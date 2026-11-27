/**
 * E-mail com HTML próprio (modelo do cliente), usado pela tela e pelo servidor. O corpo continua no mesmo campo das
 * campanhas: se começa com marcação HTML, é tratado como HTML; senão é o texto simples de sempre.
 */
export const MAX_TEXTO = 20_000;
export const MAX_HTML = 200_000;
/** Acima disto o Gmail corta a mensagem e mostra "ver mensagem completa". */
export const CORTE_GMAIL = 102_000;

const INICIO_HTML = /^﻿?\s*(?:<!--[\s\S]*?-->\s*)*<(?:!doctype\s+html|(?:html|head|body|table|div|center|style|meta|section|article|header|p|h[1-6]|img|a|span)(?=[\s/>]))/i;

export const ehHtml = (corpo: string) => INICIO_HTML.test(String(corpo ?? ""));

/** HTML colado sem uma marcação reconhecida no começo (ex.: começa com texto) é embrulhado para continuar sendo HTML. */
export const comoHtml = (html: string) => (!html.trim() || ehHtml(html) ? html : `<div>${html}</div>`);

/** Texto é cortado no limite, como antes; HTML grande demais é recusado (cortar quebraria o e-mail). */
export function conferirCorpo(raw: unknown): { ok: true; corpo: string } | { ok: false; erro: string } {
  const corpo = String(raw ?? "").trim();
  if (!ehHtml(corpo)) return { ok: true, corpo: corpo.slice(0, MAX_TEXTO) };
  if (corpo.length > MAX_HTML) return { ok: false, erro: `O HTML tem ${Math.round(corpo.length / 1000)} mil caracteres; o limite é ${MAX_HTML / 1000} mil. Hospede as imagens na internet em vez de colocá-las dentro do arquivo.` };
  return { ok: true, corpo };
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", copy: "©", reg: "®", mdash: "—", ndash: "–", hellip: "…" };
export const semEntidades = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, e: string) => {
  if (e[0] !== "#") return ENTIDADES[e.toLowerCase()] ?? m;
  const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1));
  return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
});

