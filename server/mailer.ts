import nodemailer from "nodemailer";
import { assertSafeSmtpTarget } from "./ssrfGuard.js";

export interface OutgoingEmail {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}

/**
 * Envia um e-mail do S.P.Y. Se o tenant cadastrou o próprio SMTP em
 * Configurações → Integrações → SMTP (app_settings.integracoes_smtp), usa ele
 * (o e-mail sai do domínio do cliente). Senão cai no SMTP da plataforma,
 * definido por variáveis de ambiente (SPY_SMTP_HOST/PORT/USER/PASS/FROM/ENCRYPTION).
 * Serve qualquer SMTP (Postal, SES, Brevo, Postfix…). Roda com service role; quem
 * chama TEM que ter resolvido o tenantId da sessão autenticada.
 */
export async function sendTenantEmail(db: any, tenantId: string, mail: OutgoingEmail): Promise<{ messageId: string; via: "tenant" | "platform" }> {
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

  const transporter = nodemailer.createTransport({
    host, port,
    secure: encryption === "SSL/TLS",
    requireTLS: encryption === "StartTLS",
    auth: { user, pass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  });
  const info = await transporter.sendMail({ from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
  return { messageId: String(info.messageId || ""), via: tenantReady ? "tenant" : "platform" };
}

/**
 * Envia pelo SMTP da plataforma (variáveis SPY_SMTP_*), sem olhar tenant nenhum.
 * Para e-mails de conta (redefinir senha, aviso de senha alterada): o usuário
 * pode nem estar logado e a mensagem é do S.P.Y., não de uma empresa cliente.
 */
export async function sendPlatformEmail(mail: OutgoingEmail): Promise<{ messageId: string }> {
  const e = process.env;
  if (!e.SPY_SMTP_HOST || !e.SPY_SMTP_USER || !e.SPY_SMTP_PASS || !e.SPY_SMTP_FROM) {
    throw new Error("SMTP da plataforma não configurado (SPY_SMTP_*).");
  }
  const encryption = e.SPY_SMTP_ENCRYPTION || "StartTLS";
  const transporter = nodemailer.createTransport({
    host: e.SPY_SMTP_HOST,
    port: Number(e.SPY_SMTP_PORT || 587),
    secure: encryption === "SSL/TLS",
    requireTLS: encryption === "StartTLS",
    auth: { user: e.SPY_SMTP_USER, pass: e.SPY_SMTP_PASS },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  });
  const info = await transporter.sendMail({ from: e.SPY_SMTP_FROM, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
  return { messageId: String(info.messageId || "") };
}
