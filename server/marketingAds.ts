/**
 * Gasto real do Meta Ads (Facebook/Instagram) para a tela de Campanhas: lê o Gerenciador de Anúncios da própria empresa
 * com o token de leitura (ads_read) que ela cadastrou em Integrações. Nada é gravado; resposta guardada por 10 minutos.
 * (Google Ads exige credenciais de desenvolvedor e OAuth próprios e não é lido por aqui.)
 */
import type { Express } from "express";

const GRAPH = "https://graph.facebook.com/v22.0";
const CACHE_MS = 10 * 60_000;
const cache = new Map<string, { em: number; dados: unknown }>();

export interface InsightsDia { data: string; gasto: number; impressoes: number; cliques: number }

/** Resposta do Graph (insights diários) → totais e série por dia. Linhas inválidas são ignoradas. */
export function resumirInsights(linhas: any[]): { gasto: number; impressoes: number; cliques: number; cpc: number; ctr: number; porDia: InsightsDia[] } {
  const porDia: InsightsDia[] = [];
  for (const l of linhas || []) {
    const data = String(l?.date_start ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) continue;
    porDia.push({ data, gasto: Math.round((Number(l.spend) || 0) * 100) / 100, impressoes: Math.round(Number(l.impressions) || 0), cliques: Math.round(Number(l.clicks) || 0) });
  }
  porDia.sort((a, b) => a.data.localeCompare(b.data));
  const gasto = Math.round(porDia.reduce((s, d) => s + d.gasto, 0) * 100) / 100;
  const impressoes = porDia.reduce((s, d) => s + d.impressoes, 0);
  const cliques = porDia.reduce((s, d) => s + d.cliques, 0);
  return { gasto, impressoes, cliques, cpc: cliques > 0 ? Math.round((gasto / cliques) * 100) / 100 : 0, ctr: impressoes > 0 ? Math.round((cliques / impressoes) * 10000) / 100 : 0, porDia };
}

// ---- Lista de campanhas (como no Gerenciador de Anúncios) ----

export interface CampanhaMeta {
  id: string; nome: string; status: string; statusRotulo: string; objetivo: string; objetivoRotulo: string;
  orcamento: { tipo: "diario" | "total" | null; valor: number };
  gasto: number; impressoes: number; alcance: number; cliques: number; ctr: number; cpc: number; cpm: number;
  resultados: number; resultadoRotulo: string; custoPorResultado: number;
  inicio: string | null; fim: string | null;
}

const STATUS_ROTULO: Record<string, string> = {
  ACTIVE: "Ativa", PAUSED: "Pausada", CAMPAIGN_PAUSED: "Pausada", ADSET_PAUSED: "Conjunto pausado", ARCHIVED: "Arquivada", DELETED: "Excluída",
  IN_PROCESS: "Em processamento", WITH_ISSUES: "Com problemas", PENDING_REVIEW: "Em análise", DISAPPROVED: "Reprovada", PENDING_BILLING_INFO: "Pagamento pendente",
};
const OBJETIVO_ROTULO: Record<string, string> = {
  OUTCOME_LEADS: "Cadastros (leads)", OUTCOME_SALES: "Vendas", OUTCOME_TRAFFIC: "Tráfego", OUTCOME_ENGAGEMENT: "Engajamento", OUTCOME_AWARENESS: "Reconhecimento", OUTCOME_APP_PROMOTION: "Promoção de app",
  LEAD_GENERATION: "Geração de cadastros", CONVERSIONS: "Conversões", LINK_CLICKS: "Cliques no link", MESSAGES: "Mensagens", POST_ENGAGEMENT: "Engajamento", REACH: "Alcance", BRAND_AWARENESS: "Reconhecimento de marca", VIDEO_VIEWS: "Visualizações de vídeo", PRODUCT_CATALOG_SALES: "Vendas do catálogo", STORE_VISITS: "Visitas à loja",
};
const SEM_CENTAVOS = new Set(["JPY", "KRW", "CLP", "VND", "ISK", "HUF", "UGX", "PYG"]);

const soma = (acoes: any[] | undefined, tipos: string[]) => (acoes || []).filter((a) => tipos.includes(String(a?.action_type))).reduce((t, a) => t + (Number(a?.value) || 0), 0);
const maior = (acoes: any[] | undefined, tipos: string[]) => Math.max(0, ...(acoes || []).filter((a) => tipos.includes(String(a?.action_type))).map((a) => Number(a?.value) || 0));

