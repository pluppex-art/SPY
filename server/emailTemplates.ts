/**
 * Layout dos e-mails do S.P.Y. (HTML com tabelas e estilos inline — é o que Gmail/Outlook renderizam de
 * forma confiável — mais uma versão em texto puro, que melhora a entrega e serve de fallback).
 *
 * Identidade: cabeçalho e rodapé na cor da marca com a logo do S.P.Y. (sempre a do S.P.Y.), título em duas
 * linhas (a 2ª na cor da marca), cartão de dados, botão com seta, painel com a ilustração do pipeline e
 * cartão informativo. O padrão é o laranja oficial do S.P.Y.; se a empresa dona do destinatário tem cor
 * própria (tenants.primary_color), tudo que é "cor da marca" passa a usar a dela. Imagens vão embutidas (CID).
 */
import { EMAIL_IMAGES_B64 } from "./emailAssets.js";

const BRAND = "S.P.Y.";
const TAGLINE = "Seu espião comercial";
/** Laranja oficial do S.P.Y. (mesmo LOGIN_DEFAULT_COLOR do app): vale quando a empresa não definiu cor. */
const COLOR_PRIMARY = "#f97316";
const COLOR_TEXT = "#0f172a";
const COLOR_BODY = "#475569";
const COLOR_MUTED = "#64748b";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Cor (e nome) da empresa dona do destinatário. Tudo opcional: sem marca, vale o padrão do S.P.Y. */
export interface EmailBrand {
  name?: string | null;
  /** "#RRGGBB" (tenants.primary_color). A logo do e-mail é SEMPRE a do S.P.Y.; da empresa vem só a cor. */
  color?: string | null;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (c: number[]) => `#${c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("")}`;
/** Mistura `hex` com `other` (0 = só hex, 1 = só other). */
const mix = (hex: string, other: string, amount: number) => {
  const a = rgb(hex), b = rgb(other);
  return toHex(a.map((v, i) => v + (b[i] - v) * amount));
};
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => v / 255).map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** Cor forte (cabeçalho, botão, ícones brancos por cima): a da marca, ou uma versão mais escura se for clara demais. */
const strongOf = (hex: string) => (luminance(hex) > 0.4 ? mix(hex, "#000000", 0.45) : hex);
/** Tom bem claro da cor, pra fundos de cartões e painéis. */
const tint = (hex: string, strength: number) => mix(hex, "#ffffff", 1 - strength);

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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
  /** Imagens embutidas (logo, ícones, ilustração). Quem envia deve repassar pro transporte. */
  attachments: EmailAttachment[];
}

interface Spec {
  subject: string;
  /** Texto de pré-visualização que aparece ao lado do assunto na caixa de entrada. */
  preheader: string;
  /** Texto à direita do cabeçalho (ex.: "Notificação automática" / "Novo lead no seu CRM"). */
  headerRight: { line1: string; line2: string };
  pill: { label: string; color: string };
  title1: string;
  /** 2ª linha do título, na cor da marca. */
  title2?: string;
  greeting: string;
  paragraphs: string[];
  /** Dados em destaque (ex.: nome do lead, empresa). */
  details?: { label: string; value: string }[];
  button?: { label: string; url: string };
  /** Link discreto abaixo do botão (ex.: "ou abrir o lead no S.P.Y."). */
  secondaryLink?: { label: string; url: string };
  /** Ícone da pílula e do cartão de dados (padrão: icon-user). */
  icon?: "icon-user" | "icon-bell" | "icon-users" | "icon-chart";
  /** Aviso pequeno abaixo do botão, com linha separadora. */
  note?: string;
  info?: { title: string; text: string };
  /** Mostra o painel com a ilustração do pipeline (e-mails de CRM); sem ele o corpo é de coluna única. */
  illustration?: boolean;
  footerLink?: { label: string; url: string };
  brand?: EmailBrand;
}

