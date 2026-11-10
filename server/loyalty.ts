import type { Express } from "express";

// Fidelidade do cliente (Bronze/Prata/Ouro...) por empresa: o nível vem do NÚMERO DE COMPRAS na janela escolhida
// (mês atual, 12 meses ou todo o histórico). Faixas, janela e fonte das compras são configuráveis em
// Configurações › CRM › Fidelidade (app_settings "fidelidade_config"); sem configuração vale o padrão abaixo.

export interface Nivel { nome: string; min: number; cor: string }
export interface LoyaltyCfg { enabled: boolean; janela: "mes" | "12m" | "total"; fonte: "vendas" | "financeiro"; niveis: Nivel[] }

export const DEFAULT_LOYALTY: LoyaltyCfg = {
  enabled: true, janela: "mes", fonte: "vendas",
  niveis: [{ nome: "Bronze", min: 1, cor: "#b45309" }, { nome: "Prata", min: 3, cor: "#64748b" }, { nome: "Ouro", min: 6, cor: "#ca8a04" }],
};

const HEX = /^#[0-9a-fA-F]{6}$/;

/** Config salva (qualquer coisa) -> config válida. Faixas ordenadas, sem repetir mínimo, no máximo 6. */
export function normalizeLoyaltyCfg(raw: any): LoyaltyCfg {
  const r = raw && typeof raw === "object" ? raw : {};
  const niveis: Nivel[] = (Array.isArray(r.niveis) ? r.niveis : [])
    .map((n: any) => ({ nome: String(n?.nome ?? "").trim().slice(0, 30), min: Math.floor(Number(n?.min)), cor: HEX.test(String(n?.cor)) ? String(n.cor) : "#64748b" }))
    .filter((n: Nivel) => n.nome && Number.isFinite(n.min) && n.min >= 1 && n.min <= 100000)
    .sort((a: Nivel, b: Nivel) => a.min - b.min)
    .filter((n: Nivel, i: number, arr: Nivel[]) => i === 0 || n.min !== arr[i - 1].min)
    .slice(0, 6);
  return {
    enabled: r.enabled !== false,
    janela: r.janela === "12m" || r.janela === "total" ? r.janela : "mes",
    fonte: r.fonte === "financeiro" ? "financeiro" : "vendas",
    niveis: niveis.length ? niveis : DEFAULT_LOYALTY.niveis,
  };
}

/** Maior faixa cujo mínimo de compras foi atingido (ou null). */
export function nivelDe(compras: number, niveis: Nivel[]): Nivel | null {
  let atual: Nivel | null = null;
  for (const n of niveis) if (compras >= n.min) atual = n;
  return atual;
}

export function computeLoyalty(compras: Record<string, { c: number; v: number }>, cfg: LoyaltyCfg) {
  const porCliente: Record<string, { nivel: string; cor: string; compras: number; valor: number }> = {};
  const contagem = new Map<string, number>();
  for (const [id, x] of Object.entries(compras || {})) {
    const n = nivelDe(Number(x?.c) || 0, cfg.niveis);
    if (!n) continue;
    porCliente[id] = { nivel: n.nome, cor: n.cor, compras: Number(x.c) || 0, valor: Number(x.v) || 0 };
    contagem.set(n.nome, (contagem.get(n.nome) || 0) + 1);
  }
  const resumo = [...cfg.niveis].reverse().map((n) => ({ nome: n.nome, cor: n.cor, min: n.min, clientes: contagem.get(n.nome) || 0 }));
  return { porCliente, resumo };
}

interface Deps { requireUser: any; resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>; limiter: any }

export function registerLoyaltyRoutes(app: Express, { requireUser, resolveRequestedTenantId, limiter }: Deps) {
  app.get("/api/crm/fidelidade", requireUser, limiter, async (req: any, res: any) => {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    try {
      const sb = req.supabase;
      const { data: setting } = await sb.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "fidelidade_config").maybeSingle();
      const cfg = normalizeLoyaltyCfg(setting?.value);
      if (!cfg.enabled) return res.json({ config: cfg, porCliente: {}, resumo: [] });
      const { data, error } = await sb.rpc("crm_fidelidade_compras", { p_tenant: tenantId, p_janela: cfg.janela, p_fonte: cfg.fonte });
      if (error) throw new Error(error.message);
      res.json({ config: cfg, ...computeLoyalty(data || {}, cfg) });
    } catch (e: any) {
      console.error("[crm/fidelidade]", e?.message);
      res.status(500).json({ error: "Não foi possível calcular a fidelidade." });
    }
  });
}
