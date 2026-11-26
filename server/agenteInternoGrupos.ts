/**
 * Grupos internos do Agente Secreto (módulo vendido à parte, fica em Equipe & RH): cada empresa cadastra os grupos de WhatsApp que o Agente Secreto interno
 * (n8n) acompanha, com departamento e responsável. O n8n lê o mesmo cadastro em app_settings, chave "agente_interno_grupos"
 * ({ grupos: [{ group_chat_id, group_name, departamento, responsavel_*, notificar_*, ativo }] }), então a tela só escreve ali.
 * Só funciona para empresa com o módulo "agente_interno" ligado em Admin > Módulos.
 */
import type express from "express";

const CHAVE = "agente_interno_grupos";
export const MODULO = "agente_interno";
export const DEPARTAMENTOS = [
  { id: "marketing", nome: "Marketing" }, { id: "financeiro", nome: "Financeiro" }, { id: "dev", nome: "Dev" },
  { id: "trafego", nome: "Tráfego" }, { id: "implementacao", nome: "Implementação" }, { id: "conteudo", nome: "Conteúdo" },
] as const;
const DEPTOS = new Set<string>(DEPARTAMENTOS.map((d) => d.id));
const MAX_GRUPOS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_GRUPO = /^[0-9A-Za-z._-]{3,60}@g\.us$/;

const txt = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");
const bool = (v: unknown, padrao: boolean) => (typeof v === "boolean" ? v : padrao);
export const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");

export interface Grupo {
  group_chat_id: string; group_name: string; departamento: string; ativo: boolean;
  responsavel_user_id: string | null; responsavel_nome: string; responsavel_phone: string; responsavel_email: string;
  notificar_sistema: boolean; notificar_whatsapp: boolean; notificar_email: boolean;
  [extra: string]: unknown;
}

/** Valida um grupo vindo do navegador. `anterior` (o que já está gravado) preserva campos que a tela não edita (ex.: dev_project_id, whatsapp_session). */
export function sanitizarGrupo(g: any, anterior?: Record<string, unknown>): { ok: true; grupo: Grupo } | { ok: false; erro: string } {
  const id = txt(g?.group_chat_id, 80);
  if (!ID_GRUPO.test(id)) return { ok: false, erro: `Id de grupo inválido (“${id.slice(0, 30)}”): precisa terminar em @g.us.` };
  const nome = txt(g?.group_name, 80);
  if (!nome) return { ok: false, erro: "Dê um nome ao grupo." };
  const depto = txt(g?.departamento, 30).toLowerCase();
  if (!DEPTOS.has(depto)) return { ok: false, erro: `Departamento inválido para “${nome}”.` };
  const uid = txt(g?.responsavel_user_id, 40);
  if (uid && !UUID.test(uid)) return { ok: false, erro: `Responsável inválido em “${nome}”.` };
  const fone = soDigitos(g?.responsavel_phone);
  if (fone && (fone.length < 10 || fone.length > 15)) return { ok: false, erro: `Telefone do responsável de “${nome}” inválido (use DDD + número).` };
  const email = txt(g?.responsavel_email, 120);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { ok: false, erro: `E-mail do responsável de “${nome}” inválido.` };
  return {
    ok: true,
    grupo: {
      ...(anterior ?? {}),
      group_chat_id: id, group_name: nome, departamento: depto, ativo: bool(g?.ativo, true),
      responsavel_user_id: uid || null, responsavel_nome: txt(g?.responsavel_nome, 80), responsavel_phone: fone, responsavel_email: email,
      notificar_sistema: bool(g?.notificar_sistema, true), notificar_whatsapp: bool(g?.notificar_whatsapp, true), notificar_email: bool(g?.notificar_email, false),
    },
  };
}