function render(spec: Spec): RenderedEmail {
  const base = spec.brand?.color && HEX.test(spec.brand.color) ? spec.brand.color : COLOR_PRIMARY;
  const strong = strongOf(base);
  const deep = mix(strong, "#000000", 0.22);
  const brandName = (spec.brand?.name || "").trim();
  const used = new Set<string>();
  const img = (name: string, size: number, style = "") => {
    used.add(name);
    return `<img src="cid:${name}@spy" alt="" width="${size}" height="${size}" style="display:block;border:0;width:${size}px;height:${size}px;${style}">`;
  };
  const gradient = `background:${strong};background-image:linear-gradient(135deg,${deep} 0%,${strong} 100%);`;
  const pillColor = spec.pill.color === "brand" ? strong : spec.pill.color;

  // ── Cabeçalho ──
  const header = `<tr><td style="${gradient}padding:26px 40px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      <td valign="middle" style="width:1%;white-space:nowrap;"><table role="presentation" cellspacing="0" cellpadding="0"><tr>
        <td style="padding-right:14px;">${img("mark-white", 52)}</td>
        <td>
          <div style="font-size:28px;line-height:1;font-weight:800;letter-spacing:4px;color:#ffffff;font-family:${FONT};">${BRAND}</div>
          <div style="margin-top:6px;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#ffffff;opacity:.85;font-family:${FONT};">${TAGLINE}</div>
        </td>
      </tr></table></td>
      <td align="right" valign="middle">
        <table role="presentation" cellspacing="0" cellpadding="0" align="right"><tr>
          <td align="right" style="padding-right:18px;border-right:1px solid rgba(255,255,255,.35);">
            <div style="font-size:11px;letter-spacing:2.5px;text-transform:uppercase;color:#ffffff;font-family:${FONT};">${esc(spec.headerRight.line1)}</div>
            <div style="margin-top:5px;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#ffffff;opacity:.8;font-family:${FONT};">${esc(spec.headerRight.line2)}</div>
          </td>
          <td style="padding-left:18px;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td width="52" height="52" align="center" valign="middle" style="width:52px;height:52px;border-radius:14px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.35);">${img("icon-bell", 24, "margin:0 auto;")}</td></tr></table></td>
        </tr></table>
      </td>
    </tr></table>
  </td></tr>`;

  // ── Coluna da esquerda ──
  const pill = `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 22px 0;"><tr>
    <td style="background:${tint(pillColor, 0.14)};border-radius:999px;padding:6px 18px 6px 7px;">
      <table role="presentation" cellspacing="0" cellpadding="0"><tr>
        <td width="30" height="30" align="center" valign="middle" style="width:30px;height:30px;border-radius:15px;background:${pillColor};">${img(spec.icon || "icon-user", 16, "margin:0 auto;")}</td>
        <td style="padding-left:10px;font-size:13px;font-weight:800;letter-spacing:.8px;text-transform:uppercase;color:${pillColor};font-family:${FONT};">${esc(spec.pill.label)}</td>
      </tr></table>
    </td></tr></table>`;

  const title = `<h1 style="margin:0 0 22px 0;font-size:38px;line-height:1.1;font-weight:800;letter-spacing:-1px;color:${COLOR_TEXT};font-family:${FONT};">${esc(spec.title1)}${spec.title2 ? `<br><span style="color:${strong};">${esc(spec.title2)}</span>` : ""}</h1>`;

  const greeting = `<p style="margin:0 0 8px 0;font-size:20px;line-height:1.3;font-weight:700;color:${COLOR_TEXT};font-family:${FONT};">${esc(spec.greeting)}</p>`;
  const paragraphs = spec.paragraphs
    .map((p) => `<p style="margin:0 0 18px 0;font-size:17px;line-height:1.6;color:${COLOR_BODY};font-family:${FONT};">${esc(p)}</p>`)
    .join("");

  const details = spec.details?.length
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 22px 0;background:${tint(strong, 0.07)};border-radius:18px;"><tr>
        <td width="64" valign="middle" style="padding:22px 0 22px 22px;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td width="64" height="64" align="center" valign="middle" style="width:64px;height:64px;border-radius:32px;background:${strong};">${img(spec.icon || "icon-user", 30, "margin:0 auto;")}</td></tr></table></td>
        <td valign="middle" style="padding:20px 20px 20px 22px;">
          <table role="presentation" cellspacing="0" cellpadding="0" style="border-left:1px solid ${tint(strong, 0.25)};"><tr><td style="padding-left:22px;">
            ${spec.details.map((d, i) => `<div style="${i ? "margin-top:12px;" : ""}font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:${COLOR_MUTED};font-family:${FONT};">${esc(d.label)}</div><div style="margin-top:3px;font-size:20px;line-height:1.25;font-weight:800;color:${COLOR_TEXT};font-family:${FONT};">${esc(d.value)}</div>`).join("")}
          </td></tr></table>
        </td></tr></table>`
    : "";

  const button = spec.button
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:6px 0 0 0;"><tr><td style="${gradient}border-radius:14px;box-shadow:0 8px 18px ${strong}55;">
        <a href="${esc(spec.button.url)}" style="display:block;padding:15px 20px;text-align:center;text-decoration:none;font-family:${FONT};">
          <table role="presentation" cellspacing="0" cellpadding="0" align="center"><tr>
            <td width="34" height="34" align="center" valign="middle" style="width:34px;height:34px;border-radius:17px;background:rgba(255,255,255,.25);">${img("icon-arrow", 18, "margin:0 auto;")}</td>
            <td style="padding-left:14px;font-size:19px;font-weight:800;color:#ffffff;font-family:${FONT};">${esc(spec.button.label)}</td>
          </tr></table>
        </a></td></tr></table>
       <table role="presentation" cellspacing="0" cellpadding="0" style="margin:16px 0 0 0;"><tr>
         <td valign="top" style="padding-right:10px;padding-top:2px;">${img("icon-link", 18)}</td>
         <td style="font-size:13.5px;line-height:1.5;color:${COLOR_MUTED};font-family:${FONT};">Se o botão não funcionar, copie e cole este endereço no navegador: <a href="${esc(spec.button.url)}" style="color:${strong};word-break:break-all;">${esc(spec.button.url)}</a></td>
       </tr></table>
       ${spec.secondaryLink ? `<p style="margin:14px 0 0 0;font-size:14px;line-height:1.5;color:${COLOR_MUTED};font-family:${FONT};">ou <a href="${esc(spec.secondaryLink.url)}" style="color:${strong};font-weight:700;text-decoration:underline;">${esc(spec.secondaryLink.label)}</a></p>` : ""}`
    : "";

  const note = spec.note
    ? `<p style="margin:24px 0 0 0;padding-top:20px;border-top:1px solid #e2e8f0;font-size:14px;line-height:1.6;color:${COLOR_MUTED};font-family:${FONT};">${esc(spec.note)}</p>`
    : "";

  const left = `${pill}${title}${greeting}${paragraphs}${details}${button}${note}`;

  // ── Coluna da direita (ilustração + cartão informativo) ──
  const info = spec.info
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;background:${tint(strong, 0.07)};border-radius:18px;"><tr>
        <td width="48" valign="middle" style="padding:20px 0 20px 20px;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td width="48" height="48" align="center" valign="middle" style="width:48px;height:48px;border-radius:24px;background:${strong};">${img("icon-info", 24, "margin:0 auto;")}</td></tr></table></td>
        <td valign="middle" style="padding:18px 20px 18px 18px;">
          <table role="presentation" cellspacing="0" cellpadding="0" style="border-left:1px solid ${tint(strong, 0.25)};"><tr><td style="padding-left:18px;">
            <div style="font-size:16px;line-height:1.3;font-weight:800;color:${COLOR_TEXT};font-family:${FONT};">${esc(spec.info.title)}</div>
            <div style="margin-top:6px;font-size:14px;line-height:1.55;color:${COLOR_BODY};font-family:${FONT};">${esc(spec.info.text)}</div>
          </td></tr></table>
        </td></tr></table>`
    : "";
  used.add("illustration");
  const illustration = spec.illustration
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${tint(strong, 0.09)};border-radius:24px;"><tr><td style="padding:10px;"><img src="cid:illustration@spy" alt="" width="100%" style="display:block;border:0;width:100%;height:auto;"></td></tr></table>`
    : "";
  if (!spec.illustration) used.delete("illustration");
  const right = `${illustration}${info}`;

  const body = spec.illustration || right
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="font-size:0;line-height:0;text-align:center;">
         <div style="display:inline-block;width:100%;max-width:364px;vertical-align:top;font-size:16px;line-height:1.5;text-align:left;">${left}</div>
         <div class="col-r" style="display:inline-block;width:100%;max-width:342px;vertical-align:top;font-size:16px;line-height:1.5;text-align:left;padding-left:20px;box-sizing:border-box;">${right}</div>
       </td></tr></table>`
    : `<div style="max-width:560px;">${left}</div>`;

  // ── Rodapé ──
  const footerIcons = ["icon-chart", "icon-users", "icon-gear", "icon-bell"]
    .map((n) => `<td style="padding-left:10px;"><table role="presentation" cellspacing="0" cellpadding="0"><tr><td width="44" height="44" align="center" valign="middle" style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3);">${img(n, 20, "margin:0 auto;")}</td></tr></table></td>`)
    .join("");
  const footer = `<tr><td style="${gradient}padding:26px 40px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      <td valign="middle" style="width:1%;white-space:nowrap;"><table role="presentation" cellspacing="0" cellpadding="0"><tr>
        <td style="padding-right:12px;">${img("mark-white", 40)}</td>
        <td>
          <div style="font-size:22px;line-height:1;font-weight:800;letter-spacing:3px;color:#ffffff;font-family:${FONT};">${BRAND}</div>
          <div style="margin-top:5px;font-size:9.5px;letter-spacing:2.5px;text-transform:uppercase;color:#ffffff;opacity:.85;font-family:${FONT};">${TAGLINE}</div>
        </td>
      </tr></table></td>
      <td valign="middle" style="padding:0 14px 0 18px;"><div style="border-left:1px solid rgba(255,255,255,.35);padding-left:16px;">
        <div style="font-size:13px;line-height:1.4;font-weight:700;color:#ffffff;font-family:${FONT};">Mais leads. Mais vendas. Mais resultados.</div>
        <div style="margin-top:3px;font-size:12px;line-height:1.4;color:#ffffff;opacity:.85;font-family:${FONT};">Automatize, acompanhe e converta com o ${BRAND}</div>
      </div></td>
      <td align="right" valign="middle"><table role="presentation" cellspacing="0" cellpadding="0" align="right"><tr>${footerIcons}</tr></table></td>
    </tr></table>
  </td></tr>`;

  const reason = brandName
    ? `Você recebeu este e-mail porque ele está ligado à sua conta na ${esc(brandName)}.`
    : `Você recebeu este e-mail porque ele está ligado à sua conta no ${BRAND}`;
  const footerLink = spec.footerLink
    ? ` <a href="${esc(spec.footerLink.url)}" style="color:${COLOR_MUTED};text-decoration:underline;">${esc(spec.footerLink.label)}</a>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">
<style>@media (max-width:620px){.col-r{padding-left:0!important;margin-top:24px}.pad{padding-left:22px!important;padding-right:22px!important}h1{font-size:32px!important}}</style>
<title>${esc(spec.subject)}</title></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:${FONT};">
  <span style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(spec.preheader)}</span>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2f7;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:800px;background:#ffffff;border-radius:22px;overflow:hidden;border:1px solid #dde4ee;">
        ${header}
        <tr><td class="pad" style="padding:42px 44px 40px 44px;">${body}</td></tr>
        ${footer}
      </table>
      <p style="max-width:700px;margin:18px 0 0 0;font-size:12px;line-height:1.6;color:${COLOR_MUTED};text-align:center;font-family:${FONT};">${reason} Se não foi você, pode ignorá-lo com segurança.${footerLink}</p>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    spec.title1 + (spec.title2 ? ` ${spec.title2}` : ""),
    "",
    spec.greeting,
    ...spec.paragraphs,
    ...(spec.details?.length ? ["", ...spec.details.map((d) => `${d.label}: ${d.value}`)] : []),
    ...(spec.button ? ["", `${spec.button.label}: ${spec.button.url}`] : []),
    ...(spec.secondaryLink ? [`${spec.secondaryLink.label}: ${spec.secondaryLink.url}`] : []),
    ...(spec.note ? ["", spec.note] : []),
    ...(spec.info ? ["", `${spec.info.title} — ${spec.info.text}`] : []),
    ...(spec.footerLink ? ["", `${spec.footerLink.label}: ${spec.footerLink.url}`] : []),
    "",
    `— ${BRAND} · ${TAGLINE}`,
  ].join("\n");

  const attachments: EmailAttachment[] = [...used].map((name) => ({
    filename: `${name}.png`,
    content: Buffer.from(EMAIL_IMAGES_B64[name], "base64"),
    cid: `${name}@spy`,
    contentType: "image/png",
    contentDisposition: "inline",
  }));

  return { subject: spec.subject, html, text, attachments };
}

const firstName = (name?: string | null) => (name || "").trim().split(/\s+/)[0] || "";
const greeting = (name?: string | null) => (firstName(name) ? `Olá, ${firstName(name)}!` : "Olá!");
const ACCOUNT_HEADER = { line1: "Segurança da conta", line2: "Aviso automático do S.P.Y." };

export function testEmail(brand?: EmailBrand): RenderedEmail {
  return render({
    subject: "Teste de envio — S.P.Y.",
    preheader: "Seu servidor de e-mail está funcionando.",
    headerRight: { line1: "Teste de envio", line2: "E-mail do S.P.Y." },
    pill: { label: "Teste", color: "#16a34a" },
    title1: "Tudo certo",
    title2: "com o envio de e-mails",
    greeting: "Olá!",
    paragraphs: ["Se você recebeu esta mensagem, o servidor SMTP do seu ambiente está enviando e-mails corretamente."],
    brand,
  });
}

export function passwordResetEmail(link: string, name?: string | null, brand?: EmailBrand): RenderedEmail {
  return render({
    subject: "Redefinir sua senha do S.P.Y.",
    preheader: "Use o link para criar uma nova senha.",
    headerRight: ACCOUNT_HEADER,
    pill: { label: "Segurança da conta", color: "brand" },
    title1: "Redefinir",
    title2: "sua senha",
    greeting: greeting(name),
    paragraphs: ["Recebemos um pedido para redefinir a senha da sua conta. Clique no botão abaixo para criar uma nova senha."],
    button: { label: "Criar nova senha", url: link },
    note: "Por segurança, este link expira em pouco tempo e só pode ser usado uma vez. Se você não pediu a redefinição, ignore este e-mail — sua senha continua a mesma.",
    brand,
  });
}

export function passwordChangedEmail(name: string | null | undefined, whenIso: string, brand?: EmailBrand): RenderedEmail {
  const when = new Date(whenIso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short" });
  return render({
    subject: "Sua senha do S.P.Y. foi alterada",
    preheader: "A senha da sua conta acabou de ser alterada.",
    headerRight: ACCOUNT_HEADER,
    pill: { label: "Segurança da conta", color: "brand" },
    title1: "Sua senha",
    title2: "foi alterada",
    greeting: greeting(name),
    paragraphs: [`A senha da sua conta no ${BRAND} foi alterada em ${when} (horário de Brasília).`],
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

type Icon = "icon-user" | "icon-bell" | "icon-users" | "icon-chart";
interface Copy { crm?: boolean; pill: string; title1: string; title2: string; intro: string; headerLine2: string; icon: Icon; info: { title: string; text: string } }

/**
 * Texto próprio de cada tipo de aviso. A chave é o "copyKey": normalmente o id do tipo da tela de
 * Preferências de Notificação; alguns ids têm mais de um texto (tarefa_proxima serve a tarefa e à reunião).
 */
export const NOTIFICATION_COPY: Record<string, Copy> = {
  agente_secreto_desconectado: {
    pill: "Agente Secreto desconectado", title1: "Agente Secreto", title2: "desconectou do WhatsApp", icon: "icon-bell",
    intro: "A sessão do Agente Secreto no WhatsApp caiu e ele parou de acompanhar suas conversas. Reconecte lendo o QR code no S.P.Y. — leva menos de um minuto.",
    headerLine2: "Agente Secreto desconectado",
    info: { title: "Como reconectar", text: "Abra o S.P.Y., clique em Reconectar no aviso vermelho e leia o QR code em WhatsApp › Aparelhos conectados." },
  },
  novo_lead: {
    crm: true,
    pill: "Novo lead recebido", title1: "Novo Lead", title2: "adicionado no S.P.Y.", icon: "icon-user",
    intro: "Um novo lead foi capturado e adicionado automaticamente no seu CRM. Chame agora, enquanto ele ainda está pensando em você.",
    headerLine2: "Novo lead no seu CRM",
    info: { title: "Leads chegam automaticamente", text: "O S.P.Y. monitora seus canais e adiciona oportunidades no CRM em tempo real, para você não perder nenhum potencial cliente." },
  },
  lead_distribuido: {
    crm: true,
    pill: "Lead atribuído a você", title1: "Lead atribuído", title2: "para você", icon: "icon-user",
    intro: "Um lead acabou de ser colocado na sua carteira. Quanto mais rápido o primeiro contato, maiores as chances de fechar.",
    headerLine2: "Lead atribuído no seu CRM",
    info: { title: "Quem responde primeiro, vende mais", text: "Falar com o lead nos primeiros minutos multiplica a chance de conversão. O Agente Secreto acompanha a conversa com você." },
  },
  lead_esquentou: {
    crm: true,
    pill: "Oportunidade quente", title1: "Oportunidade", title2: "quente no seu CRM", icon: "icon-chart",
    intro: "Este lead está com alta chance de fechamento. É a hora de priorizar o contato.",
    headerLine2: "Oportunidade quente",
    info: { title: "Foco no que mais converte", text: "O S.P.Y. avalia cada lead e avisa quando uma oportunidade esquenta, para você agir no momento certo." },
  },
  tarefa_proxima: {
    pill: "Lembrete de tarefa", title1: "Sua tarefa", title2: "vence em breve", icon: "icon-bell",
    intro: "Uma tarefa sua está chegando ao prazo. Separe alguns minutos para resolver antes que atrase.",
    headerLine2: "Tarefa perto do prazo",
    info: { title: "Prazo em dia, venda em dia", text: "Follow-ups no horário são o que mantém o funil andando. Concluiu? Marque como feita no S.P.Y." },
  },
  tarefa_vencida: {
    pill: "Tarefa vencida", title1: "Tarefa", title2: "vencida", icon: "icon-bell",
    intro: "Uma tarefa sua passou do prazo e ainda não foi concluída. Resolva agora ou reagende para não perder o ritmo.",
    headerLine2: "Tarefa em atraso",
    info: { title: "Reagende em um clique", text: "Se a data não faz mais sentido, ajuste o prazo no S.P.Y. para manter sua agenda realista." },
  },
  reuniao_proxima: {
    pill: "Reunião começando", title1: "Sua reunião", title2: "começa em breve", icon: "icon-users",
    intro: "Você tem um compromisso chegando. Confira os detalhes abaixo e entre com antecedência.",
    headerLine2: "Reunião ou ligação em breve",
    info: { title: "Chegue preparado", text: "Revise o histórico do lead e a pauta no S.P.Y. antes de começar. O Agente Secreto já tem o contexto da conversa." },
  },
  reuniao_confirmada: {
    pill: "Reunião agendada", title1: "Reunião", title2: "agendada na sua agenda", icon: "icon-users",
    intro: "Um novo compromisso entrou na sua agenda. Os detalhes estão logo abaixo.",
    headerLine2: "Agenda atualizada",
    info: { title: "Agenda sempre sincronizada", text: "Compromissos do Google Agenda e do S.P.Y. ficam juntos, e você recebe um lembrete antes de começar." },
  },
  proposta_aberta: {
    crm: true,
    pill: "Proposta visualizada", title1: "Seu cliente", title2: "abriu a proposta", icon: "icon-chart",
    intro: "O cliente acabou de abrir a proposta que você enviou. É um ótimo momento para fazer contato.",
    headerLine2: "Proposta visualizada",
    info: { title: "Contato no momento certo", text: "Quem liga logo depois da visualização tem muito mais chance de fechar. Acompanhe o histórico da proposta no S.P.Y." },
  },
  proposta_aceita: {
    crm: true,
    pill: "Proposta aceita", title1: "Proposta", title2: "aceita pelo cliente", icon: "icon-chart",
    intro: "O cliente aceitou a proposta. Hora de dar sequência e formalizar a venda.",
    headerLine2: "Proposta aceita",
    info: { title: "Próximo passo: formalizar", text: "O aceite foi registrado com nome, documento e horário. Acompanhe o contrato e a cobrança no S.P.Y." },
  },
  venda_fechada: {
    crm: true,
    pill: "Venda fechada", title1: "Venda", title2: "fechada no S.P.Y.", icon: "icon-chart",
    intro: "Mais uma venda registrada no seu CRM. Parabéns ao time!",
    headerLine2: "Venda fechada",
    info: { title: "Onboarding sem atraso", text: "Com a venda fechada, siga para o financeiro e a entrega para o cliente começar bem." },
  },
  pagamento_recebido: {
    pill: "Pagamento recebido", title1: "Pagamento", title2: "recebido", icon: "icon-chart",
    intro: "Um pagamento foi confirmado e já aparece no financeiro do seu S.P.Y.",
    headerLine2: "Pagamento confirmado",
    info: { title: "Financeiro em tempo real", text: "Acompanhe receitas, vencimentos e conciliação sem sair do S.P.Y." },
  },
};

/** E-mail de notificação do sistema: espelha um aviso do sino, com botão pra abrir a tela certa. */
export function notificationEmail(n: {
  kind: NotificationKind;
  title: string;
  description: string;
  /** Texto próprio do aviso (chave de NOTIFICATION_COPY); sem ele, vale o título/descrição recebidos. */
  copyKey?: string;
  /** Dados em destaque no cartão (ex.: nome do lead, empresa). */
  details?: { label: string; value: string }[];
  linkUrl?: string;
  /** Botão principal alternativo (ex.: "Chamar no WhatsApp"); quando existe, linkUrl vira o link secundário. */
  primaryButton?: { label: string; url: string };
  settingsUrl?: string;
  name?: string | null;
  brand?: EmailBrand;
}): RenderedEmail {
  const style = KIND_STYLE[n.kind] || KIND_STYLE.info;
  const copy = n.copyKey ? NOTIFICATION_COPY[n.copyKey] : undefined;
  return render({
    subject: n.title,
    preheader: n.description.slice(0, 110),
    headerRight: { line1: "Notificação automática", line2: copy?.headerLine2 || "Aviso do seu CRM" },
    pill: { label: copy?.pill || style.label, color: style.color },
    title1: copy?.title1 || n.title,
    title2: copy?.title2,
    greeting: greeting(n.name),
    paragraphs: [copy?.intro || n.description],
    details: n.details,
    icon: copy?.icon,
    button: n.primaryButton || (n.linkUrl ? { label: "Abrir no S.P.Y.", url: n.linkUrl } : undefined),
    secondaryLink: n.primaryButton && n.linkUrl ? { label: "abrir no S.P.Y.", url: n.linkUrl } : undefined,
    info: copy?.info || { title: "Fique por dentro", text: "O S.P.Y. avisa você sobre o que importa no seu CRM, em tempo real, para você agir no momento certo." },
    illustration: copy ? !!copy.crm : true,
    footerLink: n.settingsUrl ? { label: "Ajustar quais avisos você recebe por e-mail", url: n.settingsUrl } : undefined,
    brand: n.brand,
  });
}
