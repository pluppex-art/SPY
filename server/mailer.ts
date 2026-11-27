import crypto from "node:crypto";
import nodemailer from "nodemailer";
import { assertSafeSmtpTarget } from "./ssrfGuard.js";

export interface OutgoingEmail {
  to: string | string[];
  subject: string;
  /** Cabeçalhos extras (ex.: List-Unsubscribe nos disparos em massa). */
  headers?: Record<string, string>;
  replyTo?: string;
  /** Só no SMTP da plataforma: as respostas vão para o e-mail da empresa (Dados da empresa) em vez de se perderem no remetente da plataforma. */
  replyToEmpresa?: boolean;
  /** Só no SMTP da plataforma: nome que aparece como remetente (o endereço continua o da plataforma). */
  deParte?: string;
  html?: string;
  text?: string;
  /** Imagens embutidas (CID) — ex.: a logo do S.P.Y. nos e-mails com layout. */
  attachments?: { filename: string; content: Buffer; cid: string; contentType: string; contentDisposition: "inline" }[];
}

/**
 * Envia um e-mail do S.P.Y. Se o tenant cadastrou o próprio SMTP em
 * Configurações → Integrações → SMTP (app_settings.integracoes_smtp), usa ele
 * (o e-mail sai do domínio do cliente). Senão cai no SMTP da plataforma,
 * definido por variáveis de ambiente (SPY_SMTP_HOST/PORT/USER/PASS/FROM/ENCRYPTION).
 * Serve qualquer SMTP (Postal, SES, Brevo, Postfix…). Roda com service role; quem
 * chama TEM que ter resolvido o tenantId da sessão autenticada.
 */
// Uma conexão SMTP reaproveitada por servidor/usuário (antes abria conexão e TLS novos para cada destinatário).
const transportadores = new Map<string, ReturnType<typeof nodemailer.createTransport>>();
function transporterDe(c: { host: string; port: number; user: string; pass: string; encryption: string; nome?: string }) {
  const chave = `${c.host}|${c.port}|${c.user}|${c.encryption}|${c.nome ?? ""}|${crypto.createHash("sha1").update(c.pass).digest("hex")}`;
  let t = transportadores.get(chave);
  if (!t) {
    if (transportadores.size > 50) transportadores.clear();
    t = nodemailer.createTransport({
      host: c.host, port: c.port,
      // Como o SPY se apresenta ao servidor: com o domínio do remetente, não com um endereço interno da nuvem.
      ...(c.nome ? { name: c.nome } : {}),
      secure: c.encryption === "SSL/TLS",
      requireTLS: c.encryption === "StartTLS",
      auth: { user: c.user, pass: c.pass },
      pool: true, maxConnections: 3, maxMessages: 100,
      connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000,
    });
    transportadores.set(chave, t);
  }
  return t;
}

/** Troca só o NOME do remetente, mantendo o endereço (que tem SPF/DKIM da plataforma). Aceita `Nome <a@b.com>` ou `a@b.com`. */
export function montarRemetente(fromEnv: string, nome?: string): string {
  const m = String(fromEnv).match(/<([^>]+)>/);
  const endereco = (m ? m[1] : String(fromEnv)).trim();
  const limpo = String(nome ?? "").replace(/[\r\n"<>\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return limpo ? `"${limpo}" <${endereco}>` : String(fromEnv);
}

/** E-mail cadastrado em Dados da empresa (só se for um endereço válido). */
export async function emailDaEmpresa(db: any, tenantId: string): Promise<string | null> {
  try {
    const { data: emp } = await db.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "empresa_dados").maybeSingle();
    const e = String(emp?.value?.email ?? "").trim();
    return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(e) ? e : null;
  } catch { return null; }
}

export async function sendTenantEmail(db: any, tenantId: string, mail: OutgoingEmail): Promise<{ messageId: string; via: "tenant" | "platform"; response: string }> {
  const { data } = await db.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "integracoes_smtp").maybeSingle();
  const t = data?.value;
  const tenantReady = !!(t?.smtpServer && t?.smtpUser && t?.smtpPass && String(t?.fromEmail || "").trim());

  let host: string, port: number, user: string, pass: string, from: string, encryption: string;
  if (tenantReady) {
    host = t.smtpServer; port = Number(t.smtpPort); user = t.smtpUser; pass = t.smtpPass;
    from = String(t.fromEmail).trim(); encryption = t.encryption;
    await assertSafeSmtpTarget(host, port); // host informado pelo cliente: nunca confiar
  } else {
    const e = process.env;
    if (!e.SPY_SMTP_HOST || !e.SPY_SMTP_USER || !e.SPY_SMTP_PASS || !e.SPY_SMTP_FROM) {
      throw new Error("Nenhum SMTP disponível: cadastre o seu em Integrações → SMTP ou configure o SMTP da plataforma.");
    }
    host = e.SPY_SMTP_HOST; port = Number(e.SPY_SMTP_PORT || 587); user = e.SPY_SMTP_USER; pass = e.SPY_SMTP_PASS;
    from = e.SPY_SMTP_FROM; encryption = e.SPY_SMTP_ENCRYPTION || "StartTLS";
  }

  let replyTo = mail.replyTo;
  // No servidor próprio o endereço é o da empresa; sem nome cadastrado no remetente, vai o nome dela.
  if (tenantReady && mail.deParte && !from.includes("<")) from = montarRemetente(from, mail.deParte);
  if (!tenantReady) {
    if (mail.deParte) from = montarRemetente(from, mail.deParte);
    if (mail.replyToEmpresa && !replyTo) replyTo = await emailDaEmpresa(db, tenantId) ?? undefined;
  }

  const nome = /@([a-z0-9.-]+\.[a-z]{2,})/i.exec(from)?.[1];
  const transporter = transporterDe({ host, port, user, pass, encryption, nome });
  const info = await transporter.sendMail({ from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text, attachments: mail.attachments, headers: mail.headers, replyTo });
  const response = String(info.response || "").slice(0, 200);
  // Registro para investigar "não chegou": o que o servidor respondeu (só o domínio de quem recebe, sem o endereço).
  console.info("[email] aceito", JSON.stringify({ via: tenantReady ? "tenant" : "platform", host, para: String(mail.to).split("@")[1] ?? "", response }));
  return { messageId: String(info.messageId || ""), via: tenantReady ? "tenant" : "platform", response };
}

