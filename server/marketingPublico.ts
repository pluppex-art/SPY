/**
 * Entradas públicas do Marketing (sem login):
 *  - Landing pages: script de rastreio servido por este mesmo sistema (/api/lp/tracker.js) que conta visitas, cliques e
 *    conversões da LP e cria o lead quando a pessoa preenche um formulário da página.
 *  - Formulários: POST /api/public/forms/:formId/submit — o lead cai na empresa dona do formulário (antes só existia o
 *    endpoint do site do próprio S.P.Y.).
 * Proteções: limite por IP, campo-isca (honeypot), validação de nome/e-mail/telefone, tamanhos máximos e nada de dado
 * de outra pessoa na resposta.
 */
import express, { type Express, type Request, type Response, type NextFunction, type RequestHandler } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { upsertLead } from "./leadUpsert.js";
import { CAMPOS_PADRAO, normalizarCampos, validarRespostas } from "../src/lib/formularioCampos.js";
import { normalizarConteudoLP } from "../src/lib/paginaLP.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ContatoPublico { nome: string; email: string; telefone: string }

/** Valida e normaliza o contato vindo de um formulário público. Exige nome e pelo menos telefone ou e-mail válidos. */
export function validarContatoPublico(b: any): { ok: true; contato: ContatoPublico } | { ok: false; erro: string } {
  const nome = String(b?.name ?? b?.nome ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120);
  const email = String(b?.email ?? "").trim().toLowerCase().slice(0, 200);
  const telefone = String(b?.phone ?? b?.telefone ?? b?.whatsapp ?? "").replace(/\D/g, "").slice(0, 15);
  if (nome.length < 2) return { ok: false, erro: "Informe seu nome." };
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  const telOk = telefone.length >= 10 && telefone.length <= 13;
  if (email && !emailOk) return { ok: false, erro: "E-mail inválido." };
  if (telefone && !telOk) return { ok: false, erro: "Telefone inválido." };
  if (!email && !telefone) return { ok: false, erro: "Informe seu WhatsApp ou e-mail." };
  return { ok: true, contato: { nome, email, telefone } };
}

/** Campos extras do formulário (ex.: mensagem, interesse) viram a nota do lead — limitados e sem lixo. */
export function notaDosCampos(b: any, ignorar: string[] = []): string {
  const pular = new Set(["name", "nome", "email", "phone", "telefone", "whatsapp", "website", "id", "tipo", "url", ...ignorar]);
  const linhas: string[] = [];
  for (const [k, v] of Object.entries(b ?? {}).slice(0, 25)) {
    if (pular.has(k) || v == null || typeof v === "object") continue;
    const t = String(v).replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 500);
    if (t) linhas.push(`${String(k).slice(0, 40)}: ${t}`);
  }
  return linhas.join("\n").slice(0, 3000);
}

export const SCRIPT_RASTREIO = `(function(){
var s=document.currentScript;if(!s||!s.src)return;
var m=s.src.match(/[?&]id=([0-9a-f-]{36})/i);if(!m)return;var id=m[1];
var base=s.src.split('/api/')[0];var url=base+'/api/public/lp-track';
function send(t,x){var o={id:id,tipo:t,url:location.href};if(x)for(var k in x)o[k]=x[k];var b=JSON.stringify(o);
try{if(navigator.sendBeacon&&navigator.sendBeacon(url,new Blob([b],{type:'text/plain'})))return}catch(e){}
try{fetch(url,{method:'POST',body:b,keepalive:true,mode:'no-cors',headers:{'Content-Type':'text/plain'}})}catch(e){}}
try{var k='spy_lp_'+id;if(!sessionStorage.getItem(k)){sessionStorage.setItem(k,'1');send('view')}}catch(e){send('view')}
document.addEventListener('click',function(e){var a=e.target&&e.target.closest&&e.target.closest('a,button,[data-spy-cta]');if(a)send('click')},true);
document.addEventListener('submit',function(e){var f=e.target;if(!f||!f.elements)return;var d={};
for(var i=0;i<f.elements.length;i++){var el=f.elements[i];if(!el.name||el.type==='password'||el.type==='hidden'||!el.value)continue;
var n=el.name.toLowerCase();if(/pass|senha|card|cartao|cvv/.test(n))continue;d[n]=String(el.value).slice(0,500);}
send('conversion',d)},true);
window.spyConversion=function(d){send('conversion',d||{})};
})();`;

