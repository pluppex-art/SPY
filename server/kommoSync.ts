/**
 * Conector Kommo → SPY (leitura na Kommo; padrão para qualquer tenant).
 *
 *  POST /api/integrations/kommo/test    valida subdomínio + token e lista os funis da Kommo
 *  POST /api/integrations/kommo/import  importa, em etapas paginadas (body: { step, cursor }):
 *     leads (+ funis/etapas, vendedores, tags, motivo de perda, produtos ligados), entrada (caixa de
 *     entrada), produtos, tags, empresas → Clientes, contatos, notas, tarefas, historico (mudanças de etapa)
 *
 * As credenciais vêm de app_settings["integracoes_catalogo"].kommo (o mesmo cadastro do card
 * em Configurações → Integrações). Tudo é idempotente: ids determinísticos (tenant + id Kommo), então
 * rodar de novo atualiza em vez de duplicar. Cada funil da Kommo vira um funil comercial
 * "Kommo — <nome>" (id `kommo-<pipelineId>`); a etapa do lead segue a convenção do SPY
 * `${funilId}-${índiceDaEtapa}`. O mapeamento fica em kommoMap.ts (compartilhado com o webhook).
 */
import type { Express } from "express";
import { randomBytes } from "crypto";
import {
  kommoConnFromConfig, kommoAccount, kommoPipelines, kommoUsers, kommoPage, kommoCatalogs, kommoFieldValue,
  KommoError, type KommoConn,
} from "./kommoClient.js";
import {
  buildStageIndex, buildStatusNames, buildLeadRows, loadLeadContext, syncLeadTags, noteRow, taskRow, funilRow,
  upsertChunks, leadUuid, productUuid, clip, digits, iso, brDate, isPlaceholderName, allValues,
  type LeadCtx,
} from "./kommoMap.js";

interface Deps {
  requireUser: any;
  resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>;
  limiter: any;
  supabaseService: any;
}

const MAX_PAGES = 800; // 800 × 250 = 200.000 itens — só uma trava de segurança contra laço infinito
const MAX_EVENT_PAGES = 4000; // eventos vêm de 100 em 100
// A Vercel corta a função em 60s: cada chamada processa páginas até este orçamento e devolve o cursor.
const TIME_BUDGET_MS = 30_000;

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

const EXTRA_STEPS = ["produtos", "tags", "empresas", "contatos", "entrada", "notas", "tarefas", "historico"] as const;
type ExtraStep = (typeof EXTRA_STEPS)[number];

interface StepResult {
  done: boolean; nextCursor?: number | null;
  vistos: number; saved: number; // vistos = o que a Kommo entregou; saved = o que foi gravado no SPY
  warning?: string; detalhe?: Record<string, number>;
}

/**
 * Etapas complementares do "Kommo completo". Cada uma é paginada por cursor e respeita o orçamento
 * de tempo. Falha de uma etapa NÃO derruba a importação: devolve `warning` e segue.
 */
