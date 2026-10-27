/**
 * Layout único dos e-mails transacionais do S.P.Y. (HTML com tabelas e estilos
 * inline — é o que Gmail/Outlook renderizam de forma confiável — mais uma
 * versão em texto puro, que melhora a entrega e serve de fallback).
 */

const BRAND = "S.P.Y.";
const COLOR_PRIMARY = "#2563eb";
const COLOR_TEXT = "#0f172a";
const COLOR_MUTED = "#64748b";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

interface LayoutInput {
  /** Texto de pré-visualização que aparece ao lado do assunto na caixa de entrada. */
  preheader: string;
  title: string;
  /** Parágrafos do corpo (texto puro; é escapado aqui). */
  paragraphs: string[];
  button?: { label: string; url: string };
  /** Linha pequena abaixo do botão (ex.: "O link expira em 1 hora"). */
  note?: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function layout(subject: string, input: LayoutInput): RenderedEmail {
  const paragraphsHtml = input.paragraphs
    .map((p) => `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${COLOR_TEXT};">${esc(p)}</p>`)
    .join("");

  const buttonHtml = input.button
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 8px 0;"><tr><td style="background:${COLOR_PRIMARY};border-radius:8px;">
         <a href="${esc(input.button.url)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">${esc(input.button.label)}</a>
       </td></tr></table>
       <p style="margin:12px 0 0 0;font-size:12px;line-height:1.5;color:${COLOR_MUTED};">Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${esc(input.button.url)}" style="color:${COLOR_PRIMARY};word-break:break-all;">${esc(input.button.url)}</a></p>`
    : "";

  const noteHtml = input.note
    ? `<p style="margin:20px 0 0 0;font-size:13px;line-height:1.5;color:${COLOR_MUTED};">${esc(input.note)}</p>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(input.preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:${COLOR_PRIMARY};padding:22px 32px;">
          <span style="font-size:20px;font-weight:800;letter-spacing:2px;color:#ffffff;">${BRAND}</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <h1 style="margin:0 0 20px 0;font-size:22px;line-height:1.3;color:${COLOR_TEXT};">${esc(input.title)}</h1>
          ${paragraphsHtml}
          ${buttonHtml}
          ${noteHtml}
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:${COLOR_MUTED};">Você recebeu este e-mail porque ele está ligado à sua conta no ${BRAND}. Se não foi você, pode ignorá-lo com segurança.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    input.title,
    "",
    ...input.paragraphs,
    ...(input.button ? ["", `${input.button.label}: ${input.button.url}`] : []),
    ...(input.note ? ["", input.note] : []),
    "",
    `— ${BRAND}`,
  ].join("\n");

  return { subject, html, text };
}

const firstName = (name?: string | null) => (name || "").trim().split(/\s+/)[0] || "";
const greeting = (name?: string | null) => (firstName(name) ? `Olá, ${firstName(name)}!` : "Olá!");

export function testEmail(): RenderedEmail {
  return layout("Teste de envio — S.P.Y.", {
    preheader: "Seu servidor de e-mail está funcionando.",
    title: "Tudo certo com o envio de e-mails",
    paragraphs: ["Se você recebeu esta mensagem, o servidor SMTP do seu ambiente está enviando e-mails corretamente."],
  });
}

export function passwordResetEmail(link: string, name?: string | null): RenderedEmail {
  return layout("Redefinir sua senha do S.P.Y.", {
    preheader: "Use o link para criar uma nova senha.",
    title: "Redefinir sua senha",
    paragraphs: [
      greeting(name),
      "Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha.",
    ],
    button: { label: "Criar nova senha", url: link },
    note: "Por segurança, este link expira em pouco tempo e só pode ser usado uma vez. Se você não pediu a redefinição, ignore este e-mail — sua senha continua a mesma.",
  });
}

export function passwordChangedEmail(name: string | null | undefined, whenIso: string): RenderedEmail {
  const when = new Date(whenIso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short" });
  return layout("Sua senha do S.P.Y. foi alterada", {
    preheader: "A senha da sua conta acabou de ser alterada.",
    title: "Sua senha foi alterada",
    paragraphs: [
      greeting(name),
      `A senha da sua conta no ${BRAND} foi alterada em ${when} (horário de Brasília).`,
      "Se foi você, não precisa fazer nada. Se não reconhece essa alteração, redefina sua senha imediatamente pela opção “Esqueci a senha” e avise o administrador da sua empresa.",
    ],
  });
}
