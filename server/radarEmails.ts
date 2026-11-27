// E-mails vindos do Radar, para entrar numa campanha: lê o resultado da pesquisa, procura o e-mail publicado no site
// de cada empresa (o Google Maps não informa e-mail) e lista as empresas já salvas pela busca por CNAE.
import type { Express } from "express";
import axios from "axios";
import { assertSafeHttpUrl, ssrfSafeAgents } from "./ssrfGuard.js";
import { cleanEmail } from "./emailCampaigns.js";

export interface ResultadoDoRadar { empresa: string; endereco: string; avaliacao: string; contato: string; site: string; whatsapp: string; email: string }

/** O fluxo devolve texto: uma linha por empresa ("- Nome — endereço — … — contato: … — email: … — site: …"). */
export function lerResultadosDoRadar(resposta: string): ResultadoDoRadar[] {
  return resposta.split("\n").filter((l) => l.startsWith("- ")).map((l) => {
    const partes = l.slice(2).split(" — ");
    const pega = (prefixo: string) => (partes.find((x) => x.startsWith(prefixo)) || "").slice(prefixo.length).trim();
    let contato = pega("contato: ");
    if (/^n[ãa]o encontrado$/i.test(contato)) contato = "";
    // Na busca por CNAE, sem telefone o e-mail vem no lugar do contato.
    let email = cleanEmail(pega("email: "));
    if (contato.includes("@")) { email ||= cleanEmail(contato); contato = ""; }
    return {
      empresa: (partes[0] || "").trim(),
      endereco: (partes[1] || "").trim(),
      avaliacao: pega("avaliação Google: "),
      contato,
      site: pega("site: "),
      whatsapp: pega("whatsapp_chatid: ").replace(/@c\.us$/, ""),
      email,
    };
  }).filter((r) => r.empresa);
}

const ACHA_EMAIL = /[a-z0-9._%+-]{1,64}@[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){0,4}\.[a-z]{2,24}/gi;
const DOMINIO_DE_ENFEITE = /(^|\.)(sentry\.io|wixpress\.com|example\.(com|org)|exemplo\.com(\.br)?|(seu)?dominio\.com(\.br)?|email\.com|schema\.org|godaddy\.com)$/i;
const CAIXA_SEM_DONO = /^((seu|your)[._-]?)?(e-?mail|nome|name|usuario|user)$|^(no-?reply|nao-?responda|donotreply)/i;
const PROVEDOR_COMUM = /^(gmail|hotmail|outlook|live|yahoo|icloud|uol|bol|terra)\.com(\.br)?$/i;
/** Redes sociais e afins: o e-mail que aparece ali não é da empresa. */
const SEM_SITE_PROPRIO = /(^|\.)(instagram\.com|facebook\.com|fb\.com|whatsapp\.com|wa\.me|youtube\.com|tiktok\.com|google\.com|goo\.gl|ifood\.com\.br)$/i;

const semWww = (h: string) => h.toLowerCase().replace(/^www\./, "");

/** E-mail escondido pela proteção do Cloudflare (data-cfemail). */
function abrirCloudflare(hex: string): string {
  const chave = parseInt(hex.slice(0, 2), 16);
  let o = "";
  for (let i = 2; i + 1 < hex.length; i += 2) o += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ chave);
  return o;
}

/**
 * Melhor e-mail da página para aquela empresa. Só aceita o do próprio domínio, de provedor comum (gmail etc.) ou, num
 * link "mailto:", de outro domínio: um endereço solto de terceiro costuma ser de quem fez o site.
 */
