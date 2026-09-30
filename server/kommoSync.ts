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
import { createHash, randomBytes } from "crypto";
import {
  kommoConnFromConfig, kommoAccount, kommoPipelines, kommoUsers, kommoPage, kommoCatalogs, kommoByIds, kommoFieldValue, kommoCustomFields, kommoFieldByName,
  KommoError, type KommoConn, type KommoPipeline,
} from "./kommoClient.js";

interface Deps {
  requireUser: any;
  resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>;
  limiter: any;
  supabaseService: any;
}

const MAX_PAGES = 800; // 800 × 250 = 200.000 leads — só uma trava de segurança contra laço infinito
// A Vercel corta a função em 60s: cada chamada processa páginas até este orçamento e devolve o cursor.
const TIME_BUDGET_MS = 30_000;
const COLORS = ["blue", "cyan", "indigo", "purple", "amber", "orange", "pink", "slate"];
const INTEREST_RE = /interess|produto|servi[cç]o|procura|necessidade/i;
// Campo do lead que nomeia o vendedor (ex.: "Comercial"); tem prioridade sobre o "Responsável" nativo da Kommo.
const SELLER_RE = /^\s*(comercial|vendedor|consultor|closer|atendente)\b/i;
const SOURCE_RE = /origem|fonte|source|canal|campanha|utm_source/i;
const iso = (unix: any) => (unix ? new Date(Number(unix) * 1000).toISOString() : null);
const WON = 142;
const LOST = 143;

