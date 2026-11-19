/**
 * Gasto real do Meta Ads (Facebook/Instagram) para a tela de Campanhas: lê o Gerenciador de Anúncios da própria empresa
 * com o token de leitura (ads_read) que ela cadastrou em Integrações. Nada é gravado; resposta guardada por 10 minutos.
 * (Google Ads exige credenciais de desenvolvedor e OAuth próprios e não é lido por aqui.)
 */
import type { Express } from "express";

const GRAPH = "https://graph.facebook.com/v19.0";
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
}
