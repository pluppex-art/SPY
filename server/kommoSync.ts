/**
 * Conector Kommo → SPY (somente leitura na Kommo, padrão para qualquer tenant).
 *
 *  POST /api/integrations/kommo/test    valida subdomínio + token e lista os funis da Kommo
 *  POST /api/integrations/kommo/import  importa funis/etapas e leads (com contato, empresa, responsável)
 *
 * As credenciais vêm de app_settings["integracoes_catalogo"].kommo (o mesmo cadastro do card
 * em Configurações → Integrações). Importar é idempotente: cada lead da Kommo vira um lead do SPY
 * com id determinístico (tenant + id Kommo), então rodar de novo atualiza em vez de duplicar.
 * Cada funil da Kommo vira um funil comercial "Kommo — <nome>" (id `kommo-<pipelineId>`); a etapa
 * do lead segue a convenção do SPY `${funilId}-${índiceDaEtapa}`.
 */
import type { Express } from "express";
import { createHash } from "crypto";
import {
  kommoConnFromConfig, kommoAccount, kommoPipelines, kommoUsers, kommoPaged, kommoByIds, kommoFieldValue,
  KommoError, type KommoConn, type KommoPipeline,
} from "./kommoClient.js";

interface Deps {
  requireUser: any;
  resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>;
  limiter: any;
}

const MAX_LEADS = 10_000;
const COLORS = ["blue", "cyan", "indigo", "purple", "amber", "orange", "pink", "slate"];
const WON = 142;
const LOST = 143;

