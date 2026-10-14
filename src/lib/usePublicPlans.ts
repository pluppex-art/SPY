import { useEffect, useState } from "react";
import { PLANS, TOKEN_TIERS, type PlanData } from "../pages/landing/plansData";

type ApiPlan = {
  code: string; name: string; priceCents: number; billingInterval?: string; setupPriceCents?: number; tagline?: string;
  badge?: string | null; featuresHeader?: string; features?: string[]; ctaText?: string; highlight?: boolean; sortOrder?: number;
};
type ApiTier = { credits: number; priceCents: number; sortOrder?: number };
export type PublicPlansPayload = { plans?: ApiPlan[]; creditTiers?: ApiTier[] };
export type TokenTier = { credits: string; price: string };
export type PublicPlans = { plans: PlanData[]; tokenTiers: TokenTier[] };

const nf = (n: number, frac = 0) => n.toLocaleString("pt-BR", { minimumFractionDigits: frac, maximumFractionDigits: frac });
/** centavos -> "1.997" (ou "1.997,50" quando há centavos). */
const money = (cents: number) => nf(cents / 100, cents % 100 ? 2 : 0);

export const DEFAULT_PUBLIC_PLANS: PublicPlans = { plans: PLANS, tokenTiers: TOKEN_TIERS };

/** Converte a resposta da API nos formatos de exibição das páginas. Vazio/inválido -> padrões estáticos. */
export function mapPublicPlans(payload: PublicPlansPayload | null | undefined): PublicPlans {
  const plans: PlanData[] = (Array.isArray(payload?.plans) ? payload!.plans! : [])
    .filter((p) => p && p.code && p.name && Number.isFinite(p.priceCents))
    .map((p) => ({
      id: String(p.code).toLowerCase(),
      name: p.name,
      badgeTop: p.badge ? `★ ${String(p.badge).replace(/^★\s*/, "")}` : undefined,
      tagline: p.tagline ?? "",
      monthlyPrice: money(p.priceCents),
      setupPrice: p.setupPriceCents ? `R$ ${money(p.setupPriceCents)}` : "",
      featuresHeader: p.featuresHeader ?? "",
      features: Array.isArray(p.features) ? p.features.map(String) : [],
      ctaText: p.ctaText || "Começar Agora",
      highlight: !!p.highlight,
    }));
  const tokenTiers: TokenTier[] = (Array.isArray(payload?.creditTiers) ? payload!.creditTiers! : [])
    .filter((t) => t && t.credits > 0 && Number.isFinite(t.priceCents))
    .map((t) => ({ credits: `${nf(t.credits)} créditos`, price: `R$ ${money(t.priceCents)}` }));
  return {
    plans: plans.length ? plans : PLANS,
    tokenTiers: tokenTiers.length ? tokenTiers : TOKEN_TIERS,
  };
}

let cache: PublicPlans | null = null;
let inflight: Promise<PublicPlans> | null = null;

function load(): Promise<PublicPlans> {
  if (!inflight) {
    inflight = fetch("/api/billing/public-plans", { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => (cache = mapPublicPlans(j)))
      .catch(() => DEFAULT_PUBLIC_PLANS)
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** Planos/créditos da vitrine: renderiza os padrões na hora e troca quando a API responder. Nunca fica vazio. */
export function usePublicPlans(): PublicPlans {
  const [data, setData] = useState<PublicPlans>(cache ?? DEFAULT_PUBLIC_PLANS);
  useEffect(() => {
    let alive = true;
    void load().then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, []);
  return data;
}
