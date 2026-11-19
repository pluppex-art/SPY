import { modulosDoCargo } from "../src/lib/cargosUsuario.js";
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
/** Teto de envios por empresa nas últimas 24h: com SMTP próprio a reputação é dela; sem ele, o servidor é da plataforma e o teto é bem menor. */
const COTA_DIARIA_SMTP_PROPRIO = 5_000;
const COTA_DIARIA_SMTP_PLATAFORMA = 300;
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
  /** E-mails que o usuário tirou da lista na prévia. */
  excluir?: string[];
}
interface Candidate { id: string; email: unknown; name?: string | null; company?: string | null }

const secret = () => process.env.EMAIL_OPTOUT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || "";
const sign = (tenantId: string, email: string) => crypto.createHmac("sha256", secret()).update(`${tenantId}|${email}`).digest("hex").slice(0, 32);

/** Assinatura dos links de rastreio (abertura e clique): ninguém consegue montar um link que redireciona para onde quiser. */
const sigRastreio = (rid: string, alvo = "") => crypto.createHmac("sha256", secret()).update(`track|${rid}|${alvo}`).digest("hex").slice(0, 32);
export const urlAbertura = (base: string, rid: string) => `${base}/api/email/o/${rid}.gif?s=${sigRastreio(rid)}`;
export const urlClique = (base: string, rid: string, destino: string) => `${base}/api/email/c/${rid}?u=${Buffer.from(destino, "utf8").toString("base64url")}&s=${sigRastreio(rid, destino)}`;

export function optoutUrl(base: string, tenantId: string, email: string): string {
  const e = Buffer.from(email, "utf8").toString("base64url");
  return `${base}/api/email/optout?t=${tenantId}&e=${e}&s=${sign(tenantId, email)}`;
}

// Endereços que nunca são de uma pessoa real: domínios reservados para exemplo/teste (RFC 2606) e erros de digitação
// muito comuns (gmai.com, hotmail.con...). Enviar para eles só gera devolução e piora a reputação do remetente.
const RESERVED_DOMAIN = /(^|\.)(example\.(com|net|org)|invalid|test|localhost|local)$/;
const TYPO_DOMAINS = new Set([
  "gmai.com", "gmial.com", "gmil.com", "gmail.con", "gmail.co", "gmail.cm", "gmaill.com", "gamil.com", "gnail.com",
  "hotmai.com", "hotmial.com", "hotmail.con", "hotmal.com", "hotamil.com", "outlok.com", "outloock.com", "outlook.con",
  "yaho.com", "yahoo.con", "yahho.com", "yahoo.com.b", "icloud.con", "bol.com.b",
]);
export const cleanEmail = (raw: unknown): string => {
  const e = String(raw ?? "").trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e)) return "";
  const domain = e.split("@")[1];
  return RESERVED_DOMAIN.test(domain) || TYPO_DOMAINS.has(domain) ? "" : e;
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