/**
 * Envia pelo SMTP da plataforma (variáveis SPY_SMTP_*), sem olhar tenant nenhum.
 * Para tudo que é do S.P.Y. (não da empresa cliente): redefinir senha, aviso de senha alterada, cobrança e os
 * avisos automáticos do sistema (tarefa, reunião, agente secreto, pagamento...). Só o disparo de marketing
 * (campanhas e sequências) usa o SMTP próprio do cliente, via sendTenantEmail.
 */
export async function sendPlatformEmail(mail: OutgoingEmail): Promise<{ messageId: string }> {
  const e = process.env;
  if (!e.SPY_SMTP_HOST || !e.SPY_SMTP_USER || !e.SPY_SMTP_PASS || !e.SPY_SMTP_FROM) {
    throw new Error("SMTP da plataforma não configurado (SPY_SMTP_*).");
  }
  // Conexão reaproveitada (os avisos automáticos saem em rajada, vários por vez).
  const transporter = transporterDe({
    host: e.SPY_SMTP_HOST, port: Number(e.SPY_SMTP_PORT || 587), user: e.SPY_SMTP_USER, pass: e.SPY_SMTP_PASS,
    encryption: e.SPY_SMTP_ENCRYPTION || "StartTLS",
  });
  const info = await transporter.sendMail({ from: e.SPY_SMTP_FROM, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text, attachments: mail.attachments, headers: mail.headers, replyTo: mail.replyTo });
  return { messageId: String(info.messageId || "") };
}

/**
 * Diagnóstico do remetente que SERIA usado pela empresa: confere o login no SMTP (sem enviar e-mail) e devolve
 * só dados não secretos (servidor, porta, criptografia, domínio do remetente). Nunca devolve usuário nem senha.
 */
export async function checkTenantSender(db: any, tenantId: string): Promise<{ kind: "tenant" | "platform" | "none"; host?: string; port?: number; encryption?: string; fromDomain?: string; verified: boolean; error?: string }> {
  const { data } = await db.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "integracoes_smtp").maybeSingle();
  const t = data?.value;
  const own = !!(t?.smtpServer && t?.smtpUser && t?.smtpPass && String(t?.fromEmail || "").trim());
  const e = process.env;
  let host: string, port: number, user: string, pass: string, from: string, encryption: string;
  if (own) {
    host = t.smtpServer; port = Number(t.smtpPort); user = t.smtpUser; pass = t.smtpPass; from = String(t.fromEmail).trim(); encryption = t.encryption;
    try { await assertSafeSmtpTarget(host, port); } catch (err: any) { return { kind: "tenant", host, port, verified: false, error: String(err?.message || err).slice(0, 160) }; }
  } else if (e.SPY_SMTP_HOST && e.SPY_SMTP_USER && e.SPY_SMTP_PASS && e.SPY_SMTP_FROM) {
    host = e.SPY_SMTP_HOST; port = Number(e.SPY_SMTP_PORT || 587); user = e.SPY_SMTP_USER; pass = e.SPY_SMTP_PASS; from = e.SPY_SMTP_FROM; encryption = e.SPY_SMTP_ENCRYPTION || "StartTLS";
  } else {
    return { kind: "none", verified: false, error: "Nenhum SMTP configurado (nem da empresa nem da plataforma)." };
  }
  const info = { kind: (own ? "tenant" : "platform") as "tenant" | "platform", host, port, encryption, fromDomain: from.split("@").pop()?.replace(/[>"\s]/g, "") };
  try {
    const transporter = nodemailer.createTransport({ host, port, secure: encryption === "SSL/TLS", requireTLS: encryption === "StartTLS", auth: { user, pass }, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 });
    await transporter.verify();
    return { ...info, verified: true };
  } catch (err: any) {
    return { ...info, verified: false, error: String(err?.message || err).split(pass).join("***").slice(0, 200) };
  }
}
