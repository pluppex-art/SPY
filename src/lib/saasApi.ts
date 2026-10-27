import { apiFetch } from "./apiClient";

export type Plan = {
  id: string; code: string; name: string; price_cents: number; billing_interval: "monthly" | "yearly";
  trial_days: number; limits: Record<string, any>; features: string[]; active: boolean;
  tagline?: string; setup_price_cents?: number; badge?: string | null; features_header?: string; cta_text?: string;
  highlight?: boolean; show_on_site?: boolean; sort_order?: number;
};
export type CreditTier = { id: string; credits: number; price_cents: number; sort_order: number; active: boolean };
export type Subscription = {
  id: string; tenant_id: string; plan_id: string | null; status: "trial" | "active" | "past_due" | "suspended" | "canceled";
  trial_ends_at: string | null; current_period_end: string | null; grace_days: number; gateway: string | null;
  gateway_subscription_id: string | null; last_payment_at: string | null; suspended_at: string | null; notes: string | null;
  plan?: Plan | null;
};
export type BillingStatus = {
  tenantId: string; subscription: Subscription | null; usage?: Record<string, { used: number; limit: number }>; effectiveStatus: Subscription["status"] | "none"; blocked: boolean;
  ai: { used: number; limit: number | null; warnPct: number; hardStop: boolean };
};

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || `Erro ${res.status}`);
  return body as T;
}
const send = (method: string, url: string, body?: unknown) =>
  apiFetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
const tq = (tenantId?: string) => (tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : "");

export const saasApi = {
  plans: () => apiFetch("/api/billing/plans").then(json<Plan[]>),
  status: (tenantId?: string) => apiFetch(`/api/billing/status${tq(tenantId)}`).then(json<BillingStatus>),
  savePlan: (plan: Record<string, any>) => send("POST", "/api/billing/plans", plan).then(json<Plan>),
  creditTiers: () => apiFetch("/api/billing/credit-tiers").then(json<CreditTier[]>),
  saveCreditTier: (t: Record<string, any>) => send("POST", "/api/billing/credit-tiers", t).then(json<CreditTier>),
  deleteCreditTier: (id: string) => send("DELETE", `/api/billing/credit-tiers/${encodeURIComponent(id)}`).then(json<{ ok: boolean }>),
  saveSubscription: (tenantId: string, body: Record<string, any>) => send("PUT", `/api/billing/subscriptions/${tenantId}`, body).then(json<Subscription>),
  markPaid: (tenantId: string) => send("POST", `/api/billing/subscriptions/${tenantId}/mark-paid`).then(json<Subscription>),
  createAsaas: (tenantId: string, body: Record<string, any>) => send("POST", `/api/billing/subscriptions/${tenantId}/asaas`, body).then(json<{ subscriptionId: string }>),
  tick: () => send("POST", "/api/billing/tick").then(json<{ changed: number }>),
  saveAiBudget: (tenantId: string, body: Record<string, any>) => send("PUT", `/api/billing/ai-budget/${tenantId}`, body).then(json<any>),

  lgpdSearch: (q: string, tenantId?: string) =>
    apiFetch(`/api/lgpd/search?q=${encodeURIComponent(q)}${tenantId ? `&tenantId=${encodeURIComponent(tenantId)}` : ""}`).then(json<Array<{ type: "lead" | "cliente"; id: string; name: string; email: string | null; phone: string | null; extra: string | null }>>),
  lgpdExport: async (type: string, id: string, tenantId?: string) => {
    const res = await apiFetch(`/api/lgpd/export/${type}/${encodeURIComponent(id)}${tq(tenantId)}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Erro ${res.status}`);
    return res.blob();
  },
  lgpdAnonymize: (type: string, id: string, tenantId?: string) => send("POST", `/api/lgpd/anonymize/${type}/${encodeURIComponent(id)}${tq(tenantId)}`, { confirm: true }).then(json<{ ok: boolean }>),
  lgpdConsent: (body: Record<string, any>, tenantId?: string) => send("POST", `/api/lgpd/consent${tq(tenantId)}`, body).then(json<{ ok: boolean }>),
  lgpdRequests: (tenantId?: string) => apiFetch(`/api/lgpd/requests${tq(tenantId)}`).then(json<Array<{ id: string; kind: string; subject_type: string; subject_id: string; status: string; details: any; created_at: string }>>),
};

export const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");
export const STATUS_LABEL: Record<string, string> = { trial: "Em teste", active: "Ativa", past_due: "Em atraso", suspended: "Suspensa", canceled: "Cancelada", none: "Sem assinatura" };

/** "1.997,50" / "1997.5" / "997" -> centavos (NaN-safe, nunca negativo). */
export function parseMoneyToCents(input: string): number {
  let s = String(input ?? "").replace(/[^\d.,]/g, "");
  if (!s) return 0;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Math.round(parseFloat(s) * 100);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
/** centavos -> "1.997,50" (sem R$), para preencher inputs. */
export const centsToInput = (c: number) => (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