/** CORS aberto só para as entradas públicas (formulários e rastreio de LP rodam em outros domínios). */
export const corsPublicoMarketing: RequestHandler = (req: Request, res: Response, next: NextFunction) => {
  if (!/^\/api\/(public\/forms|public\/lp-track|public\/lp\/|lp\/)/.test(req.path)) return next();
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
};

interface Deps { supabaseService: SupabaseClient | null; limiter: RequestHandler }

export function registerMarketingPublicRoutes(app: Express, { supabaseService: db, limiter }: Deps) {
  const lerCorpo = (req: any): any => {
    const b = req.body;
    if (typeof b === "string") { try { return JSON.parse(b); } catch { return {}; } }
    return b && typeof b === "object" ? b : {};
  };

  app.get("/api/lp/tracker.js", (_req, res) => {
    res.setHeader("Content-Type", "application/javascript; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=300");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.send(SCRIPT_RASTREIO);
  });

  /** Soma 1 num contador da LP sem perder contagens quando duas visitas chegam juntas (tenta de novo se o valor mudou). */
  const somar = async (id: string, campo: "views" | "clicks" | "conversions") => {
    for (let i = 0; i < 4; i++) {
      const { data: lp } = await db!.from("marketing_landing_pages").select("views,clicks,conversions").eq("id", id).is("deleted_at", null).maybeSingle();
      if (!lp) return;
      const novo = { views: lp.views ?? 0, clicks: lp.clicks ?? 0, conversions: lp.conversions ?? 0, [campo]: ((lp as any)[campo] ?? 0) + 1 } as Record<string, number>;
      const taxa = novo.views > 0 ? Math.round((novo.conversions / novo.views) * 1000) / 10 : 0;
      const { data: ok } = await db!.from("marketing_landing_pages").update({ [campo]: novo[campo], conversion_rate: taxa }).eq("id", id).eq(campo, (lp as any)[campo] ?? 0).select("id");
      if (ok && ok.length) return;
    }
  };

  app.post("/api/public/lp-track", limiter, express.text({ type: "*/*", limit: "16kb" }), async (req, res) => {
    res.status(204);
    try {
      if (!db) return res.send();
      const b = lerCorpo(req);
      const id = String(b.id ?? "");
      const tipo = String(b.tipo ?? "");
      if (!UUID.test(id) || !["view", "click", "conversion"].includes(tipo)) return res.send();
      const { data: lp } = await db.from("marketing_landing_pages").select("id,tenant_id,name").eq("id", id).is("deleted_at", null).maybeSingle();
      if (!lp) return res.send();
      await somar(id, tipo === "view" ? "views" : tipo === "click" ? "clicks" : "conversions");
      if (tipo === "conversion") {
        const v = validarContatoPublico(b);
        if (v.ok === true && !b.website) {
          await upsertLead(db, lp.tenant_id, { name: v.contato.nome, email: v.contato.email, phone: v.contato.telefone, source: `Landing page: ${lp.name}`, papel: "entrada", nota: notaDosCampos(b) || `Converteu na landing page "${lp.name}".` });
        }
      }
    } catch (e: any) { console.warn("[lp-track]", e?.message); }
    res.send();
  });

  /** Dados para desenhar um formulário hospedado no sistema (só o necessário para a pessoa preencher). */
  app.get("/api/public/forms/:formId/config", limiter, async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "Indisponível no momento." });
      const formId = String(req.params.formId ?? "").slice(0, 80);
      const { data: form } = await db.from("marketing_forms").select("*").eq("id", formId).maybeSingle();
      if (!form || form.active === false || form.hospedado !== true) return res.status(404).json({ error: "Formulário não encontrado." });
      const campos = normalizarCampos(form.campos);
      const { data: tn } = await db.from("tenants").select("name").eq("id", form.tenant_id).maybeSingle();
      res.json({ nome: form.name, descricao: form.description || "", empresa: tn?.name || "", campos: campos.length ? campos : CAMPOS_PADRAO, passoAPasso: form.layout_mode === "passo_a_passo", mensagemSucesso: form.mensagem_sucesso || "Recebemos suas informações! Em breve entraremos em contato." });
    } catch (e: any) {
      console.error("[forms/config]", e?.message);
      res.status(500).json({ error: "Não foi possível abrir o formulário agora." });
    }
  });

  /** Landing page criada no sistema: dados para desenhar a página. `contar=1` registra uma visita (a página pede uma vez por sessão). */
  app.get("/api/public/lp/:id", limiter, async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "Indisponível no momento." });
      const id = String(req.params.id ?? "");
      if (!UUID.test(id)) return res.status(404).json({ error: "Página não encontrada." });
      const { data: lp } = await db.from("marketing_landing_pages").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
      if (!lp || lp.hospedada !== true || lp.status !== "published") return res.status(404).json({ error: "Esta página não está no ar." });
      const { data: tn } = await db.from("tenants").select("name").eq("id", lp.tenant_id).maybeSingle();
      if (req.query.contar === "1") await somar(id, "views");
      res.json({ nome: lp.name, empresa: tn?.name || "", ...normalizarConteudoLP(lp.conteudo) });
    } catch (e: any) {
      console.error("[lp/config]", e?.message);
      res.status(500).json({ error: "Não foi possível abrir a página agora." });
    }
  });

  app.post("/api/public/lp/:id/submit", limiter, async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "Indisponível no momento." });
      const b = lerCorpo(req);
      if (b.website) return res.json({ success: true });
      const id = String(req.params.id ?? "");
      if (!UUID.test(id)) return res.status(404).json({ error: "Página não encontrada." });
      const { data: lp } = await db.from("marketing_landing_pages").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
      if (!lp || lp.hospedada !== true || lp.status !== "published") return res.status(404).json({ error: "Esta página não está no ar." });
      const conteudo = normalizarConteudoLP(lp.conteudo);
      const r = validarRespostas(conteudo.campos, b);
      if (r.ok === false) return res.status(400).json({ error: r.erro });
      await upsertLead(db, lp.tenant_id, { name: r.contato.nome, email: r.contato.email, phone: r.contato.telefone, source: `Landing page: ${lp.name}`, papel: "entrada", nota: r.nota || `Converteu na landing page "${lp.name}".` });
      await somar(id, "conversions");
      res.json({ success: true });
    } catch (e: any) {
      console.error("[lp/submit]", e?.message);
      res.status(500).json({ error: "Não foi possível enviar agora. Tente novamente em instantes." });
    }
  });

  app.post("/api/public/forms/:formId/submit", limiter, async (req, res) => {
    try {
      if (!db) return res.status(503).json({ error: "Indisponível no momento." });
      const b = lerCorpo(req);
      if (b.website) return res.json({ success: true }); // isca para robôs
      const formId = String(req.params.formId ?? "").slice(0, 80);
      const { data: form } = await db.from("marketing_forms").select("*").eq("id", formId).maybeSingle();
      if (!form || form.active === false) return res.status(404).json({ error: "Formulário não encontrado." });
      let contato: { nome: string; email: string; telefone: string }; let nota: string;
      if (form.hospedado === true) {
        // Formulário feito no sistema: valida contra os campos que a empresa montou.
        const campos = normalizarCampos(form.campos);
        const r = validarRespostas(campos.length ? campos : CAMPOS_PADRAO, b);
        if (r.ok === false) return res.status(400).json({ error: r.erro });
        contato = r.contato; nota = r.nota;
      } else {
        const v = validarContatoPublico(b);
        if (v.ok === false) return res.status(400).json({ error: v.erro });
        contato = v.contato; nota = notaDosCampos(b);
      }
      await upsertLead(db, form.tenant_id, { name: contato.nome, email: contato.email, phone: contato.telefone, source: form.source || `Formulário: ${form.name}`, papel: "entrada", nota: nota || `Preencheu o formulário "${form.name}".` });
      res.json({ success: true });
    } catch (e: any) {
      console.error("[forms/submit]", e?.message);
      res.status(500).json({ error: "Não foi possível enviar agora. Tente novamente em instantes." });
    }
  });
}