/** "Resultado" da campanha conforme o objetivo (o Gerenciador mostra o evento que o objetivo otimiza). */
export function resultadoDaCampanha(objetivo: string, acoes: any[] | undefined, alcance: number): { valor: number; rotulo: string } {
  const LEADS = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];
  const COMPRAS = ["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"];
  const MENSAGENS = ["onsite_conversion.messaging_conversation_started_7d"];
  const o = String(objetivo || "");
  // Um mesmo cadastro pode aparecer em mais de um tipo de ação: usa o maior em vez de somar para não contar em dobro.
  const leads = maior(acoes, LEADS), compras = maior(acoes, COMPRAS), msgs = maior(acoes, MENSAGENS), cliquesLink = soma(acoes, ["link_click"]);
  if (/LEAD/.test(o)) return { valor: leads || msgs, rotulo: leads || !msgs ? "Cadastros" : "Conversas iniciadas" };
  if (/SALES|CONVERSIONS|CATALOG/.test(o)) return compras ? { valor: compras, rotulo: "Compras" } : { valor: leads, rotulo: "Cadastros" };
  if (/MESSAGES/.test(o)) return { valor: msgs, rotulo: "Conversas iniciadas" };
  if (/TRAFFIC|LINK_CLICKS/.test(o)) return { valor: cliquesLink, rotulo: "Cliques no link" };
  if (/AWARENESS|REACH/.test(o)) return { valor: alcance, rotulo: "Alcance" };
  if (/ENGAGEMENT/.test(o)) return msgs ? { valor: msgs, rotulo: "Conversas iniciadas" } : { valor: maior(acoes, ["post_engagement"]), rotulo: "Engajamentos" };
  return leads ? { valor: leads, rotulo: "Cadastros" } : { valor: cliquesLink, rotulo: "Cliques no link" };
}