const TAG = /<[a-zA-Z](?:"[^"]*"|'[^']*'|[^'">])*>/g;
const ATRIBUTO = /([\s/]+)([^\s"'=<>/]+)(?:(\s*=\s*)("[^"]*"|'[^']*'|[^\s>]+))?/g;
const REMOVIDAS = /<\/?(?:iframe|frame|frameset|object|embed|applet|base|form|input|button|select|textarea)(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
const perigoso = (valor: string) => /^(?:javascript|vbscript|data:text\/html)/i.test(semEntidades(valor.replace(/^["']|["']$/g, "")).replace(/[\u0000- ]+/g, ""));

/** Tira o que não funciona em e-mail e só serve para atrapalhar a entrega: scripts, eventos, formulários e quadros. */
export function sanitizarHtml(html: string): string {
  let h = String(html ?? "").replace(/[\u0000-\u0008]/g, "");
  for (let antes = ""; antes !== h; ) {
    antes = h;
    h = h.replace(/<script\b[\s\S]*?(?:<\/script\s*>|$)/gi, "").replace(REMOVIDAS, "")
      .replace(/<meta\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi, (tag) => (/http-equiv\s*=\s*["']?\s*refresh/i.test(tag) ? "" : tag));
  }
  return h.replace(TAG, (tag) => {
    const nome = /^<[^\s/>]+/.exec(tag)![0];
    return nome + tag.slice(nome.length).replace(ATRIBUTO, (m, sep: string, attr: string, igual?: string, valor?: string) => {
      if (/^on/i.test(attr)) return "";
      if (valor && /^(?:href|src|background|action|formaction|xlink:href)$/i.test(attr) && perigoso(valor)) return `${sep}${attr}${igual}"#"`;
      return m;
    });
  });
}

/** Troca o endereço dos links (<a> e <area>) que apontam para a internet. */
export function trocarLinks(html: string, trocar: (url: string) => string): string {
  return html.replace(/<(?:a|area)(?=[\s/])(?:"[^"]*"|'[^']*'|[^'">])*>/gi, (tag) =>
    tag.replace(/(\shref\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i, (m, ini: string, a?: string, b?: string, c?: string) => {
      const url = semEntidades((a ?? b ?? c ?? "").trim());
      if (!/^https?:\/\//i.test(url)) return m;
      return `${ini}"${trocar(url).replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"`;
    }));
}

/** Versão em texto puro (para quem não vê HTML e para os filtros de spam). Os links aparecem ao lado do texto. */
export function htmlParaTexto(html: string): string {
  return semEntidades(
    String(html ?? "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<(head|style|script|title)\b[\s\S]*?<\/\1\s*>/gi, "")
      .replace(/<a(?=[\s/])((?:"[^"]*"|'[^']*'|[^'">])*)>([\s\S]*?)<\/a\s*>/gi, (_m, attrs: string, dentro: string) => {
        const h = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i.exec(attrs);
        const url = (h?.[1] ?? h?.[2] ?? h?.[3] ?? "").trim();
        return /^https?:\/\//i.test(url) ? `${dentro} (${url})` : dentro;
      })
      .replace(/\s+/g, " ")
      .replace(/<(?:br|\/p|\/div|\/tr|\/h[1-6]|\/li|\/table)\b[^>]*>/gi, "\n")
      .replace(TAG, " ")
      .replace(/<\/[a-zA-Z][^>]*>|<![^>]*>/g, " "),
  ).replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Marcadores aceitos no lugar do link de sair da lista. */
export const MARCA_DESCADASTRO = /\{\{\s*(?:descadastro|link_descadastro|unsubscribe|unsubscribe_url)\s*\}\}|\*\|UNSUB\|\*/gi;

export function avisosDoHtml(html: string): { nivel: "atencao" | "dica"; texto: string }[] {
  const out: { nivel: "atencao" | "dica"; texto: string }[] = [];
  if (!html.trim()) return out;
  if (html.length > CORTE_GMAIL) out.push({ nivel: "atencao", texto: `O HTML tem ${Math.round(html.length / 1000)} mil caracteres: acima de ~102 mil o Gmail corta a mensagem.` });
  const imagens = [...html.matchAll(/<img\b(?:"[^"]*"|'[^']*'|[^'">])*?\ssrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/gi)].map((m) => (m[1] ?? m[2] ?? m[3] ?? "").trim());
  const foraDoAr = imagens.filter((s) => !/^(https?:)?\/\//i.test(s) && !/\{\{/.test(s));
  if (foraDoAr.length) out.push({ nivel: "atencao", texto: `${foraDoAr.length} imagem(ns) não vão aparecer: use o endereço completo (https://…). Arquivos do computador e imagens embutidas são bloqueados pelos apps de e-mail.` });
  if (/<script\b|<form\b|<iframe\b|\son[a-z]+\s*=/i.test(html)) out.push({ nivel: "atencao", texto: "Scripts, formulários e quadros não funcionam em e-mail e serão removidos." });
  if (/<link\b[^>]*stylesheet/i.test(html)) out.push({ nivel: "dica", texto: "Folhas de estilo externas são ignoradas: coloque o estilo dentro do próprio HTML." });
  if (!/<a\b[^>]*href\s*=\s*["']?https?:/i.test(html)) out.push({ nivel: "dica", texto: "Nenhum link: sem link não dá para medir cliques." });
  if (htmlParaTexto(html).length < 60) out.push({ nivel: "atencao", texto: "Quase sem texto (só imagem) costuma ir para o spam. Escreva também em texto." });
  if (!new RegExp(MARCA_DESCADASTRO.source, "i").test(html)) out.push({ nivel: "dica", texto: "O link para sair da lista será adicionado no rodapé. Para escolher o lugar, use {{descadastro}} no endereço de um link." });
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Modelo de partida, já com a marca da empresa, para o cliente baixar, ajustar e enviar de volta. */
export function modeloExemploHtml(marca: { nome: string; cor?: string | null; logo?: string | null }): string {
  const cor = /^#[0-9a-f]{6}$/i.test(marca.cor || "") ? marca.cor! : "#7C3AED";
  const nome = esc(marca.nome || "Sua empresa");
  const topo = /^https:\/\/[^\s"'<>]+$/i.test(marca.logo || "")
    ? `<img src="${esc(marca.logo!)}" alt="${nome}" style="max-height:48px;max-width:220px;border:0;display:block;margin:0 auto">`
    : `<span style="font-size:22px;font-weight:700;color:#ffffff">${nome}</span>`;
  const fundoTopo = topo.startsWith("<img") ? "#ffffff" : cor;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${nome}</title>
</head>
<body style="margin:0;padding:0;background:#f2f3f7;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2f3f7;padding:24px 12px">
  <tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden">
      <!-- Topo: troque pela sua logo -->
      <tr><td align="center" style="background:${fundoTopo};padding:24px;border-bottom:4px solid ${cor}">${topo}</td></tr>
      <!-- Conteúdo -->
      <tr><td style="padding:32px 28px">
        <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;color:#111827">Olá, {{primeiro_nome}}!</h1>
        <p style="margin:0 0 16px;font-size:16px;line-height:1.6">Escreva aqui a novidade da sua empresa: uma oferta, um convite ou um aviso importante.</p>
        <p style="margin:0 0 24px;font-size:16px;line-height:1.6">Conte em uma ou duas frases por que vale a pena clicar no botão.</p>
        <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="background:${cor};border-radius:10px">
          <a href="https://www.seusite.com.br" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:16px;font-weight:700;text-decoration:none">Quero saber mais</a>
        </td></tr></table>
      </td></tr>
      <!-- Rodapé -->
      <tr><td align="center" style="padding:20px 28px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.6;color:#6b7280">
        Você recebeu este e-mail de ${nome}.<br>
        <a href="{{descadastro}}" style="color:#6b7280">Não quero mais receber</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;
}

// ── Logo da empresa: escolhida em cada e-mail e guardada no próprio corpo ──
const SEM_LOGO = /^\s*\{\{\s*sem_logo\s*\}\}[ \t]*\r?\n?/i;
export const LOGO_NO_TOPO = "<!--spy:logo-no-topo-->";

/** Padrão: no texto a logo aparece (como sempre foi); no HTML do cliente só entra se ele pedir. */
export function comOpcaoDeLogo(corpo: string, mostrar: boolean): string {
  if (!corpo.trim()) return "";
  const { conteudo } = lerOpcaoDeLogo(corpo);
  if (ehHtml(conteudo)) return mostrar ? `${LOGO_NO_TOPO}\n${conteudo}` : conteudo;
  return mostrar ? conteudo : `{{sem_logo}}\n${conteudo}`;
}

export function lerOpcaoDeLogo(corpo: string): { conteudo: string; mostrar: boolean } {
  const c = String(corpo ?? "");
  if (ehHtml(c)) return { conteudo: c.split(LOGO_NO_TOPO).join("").replace(/^\s+/, ""), mostrar: c.includes(LOGO_NO_TOPO) };
  return { conteudo: c.replace(SEM_LOGO, ""), mostrar: !SEM_LOGO.test(c) };
}

// ── Imagens ──
/** Bloco de uma imagem no HTML, com link opcional. */
export function imagemEmHtml(url: string, descricao: string, link?: string): string {
  const img = `<img src="${esc(url)}" alt="${esc(descricao)}" width="560" style="display:block;width:100%;max-width:560px;height:auto;margin:0 auto;border:0">`;
  return `<div style="margin:16px 0;text-align:center">${link ? `<a href="${esc(link)}">${img}</a>` : img}</div>`;
}

/** A mesma imagem na marcação do texto simples. */
export function imagemEmTexto(url: string, descricao: string, link?: string): string {
  const img = `![${descricao.replace(/[[\]\r\n]/g, " ").trim()}](${url})`;
  return link ? `[${img}](${link})` : img;
}

/** Coloca o trecho no ponto do cursor; sem cursor, antes do fim do documento. */
export function inserirNoHtml(html: string, trecho: string, posicao?: number | null): string {
  if (!html.trim()) return `<div>${trecho}</div>`;
  const i = typeof posicao === "number" && posicao > 0 && posicao <= html.length ? posicao : html.toLowerCase().lastIndexOf("</body>");
  if (i < 0) return `${html}\n${trecho}`;
  // Não parte uma marcação ao meio.
  const aberta = html.lastIndexOf("<", i - 1) > html.lastIndexOf(">", i - 1);
  const onde = aberta ? html.indexOf(">", i) + 1 || html.length : i;
  return `${html.slice(0, onde)}\n${trecho}\n${html.slice(onde)}`;
}

// ── Conteúdo enquanto está sendo escrito ──
export type FormatoEmail = "texto" | "html";
export interface ConteudoEmail { formato: FormatoEmail; texto: string; html: string; logo: Record<FormatoEmail, boolean> }

export const conteudoVazio = (): ConteudoEmail => ({ formato: "texto", texto: "", html: "", logo: { texto: true, html: false } });

/** Corpo gravado → o que o editor mostra. */
export function abrirConteudo(corpo: string): ConteudoEmail {
  const { conteudo, mostrar } = lerOpcaoDeLogo(corpo);
  const formato: FormatoEmail = ehHtml(conteudo) ? "html" : "texto";
  const vazio = conteudoVazio();
  return { formato, texto: formato === "texto" ? conteudo : "", html: formato === "html" ? conteudo : "", logo: { ...vazio.logo, [formato]: mostrar } };
}

/** O que o editor mostra → corpo que vai no e-mail (vazio enquanto não há conteúdo). */
export const corpoDoConteudo = (c: ConteudoEmail) => comOpcaoDeLogo(c.formato === "html" ? comoHtml(c.html.trim()) : c.texto.trim(), c.logo[c.formato]);

// ── Imagens do modelo que não abririam (arquivo do computador) ──
export interface ImagemSemEndereco { src: string; nome: string; pareceLogo: boolean }

const IMG = /<img(?=[\s/>])(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
const SRC = /(\ssrc\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s>"']+))/i;
const atributo = (tag: string, nome: string) => { const m = new RegExp(`\\s${nome}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>"']+))`, "i").exec(tag); return m ? semEntidades(m[1] ?? m[2] ?? m[3] ?? "") : ""; };
const srcDe = (tag: string) => { const m = SRC.exec(tag); return m ? (m[2] ?? m[3] ?? m[4] ?? "").trim() : null; };

/** Imagens sem endereço na internet, uma vez cada; "parece logo" pelo nome do arquivo, descrição, classe ou id. */
export function imagensSemEndereco(html: string): ImagemSemEndereco[] {
  const achadas = new Map<string, ImagemSemEndereco>();
  for (const [tag] of String(html ?? "").replace(/<!--[\s\S]*?-->/g, "").matchAll(IMG)) {
    const src = srcDe(tag);
    if (src === null || /^(https?:)?\/\//i.test(src) || /\{\{/.test(src)) continue;
    const pareceLogo = /logo/i.test(`${src.startsWith("data:") ? "" : src} ${atributo(tag, "alt")} ${atributo(tag, "class")} ${atributo(tag, "id")}`);
    const nome = src.startsWith("data:") ? "imagem embutida no arquivo" : src.split(/[\\/]/).pop() || atributo(tag, "alt") || "imagem sem arquivo";
    const antes = achadas.get(src);
    achadas.set(src, { src, nome, pareceLogo: pareceLogo || !!antes?.pareceLogo });
  }
  return [...achadas.values()];
}

/** Põe um endereço no lugar dessa imagem. A altura fixa sai, para a nova não ficar esticada (a largura do modelo é mantida). */
export function trocarImagem(html: string, srcAntigo: string, url: string): string {
  return html.replace(IMG, (tag) => {
    if (srcDe(tag) !== srcAntigo) return tag;
    let nova = tag.replace(SRC, (_m, ini: string) => `${ini}"${esc(url)}"`);
    if (/\swidth\s*[=]|[;"'\s]width\s*:/i.test(nova)) {
      nova = nova.replace(/\sheight\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>"']+)/i, "").replace(/([;"'\s])height\s*:\s*[^;"']+/i, "$1height:auto");
    }
    return nova;
  });
}
