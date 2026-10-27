/**
 * Layout único dos e-mails transacionais do S.P.Y. (HTML com tabelas e estilos
 * inline — é o que Gmail/Outlook renderizam de forma confiável — mais uma
 * versão em texto puro, que melhora a entrega e serve de fallback).
 *
 * Identidade: padrão laranja (o laranja oficial do S.P.Y.) com branco. Se a empresa dona do destinatário
 * tem cor própria (tenants.primary_color), cabeçalho, botão e destaques passam a usar a cor dela. A logo é
 * SEMPRE a do S.P.Y. (embutida via CID).
 */
import { SPY_MARK_WHITE_PNG_B64, SPY_MARK_DARK_PNG_B64 } from "./emailAssets.js";

const BRAND = "S.P.Y.";
const TAGLINE = "Seu espião comercial";
/** Laranja oficial do S.P.Y. (mesmo LOGIN_DEFAULT_COLOR do app): vale quando a empresa não definiu cor. */
const COLOR_PRIMARY = "#f97316";
const COLOR_TEXT = "#0f172a";
const COLOR_BODY = "#334155";
const COLOR_MUTED = "#64748b";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const MARK_CID = "spy-mark@spy";

/** Cor (e nome) da empresa dona do destinatário. Tudo opcional: sem marca, vale o padrão do S.P.Y. */
export interface EmailBrand {
  name?: string | null;
  /** "#RRGGBB" (tenants.primary_color). A logo do e-mail é SEMPRE a do S.P.Y.; da empresa vem só a cor. */
  color?: string | null;
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
  /** Trecho em destaque (bloco com barra na cor da empresa), ex.: o conteúdo de uma notificação. */
  highlight?: string;
  button?: { label: string; url: string };
  /** Linha pequena abaixo do botão (ex.: "O link expira em 1 hora"). */
  note?: string;
  /** Etiqueta colorida acima do título (ex.: "Novo lead"). color "brand" = a cor da empresa. */
  tag?: { label: string; color: string };
  /** Link discreto no rodapé (ex.: "Ajustar notificações"). */
  footerLink?: { label: string; url: string };
  brand?: EmailBrand;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer;
  cid: string;
  contentType: string;
  contentDisposition: "inline";
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
  /** Imagens embutidas (a logo). Quem envia deve repassar pro transporte. */
  attachments: EmailAttachment[];
}