/** UUID estável a partir de tenant + id da Kommo (mesma entrada → mesmo id). */
function leadUuid(tenantId: string, kommoLeadId: number): string {
  const h = createHash("sha1").update(`kommo:${tenantId}:${kommoLeadId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const uuidFrom = (...parts: (string | number)[]) => {
  const h = createHash("sha1").update(parts.join(":")).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const productUuid = (tenantId: string, catalogId: number, elementId: number) => uuidFrom("kommo-prod", tenantId, catalogId, elementId);
const clip = (v: any, n: number) => String(v ?? "").slice(0, n);

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

interface SellerSync { created: string[]; existing: number; colaboradores: number; skipped: { name: string; reason: string }[] }

/**
 * Cadastra os usuários da Kommo como vendedores (role "Agente") no tenant, pelo e-mail.
 * Quem já existe no SPY é mantido como está. A conta nasce com senha aleatória e e-mail
 * confirmado — a pessoa entra por "Esqueci minha senha". Sem e-mail na Kommo não dá para
 * criar login: o vendedor continua aparecendo nos leads pelo nome.
 */
async function syncSellers(sb: any, tenantId: string, users: Map<number, { name: string; email: string; active: boolean }>): Promise<SellerSync> {
  const out: SellerSync = { created: [], existing: 0, colaboradores: 0, skipped: [] };
  if (!sb) return out;
  for (const [kommoId, u] of users) {
    if (!u.name) continue;
    let userId: string | null = null;
    if (!u.email) {
      out.skipped.push({ name: u.name, reason: "sem e-mail na Kommo (sem login)" });
    } else {
      const { data: found } = await sb.from("users").select("id, tenant_id").eq("email", u.email).maybeSingle();
      if (found) {
        if (found.tenant_id === tenantId) { out.existing++; userId = found.id; }
        else out.skipped.push({ name: u.name, reason: "e-mail já usado em outra empresa" });
      } else {
        const { data: auth, error: authErr } = await sb.auth.admin.createUser({
          email: u.email, password: randomBytes(18).toString("base64url"), email_confirm: true,
        });
        if (authErr || !auth?.user) {
          out.skipped.push({ name: u.name, reason: "não foi possível criar o acesso" });
        } else {
          const { error: profileErr } = await sb.from("users").insert({
            id: auth.user.id, tenant_id: tenantId, name: u.name, email: u.email,
            role: "Agente", is_master: false, is_tenant_admin: false, active: u.active,
          });
          if (profileErr) {
            await sb.auth.admin.deleteUser(auth.user.id);
            out.skipped.push({ name: u.name, reason: "não foi possível criar o perfil" });
          } else { out.created.push(u.name); userId = auth.user.id; }
        }
      }
    }
    // RH › Colaboradores: todo usuário da Kommo vira colaborador (Comercial), com ou sem login.
    const { error: colabErr } = await sb.from("colaboradores").upsert({
      id: `kommo-${tenantId.slice(0, 8)}-${kommoId}`, tenant_id: tenantId, user_id: userId,
      nome: u.name, cargo: "Vendedor", departamento: "Comercial",
      status: u.active ? "Ativo" : "Inativo", email: u.email || null, squad: "Sem squad",
    }, { onConflict: "id" });
    if (!colabErr) out.colaboradores++;
  }
  return out;
}

const EXTRA_STEPS = ["produtos", "empresas", "notas", "tarefas"] as const;
type ExtraStep = (typeof EXTRA_STEPS)[number];

async function upsertChunks(sb: any, table: string, rows: any[]): Promise<string | null> {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.from(table).upsert(rows.slice(i, i + 200), { onConflict: "id" });
    if (error) return error.message;
  }
  return null;
}

/**
 * Etapas complementares do "Kommo completo": produtos (catálogos), empresas → Clientes,
 * notas → histórico do lead, tarefas → Tarefas. Cada uma é paginada por cursor e respeita o
 * orçamento de tempo. Falha de uma etapa NÃO derruba a importação: devolve `warning` e segue.
 */
async function runExtraStep(step: ExtraStep, conn: KommoConn, sb: any, tenantId: string, cursor: number, started: number) {
  const users = await kommoUsers(conn);
  const t8 = tenantId.slice(0, 8);
  let saved = 0;

  if (step === "produtos") {
    const catalogs = (await kommoCatalogs(conn)).filter((c) => c.type === "products");
    for (const cat of catalogs) {
      for (let page = 1; page <= 40; page++) {
        const { items, hasNext } = await kommoPage(conn, `/catalogs/${cat.id}/elements`, "elements", page);
        const rows = items.map((e) => ({
          id: productUuid(tenantId, cat.id, e.id), tenant_id: tenantId, name: clip(e.name || `Produto ${e.id}`, 255),
          sku: clip(kommoFieldValue(e, "SKU"), 100) || null, description: kommoFieldValue(e, "DESCRIPTION") || null,
          price: Number(kommoFieldValue(e, "PRICE").replace(",", ".")) || 0, active: true,
        }));
        if (rows.length) {
          const err = await upsertChunks(sb, "products", rows);
          if (err) return { done: true, saved, warning: `Produtos não importados: ${err}` };
          saved += rows.length;
        }
        if (!hasNext) break;
      }
    }
    return { done: true, saved };
  }

  // SPY users por e-mail (responsável das tarefas)
  const spyByEmail = new Map<string, string>();
  if (step === "tarefas") {
    const { data } = await sb.from("users").select("id, email").eq("tenant_id", tenantId);
    for (const u of data || []) if (u.email) spyByEmail.set(String(u.email).toLowerCase(), u.id);
  }

  let page = cursor;
  let hasNext = true;
  while (hasNext && page <= MAX_PAGES && (page === cursor || Date.now() - started < TIME_BUDGET_MS)) {
    const path = step === "empresas" ? "/companies" : step === "notas" ? "/leads/notes" : "/tasks";
    const key = step === "empresas" ? "companies" : step === "notas" ? "notes" : "tasks";
    const params = step === "tarefas" ? { "filter[entity_type]": "leads" } : {};
    const { items, hasNext: more } = await kommoPage(conn, path, key, page, params);
    hasNext = more; page++;
    if (items.length === 0) break;

    let table = "", rows: any[] = [];
    if (step === "empresas") {
      table = "clientes";
      rows = items.map((c) => ({
        id: `kommo-${t8}-${c.id}`, tenant_id: tenantId, name: clip(c.name || `Empresa ${c.id}`, 255),
        phone: digits(kommoFieldValue(c, "PHONE")), email: kommoFieldValue(c, "EMAIL").toLowerCase(), status: "Ativo",
      }));
    } else if (step === "notas") {
      table = "lead_activities";
      rows = items.map((n) => {
        const p = n.params || {};
        const text = String(p.text ?? p.comment ?? "").trim();
        const kind = String(n.note_type || "common");
        const call = /^call/.test(kind);
        const titulo = kind === "common" ? "Comentário"
          : kind === "call_in" ? "Ligação recebida" : kind === "call_out" ? "Ligação realizada"
          : /^sms/.test(kind) ? "SMS" : /mail/.test(kind) ? "E-mail"
          : /service_message/.test(kind) ? "Mensagem do sistema" : kind === "geolocation" ? "Localização"
          : kind === "attachment" ? "Anexo" : `Kommo: ${kind}`;
        // Mantém o conteúdo como está na Kommo: texto integral + detalhes da ligação quando houver.
        const detalhes = [
          p.phone ? `Telefone: ${p.phone}` : "", p.duration ? `Duração: ${p.duration}s` : "",
          p.call_result ? `Resultado: ${p.call_result}` : "", p.link ? `Gravação: ${p.link}` : "",
          p.file_name ? `Arquivo: ${p.file_name}` : "",
        ].filter(Boolean).join("\n");
        const when = iso(n.created_at) || new Date().toISOString();
        return {
          id: `kommo-note-${t8}-${n.id}`, tenant_id: tenantId, lead_id: leadUuid(tenantId, n.entity_id),
          type: call ? "Ligação" : kind === "common" ? "Outro" : /mail/.test(kind) ? "E-mail" : "Outro",
          title: clip(titulo, 255),
          description: [text, detalhes].filter(Boolean).join("\n\n"),
          date: new Date(when).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }),
          seller: n.created_by ? (users.get(n.created_by)?.name || "Kommo") : "Kommo",
          created_at: when,
        };
      });
    } else {
      table = "tasks";
      const leadIds = [...new Set(items.map((t) => leadUuid(tenantId, t.entity_id)))];
      const existing = new Set<string>();
      for (let i = 0; i < leadIds.length; i += 80) {
        const { data } = await sb.from("leads").select("id").in("id", leadIds.slice(i, i + 80));
        for (const r of data || []) existing.add(r.id);
      }
      rows = items.map((t) => {
        const lid = leadUuid(tenantId, t.entity_id);
        const email = users.get(t.responsible_user_id)?.email;
        const text = String(t.text || "").trim();
        return {
          id: uuidFrom("kommo-task", tenantId, t.id), tenant_id: tenantId, lead_id: existing.has(lid) ? lid : null,
          assigned_to: (email && spyByEmail.get(email)) || null,
          title: clip(text.split("\n")[0] || "Tarefa da Kommo", 255), description: text || null,
          status: t.is_completed ? "Done" : "To Do", priority: "Medium",
          due_date: iso(t.complete_till), completed_at: t.is_completed ? iso(t.updated_at) : null,
          created_at: iso(t.created_at) || undefined,
        };
      });
    }
    const err = await upsertChunks(sb, table, rows);
    if (err) return { done: true, saved, warning: `${step[0].toUpperCase()}${step.slice(1)} não importadas: ${err}` };
    saved += rows.length;
  }
  const done = !hasNext || page > MAX_PAGES;
  return { done, nextCursor: done ? null : page, saved };
}

const errorStatus = (e: any) => (e instanceof KommoError ? (e.status && e.status >= 400 && e.status < 500 ? 422 : 502) : 500);

export function registerKommoRoutes(app: Express, { requireUser, resolveRequestedTenantId, limiter, supabaseService }: Deps) {
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
    const sb = req.supabase;
    const started = Date.now();
    const step = String(req.body?.step || "leads");
    const cursor = Math.max(1, Math.min(MAX_PAGES, Math.floor(Number(req.body?.cursor)) || 1));

    if ((EXTRA_STEPS as readonly string[]).includes(step)) {
      try {
        return res.json({ ok: true, ...(await runExtraStep(step as ExtraStep, conn, sb, tenantId, cursor, started)) });
      } catch (e: any) {
        if (e instanceof KommoError) return res.json({ ok: true, done: true, saved: 0, warning: `Etapa "${step}": ${e.message}` });
        console.error("[kommo-import]", step, e?.message);
        return res.status(500).json({ error: e?.message || "Falha ao importar da Kommo." });
      }
    }

    try {
      // Funis/etapas: sempre lidos (mapa de etapas); gravados só na 1ª chamada.
      const pipelines = await kommoPipelines(conn);
      if (pipelines.length === 0) return res.status(422).json({ error: "A Kommo não retornou nenhum funil." });
      if (cursor === 1) {
        const { error: funilErr } = await sb.from("crm_funis").upsert(pipelines.map((p) => funilRow(tenantId, p)), { onConflict: "id" });
        if (funilErr) return res.status(500).json({ error: `Não foi possível salvar os funis: ${funilErr.message}` });
      }
      const stageIndex = new Map<string, { idx: number; status: "Novo" | "Fechado" | "Perdido" }>();
      for (const p of pipelines) p.statuses.forEach((s, idx) => stageIndex.set(`${p.id}:${s.id}`, {
        idx, status: s.id === WON ? "Fechado" : s.id === LOST ? "Perdido" : "Novo",
      }));
      const users = await kommoUsers(conn);
      const sellerSync = cursor === 1 ? await syncSellers(supabaseService, tenantId, users) : null;

      let page = cursor;
      let hasNext = true;
      let created = 0, updated = 0, skipped = 0;
      const porFunil: Record<string, { nome: string; vistos: number; salvos: number }> = {};
      const nomeFunil = new Map(pipelines.map((p) => [p.id, p.name]));
      const bump = (pid: number, k: "vistos" | "salvos", n = 1) => {
        const e = (porFunil[pid] ||= { nome: nomeFunil.get(pid) || `Funil ${pid}`, vistos: 0, salvos: 0 });
        e[k] += n;
      };
      const skippedSamples: string[] = [];
      while (hasNext && page <= MAX_PAGES && (page === cursor || Date.now() - started < TIME_BUDGET_MS)) {
        const { items: leads, hasNext: more } = await kommoPage(conn, "/leads", "leads", page, { with: "contacts,loss_reason,catalog_elements" });
        hasNext = more;
        page++;
        if (leads.length === 0) break;
        for (const l of leads) bump(l.pipeline_id, "vistos");

        const contactIds = new Set<number>();
        const companyIds = new Set<number>();
        for (const l of leads) {
          for (const c of l._embedded?.contacts || []) contactIds.add(c.id);
          for (const c of l._embedded?.companies || []) companyIds.add(c.id);
        }
        const contacts = new Map<number, any>((await kommoByIds(conn, "/contacts", "contacts", [...contactIds])).map((c) => [c.id, c]));
        const companies = new Map<number, any>((await kommoByIds(conn, "/companies", "companies", [...companyIds])).map((c) => [c.id, c]));

        // Mescla com o que já existe (não apaga customFields locais do SPY)
        const ids = leads.map((l) => leadUuid(tenantId, l.id));
        const existing = new Map<string, any>();
        for (let i = 0; i < ids.length; i += 80) { // ids na URL: lotes pequenos para não estourar o limite do PostgREST
          const { data: prev, error: prevErr } = await sb.from("leads").select("id, customFields").in("id", ids.slice(i, i + 80));
          if (prevErr) return res.status(500).json({ error: `Falha ao consultar leads existentes: ${prevErr.message}` });
          for (const r of prev || []) existing.set(r.id, r.customFields || {});
        }

        const rows: any[] = [];
        leads.forEach((l, n) => {
          const place = stageIndex.get(`${l.pipeline_id}:${l.status_id}`);
          if (!place) {
            skipped++; // funil arquivado/etapa desconhecida
            if (skippedSamples.length < 5) skippedSamples.push(`lead ${l.id} (funil ${l.pipeline_id}, etapa ${l.status_id})`);
            return;
          }
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
            seller: kommoFieldByName([l], SELLER_RE) || users.get(l.responsible_user_id)?.name || "",
            source: kommoFieldByName([l, contact], SOURCE_RE) || "Não informada",
            status: place.status,
            priority: "Média",
            value: Number(l.price) || 0,
            pipelineId: "comercial",
            stageId: `${funilId(l.pipeline_id)}-${place.idx}`,
            lead_interesse_cliente: kommoFieldByName([l, contact], INTEREST_RE),
            clientId: "", clientName: "",
            productIds: (l._embedded?.catalog_elements || []).map((e: any) => productUuid(tenantId, e.metadata?.catalog_id, e.id)), tenantName: "", scoreIA: 50,
            date: createdIso.slice(0, 10),
            created_at: createdIso,
            customFields: {
              ...(existing.get(id) || {}),
              kommo: {
                leadId: l.id, pipelineId: l.pipeline_id, statusId: l.status_id,
                contactId: main?.id ?? null, companyId: company?.id ?? null,
                lossReason: l._embedded?.loss_reason?.[0]?.name ?? null,
                tags: (l._embedded?.tags || []).map((t: any) => t.name),
                lastContactAt: iso(l.updated_at), closedAt: iso(l.closed_at),
                fields: { ...kommoCustomFields(contact), ...kommoCustomFields(l) },
                syncedAt: new Date().toISOString(),
              },
            },
          });
        });

        if (rows.length > 0) {
          const { error } = await sb.from("leads").upsert(rows, { onConflict: "id" });
          if (error) return res.status(500).json({ error: `Falha ao salvar leads (página ${page - 1}): ${error.message}` });
        }
        for (const r of rows) bump(r.customFields.kommo.pipelineId, "salvos");
        const upd = rows.filter((r) => existing.has(r.id)).length;
        updated += upd;
        created += rows.length - upd;
      }

      const done = !hasNext || page > MAX_PAGES;
      return res.json({
        ok: true, done, nextCursor: done ? null : page,
        funis: pipelines.length, created, updated, skipped, porFunil, skippedSamples,
        vendedores: [...new Set([...users.values()].map((u) => u.name))],
        ...(sellerSync ? { cadastroVendedores: sellerSync } : {}),
        truncated: done && hasNext, // parou no limite de páginas com mais leads na Kommo
        finishedAt: new Date().toISOString(),
      });
    } catch (e: any) {
      console.error("[kommo-import]", e?.message);
      return res.status(errorStatus(e)).json({ error: e?.message || "Falha ao importar da Kommo." });
    }
  });
}
