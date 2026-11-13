/**
 * Nó "Salvar dados" do chatbot — executa a ação `save_data` que o motor (n8n) devolve.
 *
 * O workflow n8n chama POST /api/chatbot/save-data com o MESMO segredo de webhook da sessão do bot
 * (X-Webhook-Secret = whatsapp_instances.webhook_secret). O segredo identifica a sessão e, por ela,
 * o tenant: nada de tenant/registro vem do corpo da requisição.
 *
 * Gravadores por destino em SAVERS — para um destino novo: escreva o gravador aqui e liste os
 * campos em src/lib/chatbot/saveTargets.ts.
 *
 * Regras do destino "implementation": acha a implementação pelo número do contato (dentro do tenant
 * do bot); só preenche campo VAZIO (nunca sobrescreve); valor inválido é recusado e reportado;
 * a escrita só vale se ninguém alterou a implementação no meio (senão relê e refaz).
 */
import crypto from "node:crypto";
import type { Express, RequestHandler } from "express";
import { allFields, applyPatch, type ImplData } from "../src/lib/implementationForm.js";
import { isEmpty, validateField } from "../src/lib/chatbot/validateValue.js";
import { phoneKey } from "../src/lib/funnelIds.js";
import type { ProvisionResult } from "./implementationProvision.js";

type Sb = any;
interface MapEntry { field: string; variable: string }
interface SaveInput { tenantId: string; session: string; phone: string; map: MapEntry[]; vars: Record<string, string>; botName?: string }
interface SaveResult { ok: boolean; reason?: string; implementationId?: string; saved?: string[]; skipped?: string[]; rejected?: { field: string; reason: string }[] }