/** Roxo padrão do S.P.Y.; a empresa com cor própria (tenants.primary_color) usa a dela. */
const DEFAULT_LINK_COLOR = "#7C3AED";
const safeColor = (c?: string | null) => (c && /^#[0-9a-fA-F]{6}$/.test(c) ? c : DEFAULT_LINK_COLOR);

/** Texto simples → HTML seguro: parágrafos, quebras de linha e links http(s). `rastrear` troca o destino do link (contagem de cliques). */
export function textToHtml(text: string, color = DEFAULT_LINK_COLOR, rastrear?: (urlOriginal: string) => string): string {
  const paras = escapeHtml(text.replace(/\r\n/g, "\n").trim()).split(/\n{2,}/);
  return paras
    .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${p.replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, (m) => `<a href="${rastrear ? rastrear(m.replace(/&amp;/g, "&")) : m}" style="color:${color}">${m}</a>`)}</p>`)
    .join("");
}

function buildMail(opts: { subject: string; body: string; name?: string | null; company?: string | null; tenantName: string; tenantColor?: string | null; unsubUrl: string; track?: { base: string; rid: string } }) {
  const subject = renderVars(opts.subject, opts).replace(/[\r\n]+/g, " ").trim().slice(0, 200);
  const text = renderVars(opts.body, opts);
  const footerTxt = `\n\n—\nVocê recebeu este e-mail de ${opts.tenantName}. Para não receber mais, acesse: ${opts.unsubUrl}`;
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;font-size:15px">${textToHtml(text, safeColor(opts.tenantColor), opts.track ? (u) => urlClique(opts.track!.base, opts.track!.rid, u) : undefined)}</div>
<p style="max-width:600px;margin:14px auto 0;font-size:11px;color:#6b7280;text-align:center">Você recebeu este e-mail de ${escapeHtml(opts.tenantName)}.<br><a href="${opts.unsubUrl}" style="color:#6b7280">Não quero mais receber</a></p>
${opts.track ? `<img src="${urlAbertura(opts.track.base, opts.track.rid)}" width="1" height="1" alt="" style="display:none;border:0">` : ""}</body></html>`;
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
export function dedupeCandidates(cands: Candidate[], optouts: Set<string>, excluir: Set<string> = new Set()) {
  const seen = new Set<string>();
  const rows: { lead_id: string; email: string; name: string; company: string | null }[] = [];
  let semEmail = 0, descadastrados = 0, repetidos = 0, excluidos = 0;
  for (const c of cands) {
    const email = cleanEmail(c.email);
    if (!email) { semEmail++; continue; }
    if (excluir.has(email)) { excluidos++; continue; }
    if (optouts.has(email)) { descadastrados++; continue; }
    if (seen.has(email)) { repetidos++; continue; }
    seen.add(email);
    rows.push({ lead_id: c.id, email, name: String(c.name || "").trim().slice(0, 120), company: c.company ? String(c.company).slice(0, 120) : null });
  }
  return { rows, semEmail, descadastrados, repetidos, excluidos };
}

/**
 * Envia uma mensagem (já aprovada por uma pessoa) para leads da empresa por e-mail: usado pelos Gatilhos de mensagem.
 * Mesmas proteções das campanhas: só leads da empresa com e-mail válido, sem repetidos, sem descadastrados, com link de
 * descadastro e dentro da cota diária.
 */
export async function enviarEmailParaLeads(db: any, tenantId: string, base: string, leadIds: string[], texto: string): Promise<{ enviados: number; falhas: number; semEmail: number; descadastrados: number; bloqueadosPelaCota: number }> {
  const ids = Array.from(new Set(leadIds.map(String))).slice(0, 500);
  const { data: leads } = await db.from("leads").select("id, name, email, company").eq("tenant_id", tenantId).is("deleted_at", null).in("id", ids);
  const { data: tn } = await db.from("tenants").select("name, primary_color").eq("id", tenantId).maybeSingle();
  const { data: smtp } = await db.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "integracoes_smtp").maybeSingle();
  const t = smtp?.value;
  const proprio = !!(t?.smtpServer && t?.smtpUser && t?.smtpPass && String(t?.fromEmail || "").trim());
  const { count } = await db.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "sent").gte("sent_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  let restante = Math.max(0, (proprio ? COTA_DIARIA_SMTP_PROPRIO : COTA_DIARIA_SMTP_PLATAFORMA) - (count || 0));
  const { rows, semEmail, descadastrados } = dedupeCandidates((leads || []).map((l: any) => ({ id: `lead:${l.id}`, email: l.email, name: l.name, company: l.company })), await optoutSet(db, tenantId));
  const tenantName = String(tn?.name || "nossa equipe");
  let enviados = 0, falhas = 0, bloqueadosPelaCota = 0;
  for (const r of rows) {
    if (restante <= 0) { bloqueadosPelaCota++; continue; }
    const unsub = optoutUrl(base, tenantId, r.email);
    const mail = buildMail({ subject: `Uma mensagem de ${tenantName}`, body: texto, name: r.name, company: r.company, tenantName, tenantColor: tn?.primary_color ?? null, unsubUrl: unsub });
    try {
      await sendTenantEmail(db, tenantId, { to: r.email, ...mail, headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });
      enviados++; restante--;
    } catch { falhas++; }
  }
  return { enviados, falhas, semEmail, descadastrados, bloqueadosPelaCota };
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
  return dedupeCandidates(cands, await optoutSet(db, tenantId), new Set((aud.excluir || []).map((e) => String(e).trim().toLowerCase())));
}