const dinheiro = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
const dataISO = (v: unknown) => { const t = String(v ?? "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null; };

/** Junta a lista de campanhas (status, orçamento) com os números do período. Campanhas sem veiculação no período aparecem com zeros. */
export function mesclarCampanhas(campanhas: any[], insights: any[], moeda = "BRL"): CampanhaMeta[] {
  const porId = new Map<string, any>();
  for (const i of insights || []) if (i?.campaign_id) porId.set(String(i.campaign_id), i);
  const divisor = SEM_CENTAVOS.has(moeda) ? 1 : 100;
  const vistos = new Set<string>();
  const lista: CampanhaMeta[] = [];
  const montar = (c: any, i: any) => {
    const objetivo = String(c?.objective ?? "");
    const alcance = Math.round(Number(i?.reach) || 0);
    const res = resultadoDaCampanha(objetivo, i?.actions, alcance);
    const gasto = dinheiro(i?.spend);
    const diario = Number(c?.daily_budget) || 0, total = Number(c?.lifetime_budget) || 0;
    const status = String(c?.effective_status ?? c?.status ?? "");
    lista.push({
      id: String(c?.id ?? i?.campaign_id ?? ""), nome: String(c?.name ?? i?.campaign_name ?? "(sem nome)").slice(0, 200),
      status, statusRotulo: STATUS_ROTULO[status] ?? (status ? status.replace(/_/g, " ").toLowerCase() : "—"),
      objetivo, objetivoRotulo: OBJETIVO_ROTULO[objetivo] ?? (objetivo ? objetivo.replace(/^OUTCOME_/, "").replace(/_/g, " ").toLowerCase() : "—"),
      orcamento: diario > 0 ? { tipo: "diario", valor: dinheiro(diario / divisor) } : total > 0 ? { tipo: "total", valor: dinheiro(total / divisor) } : { tipo: null, valor: 0 },
      gasto, impressoes: Math.round(Number(i?.impressions) || 0), alcance, cliques: Math.round(Number(i?.clicks) || 0),
      ctr: dinheiro(i?.ctr), cpc: dinheiro(i?.cpc), cpm: dinheiro(i?.cpm),
      resultados: Math.round(res.valor), resultadoRotulo: res.rotulo, custoPorResultado: res.valor > 0 ? dinheiro(gasto / res.valor) : 0,
      inicio: dataISO(c?.start_time), fim: dataISO(c?.stop_time),
    });
  };
  for (const c of campanhas || []) { if (!c?.id || vistos.has(String(c.id))) continue; vistos.add(String(c.id)); montar(c, porId.get(String(c.id))); }
  for (const [id, i] of porId) if (!vistos.has(id)) montar({ id, name: i.campaign_name }, i); // campanha apagada que ainda tem histórico no período
  return lista.sort((a, b) => b.gasto - a.gasto || a.nome.localeCompare(b.nome, "pt-BR"));
}

/** Segue as páginas do Graph (até `max`), só para o próprio endereço do Graph (o token nunca vai para outro host). */
async function lerPaginas(urlInicial: string, token: string, max = 5): Promise<{ dados: any[]; erro?: string }> {
  const dados: any[] = []; let url: string | null = urlInicial;
  for (let i = 0; i < max && url; i++) {
    if (new URL(url).hostname !== "graph.facebook.com") break;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) return { dados, erro: String(j?.error?.message || "erro") };
    dados.push(...(j?.data || []));
    url = j?.paging?.next ? String(j.paging.next) : null;
  }
  return { dados };
}

interface Deps { requireUser: any; resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>; supabaseService: any }

export function registerMarketingAdsRoutes(app: Express, { requireUser, resolveRequestedTenantId, supabaseService }: Deps) {
  app.get("/api/marketing/meta-gasto", requireUser, async (req: any, res: any) => {
    if (!supabaseService) return res.status(503).json({ error: "Servidor sem acesso ao banco." });
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    const dias = Math.min(90, Math.max(1, Number(req.query.dias) || 30));
    try {
      const { data: s } = await supabaseService.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "integracoes_meta_ads").maybeSingle();
      const conta = String(s?.value?.accountId ?? "").replace(/\D/g, "");
      const token = String(s?.value?.adsToken ?? "").trim();
      if (!conta || !token) return res.json({ configurado: false });
      const chave = `${tenantId}:${dias}`;
      const c = cache.get(chave);
      if (c && Date.now() - c.em < CACHE_MS) return res.json(c.dados);

      const ate = new Date(); const de = new Date(Date.now() - (dias - 1) * 86400_000);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const url = `${GRAPH}/act_${conta}/insights?fields=spend,impressions,clicks&time_increment=1&limit=100&time_range=${encodeURIComponent(JSON.stringify({ since: iso(de), until: iso(ate) }))}`;
      const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
      const j: any = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = String(j?.error?.message || "");
        return res.status(502).json({ configurado: true, error: /token|session|expired|permission|OAuth/i.test(msg) ? "O token do Meta Ads expirou ou não tem permissão de leitura (ads_read). Gere outro em Integrações." : "O Meta não respondeu agora. Tente de novo em instantes." });
      }
      const dados = { configurado: true, dias, ...resumirInsights(j?.data || []), atualizadoEm: new Date().toISOString() };
      cache.set(chave, { em: Date.now(), dados });
      res.json(dados);
    } catch (e: any) {
      console.error("[meta-gasto]", e?.message);
      res.status(502).json({ configurado: true, error: "Não foi possível consultar o Meta Ads agora." });
    }
  });

  /** Lista de campanhas do Meta Ads (como no Gerenciador de Anúncios), com os números do período. Só leitura; guarda 10 minutos. */
  app.get("/api/marketing/meta-campanhas", requireUser, async (req: any, res: any) => {
    if (!supabaseService) return res.status(503).json({ error: "Servidor sem acesso ao banco." });
    const tenantId = await resolveRequestedTenantId(req, res); if (!tenantId) return;
    const dias = [7, 14, 30, 90].includes(Number(req.query.dias)) ? Number(req.query.dias) : 30;
    try {
      const { data: s } = await supabaseService.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "integracoes_meta_ads").maybeSingle();
      const conta = String(s?.value?.accountId ?? "").replace(/\D/g, "");
      const token = String(s?.value?.adsToken ?? "").trim();
      if (!conta || !token) return res.json({ configurado: false });
      const chave = `camp:${tenantId}:${dias}`;
      const c = cache.get(chave);
      if (c && req.query.atualizar !== "1" && Date.now() - c.em < CACHE_MS) return res.json(c.dados);

      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const faixa = encodeURIComponent(JSON.stringify({ since: iso(new Date(Date.now() - (dias - 1) * 86400_000)), until: iso(new Date()) }));
      const [camps, ins, conf] = await Promise.all([
        lerPaginas(`${GRAPH}/act_${conta}/campaigns?fields=id,name,status,effective_status,objective,daily_budget,lifetime_budget,start_time,stop_time&limit=100`, token),
        lerPaginas(`${GRAPH}/act_${conta}/insights?level=campaign&fields=campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions&time_range=${faixa}&limit=100`, token),
        fetch(`${GRAPH}/act_${conta}?fields=currency,name`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) }).then((r) => r.json()).catch(() => ({})) as Promise<any>,
      ]);
      const erro = camps.erro || ins.erro;
      if (erro && !camps.dados.length && !ins.dados.length) {
        return res.status(502).json({ configurado: true, error: /token|session|expired|permission|OAuth/i.test(erro) ? "O token do Meta Ads expirou ou não tem permissão de leitura (ads_read). Gere outro em Integrações." : "O Meta não respondeu agora. Tente de novo em instantes." });
      }
      const moeda = String(conf?.currency || "BRL").toUpperCase();
      const dados = { configurado: true, dias, moeda, conta: String(conf?.name || ""), campanhas: mesclarCampanhas(camps.dados, ins.dados, moeda), parcial: !!erro, atualizadoEm: new Date().toISOString() };
      cache.set(chave, { em: Date.now(), dados });
      res.json(dados);
    } catch (e: any) {
      console.error("[meta-campanhas]", e?.message);
      res.status(502).json({ configurado: true, error: "Não foi possível consultar o Meta Ads agora." });
    }
  });
}
