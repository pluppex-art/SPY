/**
 * Kommo → SPY ao vivo (webhook). Depois da importação completa, cada mudança feita na Kommo chega
 * aqui e o lead é reprocessado com a MESMA regra da importação (kommoMap.ts), então nunca duplica.
 *
 *  POST /api/integrations/kommo/webhook   (autenticado, admin) gera o endereço do webhook da empresa e,
 *                                         com { register: true }, registra-o na Kommo
 *  POST /api/public/kommo-webhook/:tenantId/:token   (público; o token por empresa é a credencial)
 *
 * O endereço público não tem sessão: a credencial é o token aleatório guardado em
 * app_settings["kommo_webhook"] (chave própria, para o autosave do card não sobrescrevê-lo).
 * Depois de validar o token a rota responde sempre 200 (a Kommo desliga webhooks que falham muito).
 */
import express from "express";
import type { Express } from "express";
import { randomBytes, timingSafeEqual } from "crypto";
import {
  kommoConnFromConfig, kommoGet, kommoPage, kommoPipelines, kommoUsers, kommoWebhooks, kommoPost, kommoFieldValue,
  KommoError, type KommoConn, type KommoPipeline, type KommoUser,
} from "./kommoClient.js";
import {
  buildStageIndex, buildLeadRows, loadLeadContext, syncLeadTags, noteRow, taskRow, upsertChunks, leadUuid, clip, digits, isPlaceholderName,
  type LeadCtx,
} from "./kommoMap.js";

interface Deps {
  requireUser: any;
  resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>;
  supabaseService: any;
  limiter: any;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LEADS_PER_CALL = 20;
const WEBHOOK_EVENTS = [
  "add_lead", "update_lead", "delete_lead", "restore_lead", "status_lead", "responsible_lead", "note_lead",
  "add_contact", "update_contact", "add_company", "update_company",
  "add_task", "update_task", "delete_task", "responsible_task",
];

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Achata o corpo (aninhado ou já "plano") em chaves no estilo `leads[status][0][id]`. */
function flatten(obj: any, prefix = "", out: Record<string, string> = {}): Record<string, string> {
  if (obj === null || obj === undefined) return out;
  if (typeof obj !== "object") { out[prefix] = String(obj); return out; }
  for (const [k, v] of Object.entries(obj)) flatten(v, prefix ? `${prefix}[${k}]` : k, out);
  return out;
}

interface Events { leadIds: Set<number>; deleted: Set<number>; contactIds: Set<number>; companyIds: Set<number>; subdomain: string }

function parseEvents(body: any): Events {
  const flat = flatten(body);
  const ev: Events = { leadIds: new Set(), deleted: new Set(), contactIds: new Set(), companyIds: new Set(), subdomain: flat["account[subdomain]"] || "" };
  for (const [k, v] of Object.entries(flat)) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) continue;
    let m: RegExpExecArray | null;
    if ((m = /^leads\[(add|update|status|responsible|restore|delete)\]\[\d+\]\[id\]$/.exec(k))) (m[1] === "delete" ? ev.deleted : ev.leadIds).add(n);
    else if (/^leads\[note\]\[\d+\]\[note\]\[element_id\]$/.test(k)) {
      if (flat[k.replace("[element_id]", "[element_type]")] === "2") ev.leadIds.add(n);
    } else if ((m = /^task\[(add|update|delete|responsible)\]\[(\d+)\]\[element_id\]$/.exec(k))) {
      if (flat[`task[${m[1]}][${m[2]}][element_type]`] === "2") ev.leadIds.add(n);
    } else if (/^contacts\[(add|update)\]\[\d+\]\[id\]$/.test(k)) ev.contactIds.add(n);
    else if (/^companies\[(add|update)\]\[\d+\]\[id\]$/.test(k)) ev.companyIds.add(n);
  }
  return ev;
}

// Funis e usuários mudam pouco: cache curto por tenant evita 2 chamadas à Kommo em cada evento.
const refCache = new Map<string, { at: number; pipelines: KommoPipeline[]; users: Map<number, KommoUser> }>();
async function reference(conn: KommoConn, tenantId: string) {
  const hit = refCache.get(tenantId);
  if (hit && Date.now() - hit.at < 60_000) return hit;
  const fresh = { at: Date.now(), pipelines: await kommoPipelines(conn), users: await kommoUsers(conn) };
  refCache.set(tenantId, fresh);
  return fresh;
}