/** UUID estável a partir de tenant + id da Kommo (mesma entrada → mesmo id). */
function leadUuid(tenantId: string, kommoLeadId: number): string {
  const h = createHash("sha1").update(`kommo:${tenantId}:${kommoLeadId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const funilId = (pipelineId: number) => `kommo-${pipelineId}`;
const digits = (v: string) => v.replace(/\D/g, "");

function funilRow(tenantId: string, p: KommoPipeline) {
  const etapas = p.statuses.map((s) => s.name);
  return {
    id: funilId(p.id),
    nome: `Kommo — ${p.name}`,
    tipo: "comercial",
    etapas,
    etapas_config: p.statuses.map((s, i) => ({
      nome: s.name,
      cor: s.id === WON ? "emerald" : s.id === LOST ? "rose" : COLORS[i % COLORS.length],
      iniciarMinimizado: s.id === WON || s.id === LOST,
    })),
    ativo: true,
    tenant_id: tenantId,
    updated_at: new Date().toISOString(),
  };
}

async function loadConn(req: any, res: any, tenantId: string): Promise<KommoConn | null> {
  const { data } = await req.supabase.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "integracoes_catalogo").maybeSingle();
  const parsed = kommoConnFromConfig(data?.value?.kommo || {});
  if ("error" in parsed) { res.status(409).json({ error: parsed.error }); return null; }
  return parsed.conn;
}

async function requireAdmin(req: any, res: any): Promise<boolean> {
  const { data: caller } = await req.supabase.from("users").select("is_master, is_tenant_admin").eq("id", req.user.id).maybeSingle();
  if (!caller?.is_master && !caller?.is_tenant_admin) {
    res.status(403).json({ error: "Apenas administradores da empresa podem sincronizar com a Kommo." });
    return false;
  }
  return true;
}

const errorStatus = (e: any) => (e instanceof KommoError ? (e.status && e.status >= 400 && e.status < 500 ? 422 : 502) : 500);

export function registerKommoRoutes(app: Express, { requireUser, resolveRequestedTenantId, limiter }: Deps) {
  app.use("/api/integrations/kommo", limiter);

  app.post("/api/integrations/kommo/test", requireUser, async (req: any, res) => {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const conn = await loadConn(req, res, tenantId);
    if (!conn) return;
    try {
      const account = await kommoAccount(conn);
      const pipelines = await kommoPipelines(conn);
      return res.json({
        ok: true, account: { name: account.name, subdomain: account.subdomain },
        pipelines: pipelines.map((p) => ({ id: p.id, name: p.name, stages: p.statuses.length })),
      });
    } catch (e: any) {
      return res.status(errorStatus(e)).json({ ok: false, error: e?.message || "Falha ao conectar à Kommo." });
    }
  });

  app.post("/api/integrations/kommo/import", requireUser, async (req: any, res) => {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    if (!(await requireAdmin(req, res))) return;
    const conn = await loadConn(req, res, tenantId);
    if (!conn) return;
    res.setTimeout(10 * 60_000);
    const sb = req.supabase;

    try {
      // 1) Funis e etapas
      const pipelines = await kommoPipelines(conn);
      if (pipelines.length === 0) return res.status(422).json({ error: "A Kommo não retornou nenhum funil." });
      const { error: funilErr } = await sb.from("crm_funis").upsert(pipelines.map((p) => funilRow(tenantId, p)), { onConflict: "id" });
      if (funilErr) return res.status(500).json({ error: `Não foi possível salvar os funis: ${funilErr.message}` });

      const stageIndex = new Map<string, { idx: number; status: "Novo" | "Fechado" | "Perdido" }>();
      for (const p of pipelines) p.statuses.forEach((s, idx) => stageIndex.set(`${p.id}:${s.id}`, {
        idx, status: s.id === WON ? "Fechado" : s.id === LOST ? "Perdido" : "Novo",
      }));

      // 2) Leads + relacionados
      const [users, leads] = await Promise.all([
        kommoUsers(conn),
        kommoPaged(conn, "/leads", "leads", { with: "contacts,loss_reason" }, MAX_LEADS),
      ]);
      const contactIds = new Set<number>();
      const companyIds = new Set<number>();
      for (const l of leads) {
        for (const c of l._embedded?.contacts || []) contactIds.add(c.id);
        for (const c of l._embedded?.companies || []) companyIds.add(c.id);
      }
      const contacts = new Map<number, any>((await kommoByIds(conn, "/contacts", "contacts", [...contactIds])).map((c) => [c.id, c]));
      const companies = new Map<number, any>((await kommoByIds(conn, "/companies", "companies", [...companyIds])).map((c) => [c.id, c]));

      // 3) Mescla com o que já existe (não apaga customFields locais do SPY)
      const ids = leads.map((l) => leadUuid(tenantId, l.id));
      const existing = new Map<string, any>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await sb.from("leads").select("id, customFields").in("id", ids.slice(i, i + 200));
        for (const r of data || []) existing.set(r.id, r.customFields || {});
      }

      let skipped = 0;
      const rows: any[] = [];
      leads.forEach((l, n) => {
        const place = stageIndex.get(`${l.pipeline_id}:${l.status_id}`);
        if (!place) { skipped++; return; } // funil arquivado/etapa desconhecida
        const main = (l._embedded?.contacts || []).find((c: any) => c.is_main) || (l._embedded?.contacts || [])[0];
        const contact = main ? contacts.get(main.id) : null;
        const company = (l._embedded?.companies || [])[0];
        const companyName = company ? (companies.get(company.id)?.name || company.name || "") : "";
        const createdIso = new Date((l.created_at || Date.now() / 1000) * 1000).toISOString();
        const id = ids[n];
        rows.push({
          id, tenant_id: tenantId,
          name: contact?.name || l.name || `Lead Kommo #${l.id}`,
          title: l.name || "",
          company: companyName,
          email: kommoFieldValue(contact, "EMAIL").toLowerCase(),
          phone: digits(kommoFieldValue(contact, "PHONE")),
          seller: users.get(l.responsible_user_id) || "",
          source: "Kommo",
          status: place.status,
          priority: "Média",
          value: Number(l.price) || 0,
          pipelineId: "comercial",
          stageId: `${funilId(l.pipeline_id)}-${place.idx}`,
          lead_interesse_cliente: "",
          clientId: "", clientName: "", productIds: [], tenantName: "", scoreIA: 50,
          date: createdIso.slice(0, 10),
          created_at: createdIso,
          customFields: {
            ...(existing.get(id) || {}),
            kommo: {
              leadId: l.id, pipelineId: l.pipeline_id, statusId: l.status_id,
              contactId: main?.id ?? null, companyId: company?.id ?? null,
              lossReason: l._embedded?.loss_reason?.[0]?.name ?? null,
              tags: (l._embedded?.tags || []).map((t: any) => t.name),
              syncedAt: new Date().toISOString(),
            },
          },
        });
      });

      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await sb.from("leads").upsert(rows.slice(i, i + 200), { onConflict: "id" });
        if (error) return res.status(500).json({ error: `Falha ao salvar leads (lote ${i / 200 + 1}): ${error.message}`, imported: i });
      }

      const updated = rows.filter((r) => existing.has(r.id)).length;
      return res.json({
        ok: true,
        funis: pipelines.length,
        leads: rows.length, created: rows.length - updated, updated, skipped,
        truncated: leads.length >= MAX_LEADS,
        finishedAt: new Date().toISOString(),
      });
    } catch (e: any) {
      console.error("[kommo-import]", e?.message);
      return res.status(errorStatus(e)).json({ error: e?.message || "Falha ao importar da Kommo." });
    }
  });
}
