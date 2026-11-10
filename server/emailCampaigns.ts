import crypto from "node:crypto";
import type { Express } from "express";
import { sendTenantEmail, checkTenantSender } from "./mailer.js";

// Disparo de e-mail em massa por empresa (genérico, qualquer tenant). Regras:
//  - público = leads DA EMPRESA com e-mail válido, filtrados por origem/status; sem repetidos e sem descadastrados;
//  - sai pelo SMTP da empresa (Integrações → SMTP) ou, sem ele, pelo da plataforma;
//  - envio em lotes curtos (cabe no limite da função) que o navegador vai pedindo; retomável e sem envio duplicado;
//  - todo e-mail leva link de descadastro (LGPD) + cabeçalho List-Unsubscribe, e quem sai nunca mais recebe.

const MAX_RECIPIENTS = 10_000;
const BATCH_SIZE = 40;
const CONCURRENCY = 5;
const TIME_BUDGET_MS = 40_000;
const STALE_CLAIM_MS = 3 * 60_000;
const PAGE = 1000;
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export interface Audience {
  /** Filtros aplicados só aos leads. */
  sources?: string[]; statuses?: string[];
  /** Quais cadastros entram. Leads entra por padrão (false para desligar). */
  leads?: boolean; clientes?: boolean; contatos?: boolean; equipe?: boolean;
  /** Lista própria: pessoas que podem nem estar no sistema (inscritos de um formulário, etc.). */
  manual?: { email: string; name?: string }[];
}
interface Candidate { id: string; email: unknown; name?: string | null; company?: string | null }

const secret = () => process.env.EMAIL_OPTOUT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
const sign = (tenantId: string, email: string) => crypto.createHmac("sha256", secret()).update(`${tenantId}|${email}`).digest("hex").slice(0, 32);

export function optoutUrl(base: string, tenantId: string, email: string): string {
  const e = Buffer.from(email, "utf8").toString("base64url");
  return `${base}/api/email/optout?t=${tenantId}&e=${e}&s=${sign(tenantId, email)}`;
}

export const cleanEmail = (raw: unknown): string => {
  const e = String(raw ?? "").trim().toLowerCase();
  return e.length <= 254 && EMAIL_RE.test(e) ? e : "";
};

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Troca {{nome}}, {{primeiro_nome}}, {{empresa}} (valor ausente vira vazio). */
export function renderVars(text: string, v: { name?: string | null; company?: string | null }): string {
  const name = (v.name || "").trim();
  const first = name.split(/\s+/)[0] || "";
  return text
    .replace(/\{\{\s*primeiro[_ ]nome\s*\}\}/gi, first)
    .replace(/\{\{\s*nome\s*\}\}/gi, name)
    .replace(/\{\{\s*empresa\s*\}\}/gi, (v.company || "").trim());
}

