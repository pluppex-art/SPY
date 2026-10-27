/**
 * Layout único dos e-mails transacionais do S.P.Y. (HTML com tabelas e estilos
 * inline — é o que Gmail/Outlook renderizam de forma confiável — mais uma
 * versão em texto puro, que melhora a entrega e serve de fallback).
 */

const BRAND = "S.P.Y.";
const COLOR_PRIMARY = "#2563eb";
const COLOR_TEXT = "#0f172a";
const COLOR_MUTED = "#64748b";

/** Identidade visual da empresa (tenant) dona do destinatário. Tudo opcional: sem marca, vale o padrão do S.P.Y. */
export interface EmailBrand {
  name?: string | null;
  /** "#RRGGBB" (tenants.primary_color). */
  color?: string | null;
  /** URL https pública da logo (empresa_dados.logoUrl). Data URI não funciona em e-mail. */
  logoUrl?: string | null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Branco ou quase-preto, o que tiver mais contraste sobre a cor da marca (verde claro leva texto escuro). */
const textOn = (hex: string) => (luminance(hex) > 0.4 ? "#0f172a" : "#ffffff");

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
  /** Etiqueta colorida acima do título (ex.: "Novo lead"). */
  tag?: { label: string; color: string };
  /** Link discreto no rodapé (ex.: "Ajustar notificações"). */
  footerLink?: { label: string; url: string };
  brand?: EmailBrand;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function layout(subject: string, input: LayoutInput): RenderedEmail {
  const brandColor = input.brand?.color && HEX.test(input.brand.color) ? input.brand.color : COLOR_PRIMARY;
  const onBrand = textOn(brandColor);
  const brandName = (input.brand?.name || "").trim() || BRAND;
  const logoOk = !!input.brand?.logoUrl && /^https:\/\//i.test(input.brand.logoUrl);
  const headerHtml = logoOk
    ? `<img src="${esc(input.brand!.logoUrl!)}" alt="${esc(brandName)}" height="36" style="display:block;max-height:36px;max-width:220px;border:0;">`
    : `<span style="font-size:20px;font-weight:800;letter-spacing:${input.brand?.name ? "0.5px" : "2px"};color:${onBrand};">${esc(brandName)}</span>`;
  const paragraphsHtml = input.paragraphs
    .map((p) => `<p style="margin:0 0 16px 0;font-size:15px;line-height:1.6;color:${COLOR_TEXT};">${esc(p)}</p>`)
    .join("");

  const buttonHtml = input.button
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 8px 0;"><tr><td style="background:${brandColor};border-radius:8px;">
         <a href="${esc(input.button.url)}" style="display:inline-block;padding:14px 28px;font-size:15px;font-weight:600;color:${onBrand};text-decoration:none;">${esc(input.button.label)}</a>
       </td></tr></table>
       <p style="margin:12px 0 0 0;font-size:12px;line-height:1.5;color:${COLOR_MUTED};">Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${esc(input.button.url)}" style="color:${brandColor};word-break:break-all;">${esc(input.button.url)}</a></p>`
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
        <tr><td style="background:${brandColor};padding:22px 32px;">
          ${headerHtml}
        </td></tr>
        <tr><td style="padding:32px;">
          ${input.tag ? `<span style="display:inline-block;margin:0 0 14px 0;padding:4px 10px;border-radius:999px;background:${input.tag.color}1a;color:${input.tag.color};font-size:12px;font-weight:700;letter-spacing:.3px;">${esc(input.tag.label)}</span>` : ""}
          <h1 style="margin:0 0 20px 0;font-size:22px;line-height:1.3;color:${COLOR_TEXT};">${esc(input.title)}</h1>
          ${paragraphsHtml}
          ${buttonHtml}
          ${noteHtml}
        </td></tr>
        <tr><td style="padding:20px 32px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:12px;line-height:1.5;color:${COLOR_MUTED};">Você recebeu este e-mail porque ele está ligado à sua conta${input.brand?.name ? ` na ${esc(brandName)}` : ` no ${BRAND}`}. Se não foi você, pode ignorá-lo com segurança.${input.brand?.name ? ` Enviado pelo ${BRAND}.` : ""}</p>
          ${input.footerLink ? `<p style="margin:10px 0 0 0;font-size:12px;"><a href="${esc(input.footerLink.url)}" style="color:${brandColor};">${esc(input.footerLink.label)}</a></p>` : ""}
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
    ...(input.footerLink ? ["", `${input.footerLink.label}: ${input.footerLink.url}`] : []),
    "",
    `— ${BRAND}`,
  ].join("\n");

