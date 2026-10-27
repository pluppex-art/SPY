import nodemailer from "nodemailer";
import { assertSafeSmtpTarget } from "./ssrfGuard.js";

export interface OutgoingEmail {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}

/**
 * Envia um e-mail usando o servidor SMTP que o próprio tenant cadastrou em
 * Configurações → Integrações → SMTP (app_settings.integracoes_smtp). Serve
 * qualquer SMTP (Postal, SES, Brevo, Postfix…) — nada aqui é específico de
 * provedor nem de tenant. Roda com service role; quem chama TEM que ter
 * resolvido o tenantId da sessão autenticada.
 */
export async function sendTenantEmail(db: any, tenantId: string, mail: OutgoingEmail): Promise<{ messageId: string }> {
  const { data } = await db.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "integracoes_smtp").maybeSingle();
  const cfg = data?.value;
  if (!cfg?.smtpServer || !cfg?.smtpUser || !cfg?.smtpPass) {
    throw new Error("SMTP não configurado. Preencha host, usuário e senha em Integrações → SMTP.");
  }
  const from = String(cfg.fromEmail || "").trim();
  if (!from) throw new Error("Defina o e-mail de remetente padrão em Integrações → SMTP.");

  await assertSafeSmtpTarget(cfg.smtpServer, cfg.smtpPort);
  const transporter = nodemailer.createTransport({
    host: cfg.smtpServer,
    port: Number(cfg.smtpPort),
    secure: cfg.encryption === "SSL/TLS",
    requireTLS: cfg.encryption === "StartTLS",
    auth: { user: cfg.smtpUser, pass: cfg.smtpPass },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
  });
  const info = await transporter.sendMail({ from, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text });
  return { messageId: String(info.messageId || "") };
}