function layout(subject: string, input: LayoutInput): RenderedEmail {
  const brandColor = input.brand?.color && HEX.test(input.brand.color) ? input.brand.color : COLOR_PRIMARY;
  const onBrand = textOn(brandColor);
  const brandName = (input.brand?.name || "").trim();

  // Cor de destaque legível sobre branco: a da marca, ou o texto escuro se a marca for clara demais.
  const accent = luminance(brandColor) > 0.4 ? COLOR_TEXT : brandColor;
  const tagColor = input.tag?.color === "brand" ? accent : input.tag?.color || accent;
  const tagHtml = input.tag
    ? `<span style="display:inline-block;margin:0 0 16px 0;padding:5px 12px;border-radius:999px;background:${tagColor}1f;color:${tagColor};font-size:12px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;">${esc(input.tag.label)}</span>`
    : "";

  const paragraphsHtml = input.paragraphs
    .map((p, i) => `<p style="margin:0 0 16px 0;font-size:${i === 0 ? 16 : 15.5}px;line-height:1.65;color:${i === 0 ? COLOR_TEXT : COLOR_BODY};${i === 0 ? "font-weight:600;" : ""}">${esc(p)}</p>`)
    .join("");

  const highlightHtml = input.highlight
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:4px 0 8px 0;"><tr>
         <td width="4" style="background:${brandColor};border-radius:4px;font-size:0;line-height:0;">&nbsp;</td>
         <td style="background:#f8fafc;border-radius:0 10px 10px 0;padding:16px 18px;font-size:16px;line-height:1.6;color:${COLOR_TEXT};">${esc(input.highlight)}</td>
       </tr></table>`
    : "";

  const buttonHtml = input.button
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:28px 0 6px 0;"><tr><td style="background:${brandColor};border-radius:10px;">
         <a href="${esc(input.button.url)}" style="display:inline-block;padding:16px 34px;font-size:16px;font-weight:700;color:${onBrand};text-decoration:none;font-family:${FONT};">${esc(input.button.label)}</a>
       </td></tr></table>
       <p style="margin:14px 0 0 0;font-size:12px;line-height:1.55;color:${COLOR_MUTED};">Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${esc(input.button.url)}" style="color:${COLOR_MUTED};word-break:break-all;">${esc(input.button.url)}</a></p>`
    : "";

  const noteHtml = input.note
    ? `<p style="margin:22px 0 0 0;padding-top:18px;border-top:1px solid #e2e8f0;font-size:13px;line-height:1.6;color:${COLOR_MUTED};">${esc(input.note)}</p>`
    : "";

  const footerLinkHtml = input.footerLink
    ? `<p style="margin:12px 0 0 0;font-size:12px;"><a href="${esc(input.footerLink.url)}" style="color:${COLOR_MUTED};text-decoration:underline;">${esc(input.footerLink.label)}</a></p>`
    : "";

  const reason = brandName
    ? `Você recebeu este e-mail porque ele está ligado à sua conta na ${esc(brandName)}.`
    : `Você recebeu este e-mail porque ele está ligado à sua conta no ${BRAND}`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:${FONT};">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(input.preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f7;padding:36px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #dde4ee;">
        <tr><td style="background:${brandColor};padding:26px 36px;">
          <table role="presentation" cellspacing="0" cellpadding="0"><tr>
            <td style="padding-right:14px;"><img src="cid:${MARK_CID}" alt="" width="46" height="46" style="display:block;border:0;width:46px;height:46px;"></td>
            <td>
              <div style="font-size:24px;line-height:1.1;font-weight:800;letter-spacing:3px;color:${onBrand};font-family:${FONT};">${BRAND}</div>
              <div style="margin-top:4px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${onBrand};opacity:.85;font-family:${FONT};">${TAGLINE}</div>
            </td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:38px 36px 34px 36px;">
          ${tagHtml}
          <h1 style="margin:0 0 22px 0;font-size:26px;line-height:1.25;font-weight:800;color:${COLOR_TEXT};letter-spacing:-.3px;">${esc(input.title)}</h1>
          ${paragraphsHtml}
          ${highlightHtml}
          ${buttonHtml}
          ${noteHtml}
        </td></tr>
        <tr><td style="padding:22px 36px 26px 36px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:12px;line-height:1.6;color:${COLOR_MUTED};">${reason} Se não foi você, pode ignorá-lo com segurança.</p>
          ${footerLinkHtml}
          <p style="margin:14px 0 0 0;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#94a3b8;">${brandName ? `Enviado pelo ${BRAND} · ` : ""}${TAGLINE}</p>
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
    ...(input.highlight ? ["", input.highlight] : []),
    ...(input.button ? ["", `${input.button.label}: ${input.button.url}`] : []),
    ...(input.note ? ["", input.note] : []),
    ...(input.footerLink ? ["", `${input.footerLink.label}: ${input.footerLink.url}`] : []),
    "",
    `— ${BRAND} · ${TAGLINE}`,
  ].join("\n");

  return {
    subject,
    html,
    text,
    attachments: [{
      filename: "spy.png",
      content: Buffer.from(onBrand === "#ffffff" ? SPY_MARK_WHITE_PNG_B64 : SPY_MARK_DARK_PNG_B64, "base64"),
      cid: MARK_CID,
      contentType: "image/png",
      contentDisposition: "inline",
    }],
  };
}

const firstName = (name?: string | null) => (name || "").trim().split(/\s+/)[0] || "";
const greeting = (name?: string | null) => (firstName(name) ? `Olá, ${firstName(name)}!` : "Olá!");
const SECURITY_TAG = { label: "Segurança da conta", color: "brand" };

export function testEmail(brand?: EmailBrand): RenderedEmail {
  return layout("Teste de envio — S.P.Y.", {
    preheader: "Seu servidor de e-mail está funcionando.",
    tag: { label: "Teste", color: "#16a34a" },
    title: "Tudo certo com o envio de e-mails",
    paragraphs: ["Se você recebeu esta mensagem, o servidor SMTP do seu ambiente está enviando e-mails corretamente."],
    brand,
  });
}

export function passwordResetEmail(link: string, name?: string | null, brand?: EmailBrand): RenderedEmail {
  return layout("Redefinir sua senha do S.P.Y.", {
    preheader: "Use o link para criar uma nova senha.",
    tag: SECURITY_TAG,
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
    tag: SECURITY_TAG,
    title: "Sua senha foi alterada",
    paragraphs: [
      greeting(name),
      `A senha da sua conta no ${BRAND} foi alterada em ${when} (horário de Brasília).`,
    ],
    note: "Se foi você, não precisa fazer nada. Se não reconhece essa alteração, redefina sua senha agora pela opção “Esqueci a senha” e avise o administrador da sua empresa.",
    brand,
  });
}

export type NotificationKind = "success" | "info" | "warning" | "error";
const KIND_STYLE: Record<NotificationKind, { label: string; color: string }> = {
  success: { label: "Boa notícia", color: "#16a34a" },
  info: { label: "Aviso", color: "brand" },
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
    paragraphs: [greeting(n.name)],
    highlight: n.description,
    button: n.linkUrl ? { label: "Abrir no S.P.Y.", url: n.linkUrl } : undefined,
    footerLink: n.settingsUrl ? { label: "Ajustar quais avisos você recebe por e-mail", url: n.settingsUrl } : undefined,
    brand: n.brand,
  });
}