  return { subject, html, text };
}

const firstName = (name?: string | null) => (name || "").trim().split(/\s+/)[0] || "";
const greeting = (name?: string | null) => (firstName(name) ? `Olá, ${firstName(name)}!` : "Olá!");

export function testEmail(brand?: EmailBrand): RenderedEmail {
  return layout("Teste de envio — S.P.Y.", {
    preheader: "Seu servidor de e-mail está funcionando.",
    title: "Tudo certo com o envio de e-mails",
    paragraphs: ["Se você recebeu esta mensagem, o servidor SMTP do seu ambiente está enviando e-mails corretamente."],
    brand,
  });
}

export function passwordResetEmail(link: string, name?: string | null, brand?: EmailBrand): RenderedEmail {
  return layout("Redefinir sua senha do S.P.Y.", {
    preheader: "Use o link para criar uma nova senha.",
    title: "Redefinir sua senha",
    paragraphs: [
      greeting(name),
      "Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha.",
    ],
    button: { label: "Criar nova senha", url: link },
    note: "Por segurança, este link expira em pouco tempo e só pode ser usado uma vez. Se você não pediu a redefinição, ignore este e-mail — sua senha continua a mesma.",
    brand,
  });
}

export function passwordChangedEmail(name: string | null | undefined, whenIso: string, brand?: EmailBrand): RenderedEmail {
  const when = new Date(whenIso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short" });
  return layout("Sua senha do S.P.Y. foi alterada", {
    preheader: "A senha da sua conta acabou de ser alterada.",
    title: "Sua senha foi alterada",
    paragraphs: [
      greeting(name),
      `A senha da sua conta no ${BRAND} foi alterada em ${when} (horário de Brasília).`,
      "Se foi você, não precisa fazer nada. Se não reconhece essa alteração, redefina sua senha imediatamente pela opção “Esqueci a senha” e avise o administrador da sua empresa.",
    ],
    brand,
  });
}

export type NotificationKind = "success" | "info" | "warning" | "error";
const KIND_STYLE: Record<NotificationKind, { label: string; color: string }> = {
  success: { label: "Boa notícia", color: "#16a34a" },
  info: { label: "Aviso", color: "#2563eb" },
  warning: { label: "Atenção", color: "#d97706" },
  error: { label: "Importante", color: "#dc2626" },
};

/** E-mail de notificação do sistema: espelha um aviso do sino, com botão pra abrir a tela certa. */
export function notificationEmail(n: {
  kind: NotificationKind;
  title: string;
  description: string;
  linkUrl?: string;
  settingsUrl?: string;
  name?: string | null;
  brand?: EmailBrand;
}): RenderedEmail {
  const style = KIND_STYLE[n.kind] || KIND_STYLE.info;
  return layout(n.title, {
    preheader: n.description.slice(0, 110),
    tag: style,
    title: n.title,
    paragraphs: [greeting(n.name), n.description],
    button: n.linkUrl ? { label: "Abrir no S.P.Y.", url: n.linkUrl } : undefined,
    footerLink: n.settingsUrl ? { label: "Ajustar quais avisos você recebe por e-mail", url: n.settingsUrl } : undefined,
    brand: n.brand,
  });
}
