import type { Express } from "express";

// Métricas de aquisição por empresa (genérico, qualquer tenant): investimento em mídia, leads, MQL, vendas e os custos
// derivados — CPL (por lead), CPLQ (por lead qualificado/MQL), CAC (por venda) e ROAS. A agregação pesada roda no banco
// (marketing_aquisicao); aqui só junta o investimento e calcula as razões. Divisão por zero vira null (nunca 0 enganoso).

export interface OrigemRow { origem: string; leads: number; mql: number; vendas: number; receita: number }
export interface SpendRow { source: string; amount: number }

const strip = (s: string) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const ratio = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) / 100 : null);
/** Custo por unidade: sem investimento lançado não existe custo (null), em vez de um "R$ 0" enganoso. */
const cost = (inv: number, n: number): number | null => (inv > 0 ? ratio(inv, n) : null);

export function buildAcquisition(rows: OrigemRow[], manual: SpendRow[], financeFallback: number) {
  const manualTotal = manual.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const investimento = manualTotal > 0 ? manualTotal : financeFallback;
  const fonteInvestimento: "manual" | "financeiro" | "nenhum" = manualTotal > 0 ? "manual" : financeFallback > 0 ? "financeiro" : "nenhum";

  const spendBySource = new Map<string, number>();
  for (const m of manual) if (m.source?.trim()) spendBySource.set(strip(m.source), (spendBySource.get(strip(m.source)) || 0) + (Number(m.amount) || 0));

  const used = new Set<string>();
  const porOrigem = rows.map((r) => {
    const key = strip(r.origem);
    const inv = spendBySource.get(key) ?? 0;
    if (spendBySource.has(key)) used.add(key);
    return { ...r, investimento: inv, cpl: cost(inv, r.leads), cplq: cost(inv, r.mql), cac: cost(inv, r.vendas), roas: ratio(r.receita, inv) };
  });
  // Investimento lançado numa origem que não teve lead/venda no período também aparece (custo sem retorno).
  for (const [key, inv] of spendBySource) {
    if (used.has(key)) continue;
    const nome = manual.find((m) => strip(m.source) === key)?.source ?? key;
    porOrigem.push({ origem: nome, leads: 0, mql: 0, vendas: 0, receita: 0, investimento: inv, cpl: null, cplq: null, cac: null, roas: null });
  }

  const leads = rows.reduce((s, r) => s + r.leads, 0);
  const mql = rows.reduce((s, r) => s + r.mql, 0);
  const vendas = rows.reduce((s, r) => s + r.vendas, 0);
  const receita = rows.reduce((s, r) => s + r.receita, 0);
  return {
    totais: { investimento, fonteInvestimento, leads, mql, vendas, receita, cpl: cost(investimento, leads), cplq: cost(investimento, mql), cac: cost(investimento, vendas), roas: ratio(receita, investimento), ticket: ratio(receita, vendas), taxaMql: ratio(mql * 100, leads) },
    porOrigem,
  };
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const firstOfMonth = (d: string) => `${d.slice(0, 7)}-01`;

interface Deps { requireUserOrInternalService: any; resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>; limiter: any }

export function registerAcquisitionRoutes(app: Express, { requireUserOrInternalService, resolveRequestedTenantId, limiter }: Deps) {
  app.get("/api/marketing/aquisicao", requireUserOrInternalService, limiter, async (req: any, res: any) => {
    const from = String(req.query.from || ""), to = String(req.query.to || "");
    const minScore = Math.min(100, Math.max(0, parseInt(String(req.query.minScore ?? "60"), 10) || 60));
    if (!DATE.test(from) || !DATE.test(to) || from > to) return res.status(400).json({ error: "Período inválido." });
    if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 800) return res.status(400).json({ error: "Período muito longo (máximo ~2 anos)." });
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    try {
      const sb = req.supabase;
      const [{ data: agg, error: e1 }, { data: spend, error: e2 }] = await Promise.all([
        sb.rpc("marketing_aquisicao", { p_tenant: tenantId, p_from: from, p_to: to, p_min_score: minScore }),
        sb.from("marketing_spend").select("source, amount").eq("tenant_id", tenantId).gte("month", firstOfMonth(from)).lte("month", to).limit(5000),
      ]);
      if (e1) throw new Error(e1.message);
      if (e2) throw new Error(e2.message);

      // Sem lançamento manual: usa o Financeiro (despesas pagas em categorias de marketing/anúncios/tráfego).
      let financeFallback = 0;
      if (!(spend || []).some((s: any) => Number(s.amount) > 0)) {
        const { data: fin } = await sb.from("finance_entries").select("value")
          .eq("tenant_id", tenantId).eq("type", "Pagar").eq("status", "Pago").gte("date_normalized", from).lte("date_normalized", to)
          .or("category.ilike.%marketing%,category.ilike.%anúncio%,category.ilike.%anuncio%,category.ilike.%tráfego%,category.ilike.%trafego%").limit(5000);
        financeFallback = (fin || []).reduce((s: number, f: any) => s + (Number(f.value) || 0), 0);
      }
      const out = buildAcquisition((agg?.porOrigem || []) as OrigemRow[], (spend || []) as SpendRow[], financeFallback);
      res.json({ from, to, minScore, vendasSemData: Number(agg?.vendasSemData || 0), ...out });
    } catch (e: any) {
      console.error("[marketing/aquisicao]", e?.message);
      res.status(500).json({ error: "Não foi possível calcular as métricas de aquisição." });
    }
  });
}