export function melhorEmail(html: string, hostDoSite: string): { email: string; nota: number } | null {
  const texto = html.replace(/&#0*64;|&#x0*40;|%40/gi, "@").replace(/&#0*46;|&#x0*2e;/gi, ".");
  const emLink = new Set((texto.match(/mailto:[^"'?>\s]+/gi) || []).map((m) => m.slice(7).toLowerCase()));
  const escondidos = [...texto.matchAll(/data-cfemail="([0-9a-f]{6,200})"/gi)].map((m) => abrirCloudflare(m[1]).toLowerCase());
  for (const e of escondidos) emLink.add(e);
  const casa = semWww(hostDoSite);
  let melhor: { email: string; nota: number } | null = null;
  for (const achado of [...(texto.match(ACHA_EMAIL) || []), ...escondidos]) {
    const email = cleanEmail(achado);
    if (!email || /\.(png|jpe?g|gif|webp|svg|css|js)$/i.test(email)) continue;
    const [caixa, dominio] = email.split("@");
    if (DOMINIO_DE_ENFEITE.test(dominio) || CAIXA_SEM_DONO.test(caixa)) continue;
    const daCasa = dominio === casa || casa.endsWith(`.${dominio}`) || dominio.endsWith(`.${casa}`);
    const link = emLink.has(email);
    const nota = daCasa ? (link ? 5 : 4) : PROVEDOR_COMUM.test(dominio) ? (link ? 3 : 2) : link ? 1 : 0;
    if (nota && (!melhor || nota > melhor.nota)) melhor = { email, nota };
  }
  return melhor;
}

export type BaixarPagina = (url: string) => Promise<{ html: string; url: string } | null>;

/** Baixa uma página pública: confere o destino a cada redirecionamento e limita tempo e tamanho. */
export const baixarPagina: BaixarPagina = async (inicio) => {
  let url = inicio;
  for (let salto = 0; salto < 4; salto++) {
    const segura = await assertSafeHttpUrl(url);
    const r = await axios.get(segura.toString(), {
      timeout: 6_000, signal: AbortSignal.timeout(8_000), maxRedirects: 0, maxContentLength: 2_000_000, responseType: "text", transformResponse: (x) => x,
      validateStatus: () => true, headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 (compatible; SPY-Radar/1.0)" }, ...ssrfSafeAgents,
    });
    if (r.status >= 300 && r.status < 400 && r.headers.location) { url = new URL(String(r.headers.location), segura).toString(); continue; }
    if (r.status !== 200 || !/html|text\/plain/i.test(String(r.headers["content-type"] || "text/html"))) return null;
    return { html: String(r.data || ""), url: segura.toString() };
  }
  return null;
};

/** Procura na página inicial e, se preciso, em até duas páginas de contato do mesmo site. "" quando não acha. */
export async function emailDoSite(site: string, baixar: BaixarPagina = baixarPagina): Promise<string> {
  let inicio: URL;
  try { inicio = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`); } catch { return ""; }
  if (!inicio.hostname.includes(".") || SEM_SITE_PROPRIO.test(inicio.hostname)) return "";
  const tentar = async (u: string) => { try { return await baixar(u); } catch { return null; } };
  const home = await tentar(inicio.toString());
  if (!home) return "";
  const host = new URL(home.url).hostname;
  if (SEM_SITE_PROPRIO.test(host)) return "";
  let achado = melhorEmail(home.html, host);
  if (!achado || achado.nota < 4) {
    const links = [...home.html.matchAll(/href\s*=\s*["']([^"'#]*(?:contato|contact|fale)[^"'#]*)["']/gi)]
      .map((m) => { try { return new URL(m[1], home.url); } catch { return null; } })
      .filter((u): u is URL => !!u && semWww(u.hostname) === semWww(host) && /^https?:$/.test(u.protocol))
      .map((u) => u.toString());
    const paginas = [...new Set(links.length ? links : [new URL("/contato", home.url).toString()])].slice(0, 2);
    for (const p of paginas) {
      const pg = await tentar(p);
      const outro = pg && melhorEmail(pg.html, host);
      if (outro && (!achado || outro.nota > achado.nota)) achado = outro;
      if (achado && achado.nota >= 4) break;
    }
  }
  return achado?.email ?? "";
}

const MAX_SITES = 20;
const PRAZO_MS = 40_000;

interface Deps { requireUser: any; resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>; limiter: any; supabaseService: any; baixar?: BaixarPagina }

export function registerRadarEmailRoutes(app: Express, { requireUser, resolveRequestedTenantId, limiter, supabaseService, baixar }: Deps) {
  app.post("/api/radar/emails", requireUser, limiter, async (req: any, res: any) => {
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    const sites: string[] = Array.isArray(req.body?.sites) ? [...new Set<string>(req.body.sites.map((s: unknown) => String(s ?? "").trim().slice(0, 300)).filter(Boolean))].slice(0, MAX_SITES) : [];
    if (!sites.length) return res.status(400).json({ error: "Informe os sites." });
    const inicio = Date.now();
    const emails: Record<string, string> = {};
    const fila = [...sites];
    const worker = async () => {
      for (let s = fila.shift(); s; s = fila.shift()) {
        if (Date.now() - inicio > PRAZO_MS) break;
        emails[s] = await emailDoSite(s, baixar);
      }
    };
    await Promise.all(Array.from({ length: 5 }, worker));
    res.json({ emails });
  });

  // Empresas que a busca por CNAE do Radar já guardou: as com e-mail (campanha) ou todas (?todas=1, tela do Radar).
  app.get("/api/radar/empresas-salvas", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return res.status(503).json({ error: "Servidor sem acesso ao banco." });
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    const todas = req.query?.todas === "1";
    let consulta = supabaseService.from("radar_empresas_frias").select("id, cnpj, razao_social, nome_fantasia, email, telefones, endereco, municipio, uf, cnae_descricao, created_at").eq("tenant_id", tenantId);
    if (!todas) consulta = consulta.not("email", "is", null).neq("email", "");
    const { data, error } = await consulta.order("created_at", { ascending: false }).limit(500);
    if (error) return res.status(500).json({ error: "Não foi possível ler as empresas salvas do Radar." });
    res.json({
      empresas: (data || []).map((e: any) => {
        const empresa = String(e.nome_fantasia || e.razao_social || ""), email = cleanEmail(e.email);
        const cidade = [e.municipio, e.uf].filter(Boolean).join("/");
        const base = { empresa, email, detalhe: [cidade, e.cnae_descricao].filter(Boolean).join(" · ") };
        return todas ? { ...base, cnpj: String(e.cnpj || ""), razaoSocial: String(e.razao_social || ""), endereco: [e.endereco, cidade].filter(Boolean).join(" · "), contato: String(e.telefones?.[0] || ""), avaliacao: "", site: "", whatsapp: "" } : base;
      }).filter((e: any) => todas || e.email),
    });
  });
}