/** Lista inteira → o que pode ser gravado. Id repetido é erro (o n8n acharia o primeiro e ignoraria o outro). */
export function sanitizarGrupos(lista: unknown, gravados: unknown[] = []): { ok: true; grupos: Grupo[] } | { ok: false; erro: string } {
  if (!Array.isArray(lista)) return { ok: false, erro: "Lista de grupos inválida." };
  if (lista.length > MAX_GRUPOS) return { ok: false, erro: `No máximo ${MAX_GRUPOS} grupos.` };
  const porId = new Map<string, Record<string, unknown>>();
  for (const x of gravados as any[]) if (x && typeof x.group_chat_id === "string") porId.set(x.group_chat_id, x);
  const vistos = new Set<string>(), grupos: Grupo[] = [];
  for (const g of lista) {
    const r = sanitizarGrupo(g, porId.get(txt((g as any)?.group_chat_id, 80)));
    if (r.ok === false) return r;
    if (vistos.has(r.grupo.group_chat_id)) return { ok: false, erro: `O grupo ${r.grupo.group_chat_id} aparece duas vezes.` };
    vistos.add(r.grupo.group_chat_id); grupos.push(r.grupo);
  }
  return { ok: true, grupos };
}

type Deps = { requireUser: any; requireTenantAdmin: any; resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>; supabaseService: any; limiter: any };

export function registerAgenteInternoGruposRoutes(app: express.Express, { requireUser, requireTenantAdmin, resolveRequestedTenantId, supabaseService, limiter }: Deps) {
  /** Empresa que contratou o módulo? */
  async function contratado(tenantId: string): Promise<boolean> {
    const { data } = await supabaseService.from("tenants").select("modules").eq("id", tenantId).maybeSingle();
    return data?.modules?.[MODULO] === true;
  }
  async function contexto(req: any, res: any): Promise<string | null> {
    if (!supabaseService) { res.status(503).json({ error: "Servidor sem acesso ao banco." }); return null; }
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return null;
    if (!(await contratado(tenantId))) { res.status(403).json({ error: "Os grupos internos do Agente Secreto não estão contratados para esta empresa.", contratado: false }); return null; }
    return tenantId;
  }

  app.get("/api/agente-interno/grupos", requireUser, limiter, async (req: any, res) => {
    try {
      if (!supabaseService) return res.status(503).json({ error: "Servidor sem acesso ao banco." });
      const tenantId = await resolveRequestedTenantId(req, res);
      if (!tenantId) return;
      // Quem não contratou recebe 200 com contratado:false, para a tela só esconder a aba (sem erro).
      if (!(await contratado(tenantId))) return res.json({ contratado: false, grupos: [], departamentos: DEPARTAMENTOS });
      const { data } = await supabaseService.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", CHAVE).maybeSingle();
      res.json({ contratado: true, grupos: Array.isArray(data?.value?.grupos) ? data.value.grupos : [], departamentos: DEPARTAMENTOS });
    } catch (e: any) { console.error("[agente-interno-grupos/get]", e?.message); res.status(500).json({ error: "Não foi possível carregar os grupos." }); }
  });

  app.put("/api/agente-interno/grupos", requireUser, requireTenantAdmin, limiter, async (req: any, res) => {
    try {
      const tenantId = await contexto(req, res);
      if (!tenantId) return;
      const { data: atual } = await supabaseService.from("app_settings").select("id, value").eq("tenant_id", tenantId).eq("key", CHAVE).maybeSingle();
      const r = sanitizarGrupos(req.body?.grupos, Array.isArray(atual?.value?.grupos) ? atual.value.grupos : []);
      if (r.ok === false) return res.status(400).json({ error: r.erro });
      // O responsável precisa ser mesmo uma pessoa desta empresa.
      const ids = Array.from(new Set(r.grupos.map((g) => g.responsavel_user_id).filter((x): x is string => !!x)));
      if (ids.length) {
        const { data: us } = await supabaseService.from("users").select("id").eq("tenant_id", tenantId).in("id", ids);
        const ok = new Set((us || []).map((u: any) => u.id));
        const fora = ids.find((i) => !ok.has(i));
        if (fora) return res.status(400).json({ error: "Um dos responsáveis não pertence a esta empresa." });
      }
      const valor = { ...(atual?.value ?? {}), grupos: r.grupos };
      const { error } = atual?.id
        ? await supabaseService.from("app_settings").update({ value: valor }).eq("id", atual.id)
        : await supabaseService.from("app_settings").insert({ tenant_id: tenantId, key: CHAVE, value: valor });
      if (error) { console.error("[agente-interno-grupos/put]", error.message); return res.status(500).json({ error: "Não foi possível salvar os grupos." }); }
      res.json({ ok: true, grupos: r.grupos });
    } catch (e: any) { console.error("[agente-interno-grupos/put]", e?.message); res.status(500).json({ error: "Não foi possível salvar os grupos." }); }
  });
}