/** Reprocessa um lead da Kommo: lead + contato + empresa + tags + produtos, e suas notas e tarefas. */
async function syncLead(conn: KommoConn, sb: any, tenantId: string, kommoLeadId: number): Promise<"ok" | "removido"> {
  let lead: any = null;
  try {
    lead = await kommoGet(conn, `/leads/${kommoLeadId}`, { with: "contacts,loss_reason,catalog_elements" });
  } catch (e) {
    if (!(e instanceof KommoError && e.status === 404)) throw e;
  }
  if (!lead?.id) {
    await sb.from("leads").update({ deleted_at: new Date().toISOString() }).eq("id", leadUuid(tenantId, kommoLeadId)).eq("tenant_id", tenantId);
    return "removido";
  }
  const { pipelines, users } = await reference(conn, tenantId);
  const ctx: LeadCtx = { tenantId, users, stageIndex: buildStageIndex(pipelines), ...(await loadLeadContext(conn, sb, tenantId, [lead])) };
  const built = buildLeadRows(ctx, [lead]);
  if (built.rows.length) {
    const err = await upsertChunks(sb, "leads", built.rows);
    if (err) throw new Error(err);
    await syncLeadTags(sb, tenantId, built.tagPairs);
  }

  // Notas e tarefas do lead
  const notes: any[] = [];
  for (let page = 1; page <= 4; page++) {
    const r = await kommoPage(conn, `/leads/${kommoLeadId}/notes`, "notes", page);
    notes.push(...r.items);
    if (!r.hasNext) break;
  }
  if (notes.length) await upsertChunks(sb, "lead_activities", notes.map((n) => noteRow(tenantId, { ...n, entity_id: kommoLeadId }, users)));

  const tasks = (await kommoPage(conn, "/tasks", "tasks", 1, { "filter[entity_id][]": String(kommoLeadId), "filter[entity_type]": "leads" })).items;
  if (tasks.length) {
    const spyByEmail = new Map<string, string>();
    const { data: spyUsers } = await sb.from("users").select("id, email").eq("tenant_id", tenantId);
    for (const u of spyUsers || []) if (u.email) spyByEmail.set(String(u.email).toLowerCase(), u.id);
    const leadId = leadUuid(tenantId, kommoLeadId);
    await upsertChunks(sb, "tasks", tasks.map((t) => taskRow(tenantId, t, users, spyByEmail, (id) => id === leadId && built.rows.length > 0)));
  }
  return "ok";
}

async function syncCompany(conn: KommoConn, sb: any, tenantId: string, companyId: number) {
  const c = await kommoGet(conn, `/companies/${companyId}`);
  if (!c?.id || isPlaceholderName(String(c.name || ""))) return;
  await upsertChunks(sb, "clientes", [{
    id: `kommo-${tenantId.slice(0, 8)}-${c.id}`, tenant_id: tenantId, name: clip(c.name, 255),
    phone: digits(kommoFieldValue(c, "PHONE")), email: kommoFieldValue(c, "EMAIL").toLowerCase(), status: "Ativo",
  }]);
}