/** Texto simples → HTML seguro: parágrafos, quebras de linha e links http(s). */
export function textToHtml(text: string): string {
  const paras = escapeHtml(text.replace(/\r\n/g, "\n").trim()).split(/\n{2,}/);
  return paras
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${p.replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" style="color:#F97316">$1</a>')}</p>`)
    .join("");
}

function buildMail(opts: { subject: string; body: string; name?: string | null; company?: string | null; tenantName: string; unsubUrl: string }) {
  const subject = renderVars(opts.subject, opts).replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  const text = renderVars(opts.body, opts);
  const footerTxt = `\n\n—\nVocê recebeu este e-mail de ${opts.tenantName}. Para não receber mais, acesse: ${opts.unsubUrl}`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;font-size:15px">${textToHtml(text)}</div>
<p style="max-width:600px;margin:14px auto 0;font-size:11px;color:#6b7280;text-align:center">Você recebeu este e-mail de ${escapeHtml(opts.tenantName)}.<br><a href="${opts.unsubUrl}" style="color:#6b7280">Não quero mais receber</a></p>
</body></html>`;
  return { subject, text: text + footerTxt, html };
}

interface Deps { requireUser: any; resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>; limiter: any; supabaseService: any }

async function pagedLeads(db: any, tenantId: string) {
  const out: any[] = [];
  for (let from = 0; from < 60_000; from += PAGE) {
    const { data, error } = await db.from("leads").select("id, name, email, company, source, status")
      .eq("tenant_id", tenantId).is("deleted_at", null).not("email", "is", null).neq("email", "")
      .order("created_at", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function optoutSet(db: any, tenantId: string): Promise<Set<string>> {
  const s = new Set<string>();
  for (let from = 0; ; from += PAGE) {
    const { data } = await db.from("email_optouts").select("email").eq("tenant_id", tenantId).range(from, from + PAGE - 1);
    (data || []).forEach((r: any) => s.add(String(r.email)));
    if (!data || data.length < PAGE) break;
  }
  return s;
}

function filterLeads(leads: any[], aud: Audience): Candidate[] {
  const sources = new Set((aud.sources || []).map(String));
  const statuses = new Set((aud.statuses || []).map(String));
  return leads.filter((l) => (!sources.size || sources.has(String(l.source ?? ""))) && (!statuses.size || statuses.has(String(l.status ?? ""))))
    .map((l) => ({ id: `lead:${l.id}`, email: l.email, name: l.name, company: l.company }));
}

/** Tira inválidos, descadastrados e repetidos (o mesmo e-mail entra uma vez só, venha de onde vier). */
export function dedupeCandidates(cands: Candidate[], optouts: Set<string>) {
  const seen = new Set<string>();
  const rows: { lead_id: string; email: string; name: string; company: string | null }[] = [];
  let semEmail = 0, descadastrados = 0, repetidos = 0;
  for (const c of cands) {
    const email = cleanEmail(c.email);
    if (!email) { semEmail++; continue; }
    if (optouts.has(email)) { descadastrados++; continue; }
    if (seen.has(email)) { repetidos++; continue; }
    seen.add(email);
    rows.push({ lead_id: c.id, email, name: String(c.name || "").trim().slice(0, 120), company: c.company ? String(c.company).slice(0, 120) : null });
  }
  return { rows, semEmail, descadastrados, repetidos };
}

export function selectAudience(leads: any[], aud: Audience, optouts: Set<string>) {
  return dedupeCandidates(filterLeads(leads, aud), optouts);
}

async function pagedTable(db: any, table: string, columns: string, tenantId: string, extra?: (q: any) => any): Promise<any[]> {
  const out: any[] = [];
  for (let from = 0; from < 60_000; from += PAGE) {
    let q = db.from(table).select(columns).eq("tenant_id", tenantId);
    if (extra) q = extra(q);
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Junta todas as fontes escolhidas (leads, clientes, contatos, equipe e lista própria) já sem repetidos/descadastrados. */
export async function resolveAudience(db: any, tenantId: string, aud: Audience) {
  const cands: Candidate[] = [];
  if (aud.leads !== false) cands.push(...filterLeads(await pagedLeads(db, tenantId), aud));
  if (aud.clientes) cands.push(...(await pagedTable(db, "clientes", "id, name, email", tenantId, (q) => q.not("email", "is", null).neq("email", ""))).map((r) => ({ id: `cliente:${r.id}`, email: r.email, name: r.name, company: r.name })));
  if (aud.contatos) cands.push(...(await pagedTable(db, "cliente_contatos", "id, nome, email", tenantId, (q) => q.not("email", "is", null).neq("email", ""))).map((r) => ({ id: `contato:${r.id}`, email: r.email, name: r.nome })));
  if (aud.equipe) cands.push(...(await pagedTable(db, "users", "id, name, email, active", tenantId)).filter((r) => r.active !== false).map((r) => ({ id: `usuario:${r.id}`, email: r.email, name: r.name })));
  if (Array.isArray(aud.manual)) cands.push(...aud.manual.slice(0, MAX_RECIPIENTS + 1).map((m, i) => ({ id: "manual", email: m?.email, name: m?.name })));
  return dedupeCandidates(cands, await optoutSet(db, tenantId));
}

/** Corpo da requisição → público (só campos conhecidos, com limites). */
export function parseAudience(raw: any): Audience {
  const arr = (v: any) => (Array.isArray(v) ? v.map(String).slice(0, 100) : []);
  return {
    sources: arr(raw?.sources), statuses: arr(raw?.statuses),
    leads: raw?.leads !== false, clientes: raw?.clientes === true, contatos: raw?.contatos === true, equipe: raw?.equipe === true,
    manual: Array.isArray(raw?.manual) ? raw.manual.slice(0, MAX_RECIPIENTS + 1).map((m: any) => ({ email: String(m?.email ?? "").slice(0, 254), name: String(m?.name ?? "").slice(0, 120) })) : [],
  };
}

const baseUrl = (req: any) => (process.env.PUBLIC_APP_URL || `https://${req.get("host")}`).replace(/\/+$/, "");

export function registerEmailCampaignRoutes(app: Express, { requireUser, resolveRequestedTenantId, limiter, supabaseService }: Deps) {
  const noDb = (res: any) => res.status(503).json({ error: "Servidor sem acesso ao banco." });

  // Opções para montar o público: origens e status existentes (só leads com e-mail válido).
  app.get("/api/email-campaigns/audience-options", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    try {
      const leads = await pagedLeads(supabaseService, tenantId);
      const count = (key: "source" | "status") => {
        const m = new Map<string, number>();
        for (const l of leads) if (cleanEmail(l.email)) m.set(String(l[key] ?? ""), (m.get(String(l[key] ?? "")) || 0) + 1);
        return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, count: n }));
      };
      const { data: smtp } = await supabaseService.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "integracoes_smtp").maybeSingle();
      const t = smtp?.value;
      const own = !!(t?.smtpServer && t?.smtpUser && t?.smtpPass && String(t?.fromEmail || "").trim());
      res.json({ sources: count("source"), statuses: count("status"), sender: own ? { kind: "tenant", from: String(t.fromEmail) } : { kind: "platform" } });
    } catch (e: any) { res.status(500).json({ error: e?.message || "Falha ao ler os leads." }); }
  });

  // Confere o remetente (login no SMTP, sem enviar e-mail). Só dados não secretos.
  app.get("/api/email-campaigns/sender-check", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    res.json(await checkTenantSender(supabaseService, tenantId));
  });

  app.post("/api/email-campaigns/audience-preview", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    try {
      const sel = await resolveAudience(supabaseService, tenantId, parseAudience(req.body?.audience));
      res.json({ total: sel.rows.length, semEmail: sel.semEmail, descadastrados: sel.descadastrados, repetidos: sel.repetidos, sample: sel.rows.slice(0, 5).map((r) => ({ name: r.name, email: r.email })) });
    } catch (e: any) { res.status(500).json({ error: e?.message || "Falha ao calcular o público." }); }
  });

  app.get("/api/email-campaigns", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    const { data, error } = await supabaseService.from("email_campaigns").select("id, name, subject, status, total, sent, failed, sender, created_at, started_at, finished_at")
      .eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(50);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ campaigns: data || [] });
  });

  // Cria a campanha e congela a lista de destinatários.
  app.post("/api/email-campaigns", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    const name = String(req.body?.name || "").trim().slice(0, 120);
    const subject = String(req.body?.subject || "").replace(/[\r\n]+/g, " ").trim().slice(0, 200);
    const body = String(req.body?.body || "").trim().slice(0, 20_000);
    if (!name || !subject || !body) return res.status(400).json({ error: "Informe nome, assunto e mensagem." });
    try {
      const aud = parseAudience(req.body?.audience);
      const sel = await resolveAudience(supabaseService, tenantId, aud);
      if (sel.rows.length === 0) return res.status(400).json({ error: "Nenhum destinatário com e-mail válido nesse público." });
      if (sel.rows.length > MAX_RECIPIENTS) return res.status(400).json({ error: `Público com ${sel.rows.length} pessoas; o máximo por campanha é ${MAX_RECIPIENTS}. Filtre por origem ou status.` });
      const audience = { ...aud, manual: undefined, manualCount: aud.manual?.length || 0 }; // a lista própria fica nos destinatários, não duplicada aqui
      const { data: camp, error } = await supabaseService.from("email_campaigns")
        .insert({ tenant_id: tenantId, name, subject, body, audience, total: sel.rows.length, status: "ready", created_by: req.user.id }).select("id").single();
      if (error) throw new Error(error.message);
      for (let i = 0; i < sel.rows.length; i += 500) {
        const { error: e2 } = await supabaseService.from("email_campaign_recipients")
          .insert(sel.rows.slice(i, i + 500).map((r) => ({ ...r, campaign_id: camp.id, tenant_id: tenantId })));
        if (e2) { await supabaseService.from("email_campaigns").delete().eq("id", camp.id); throw new Error(e2.message); }
      }
      res.json({ id: camp.id, total: sel.rows.length });
    } catch (e: any) { res.status(500).json({ error: e?.message || "Não foi possível criar a campanha." }); }
  });

  const loadCampaign = async (req: any, res: any, tenantId: string) => {
    const id = String(req.params.id || "");
    if (!UUID.test(id)) { res.status(400).json({ error: "Campanha inválida." }); return null; }
    const { data } = await supabaseService.from("email_campaigns").select("*").eq("id", id).eq("tenant_id", tenantId).maybeSingle();
    if (!data) { res.status(404).json({ error: "Campanha não encontrada." }); return null; }
    return data;
  };

  const mailFor = async (camp: any, tenantName: string, base: string, r: { name?: string | null; company?: string | null; email: string }) =>
    ({ to: r.email, ...buildMail({ subject: camp.subject, body: camp.body, name: r.name, company: r.company, tenantName, unsubUrl: optoutUrl(base, camp.tenant_id, r.email) }),
      headers: { "List-Unsubscribe": `<${optoutUrl(base, camp.tenant_id, r.email)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });

  const tenantNameOf = async (tenantId: string) => {
    const { data } = await supabaseService.from("tenants").select("name").eq("id", tenantId).maybeSingle();
    return String(data?.name || "nossa equipe");
  };

  // Teste: manda UM e-mail só para quem está logado (nunca para outra pessoa).
  app.post("/api/email-campaigns/:id/test", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    const camp = await loadCampaign(req, res, tenantId); if (!camp) return;
    const to = cleanEmail(req.user?.email);
    if (!to) return res.status(400).json({ error: "Sua conta não tem e-mail válido para receber o teste." });
    try {
      const mail = await mailFor(camp, await tenantNameOf(tenantId), baseUrl(req), { name: "Nome de Teste", company: "Empresa de Teste", email: to });
      mail.subject = `[TESTE] ${mail.subject}`;
      const r = await sendTenantEmail(supabaseService, tenantId, mail);
      res.json({ ok: true, to, via: r.via });
    } catch (e: any) { res.status(502).json({ error: `Não foi possível enviar: ${String(e?.message || e).slice(0, 200)}` }); }
  });

  // Envia o próximo lote. O navegador chama de novo até `pending` chegar a 0 (pode fechar e retomar depois).
  app.post("/api/email-campaigns/:id/send-batch", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    const camp = await loadCampaign(req, res, tenantId); if (!camp) return;
    if (camp.status === "cancelled") return res.json({ done: true, status: "cancelled", pending: 0, sent: camp.sent, failed: camp.failed });
    const started = Date.now();
    const db = supabaseService;
    try {
      // Lotes que travaram (função interrompida) voltam para a fila.
      await db.from("email_campaign_recipients").update({ status: "pending", claimed_at: null })
        .eq("campaign_id", camp.id).eq("status", "sending").lt("claimed_at", new Date(Date.now() - STALE_CLAIM_MS).toISOString());
      const { data: cand } = await db.from("email_campaign_recipients").select("id").eq("campaign_id", camp.id).eq("status", "pending").limit(BATCH_SIZE);
      const ids = (cand || []).map((r: any) => r.id);
      let claimed: any[] = [];
      if (ids.length) {
        const { data } = await db.from("email_campaign_recipients").update({ status: "sending", claimed_at: new Date().toISOString() })
          .in("id", ids).eq("status", "pending").select("id, email, name, company");
        claimed = data || [];
      }
      if (camp.status === "ready") await db.from("email_campaigns").update({ status: "sending", started_at: new Date().toISOString() }).eq("id", camp.id);

      const [tenantName, optouts] = await Promise.all([tenantNameOf(tenantId), optoutSet(db, tenantId)]);
      const base = baseUrl(req);
      let via: string | null = null;
      const queue = [...claimed];
      const worker = async () => {
        for (let r = queue.shift(); r; r = queue.shift()) {
          if (Date.now() - started > TIME_BUDGET_MS) { // sem tempo: devolve para a fila
            await db.from("email_campaign_recipients").update({ status: "pending", claimed_at: null }).eq("id", r.id);
            continue;
          }
          if (optouts.has(r.email)) { await db.from("email_campaign_recipients").update({ status: "skipped", error: "descadastrado" }).eq("id", r.id); continue; }
          try {
            const out = await sendTenantEmail(db, tenantId, await mailFor(camp, tenantName, base, r));
            via = out.via;
            await db.from("email_campaign_recipients").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", r.id);
          } catch (e: any) {
            await db.from("email_campaign_recipients").update({ status: "failed", error: String(e?.message || e).slice(0, 300) }).eq("id", r.id);
          }
        }
      };
      await Promise.all(Array.from({ length: CONCURRENCY }, worker));

      const count = async (status: string) => (await db.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", camp.id).eq("status", status)).count || 0;
      const [sent, failed, pending, sending] = await Promise.all([count("sent"), count("failed"), count("pending"), count("sending")]);
      const done = pending === 0 && sending === 0;
      await db.from("email_campaigns").update({
        sent, failed, ...(via ? { sender: via } : {}), ...(done ? { status: "done", finished_at: new Date().toISOString() } : {}),
      }).eq("id", camp.id).neq("status", "cancelled");
      res.json({ done, status: done ? "done" : "sending", pending: pending + sending, sent, failed, total: camp.total });
    } catch (e: any) { res.status(500).json({ error: e?.message || "Falha no envio." }); }
  });

  app.post("/api/email-campaigns/:id/cancel", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    const camp = await loadCampaign(req, res, tenantId); if (!camp) return;
    await supabaseService.from("email_campaign_recipients").update({ status: "skipped", error: "campanha cancelada" }).eq("campaign_id", camp.id).in("status", ["pending", "sending"]);
    await supabaseService.from("email_campaigns").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", camp.id);
    res.json({ ok: true });
  });

  app.get("/api/email-campaigns/:id/failures", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    const camp = await loadCampaign(req, res, tenantId); if (!camp) return;
    const { data } = await supabaseService.from("email_campaign_recipients").select("email, error").eq("campaign_id", camp.id).eq("status", "failed").limit(50);
    res.json({ failures: data || [] });
  });

  // Descadastro público (link do e-mail e clique único do provedor de e-mail). Só grava o e-mail assinado pelo servidor.
  const optout = async (req: any, res: any) => {
    const t = String(req.query.t || ""), s = String(req.query.s || "");
    let email = "";
    try { email = cleanEmail(Buffer.from(String(req.query.e || ""), "base64url").toString("utf8")); } catch { /* inválido */ }
    const ok = !!supabaseService && UUID.test(t) && !!email && !!secret() && s.length === 32
      && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(sign(t, email)));
    // GET só mostra a confirmação (antivírus/leitores de e-mail abrem links sozinhos e não podem descadastrar ninguém).
    if (ok && req.method === "GET") {
      return res.status(200).type("html").send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Descadastro</title>
<body style="font-family:Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f5f5f7;margin:0"><form method="post" style="background:#fff;padding:32px;border-radius:14px;max-width:420px;text-align:center">
<h2 style="margin:0 0 8px">Deixar de receber e-mails?</h2><p style="color:#6b7280;margin:0 0 18px">Confirme para sair desta lista.</p><button style="background:#F97316;color:#fff;border:0;padding:12px 22px;border-radius:10px;font-weight:700;font-size:15px;cursor:pointer">Confirmar saída</button></form></body>`);
    }
    if (ok) await supabaseService.from("email_optouts").upsert({ tenant_id: t, email }, { onConflict: "tenant_id,email", ignoreDuplicates: true });
    res.status(ok ? 200 : 400).type("html").send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Descadastro</title>
<body style="font-family:Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f5f5f7;margin:0"><div style="background:#fff;padding:32px;border-radius:14px;max-width:420px;text-align:center">
<h2 style="margin:0 0 8px">${ok ? "Pronto, você saiu da lista" : "Link inválido"}</h2><p style="color:#6b7280;margin:0">${ok ? "Você não receberá mais e-mails desta empresa." : "Não foi possível confirmar este pedido. Responda o e-mail recebido pedindo para sair da lista."}</p></div></body>`);
  };
  app.get("/api/email/optout", limiter, optout);
  app.post("/api/email/optout", limiter, optout);
}