const safeEqual = (a: string, b: string) => {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

type Found = { ok: true; id: string } | { ok: false; reason: string };

/** Implementação do tenant cujo cliente/contato/formulário usa esse número (a ainda aberta tem preferência). */
async function findImplementation(sb: Sb, tenantId: string, phone: string): Promise<Found> {
  const key = phoneKey(phone);
  if (key.length < 8) return { ok: false, reason: "telefone_invalido" };
  const [{ data: impls }, { data: clientes }, { data: contatos }] = await Promise.all([
    sb.from("implementations").select("id, cliente_id, status, data").eq("tenant_id", tenantId).limit(5000),
    sb.from("clientes").select("id, phone").eq("tenant_id", tenantId).limit(5000),
    sb.from("cliente_contatos").select("cliente_id, telefone, whatsapp").eq("tenant_id", tenantId).limit(5000),
  ]);
  const clienteIds = new Set<string>();
  for (const c of clientes || []) if (c.phone && phoneKey(c.phone) === key) clienteIds.add(c.id);
  for (const c of contatos || []) if ((c.whatsapp && phoneKey(c.whatsapp) === key) || (c.telefone && phoneKey(c.telefone) === key)) clienteIds.add(c.cliente_id);
  const matches = (impls || []).filter((i: any) => clienteIds.has(i.cliente_id) || phoneKey(i.data?.resp_whatsapp) === key || phoneKey(i.data?.whats_numero) === key);
  const open = matches.filter((i: any) => i.status !== "Concluída");
  const pool = open.length ? open : matches;
  if (pool.length === 0) return { ok: false, reason: "implementacao_nao_encontrada" };
  if (pool.length > 1) return { ok: false, reason: "mais_de_uma_implementacao" };
  return { ok: true, id: pool[0].id as string };
}

async function saveToImplementation(sb: Sb, a: SaveInput): Promise<SaveResult> {
  const found = await findImplementation(sb, a.tenantId, a.phone);
  if (found.ok === false) return { ok: false, reason: found.reason };
  const implId = found.id;
  // Quem conduz a conversa é o responsável pela implementação: o nome do chatbot (só se ainda não há responsável).
  if (a.botName) await sb.from("implementations").update({ responsavel: a.botName }).eq("id", implId).eq("tenant_id", a.tenantId).is("responsavel", null);

  const fields = new Map(allFields().map((f) => [f.id, f]));
  const saved: string[] = [], skipped: string[] = [], rejected: { field: string; reason: string }[] = [];

  for (let attempt = 0; attempt < 3; attempt++) {
    saved.length = 0; skipped.length = 0; rejected.length = 0;
    const { data: impl } = await sb.from("implementations").select("id, data, updated_at").eq("id", implId).eq("tenant_id", a.tenantId).maybeSingle();
    if (!impl) return { ok: false, reason: "implementacao_nao_encontrada" };
    const current: ImplData = impl.data || {};
    const patch: Record<string, any> = {};
    for (const m of a.map) {
      const field = fields.get(m.field);
      const raw = a.vars[m.variable];
      if (!field) { rejected.push({ field: m.field, reason: "campo desconhecido" }); continue; }
      if (isEmpty(raw)) continue; // variável não coletada
      if (!isEmpty(current[field.id])) { skipped.push(field.id); continue; } // nunca sobrescreve
      const v = validateField(field, raw);
      if (v.ok === false) { rejected.push({ field: field.id, reason: v.reason }); continue; }
      if (v.value !== undefined) patch[field.id] = v.value;
    }
    if (Object.keys(patch).length === 0) return { ok: true, implementationId: implId, saved: [], skipped, rejected };

    const upd = await sb.from("implementations").update({ data: applyPatch(current, patch) }).eq("id", implId).eq("tenant_id", a.tenantId).eq("updated_at", impl.updated_at).select("id");
    if (upd.error) return { ok: false, reason: "erro_ao_gravar" };
    if (!upd.data || upd.data.length === 0) continue; // alguém salvou no meio: relê e refaz
    saved.push(...Object.keys(patch));
    await sb.from("implementation_field_changes").insert(saved.map((id) => ({
      tenant_id: a.tenantId, implementation_id: implId, field_id: id, old_value: null, new_value: patch[id], source: "chatbot", chatbot_session: a.session,
    })));
    return { ok: true, implementationId: implId, saved, skipped, rejected };
  }
  return { ok: false, reason: "edicao_concorrente" };
}

const SAVERS: Record<string, (sb: Sb, a: SaveInput) => Promise<SaveResult>> = {
  implementation: saveToImplementation,
};

export interface ChatbotSaveDeps {
  limiter: RequestHandler;
  supabaseService: Sb;
  /** Cria o ambiente do cliente e aciona o agente (server/implementationProvision.ts). Opcional: sem ele o nó só grava. */
  provision?: (implementationId: string, ownerTenantId: string) => Promise<ProvisionResult>;
}

export function registerChatbotSaveRoutes(app: Express, { limiter, supabaseService, provision }: ChatbotSaveDeps) {
  /** Autentica a chamada do n8n pelo segredo da sessão; o tenant sai da sessão, nunca do corpo. */
  const authSession = async (req: any, res: any): Promise<{ tenantId: string; session: string; botName: string } | null> => {
    if (!supabaseService) { res.status(503).json({ error: "Serviço indisponível." }); return null; }
    const headerSecret = req.headers["x-webhook-secret"];
    const secret = typeof headerSecret === "string" ? headerSecret : "";
    const session = req.body?.session;
    if (!secret || typeof session !== "string" || !session) { res.status(403).json({ error: "Não autorizado." }); return null; }
    const { data: inst } = await supabaseService.from("whatsapp_instances").select("tenant_id, webhook_secret").eq("name", session).maybeSingle();
    if (!inst?.webhook_secret || !safeEqual(secret, inst.webhook_secret)) { res.status(403).json({ error: "Não autorizado." }); return null; }
    const { data: bot } = await supabaseService.from("chatbots").select("name").eq("tenant_id", inst.tenant_id).eq("whatsapp_session", session).maybeSingle();
    return { tenantId: inst.tenant_id, session, botName: String(bot?.name || "") };
  };

  // Variáveis que o bot já "sabe" ao começar a conversa: o próprio nome (bot_nome) e o que o SPY tem do cliente
  // (formulário da implementação, achado pelo número). O n8n passa isso ao motor como `seed` na 1ª mensagem.
  app.post("/api/chatbot/context", limiter, async (req: any, res) => {
    try {
      const auth = await authSession(req, res);
      if (!auth) return;
      const vars: Record<string, string> = {};
      if (auth.botName) vars.bot_nome = auth.botName;
      const found = await findImplementation(supabaseService, auth.tenantId, String(req.body?.phone ?? ""));
      if (found.ok) {
        const { data: impl } = await supabaseService.from("implementations").select("data").eq("id", found.id).eq("tenant_id", auth.tenantId).maybeSingle();
        for (const f of allFields()) {
          const v = impl?.data?.[f.id];
          if (isEmpty(v)) continue;
          vars[f.id] = typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v).slice(0, 500);
        }
      }
      res.json({ vars });
    } catch (err: any) {
      console.error("[chatbot/context]", err?.message);
      res.json({ vars: {} }); // sem contexto o bot só pergunta tudo: nunca trava a conversa
    }
  });

  app.post("/api/chatbot/save-data", limiter, async (req: any, res) => {
    try {
      const auth = await authSession(req, res);
      if (!auth) return;
      const { session, target, map, vars, phone } = req.body ?? {};
      const inst = { tenant_id: auth.tenantId };

      const saver = typeof target === "string" ? SAVERS[target] : undefined;
      if (!saver) return res.status(400).json({ error: "Destino desconhecido." });
      if (!Array.isArray(map) || map.length === 0 || map.length > 60) return res.status(400).json({ error: "Mapeamento inválido." });
      const cleanVars: Record<string, string> = {};
      for (const [k, v] of Object.entries(vars && typeof vars === "object" ? vars : {})) if (typeof v === "string") cleanVars[k] = v.slice(0, 2000);
      const cleanMap: MapEntry[] = map.filter((m: any) => m && typeof m.field === "string" && typeof m.variable === "string").map((m: any) => ({ field: m.field, variable: m.variable }));

      const result = await saver(supabaseService, { tenantId: inst.tenant_id, session, phone: String(phone || cleanVars.telefone || ""), map: cleanMap, vars: cleanVars, botName: auth.botName });
      if (!result.ok) console.warn("[chatbot/save-data]", session, result.reason);
      // Fim da coleta: se o nó pede e há dados suficientes, cria o ambiente e aciona o agente (uma única vez).
      let provisioned: ProvisionResult | undefined;
      if (result.ok && result.implementationId && target === "implementation" && req.body?.provision === true && provision) {
        try { provisioned = await provision(result.implementationId, inst.tenant_id); } catch (e: any) {
          console.error("[chatbot/save-data] provision:", e?.message);
          provisioned = { status: "failed", reason: "erro_interno" };
        }
      }
      // 200 mesmo quando não gravou: o fluxo do bot segue; o motivo vai no corpo (n8n não precisa repetir).
      res.json(provisioned ? { ...result, provisioned } : result);
    } catch (err: any) {
      console.error("[chatbot/save-data]", err?.message);
      res.status(500).json({ ok: false, reason: "erro_interno" });
    }
  });
}