async function runExtraStep(step: ExtraStep, conn: KommoConn, sb: any, tenantId: string, cursor: number, started: number): Promise<StepResult> {
  const t8 = tenantId.slice(0, 8);
  const fail = (vistos: number, saved: number, msg: string): StepResult => ({ done: true, vistos, saved, warning: msg });

  // ── Produtos (catálogos): nunca sobrescreve o que já existe ─────────────────────────────────────
  if (step === "produtos") {
    let vistos = 0, saved = 0;
    for (const cat of (await kommoCatalogs(conn)).filter((c) => c.type === "products")) {
      for (let page = 1; page <= 40; page++) {
        const { items, hasNext } = await kommoPage(conn, `/catalogs/${cat.id}/elements`, "elements", page);
        vistos += items.length;
        const rows = items.map((e) => ({
          id: productUuid(tenantId, cat.id, e.id), tenant_id: tenantId, name: clip(e.name || `Produto ${e.id}`, 255),
          sku: clip(kommoFieldValue(e, "SKU"), 100) || null, description: kommoFieldValue(e, "DESCRIPTION") || null,
          price: Number(kommoFieldValue(e, "PRICE").replace(",", ".")) || 0, active: true,
        }));
        if (rows.length) {
          // Preço/nome editados no SPY valem mais que a Kommo: só cria os que faltam e preenche preço zerado.
          const { data: have, error: haveErr } = await sb.from("products").select("id, price").in("id", rows.map((r) => r.id));
          if (haveErr) return fail(vistos, saved, `Produtos não importados: ${haveErr.message}`);
          const existing = new Map<string, number>((have || []).map((h: any) => [h.id, Number(h.price) || 0]));
          const novos = rows.filter((r) => !existing.has(r.id));
          if (novos.length) {
            const { error } = await sb.from("products").insert(novos);
            if (error) return fail(vistos, saved, `Produtos não importados: ${error.message}`);
          }
          for (const r of rows) if (existing.has(r.id) && existing.get(r.id) === 0 && r.price > 0) await sb.from("products").update({ price: r.price }).eq("id", r.id);
          saved += rows.length; // novos + já existentes (mantidos como estão)
        }
        if (!hasNext) break;
      }
    }
    return { done: true, vistos, saved };
  }

  // ── Tags: todas as da conta (as usadas pelos leads já são ligadas na etapa de leads) ────────────
  if (step === "tags") {
    const names: string[] = [];
    for (let page = 1; page <= 40; page++) {
      const { items, hasNext } = await kommoPage(conn, "/leads/tags", "tags", page);
      names.push(...items.map((t) => String(t.name || "").trim()).filter(Boolean));
      if (!hasNext) break;
    }
    const r = await syncLeadTags(sb, tenantId, [], names);
    return r.error ? fail(names.length, 0, `Tags não importadas: ${r.error}`) : { done: true, vistos: names.length, saved: names.length };
  }

  // Dados de apoio, só quando a etapa precisa
  const users = ["notas", "tarefas", "historico"].includes(step) ? await kommoUsers(conn) : new Map();
  const spyByEmail = new Map<string, string>();
  if (step === "tarefas") {
    const { data } = await sb.from("users").select("id, email").eq("tenant_id", tenantId);
    for (const u of data || []) if (u.email) spyByEmail.set(String(u.email).toLowerCase(), u.id);
  }
  const pipelines = step === "historico" || step === "entrada" ? await kommoPipelines(conn) : [];
  const statusNames = buildStatusNames(pipelines);
  const entradaCtx: Pick<LeadCtx, "users" | "stageIndex"> | null = step === "entrada"
    ? { users: await kommoUsers(conn), stageIndex: buildStageIndex(pipelines) } : null;

  const limit = step === "historico" ? 100 : 250;
  const maxPages = step === "historico" ? MAX_EVENT_PAGES : MAX_PAGES;
  let page = cursor, hasNext = true, vistos = 0, saved = 0;
  const detalhe: Record<string, number> = {};
  const add = (k: string, n: number) => { detalhe[k] = (detalhe[k] || 0) + n; };

  while (hasNext && page <= maxPages && (page === cursor || Date.now() - started < TIME_BUDGET_MS)) {
    const path = { empresas: "/companies", contatos: "/contacts", entrada: "/leads/unsorted", notas: "/leads/notes", tarefas: "/tasks", historico: "/events" }[step];
    const key = { empresas: "companies", contatos: "contacts", entrada: "unsorted", notas: "notes", tarefas: "tasks", historico: "events" }[step];
    const params: Record<string, string> = step === "tarefas" ? { "filter[entity_type]": "leads" }
      : step === "contatos" ? { with: "leads" }
      : step === "historico" ? { "filter[type]": "lead_status_changed" } : {};
    const { items, hasNext: more } = await kommoPage(conn, path, key, page, params, limit);
    hasNext = more; page++;
    if (items.length === 0) break;
    vistos += items.length;

    if (step === "empresas") {
      const rows = items.filter((c) => !isPlaceholderName(String(c.name || ""))).map((c) => ({
        id: `kommo-${t8}-${c.id}`, tenant_id: tenantId, name: clip(c.name, 255),
        phone: digits(kommoFieldValue(c, "PHONE")), email: kommoFieldValue(c, "EMAIL").toLowerCase(), status: "Ativo",
      }));
      const err = await upsertChunks(sb, "clientes", rows);
      if (err) return fail(vistos, saved, `Empresas não importadas: ${err}`);
      saved += rows.length;
      add("sem nome (ignoradas)", items.length - rows.length);

    } else if (step === "contatos") {
      // Contato que já é lead vive no próprio lead (nome/telefone/e-mail + todos os campos).
      // Com empresa importada → "Contatos" da empresa; sem lead e sem empresa → cliente (pessoa solta).
      const companyIds = [...new Set(items.flatMap((c) => (c._embedded?.companies || []).map((x: any) => x.id)))];
      const haveCompany = new Set<string>();
      for (let i = 0; i < companyIds.length; i += 80) {
        const ids = companyIds.slice(i, i + 80).map((id) => `kommo-${t8}-${id}`);
        const { data } = await sb.from("clientes").select("id").in("id", ids);
        for (const r of data || []) haveCompany.add(r.id);
      }
      const contatos: any[] = [], soltos: any[] = [];
      for (const c of items) {
        const phones = allValues(c, "PHONE"), emails = allValues(c, "EMAIL");
        const companyId = (c._embedded?.companies || [])[0]?.id;
        const clienteId = companyId ? `kommo-${t8}-${companyId}` : null;
        const hasLead = (c._embedded?.leads || []).length > 0;
        if (clienteId && haveCompany.has(clienteId)) {
          contatos.push({
            id: `kommo-ct-${t8}-${c.id}`, tenant_id: tenantId, cliente_id: clienteId, nome: clip(c.name || `Contato ${c.id}`, 255),
            cargo: kommoFieldValue(c, "POSITION") || null, email: emails[0]?.toLowerCase() || null,
            telefone: phones[0] ? digits(phones[0]) : null, whatsapp: phones[1] ? digits(phones[1]) : null,
            observacoes: [emails.length > 1 ? `Outros e-mails: ${emails.slice(1).join(", ")}` : "", phones.length > 2 ? `Outros telefones: ${phones.slice(2).join(", ")}` : ""].filter(Boolean).join(" | ") || null,
            principal: false,
          });
        } else if (hasLead) {
          add("já no lead", 1);
        } else if (!isPlaceholderName(String(c.name || ""))) {
          soltos.push({
            id: `kommo-ct-${t8}-${c.id}`, tenant_id: tenantId, name: clip(c.name, 255),
            phone: phones[0] ? digits(phones[0]) : "", email: emails[0]?.toLowerCase() || "", status: "Ativo",
          });
        } else add("sem nome (ignorados)", 1);
      }
      const e1 = await upsertChunks(sb, "cliente_contatos", contatos);
      if (e1) return fail(vistos, saved, `Contatos não importados: ${e1}`);
      const e2 = await upsertChunks(sb, "clientes", soltos);
      if (e2) return fail(vistos, saved, `Contatos soltos não importados: ${e2}`);
      saved += contatos.length + soltos.length;
      add("contato de empresa", contatos.length); add("cliente (sem lead)", soltos.length);

    } else if (step === "entrada") {
      // Leads da caixa de entrada: a API de leads não os devolve. Caem na 1ª etapa do funil.
      const leads: any[] = [], sourceByLead = new Map<number, string>(), embeddedContacts: any[] = [];
      for (const it of items) {
        const lead = it._embedded?.leads?.[0];
        if (!lead) continue;
        const pid = lead.pipeline_id ?? it.pipeline_id;
        const incoming = pipelines.find((p) => p.id === pid)?.incomingIds[0];
        if (!incoming) continue;
        embeddedContacts.push(...(it._embedded?.contacts || []));
        if (it.source_name) sourceByLead.set(lead.id, String(it.source_name));
        leads.push({
          ...lead, pipeline_id: pid, status_id: incoming, created_at: lead.created_at ?? it.created_at,
          _embedded: {
            ...(lead._embedded || {}),
            contacts: (it._embedded?.contacts || []).map((c: any) => ({ id: c.id, is_main: true })),
            companies: (it._embedded?.companies || []).map((c: any) => ({ id: c.id })),
          },
        });
      }
      if (leads.length) {
        const ctx: LeadCtx = { tenantId, ...entradaCtx!, ...(await loadLeadContext(conn, sb, tenantId, leads, embeddedContacts)) };
        const built = buildLeadRows(ctx, leads, "Caixa de entrada");
        for (const r of built.rows) {
          if (r.source === "Caixa de entrada" && sourceByLead.has(r.customFields.kommo.leadId)) r.source = sourceByLead.get(r.customFields.kommo.leadId);
          r.customFields.kommo.caixaDeEntrada = true;
        }
        const err = await upsertChunks(sb, "leads", built.rows);
        if (err) return fail(vistos, saved, `Leads da caixa de entrada não importados: ${err}`);
        const tg = await syncLeadTags(sb, tenantId, built.tagPairs);
        saved += built.rows.length;
        if (tg.error) return { done: !hasNext, nextCursor: hasNext ? page : null, vistos, saved, warning: `Tags da caixa de entrada: ${tg.error}` };
      }

    } else if (step === "notas") {
      const rows = items.map((n) => noteRow(tenantId, n, users));
      const err = await upsertChunks(sb, "lead_activities", rows);
      if (err) return fail(vistos, saved, `Notas não importadas: ${err}`);
      saved += rows.length;

    } else if (step === "tarefas") {
      const leadIds = [...new Set(items.map((t) => leadUuid(tenantId, t.entity_id)))];
      const existing = new Set<string>();
      for (let i = 0; i < leadIds.length; i += 80) {
        const { data } = await sb.from("leads").select("id").in("id", leadIds.slice(i, i + 80));
        for (const r of data || []) existing.add(r.id);
      }
      const rows = items.map((t) => taskRow(tenantId, t, users, spyByEmail, (id) => existing.has(id)));
      const err = await upsertChunks(sb, "tasks", rows);
      if (err) return fail(vistos, saved, `Tarefas não importadas: ${err}`);
      saved += rows.length;

    } else {
      // historico: cada mudança de etapa vira uma linha no histórico do lead
      const nome = (v: any) => {
        const st = v?.[0]?.lead_status;
        return st ? (statusNames.get(`${st.pipeline_id}:${st.id}`) || `Etapa ${st.id}`) : "—";
      };
      const funil = (v: any) => {
        const st = v?.[0]?.lead_status;
        return st ? (pipelines.find((p) => p.id === st.pipeline_id)?.name || "") : "";
      };
      const rows = items.filter((e) => e.entity_id).map((e) => {
        const when = iso(e.created_at) || new Date().toISOString();
        const de = nome(e.value_before), para = nome(e.value_after);
        const fDe = funil(e.value_before), fPara = funil(e.value_after);
        return {
          id: `kommo-evt-${t8}-${e.id}`, tenant_id: tenantId, lead_id: leadUuid(tenantId, e.entity_id),
          type: "Outro", title: "Mudança de etapa",
          description: fDe && fPara && fDe !== fPara ? `${fDe} › ${de}  →  ${fPara} › ${para}` : `${de}  →  ${para}`,
          date: brDate(when),
          seller: e.created_by ? (users.get(e.created_by)?.name || "Kommo") : "Kommo",
          created_at: when,
        };
      });
      const err = await upsertChunks(sb, "lead_activities", rows);
      if (err) return fail(vistos, saved, `Histórico de etapas não importado: ${err}`);
      saved += rows.length;
    }
  }
  const done = !hasNext || page > maxPages;
  return { done, nextCursor: done ? null : page, vistos, saved, ...(Object.keys(detalhe).length ? { detalhe } : {}) };
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
    const cursor = Math.max(1, Math.min(MAX_EVENT_PAGES, Math.floor(Number(req.body?.cursor)) || 1));

    if ((EXTRA_STEPS as readonly string[]).includes(step)) {
      try {
        return res.json({ ok: true, ...(await runExtraStep(step as ExtraStep, conn, sb, tenantId, cursor, started)) });
      } catch (e: any) {
        if (e instanceof KommoError) return res.json({ ok: true, done: true, vistos: 0, saved: 0, warning: `Etapa "${step}": ${e.message}` });
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
      const stageIndex = buildStageIndex(pipelines);
      const users = await kommoUsers(conn);
      const sellerSync = cursor === 1 ? await syncSellers(supabaseService, tenantId, users) : null;

      let page = cursor, hasNext = true, created = 0, updated = 0, skipped = 0, vistos = 0, tagLinks = 0;
      let warning: string | undefined;
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
        vistos += leads.length;
        for (const l of leads) bump(l.pipeline_id, "vistos");

        const ctx: LeadCtx = { tenantId, users, stageIndex, ...(await loadLeadContext(conn, sb, tenantId, leads)) };
        const built = buildLeadRows(ctx, leads);
        for (const s of built.skipped) {
          skipped++; // funil arquivado/etapa desconhecida
          if (skippedSamples.length < 5) skippedSamples.push(`lead ${s.id} (funil ${s.pipelineId}, etapa ${s.statusId})`);
        }
        if (built.rows.length > 0) {
          const { error } = await sb.from("leads").upsert(built.rows, { onConflict: "id" });
          if (error) return res.status(500).json({ error: `Falha ao salvar leads (página ${page - 1}): ${error.message}` });
          const tg = await syncLeadTags(sb, tenantId, built.tagPairs);
          if (tg.error) warning = `Tags dos leads: ${tg.error}`; else tagLinks += tg.links;
        }
        for (const r of built.rows) bump(r.customFields.kommo.pipelineId, "salvos");
        const upd = built.rows.filter((r) => ctx.existing.has(r.id)).length;
        updated += upd;
        created += built.rows.length - upd;
      }

      const done = !hasNext || page > MAX_PAGES;
      return res.json({
        ok: true, done, nextCursor: done ? null : page,
        funis: pipelines.length, created, updated, skipped, vistos, tagLinks, porFunil, skippedSamples,
        vendedores: [...new Set([...users.values()].map((u) => u.name))],
        ...(sellerSync ? { cadastroVendedores: sellerSync } : {}),
        ...(warning ? { warning } : {}),
        truncated: done && hasNext, // parou no limite de páginas com mais leads na Kommo
        finishedAt: new Date().toISOString(),
      });
    } catch (e: any) {
      console.error("[kommo-import]", e?.message);
      return res.status(errorStatus(e)).json({ error: e?.message || "Falha ao importar da Kommo." });
    }
  });
}