/** Corpo da requisição → público (só campos conhecidos, com limites). */
export function parseAudience(raw: any): Audience {
  const arr = (v: any) => (Array.isArray(v) ? v.map(String).slice(0, 100) : []);
  return {
    sources: arr(raw?.sources), statuses: arr(raw?.statuses),
    leads: raw?.leads !== false, clientes: raw?.clientes === true, contatos: raw?.contatos === true, equipe: raw?.equipe === true,
    excluir: Array.isArray(raw?.excluir) ? raw.excluir.map((e: any) => String(e).slice(0, 254)).slice(0, 20_000) : [],
    manual: Array.isArray(raw?.manual) ? raw.manual.slice(0, MAX_RECIPIENTS + 1).map((m: any) => ({ email: String(m?.email ?? "").slice(0, 254), name: String(m?.name ?? "").slice(0, 120) })) : [],
  };
}

const baseUrl = (req: any) => (process.env.PUBLIC_APP_URL || `https://${req.get("host")}`).replace(/\/+$/, "");

export function registerEmailCampaignRoutes(app: Express, { requireUser, resolveRequestedTenantId, limiter, supabaseService }: Deps) {
  const noDb = (res: any) => res.status(503).json({ error: "Servidor sem acesso ao banco." });

  /** Só quem tem o módulo Marketing (na empresa e no cargo) cria e dispara campanhas: o menu já escondia isso, agora o servidor também confere. */
  const liberarMarketing = async (req: any, res: any, tenantId: string): Promise<boolean> => {
    try {
      const { data: t } = await supabaseService.from("tenants").select("modules").eq("id", tenantId).is("deleted_at", null).maybeSingle();
      const { data: u } = await supabaseService.from("users").select("role, is_master, is_tenant_admin, tenant_id").eq("id", req.user.id).maybeSingle();
      const admin = !!u && (u.is_master === true || (u.is_tenant_admin === true && u.tenant_id === tenantId));
      if (u?.is_master !== true && t?.modules?.marketing !== true) { res.status(403).json({ error: "O módulo Marketing não está ativo nesta empresa." }); return false; }
      if (admin) return true;
      const { data: cargos } = await supabaseService.from("cargos").select("nome, modulos, restringir_aos_proprios_dados").eq("tenant_id", tenantId);
      const mods = modulosDoCargo({ role: u?.role }, cargos || []);
      if (mods && !mods.includes("marketing")) { res.status(403).json({ error: "Seu perfil não tem acesso ao Marketing." }); return false; }
      return true;
    } catch { res.status(500).json({ error: "Não foi possível conferir a permissão." }); return false; }
  };

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
      res.json({ total: sel.rows.length, semEmail: sel.semEmail, descadastrados: sel.descadastrados, repetidos: sel.repetidos, excluidos: sel.excluidos, sample: sel.rows.slice(0, 200).map((r) => ({ name: r.name, email: r.email })) });
    } catch (e: any) { res.status(500).json({ error: e?.message || "Falha ao calcular o público." }); }
  });

  app.get("/api/email-campaigns", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    const colunas = "id, name, subject, status, total, sent, failed, sender, created_at, started_at, finished_at";
    let { data, error } = await supabaseService.from("email_campaigns").select(`${colunas}, opened, clicked`).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(50);
    if (error && /opened|clicked/i.test(error.message)) // migração 20261126 ainda não aplicada: lista sem as métricas
      ({ data, error } = await supabaseService.from("email_campaigns").select(colunas).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(50));
    if (error) return res.status(500).json({ error: error.message });
    res.json({ campaigns: data || [] });
  });

  // Cria a campanha e congela a lista de destinatários.
  app.post("/api/email-campaigns", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    if (!(await liberarMarketing(req, res, tenantId))) return;
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

  const mailFor = async (camp: any, tenant: { name: string; color: string | null }, base: string, r: { id?: string; name?: string | null; company?: string | null; email: string }) =>
    ({ to: r.email, ...buildMail({ subject: camp.subject, body: camp.body, name: r.name, company: r.company, tenantName: tenant.name, tenantColor: tenant.color, unsubUrl: optoutUrl(base, camp.tenant_id, r.email) , track: r.id ? { base, rid: r.id } : undefined }),
      headers: { "List-Unsubscribe": `<${optoutUrl(base, camp.tenant_id, r.email)}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } });

  const tenantNameOf = async (tenantId: string) => {
    const { data } = await supabaseService.from("tenants").select("name, primary_color").eq("id", tenantId).maybeSingle();
    return { name: String(data?.name || "nossa equipe"), color: (data?.primary_color as string | null) || null };
  };

  // Teste: manda UM e-mail só para quem está logado (nunca para outra pessoa).
  app.post("/api/email-campaigns/:id/test", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    if (!(await liberarMarketing(req, res, tenantId))) return;
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

  /** Quantos e-mails a empresa ainda pode enviar nas últimas 24h (protege a reputação do remetente e da plataforma). */
  const cotaRestante = async (db: any, tenantId: string): Promise<{ restante: number; limite: number; proprio: boolean }> => {
    const { data: smtp } = await db.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "integracoes_smtp").maybeSingle();
    const t = smtp?.value;
    const proprio = !!(t?.smtpServer && t?.smtpUser && t?.smtpPass && String(t?.fromEmail || "").trim());
    const limite = proprio ? COTA_DIARIA_SMTP_PROPRIO : COTA_DIARIA_SMTP_PLATAFORMA;
    const { count } = await db.from("email_campaign_recipients").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "sent").gte("sent_at", new Date(Date.now() - 24 * 3600_000).toISOString());
    return { restante: Math.max(0, limite - (count || 0)), limite, proprio };
  };

  type ResultadoLote = { done: boolean; status: string; pending: number; sent: number; failed: number; total: number; cota?: { limite: number; proprio: boolean } };

  /** Envia o próximo lote de uma campanha (usado pelo navegador e pela rotina automática). */
  const processarLote = async (camp: any, tenantId: string, base: string): Promise<ResultadoLote> => {
    if (camp.status === "cancelled") return { done: true, status: "cancelled", pending: 0, sent: camp.sent, failed: camp.failed, total: camp.total };
    const started = Date.now();
    const db = supabaseService;
    // Lotes que travaram (função interrompida) voltam para a fila.
    await db.from("email_campaign_recipients").update({ status: "pending", claimed_at: null })
      .eq("campaign_id", camp.id).eq("status", "sending").lt("claimed_at", new Date(Date.now() - STALE_CLAIM_MS).toISOString());
    const cota = await cotaRestante(db, tenantId);
    const tamanho = Math.min(BATCH_SIZE, cota.restante);
    let claimed: any[] = [];
    if (tamanho > 0) {
      const { data: cand } = await db.from("email_campaign_recipients").select("id").eq("campaign_id", camp.id).eq("status", "pending").limit(tamanho);
      const ids = (cand || []).map((r: any) => r.id);
      if (ids.length) {
        const { data } = await db.from("email_campaign_recipients").update({ status: "sending", claimed_at: new Date().toISOString() })
          .in("id", ids).eq("status", "pending").select("id, email, name, company");
        claimed = data || [];
      }
    }
    if (camp.status === "ready") await db.from("email_campaigns").update({ status: "sending", started_at: new Date().toISOString() }).eq("id", camp.id);

    const [tenant, optouts] = await Promise.all([tenantNameOf(tenantId), optoutSet(db, tenantId)]);
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
          const out = await sendTenantEmail(db, tenantId, await mailFor(camp, tenant, base, r));
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
    return { done, status: done ? "done" : "sending", pending: pending + sending, sent, failed, total: camp.total, ...(tamanho === 0 && !done ? { cota: { limite: cota.limite, proprio: cota.proprio } } : {}) };
  };

  // Envia o próximo lote. O navegador chama de novo até `pending` chegar a 0 (pode fechar e retomar depois).
  app.post("/api/email-campaigns/:id/send-batch", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    if (!(await liberarMarketing(req, res, tenantId))) return;
    const camp = await loadCampaign(req, res, tenantId); if (!camp) return;
    try { res.json(await processarLote(camp, tenantId, baseUrl(req))); }
    catch (e: any) { res.status(500).json({ error: e?.message || "Falha no envio." }); }
  });

  /**
   * Rotina automática (Vercel Cron): continua sozinha as campanhas que ficaram "enviando" — por exemplo quando a aba foi
   * fechada ou a cota diária acabou e liberou de novo. Protegida por CRON_SECRET.
   */
  app.get("/api/email-campaigns/cron/continuar", async (req: any, res: any) => {
    const segredo = process.env.CRON_SECRET;
    const auth = String(req.headers.authorization || "");
    if (!segredo || !supabaseService || auth.length !== `Bearer ${segredo}`.length || !crypto.timingSafeEqual(Buffer.from(auth), Buffer.from(`Bearer ${segredo}`))) return res.status(401).json({ error: "Não autorizado." });
    const inicio = Date.now();
    const { data: campanhas } = await supabaseService.from("email_campaigns").select("*").eq("status", "sending").order("started_at", { ascending: true }).limit(20);
    let lotes = 0;
    for (const camp of campanhas || []) {
      if (Date.now() - inicio > 45_000) break;
      try { await processarLote(camp, camp.tenant_id, (process.env.PUBLIC_APP_URL || `https://${req.get("host")}`).replace(/\/+$/, "")); lotes++; } catch (e: any) { console.warn("[email cron]", camp.id, e?.message); }
    }
    res.json({ campanhas: (campanhas || []).length, lotes });
  });

  app.post("/api/email-campaigns/:id/cancel", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    if (!(await liberarMarketing(req, res, tenantId))) return;
    const camp = await loadCampaign(req, res, tenantId); if (!camp) return;
    await supabaseService.from("email_campaign_recipients").update({ status: "skipped", error: "campanha cancelada" }).eq("campaign_id", camp.id).in("status", ["pending", "sending"]);
    await supabaseService.from("email_campaigns").update({ status: "cancelled", finished_at: new Date().toISOString() }).eq("id", camp.id);
    res.json({ ok: true });
  });

  /** Põe os envios que falharam de volta na fila (para tentar de novo) e reabre a campanha. */
  app.post("/api/email-campaigns/:id/retry-failed", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return noDb(res);
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    if (!(await liberarMarketing(req, res, tenantId))) return;
    const camp = await loadCampaign(req, res, tenantId); if (!camp) return;
    if (camp.status === "cancelled") return res.status(409).json({ error: "Campanha cancelada." });
    const { data } = await supabaseService.from("email_campaign_recipients").update({ status: "pending", error: null, claimed_at: null }).eq("campaign_id", camp.id).eq("status", "failed").select("id");
    const n = data?.length || 0;
    if (n > 0) await supabaseService.from("email_campaigns").update({ status: "sending", failed: 0 }).eq("id", camp.id);
    res.json({ requeued: n });
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
      const { data: tn } = await supabaseService!.from("tenants").select("primary_color").eq("id", t).maybeSingle();
      const btnColor = tn?.primary_color as string | null;
      return res.status(200).type("html").send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Descadastro</title>
<body style="font-family:Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f5f5f7;margin:0"><form method="post" style="background:#fff;padding:32px;border-radius:14px;max-width:420px;text-align:center">
<h2 style="margin:0 0 8px">Deixar de receber e-mails?</h2><p style="color:#6b7280;margin:0 0 18px">Confirme para sair desta lista.</p><button style="background:${safeColor(btnColor)};color:#fff;border:0;padding:12px 22px;border-radius:10px;font-weight:700;font-size:15px;cursor:pointer">Confirmar saída</button></form></body>`);
    }
    if (ok) await supabaseService.from("email_optouts").upsert({ tenant_id: t, email }, { onConflict: "tenant_id,email", ignoreDuplicates: true });
    res.status(ok ? 200 : 400).type("html").send(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Descadastro</title>
<body style="font-family:Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f5f5f7;margin:0"><div style="background:#fff;padding:32px;border-radius:14px;max-width:420px;text-align:center">
<h2 style="margin:0 0 8px">${ok ? "Pronto, você saiu da lista" : "Link inválido"}</h2><p style="color:#6b7280;margin:0">${ok ? "Você não receberá mais e-mails desta empresa." : "Não foi possível confirmar este pedido. Responda o e-mail recebido pedindo para sair da lista."}</p></div></body>`);
  };
  /**
   * Rastreio de abertura (imagem de 1 pixel) e de clique (redirecionamento assinado). Só grava se a assinatura confere e
   * conta uma pessoa uma vez por campanha (aberturas/cliques repetidos só aumentam o contador do destinatário).
   * Aberturas são estimativas: alguns apps de e-mail baixam as imagens sozinhos e outros bloqueiam.
   */
  const registrar = async (rid: string, tipo: "open" | "click") => {
    if (!supabaseService || !UUID.test(rid)) return;
    try {
      const { data: r } = await supabaseService.from("email_campaign_recipients").select("campaign_id, opened_at, clicked_at, open_count, click_count").eq("id", rid).maybeSingle();
      if (!r) return;
      const agora = new Date().toISOString();
      const primeiro = tipo === "open" ? !r.opened_at : !r.clicked_at;
      await supabaseService.from("email_campaign_recipients").update(tipo === "open"
        ? { open_count: (r.open_count || 0) + 1, ...(primeiro ? { opened_at: agora } : {}) }
        : { click_count: (r.click_count || 0) + 1, ...(primeiro ? { clicked_at: agora } : {}), ...(!r.opened_at ? { opened_at: agora, open_count: (r.open_count || 0) + 1 } : {}) }).eq("id", rid);
      const campo = tipo === "open" ? "opened" : "clicked";
      const abriuAgora = tipo === "click" && !r.opened_at;
      for (const [col, deve] of [[campo, primeiro], ["opened", abriuAgora]] as const) {
        if (!deve) continue;
        for (let i = 0; i < 4; i++) { // soma sem perder contagem quando duas pessoas abrem juntas
          const { data: c } = await supabaseService.from("email_campaigns").select(col).eq("id", r.campaign_id).maybeSingle();
          if (!c) break;
          const atual = (c as any)[col] || 0;
          const { data: ok } = await supabaseService.from("email_campaigns").update({ [col]: atual + 1 }).eq("id", r.campaign_id).eq(col, atual).select("id");
          if (ok && ok.length) break;
        }
      }
    } catch (e: any) { console.warn("[email rastreio]", e?.message); }
  };
  const igual = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

  app.get("/api/email/o/:rid.gif", async (req: any, res: any) => {
    const rid = String(req.params.rid || "");
    if (UUID.test(rid) && !!secret() && igual(String(req.query.s || ""), sigRastreio(rid))) await registrar(rid, "open");
    res.setHeader("Content-Type", "image/gif");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.end(Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64"));
  });

  app.get("/api/email/c/:rid", async (req: any, res: any) => {
    const rid = String(req.params.rid || "");
    let destino = "";
    try { destino = Buffer.from(String(req.query.u || ""), "base64url").toString("utf8"); } catch { /* inválido */ }
    const ok = UUID.test(rid) && /^https?:\/\//i.test(destino) && !!secret() && igual(String(req.query.s || ""), sigRastreio(rid, destino));
    if (!ok) return res.status(400).send("Link inválido.");
    await registrar(rid, "click");
    res.redirect(302, destino);
  });

  app.get("/api/email/optout", limiter, optout);
  app.post("/api/email/optout", limiter, optout);
}