export function registerKommoWebhookRoutes(app: Express, { requireUser, resolveRequestedTenantId, supabaseService, limiter }: Deps) {
  const sb = supabaseService;

  // ── Endereço do webhook (e registro na Kommo, quando pedido) ────────────────────────────────────
  app.post("/api/integrations/kommo/webhook", requireUser, async (req: any, res) => {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    if (!sb) return res.status(503).json({ error: "SUPABASE_SERVICE_ROLE_KEY não configurada no servidor." });
    const { data: caller } = await req.supabase.from("users").select("is_master, is_tenant_admin").eq("id", req.user.id).maybeSingle();
    if (!caller?.is_master && !caller?.is_tenant_admin) return res.status(403).json({ error: "Apenas administradores da empresa podem ligar a atualização ao vivo." });

    const { data: row } = await sb.from("app_settings").select("id, value").eq("tenant_id", tenantId).eq("key", "kommo_webhook").maybeSingle();
    let token: string = row?.value?.token || "";
    if (!token) {
      token = randomBytes(24).toString("hex");
      const { error } = row
        ? await sb.from("app_settings").update({ value: { token } }).eq("id", row.id)
        : await sb.from("app_settings").insert({ tenant_id: tenantId, key: "kommo_webhook", value: { token } });
      if (error) return res.status(500).json({ error: "Não foi possível gerar o endereço do webhook." });
    }
    const base = (process.env.PUBLIC_APP_URL || `${req.protocol}://${req.get("host")}`).replace(/\/+$/, "");
    const url = `${base}/api/public/kommo-webhook/${tenantId}/${token}`;
    if (!req.body?.register) return res.json({ ok: true, url, registered: false });

    const { data: cfg } = await req.supabase.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "integracoes_catalogo").maybeSingle();
    const parsed = kommoConnFromConfig(cfg?.value?.kommo || {});
    if ("error" in parsed) return res.status(409).json({ error: parsed.error });
    try {
      const already = (await kommoWebhooks(parsed.conn)).some((w) => w.destination === url);
      if (!already) await kommoPost(parsed.conn, "/webhooks", { destination: url, settings: WEBHOOK_EVENTS });
      return res.json({ ok: true, url, registered: true, alreadyRegistered: already });
    } catch (e: any) {
      // Sem permissão para registrar sozinho: devolve o endereço para colar em Kommo → Configurações → Webhooks.
      return res.status(422).json({ ok: false, url, error: e?.message || "Não foi possível registrar o webhook na Kommo." });
    }
  });

  // ── Recebimento (público; credencial = token da empresa) ────────────────────────────────────────
  const parseBody = (req: any, res: any, next: any) =>
    req.body && Object.keys(req.body).length > 0 ? next() : express.urlencoded({ extended: true, limit: "1mb" })(req, res, next);

  app.post("/api/public/kommo-webhook/:tenantId/:token", limiter, parseBody, async (req: any, res) => {
    const { tenantId, token } = req.params;
    if (!sb) return res.status(503).end();
    if (!UUID_RE.test(String(tenantId))) return res.status(404).end();
    const { data: wh } = await sb.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "kommo_webhook").maybeSingle();
    const expected = String(wh?.value?.token || "");
    if (!expected || !safeEqual(String(token), expected)) return res.status(403).end();

    const result = { leads: 0, removidos: 0, empresas: 0, erros: 0, ignorados: 0 };
    try {
      const { data: cfg } = await sb.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "integracoes_catalogo").maybeSingle();
      const parsed = kommoConnFromConfig(cfg?.value?.kommo || {});
      if ("error" in parsed) return res.status(200).json({ ok: true, ...result, aviso: parsed.error });
      const ev = parseEvents(req.body);
      // Evento de outra conta Kommo (ou lixo): descarta.
      if (ev.subdomain && ev.subdomain.toLowerCase() !== parsed.conn.subdomain) return res.status(200).json({ ok: true, ...result, aviso: "conta diferente" });

      // Contato alterado → reprocessa os leads ligados a ele
      for (const cid of ev.contactIds) {
        const { data } = await sb.from("leads").select("customFields").eq("tenant_id", tenantId).eq("customFields->kommo->>contactId", String(cid)).limit(MAX_LEADS_PER_CALL);
        for (const l of data || []) if (l.customFields?.kommo?.leadId) ev.leadIds.add(Number(l.customFields.kommo.leadId));
      }
      for (const id of ev.deleted) ev.leadIds.delete(id);

      const ids = [...ev.leadIds];
      result.ignorados = Math.max(0, ids.length - MAX_LEADS_PER_CALL);
      for (const id of ids.slice(0, MAX_LEADS_PER_CALL)) {
        try { (await syncLead(parsed.conn, sb, tenantId, id)) === "ok" ? result.leads++ : result.removidos++; }
        catch (e: any) { result.erros++; console.error("[kommo-webhook] lead", id, e?.message); }
      }
      for (const id of ev.deleted) {
        await sb.from("leads").update({ deleted_at: new Date().toISOString() }).eq("id", leadUuid(tenantId, id)).eq("tenant_id", tenantId);
        result.removidos++;
      }
      for (const id of [...ev.companyIds].slice(0, MAX_LEADS_PER_CALL)) {
        try { await syncCompany(parsed.conn, sb, tenantId, id); result.empresas++; }
        catch (e: any) { result.erros++; console.error("[kommo-webhook] empresa", id, e?.message); }
      }
    } catch (e: any) {
      result.erros++;
      console.error("[kommo-webhook]", e?.message);
    }
    return res.status(200).json({ ok: true, ...result });
  });
}
