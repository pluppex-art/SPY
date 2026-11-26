/**
 * Grupos do Radar de oportunidades: cada empresa cadastra os grupos de WhatsApp que o Radar (n8n) acompanha, só lendo
 * (ele nunca escreve no grupo) e avisando o vendedor responsável por mensagem privada quando acha uma oportunidade.
 * Cadastro na tabela radar_grupos_monitorados (a mesma que o workflow do Radar consulta). Só vale para empresa com o módulo "radar".
 * Um grupo pertence a um único agente: não pode estar ao mesmo tempo nos grupos do Radar e nos do Agente Secreto interno.
 */
import type express from "express";

export const MODULO = "radar";
const MAX_GRUPOS = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ID_GRUPO = /^[0-9A-Za-z._-]{3,60}@g\.us$/;
const txt = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max) : "");

export interface GrupoRadar { group_chat_id: string; group_name: string; vendedor_colaborador_id: string; ativo: boolean }

/** Valida a lista vinda do navegador. Id repetido ou vendedor ausente é erro (sem vendedor ninguém seria avisado). */
export function sanitizarGruposRadar(lista: unknown): { ok: true; grupos: GrupoRadar[] } | { ok: false; erro: string } {
  if (!Array.isArray(lista)) return { ok: false, erro: "Lista de grupos inválida." };
  if (lista.length > MAX_GRUPOS) return { ok: false, erro: `No máximo ${MAX_GRUPOS} grupos.` };
  const vistos = new Set<string>(), grupos: GrupoRadar[] = [];
  for (const g of lista as any[]) {
    const id = txt(g?.group_chat_id, 80);
    if (!ID_GRUPO.test(id)) return { ok: false, erro: `Id de grupo inválido (“${id.slice(0, 30)}”): precisa terminar em @g.us.` };
    const nome = txt(g?.group_name, 80);
    if (!nome) return { ok: false, erro: "Dê um nome ao grupo." };
    const vend = txt(g?.vendedor_colaborador_id, 40);
    if (!vend || !UUID.test(vend)) return { ok: false, erro: `Escolha o vendedor responsável por “${nome}”.` };
    if (vistos.has(id)) return { ok: false, erro: `O grupo ${id} aparece duas vezes.` };
    vistos.add(id);
    grupos.push({ group_chat_id: id, group_name: nome, vendedor_colaborador_id: vend, ativo: typeof g?.ativo === "boolean" ? g.ativo : true });
  }
  return { ok: true, grupos };
}

type Deps = { requireUser: any; requireTenantAdmin: any; resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>; supabaseService: any; limiter: any };

export function registerRadarGruposRoutes(app: express.Express, { requireUser, requireTenantAdmin, resolveRequestedTenantId, supabaseService, limiter }: Deps) {
  async function contratado(tenantId: string): Promise<boolean> {
    const { data } = await supabaseService.from("tenants").select("modules").eq("id", tenantId).maybeSingle();
    return data?.modules?.[MODULO] === true;
  }

  app.get("/api/radar/grupos", requireUser, limiter, async (req: any, res) => {
    try {
      if (!supabaseService) return res.status(503).json({ error: "Servidor sem acesso ao banco." });
      const tenantId = await resolveRequestedTenantId(req, res);
      if (!tenantId) return;
      if (!(await contratado(tenantId))) return res.json({ contratado: false, grupos: [] });
      const { data, error } = await supabaseService.from("radar_grupos_monitorados")
        .select("group_chat_id, group_name, vendedor_colaborador_id, vendedor_nome, vendedor_phone, ativo")
        .eq("tenant_id", tenantId).order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      res.json({ contratado: true, grupos: data || [] });
    } catch (e: any) { console.error("[radar-grupos/get]", e?.message); res.status(500).json({ error: "Não foi possível carregar os grupos." }); }
  });

  app.put("/api/radar/grupos", requireUser, requireTenantAdmin, limiter, async (req: any, res) => {
    try {
      if (!supabaseService) return res.status(503).json({ error: "Servidor sem acesso ao banco." });
      const tenantId = await resolveRequestedTenantId(req, res);
      if (!tenantId) return;
      if (!(await contratado(tenantId))) return res.status(403).json({ error: "O Radar não está contratado para esta empresa.", contratado: false });
      const r = sanitizarGruposRadar(req.body?.grupos);
      if (r.ok === false) return res.status(400).json({ error: r.erro });

      // Vendedor: tem que ser colaborador desta empresa. Nome e telefone vêm do cadastro dele (é para esse número que o aviso vai).
      const idsVend = Array.from(new Set(r.grupos.map((g) => g.vendedor_colaborador_id)));
      const { data: cols } = idsVend.length
        ? await supabaseService.from("colaboradores").select("id, nome, phone").eq("tenant_id", tenantId).in("id", idsVend)
        : { data: [] as any[] };
      const porId = new Map<string, any>((cols || []).map((c: any) => [String(c.id), c]));
      for (const g of r.grupos) if (!porId.has(g.vendedor_colaborador_id)) return res.status(400).json({ error: `O vendedor de “${g.group_name}” não pertence a esta empresa.` });

      // Um grupo, um agente: recusa o que já é de outra empresa ou dos grupos internos desta.
      const ids = r.grupos.map((g) => g.group_chat_id);
      if (ids.length) {
        const { data: outros } = await supabaseService.from("radar_grupos_monitorados").select("group_chat_id, tenant_id").in("group_chat_id", ids);
        const alheio = (outros || []).find((o: any) => o.tenant_id !== tenantId);
        if (alheio) return res.status(409).json({ error: `O grupo ${alheio.group_chat_id} já está cadastrado em outra empresa.` });
        const { data: interno } = await supabaseService.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "agente_interno_grupos").maybeSingle();
        const dosInternos = new Set<string>((Array.isArray(interno?.value?.grupos) ? interno.value.grupos : []).map((x: any) => x?.group_chat_id));
        const dup = ids.find((i) => dosInternos.has(i));
        if (dup) return res.status(409).json({ error: `O grupo ${dup} já é um grupo interno do Agente Secreto. Um grupo só pode ter um agente.` });
      }

      const { data: atuais } = await supabaseService.from("radar_grupos_monitorados").select("group_chat_id").eq("tenant_id", tenantId);
      const novos = new Set(ids);
      const remover = (atuais || []).map((x: any) => x.group_chat_id).filter((i: string) => !novos.has(i));
      if (remover.length) {
        const { error } = await supabaseService.from("radar_grupos_monitorados").delete().eq("tenant_id", tenantId).in("group_chat_id", remover);
        if (error) throw new Error(error.message);
      }
      const linhas = r.grupos.map((g) => {
        const c = porId.get(g.vendedor_colaborador_id);
        return { tenant_id: tenantId, group_chat_id: g.group_chat_id, group_name: g.group_name, vendedor_colaborador_id: g.vendedor_colaborador_id, vendedor_nome: String(c?.nome ?? ""), vendedor_phone: String(c?.phone ?? "").replace(/\D/g, ""), ativo: g.ativo, updated_at: new Date().toISOString() };
      });
      if (linhas.length) {
        const { error } = await supabaseService.from("radar_grupos_monitorados").upsert(linhas, { onConflict: "group_chat_id" });
        if (error) throw new Error(error.message);
      }
      res.json({ ok: true, grupos: linhas.map(({ tenant_id, updated_at, ...resto }) => resto) });
    } catch (e: any) { console.error("[radar-grupos/put]", e?.message); res.status(500).json({ error: "Não foi possível salvar os grupos." }); }
  });
}
