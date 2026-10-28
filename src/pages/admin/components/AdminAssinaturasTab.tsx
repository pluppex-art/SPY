import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, CheckCircle2, Play, Trash2, X } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { supabase, PLUPPEX_TENANT_ID } from "../../../lib/supabase";
import { MODULES } from "./NovoTenantModal";
import { saasApi, brl, fmtDate, STATUS_LABEL, parseMoneyToCents, centsToInput, type Plan, type Subscription, type CreditTier } from "../../../lib/saasApi";
import { invalidateBillingStatus } from "../../../hooks/useBillingStatus";

type TenantRow = { id: string; name: string };
type BudgetRow = { tenant_id: string; monthly_token_limit: number | null; warn_pct: number; hard_stop: boolean };

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "info" | "neutral"> = {
  active: "success", trial: "info", past_due: "warning", suspended: "destructive", canceled: "destructive",
};
const inputCls = "w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface)] px-3 py-2 text-sm";
const EMPTY_PLAN = { id: "", code: "", name: "", price: "", interval: "monthly", trialDays: "14", users: "", leads: "", features: "", tagline: "", setup: "", badge: "", featuresHeader: "", ctaText: "", highlight: false, showOnSite: false, sortOrder: "0", active: true, productId: "", modules: {} as Record<string, boolean>, aiTokens: "" };
const EMPTY_TIER = { id: "", credits: "", price: "", sortOrder: "0", active: true, productId: "" };
type ProductRow = { id: string; name: string; price: number; is_recurring: boolean | null; active: boolean | null };
const toLocalDate = (iso?: string | null) => (iso ? iso.slice(0, 10) : "");

export function AdminAssinaturasTab() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [subs, setSubs] = useState<Record<string, Subscription>>({});
  const [budgets, setBudgets] = useState<Record<string, BudgetRow>>({});
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<"planos" | "assinaturas">("planos");
  const [products, setProducts] = useState<ProductRow[]>([]);

  // formulário de plano
  const [planForm, setPlanForm] = useState(EMPTY_PLAN);
  const [tiers, setTiers] = useState<CreditTier[]>([]);
  const [tierForm, setTierForm] = useState(EMPTY_TIER);
  // formulário de assinatura do tenant selecionado
  const [subForm, setSubForm] = useState({ planId: "", status: "trial", trialEnd: "", periodEnd: "", graceDays: "7", notes: "" });
  const [budgetForm, setBudgetForm] = useState({ limit: "", warnPct: "80", hardStop: true });
  const [asaasForm, setAsaasForm] = useState({ name: "", cpfCnpj: "", email: "", billingType: "UNDEFINED" });

  const load = useCallback(async () => {
    if (!supabase) return;
    const [p, t, s, b, ct, pr] = await Promise.all([
      saasApi.plans().catch(() => [] as Plan[]),
      supabase.from("tenants").select("id, name").is("deleted_at", null).order("name"),
      supabase.from("tenant_subscriptions").select("*"),
      supabase.from("tenant_ai_budget").select("*"),
      saasApi.creditTiers().catch(() => [] as CreditTier[]),
      supabase.from("products").select("id, name, price, is_recurring, active").eq("tenant_id", PLUPPEX_TENANT_ID).is("deleted_at", null).order("name"),
    ]);
    setProducts(((pr as any).data as ProductRow[]) || []);
    setPlans(p);
    setTiers(ct);
    setTenants((t.data as TenantRow[]) || []);
    setSubs(Object.fromEntries(((s.data as Subscription[]) || []).map((x) => [x.tenant_id, x])));
    setBudgets(Object.fromEntries(((b.data as BudgetRow[]) || []).map((x) => [x.tenant_id, x])));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const planById = useMemo(() => Object.fromEntries(plans.map((p) => [p.id, p])), [plans]);

  // ao selecionar tenant, preenche os formulários com o estado atual
  useEffect(() => {
    if (!selected) return;
    const s = subs[selected]; const b = budgets[selected];
    setSubForm({ planId: s?.plan_id ?? "", status: s?.status ?? "trial", trialEnd: toLocalDate(s?.trial_ends_at), periodEnd: toLocalDate(s?.current_period_end), graceDays: String(s?.grace_days ?? 7), notes: s?.notes ?? "" });
    setBudgetForm({ limit: b?.monthly_token_limit ? String(b.monthly_token_limit) : "", warnPct: String(b?.warn_pct ?? 80), hardStop: b?.hard_stop ?? true });
    setAsaasForm((f) => ({ ...f, name: tenants.find((t) => t.id === selected)?.name ?? "" }));
  }, [selected, subs, budgets, tenants]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); invalidateBillingStatus(); await load(); }
    catch (e: any) { toast.error(e?.message || "Falha na operação."); }
    finally { setBusy(false); }
  };

  const editPlan = (p: Plan) => setPlanForm({
    id: p.id, code: p.code, name: p.name, price: centsToInput(p.price_cents), interval: p.billing_interval, trialDays: String(p.trial_days ?? 0),
    users: p.limits?.users != null ? String(p.limits.users) : "", leads: p.limits?.leads != null ? String(p.limits.leads) : "",
    features: (p.features || []).join("\n"), tagline: p.tagline ?? "", setup: p.setup_price_cents ? centsToInput(p.setup_price_cents) : "",
    badge: p.badge ?? "", featuresHeader: p.features_header ?? "", ctaText: p.cta_text ?? "", highlight: !!p.highlight,
    showOnSite: !!p.show_on_site, sortOrder: String(p.sort_order ?? 0), active: p.active,
    productId: p.product_id ?? "", modules: { ...(p.modules || {}) }, aiTokens: p.ai_monthly_tokens ? String(p.ai_monthly_tokens) : "",
  });
  const linkedProduct = planForm.productId ? products.find((x) => x.id === planForm.productId) : undefined;
  const usedPlanProducts = new Set(plans.filter((p) => p.product_id && p.id !== planForm.id).map((p) => p.product_id));
  const usedTierProducts = new Set(tiers.filter((t) => t.product_id && t.id !== tierForm.id).map((t) => t.product_id));
  const fmtProd = (x: ProductRow) => `${x.name.trim()} — ${Number(x.price).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;

  const savePlan = () => run(() => saasApi.savePlan({
    id: planForm.id || undefined, code: planForm.code, name: planForm.name, priceCents: parseMoneyToCents(planForm.price),
    billingInterval: planForm.interval, trialDays: Number(planForm.trialDays) || 0, active: planForm.active,
    // preserva limites que o formulário não edita (ex.: outras chaves) ao editar em place
    limits: { ...Object.fromEntries(Object.entries(plans.find((x) => x.id === planForm.id)?.limits || {}).filter(([k]) => k !== "users" && k !== "leads")), ...(planForm.users ? { users: Number(planForm.users) } : {}), ...(planForm.leads ? { leads: Number(planForm.leads) } : {}) },
    features: planForm.features.split("\n").map((x) => x.trim()).filter(Boolean),
    tagline: planForm.tagline, setupPriceCents: parseMoneyToCents(planForm.setup), badge: planForm.badge, featuresHeader: planForm.featuresHeader,
    ctaText: planForm.ctaText, highlight: planForm.highlight, showOnSite: planForm.showOnSite, sortOrder: Number(planForm.sortOrder) || 0,
    productId: planForm.productId || null, modules: planForm.modules, aiMonthlyTokens: planForm.aiTokens ? Number(planForm.aiTokens.replace(/\D/g, "")) : null,
  }).then(() => setPlanForm(EMPTY_PLAN)), planForm.id ? "Plano atualizado." : "Plano criado.");

  const saveTier = () => run(() => saasApi.saveCreditTier({
    id: tierForm.id || undefined, credits: Number(tierForm.credits.replace(/\D/g, "")), priceCents: parseMoneyToCents(tierForm.price),
    sortOrder: Number(tierForm.sortOrder) || 0, active: tierForm.active, productId: tierForm.productId || null,
  }).then(() => setTierForm(EMPTY_TIER)), "Faixa de créditos salva.");

  const previewPrice = parseMoneyToCents(planForm.price);
  const previewSetup = parseMoneyToCents(planForm.setup);

  const saveSub = () => run(() => saasApi.saveSubscription(selected, {
    planId: subForm.planId || undefined, status: subForm.status, graceDays: Number(subForm.graceDays),
    trialEndsAt: subForm.trialEnd ? new Date(subForm.trialEnd).toISOString() : undefined,
    currentPeriodEnd: subForm.periodEnd ? new Date(subForm.periodEnd).toISOString() : undefined, notes: subForm.notes,
  }), "Assinatura salva.");

  const saveBudget = () => run(() => saasApi.saveAiBudget(selected, {
    monthlyTokenLimit: budgetForm.limit ? Number(budgetForm.limit) : null, warnPct: Number(budgetForm.warnPct), hardStop: budgetForm.hardStop,
  }), "Teto de IA salvo.");

  const selectedSub = selected ? subs[selected] : undefined;

  return (
    <div className="space-y-6">
      <div className="inline-flex rounded-lg border border-[var(--color-border-default)] p-0.5 bg-[var(--color-surface-sunken)]">
        {([["planos", "Planos & Créditos"], ["assinaturas", "Assinaturas por empresa"]] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setView(id)}
            className={`px-4 py-1.5 text-xs font-bold rounded-md cursor-pointer border-none transition-colors ${view === id ? "bg-[var(--color-primary-blue)] text-white" : "bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}>
            {label}
          </button>
        ))}
      </div>
      {view === "planos" && (<>
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-sm">Planos</h3>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { const r = await saasApi.tick(); toast.info(`${r.changed} assinatura(s) mudaram de status.`); }, "Régua executada.")}>
            <Play className="w-3.5 h-3.5 mr-1" /> Rodar régua de cobrança agora
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[var(--color-text-muted)]"><th className="py-1.5">Plano</th><th>Preço</th><th>Produto</th><th>Módulos</th><th>Teste</th><th>Site</th><th>Status</th></tr></thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} onClick={() => editPlan(p)} className={`border-t border-[var(--color-border-default)] cursor-pointer hover:bg-[var(--color-surface-sunken)] ${planForm.id === p.id ? "bg-[var(--color-surface-sunken)]" : ""}`}>
                  <td className="py-1.5 font-semibold">{p.name} <span className="text-xs text-[var(--color-text-muted)]">({p.code})</span></td>
                  <td>{brl(p.price_cents)}/{p.billing_interval === "yearly" ? "ano" : "mês"}</td>
                  <td className="text-xs">{p.product_id ? <Badge variant="success">Ligado</Badge> : <Badge variant="warning">Sem produto</Badge>}</td>
                  <td className="text-xs">{Object.values(p.modules || {}).filter(Boolean).length || "—"}</td>
                  <td>{p.trial_days}d</td>
                  <td>{p.show_on_site ? <Badge variant="info">No site</Badge> : <span className="text-xs text-[var(--color-text-muted)]">—</span>}</td>
                  <td><Badge variant={p.active ? "success" : "neutral"}>{p.active ? "Ativo" : "Inativo"}</Badge></td>
                </tr>
              ))}
              {plans.length === 0 && <tr><td colSpan={7} className="py-3 text-[var(--color-text-muted)]">Nenhum plano ainda. Crie o primeiro abaixo.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">Clique num plano para editar. Os preços e textos marcados com "Mostrar no site" alimentam as landings. As mudanças aparecem na landing em até 1 minuto.</p>
        <div className="grid gap-2 md:grid-cols-4 border-t border-[var(--color-border-default)] pt-4">
          <h4 className="md:col-span-4 text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)]">{planForm.id ? `Editando: ${planForm.name}` : "Novo plano"}</h4>
          <input className={inputCls} placeholder="Código (ex.: pro)" value={planForm.code} onChange={(e) => setPlanForm({ ...planForm, code: e.target.value })} />
          <input className={inputCls} placeholder="Nome (ex.: Profissional)" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} />
          <div className="md:col-span-4 grid gap-2 md:grid-cols-4 rounded-lg border border-[var(--color-border-default)] p-3 bg-[var(--color-surface-sunken)]">
            <p className="md:col-span-4 text-[11px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Produto do catálogo (fonte do preço)</p>
            <select className={`${inputCls} md:col-span-3`} value={planForm.productId} onChange={(e) => {
              const prod = products.find((x) => x.id === e.target.value);
              setPlanForm({ ...planForm, productId: e.target.value, ...(prod ? { price: centsToInput(Math.round(Number(prod.price) * 100)), active: prod.active !== false } : {}) });
            }}>
              <option value="">Sem produto ligado (preço manual)</option>
              {products.filter((x) => !usedPlanProducts.has(x.id)).map((x) => <option key={x.id} value={x.id}>{fmtProd(x)}</option>)}
            </select>
            {planForm.id && !planForm.productId ? (
              <Button variant="outline" disabled={busy} onClick={() => run(() => saasApi.createPlanProduct(planForm.id), "Produto criado no catálogo e ligado ao plano.")}>Criar produto deste plano</Button>
            ) : <span className="text-xs text-[var(--color-text-muted)] self-center">{linkedProduct ? "Mude o preço em Produtos: o plano e o site acompanham." : ""}</span>}
          </div>
          <input className={inputCls} disabled={!!planForm.productId} title={planForm.productId ? "Vem do produto" : undefined} placeholder="Preço mensal em R$ (ex.: 1.997,00)" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} />
          <select className={inputCls} disabled={!!planForm.productId} value={planForm.interval} onChange={(e) => setPlanForm({ ...planForm, interval: e.target.value })}><option value="monthly">Mensal</option><option value="yearly">Anual</option></select>
          <input className={inputCls} placeholder="Implantação em R$ (ex.: 2.997,00)" value={planForm.setup} onChange={(e) => setPlanForm({ ...planForm, setup: e.target.value })} />
          <input className={inputCls} placeholder="Dias de teste" value={planForm.trialDays} onChange={(e) => setPlanForm({ ...planForm, trialDays: e.target.value })} />
          <input className={inputCls} placeholder="Limite de usuários" value={planForm.users} onChange={(e) => setPlanForm({ ...planForm, users: e.target.value })} />
          <input className={inputCls} placeholder="Limite de leads" value={planForm.leads} onChange={(e) => setPlanForm({ ...planForm, leads: e.target.value })} />
          <input className={`${inputCls} md:col-span-2`} maxLength={300} placeholder="Frase de apoio (tagline)" value={planForm.tagline} onChange={(e) => setPlanForm({ ...planForm, tagline: e.target.value })} />
          <input className={inputCls} maxLength={40} placeholder="Selo (ex.: MAIS ESCOLHIDO)" value={planForm.badge} onChange={(e) => setPlanForm({ ...planForm, badge: e.target.value })} />
          <input className={inputCls} maxLength={60} placeholder="Texto do botão (ex.: Começar Agora)" value={planForm.ctaText} onChange={(e) => setPlanForm({ ...planForm, ctaText: e.target.value })} />
          <input className={`${inputCls} md:col-span-2`} maxLength={80} placeholder="Título da lista (ex.: Inclui: / Tudo do START +)" value={planForm.featuresHeader} onChange={(e) => setPlanForm({ ...planForm, featuresHeader: e.target.value })} />
          <input className={inputCls} type="number" min={0} placeholder="Ordem no site" value={planForm.sortOrder} onChange={(e) => setPlanForm({ ...planForm, sortOrder: e.target.value })} />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={planForm.highlight} onChange={(e) => setPlanForm({ ...planForm, highlight: e.target.checked })} /> Destacar</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={planForm.showOnSite} onChange={(e) => setPlanForm({ ...planForm, showOnSite: e.target.checked })} /> Mostrar no site</label>
            <label className="flex items-center gap-1.5"><input type="checkbox" checked={planForm.active} onChange={(e) => setPlanForm({ ...planForm, active: e.target.checked })} /> Ativo</label>
          </div>
          <div className="md:col-span-4 space-y-2">
            <p className="text-[11px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Módulos liberados ao assinar (nenhum marcado = não altera os módulos do cliente)</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
              {MODULES.map((m) => (
                <label key={m.id} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={!!planForm.modules[m.id]} onChange={(e) => setPlanForm({ ...planForm, modules: { ...planForm.modules, [m.id]: e.target.checked } })} /> {m.label}
                </label>
              ))}
            </div>
          </div>
          <input className={`${inputCls} md:col-span-2`} inputMode="numeric" placeholder="Teto de IA do plano, em tokens/mês (vazio = sem teto)" value={planForm.aiTokens} onChange={(e) => setPlanForm({ ...planForm, aiTokens: e.target.value })} />
          <textarea className={`${inputCls} md:col-span-4`} rows={5} placeholder="Recursos incluídos (um por linha)" value={planForm.features} onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })} />
          <div className="md:col-span-4 flex flex-wrap items-center gap-2">
            <Badge variant="info">Aparece no site como: {brl(previewPrice).replace(/\u00a0/g, " ")}/{planForm.interval === "yearly" ? "ano" : "mês"}{previewSetup ? ` · implantação ${brl(previewSetup).replace(/\u00a0/g, " ")}` : ""}{planForm.showOnSite ? "" : " (oculto no site)"}</Badge>
            <div className="flex-1" />
            {planForm.id && <Button variant="outline" disabled={busy} onClick={() => setPlanForm(EMPTY_PLAN)}><X className="w-4 h-4 mr-1" /> Cancelar edição</Button>}
            <Button disabled={busy || !planForm.code || !planForm.name} onClick={savePlan}>{planForm.id ? "Salvar alterações" : <><Plus className="w-4 h-4 mr-1" /> Criar plano</>}</Button>
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h3 className="font-black text-sm">Créditos de IA (vitrine)</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[var(--color-text-muted)]"><th className="py-1.5">Créditos</th><th>Preço</th><th>Produto</th><th>Ordem</th><th>Status</th><th /></tr></thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.id} onClick={() => setTierForm({ id: t.id, credits: String(t.credits), price: centsToInput(t.price_cents), sortOrder: String(t.sort_order), active: t.active, productId: t.product_id ?? "" })} className={`border-t border-[var(--color-border-default)] cursor-pointer hover:bg-[var(--color-surface-sunken)] ${tierForm.id === t.id ? "bg-[var(--color-surface-sunken)]" : ""}`}>
                  <td className="py-1.5 font-semibold">{t.credits.toLocaleString("pt-BR")}</td>
                  <td>{brl(t.price_cents)}</td><td className="text-xs">{t.product_id ? <Badge variant="success">Ligado</Badge> : <Badge variant="warning">Sem produto</Badge>}</td><td>{t.sort_order}</td>
                  <td><Badge variant={t.active ? "success" : "neutral"}>{t.active ? "Ativa" : "Inativa"}</Badge></td>
                  <td className="text-right"><Button size="sm" variant="outline" disabled={busy} onClick={(e) => { e.stopPropagation(); if (window.confirm("Remover esta faixa de créditos?")) void run(() => saasApi.deleteCreditTier(t.id), "Faixa removida."); }}><Trash2 className="w-3.5 h-3.5" /></Button></td>
                </tr>
              ))}
              {tiers.length === 0 && <tr><td colSpan={6} className="py-3 text-[var(--color-text-muted)]">Nenhuma faixa cadastrada (a landing usa os valores padrão).</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 md:grid-cols-5 border-t border-[var(--color-border-default)] pt-4">
          <div className="md:col-span-5 flex flex-wrap gap-2 items-center">
            <select className={`${inputCls} md:max-w-md`} value={tierForm.productId} onChange={(e) => {
              const prod = products.find((x) => x.id === e.target.value);
              setTierForm({ ...tierForm, productId: e.target.value, ...(prod ? { price: centsToInput(Math.round(Number(prod.price) * 100)) } : {}) });
            }}>
              <option value="">Sem produto ligado (preço manual)</option>
              {products.filter((x) => !usedTierProducts.has(x.id)).map((x) => <option key={x.id} value={x.id}>{fmtProd(x)}</option>)}
            </select>
            {tierForm.id && !tierForm.productId && (
              <Button variant="outline" disabled={busy} onClick={() => run(() => saasApi.createTierProduct(tierForm.id).then(() => setTierForm(EMPTY_TIER)), "Produto criado no catálogo e ligado ao pacote.")}>Criar produto deste pacote</Button>
            )}
          </div>
          <input className={inputCls} inputMode="numeric" placeholder="Créditos (ex.: 10000)" value={tierForm.credits} onChange={(e) => setTierForm({ ...tierForm, credits: e.target.value })} />
          <input className={inputCls} disabled={!!tierForm.productId} placeholder="Preço em R$ (ex.: 199,00)" value={tierForm.price} onChange={(e) => setTierForm({ ...tierForm, price: e.target.value })} />
          <input className={inputCls} type="number" min={0} placeholder="Ordem" value={tierForm.sortOrder} onChange={(e) => setTierForm({ ...tierForm, sortOrder: e.target.value })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={tierForm.active} onChange={(e) => setTierForm({ ...tierForm, active: e.target.checked })} /> Ativa</label>
          <div className="flex gap-2">
            {tierForm.id && <Button variant="outline" disabled={busy} onClick={() => setTierForm(EMPTY_TIER)}><X className="w-4 h-4" /></Button>}
            <Button disabled={busy || !Number(tierForm.credits.replace(/\D/g, "")) || !parseMoneyToCents(tierForm.price)} onClick={saveTier}>{tierForm.id ? "Salvar faixa" : "Adicionar faixa"}</Button>
          </div>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">As mudanças aparecem na landing em até 1 minuto.</p>
      </Card>
      </>)}

      {view === "assinaturas" && (<>
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-black text-sm">Assinaturas por empresa</h3>
          <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[var(--color-text-muted)]"><th className="py-1.5">Empresa</th><th>Plano</th><th>Status</th><th>Vence</th><th>IA (teto)</th></tr></thead>
            <tbody>
              {tenants.map((t) => {
                const s = subs[t.id]; const b = budgets[t.id];
                return (
                  <tr key={t.id} onClick={() => setSelected(t.id)} className={`border-t border-[var(--color-border-default)] cursor-pointer hover:bg-[var(--color-surface-sunken)] ${selected === t.id ? "bg-[var(--color-surface-sunken)]" : ""}`}>
                    <td className="py-1.5 font-semibold">{t.name}</td>
                    <td>{s?.plan_id ? planById[s.plan_id]?.name ?? "—" : "—"}</td>
                    <td>{s ? <Badge variant={STATUS_VARIANT[s.status]}>{STATUS_LABEL[s.status]}</Badge> : <span className="text-[var(--color-text-muted)]">Sem assinatura</span>}</td>
                    <td>{fmtDate(s?.status === "trial" ? s.trial_ends_at : s?.current_period_end)}</td>
                    <td>{b?.monthly_token_limit ? b.monthly_token_limit.toLocaleString("pt-BR") : "Sem limite"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">Empresas sem assinatura têm acesso liberado. Clique numa linha para editar.</p>
      </Card>

      {selected && (
        <Card className="p-5 space-y-5">
          <h3 className="font-black text-sm">{tenants.find((t) => t.id === selected)?.name}</h3>
          <div className="grid gap-2 md:grid-cols-3">
            <select className={inputCls} value={subForm.planId} onChange={(e) => setSubForm({ ...subForm, planId: e.target.value })}>
              <option value="">Plano…</option>{plans.map((p) => <option key={p.id} value={p.id}>{p.name} — {brl(p.price_cents)}</option>)}
            </select>
            <select className={inputCls} value={subForm.status} onChange={(e) => setSubForm({ ...subForm, status: e.target.value })}>
              {Object.entries(STATUS_LABEL).filter(([k]) => k !== "none").map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <input className={inputCls} type="number" min={0} placeholder="Carência (dias)" value={subForm.graceDays} onChange={(e) => setSubForm({ ...subForm, graceDays: e.target.value })} />
            <label className="text-xs text-[var(--color-text-muted)]">Fim do teste<input className={inputCls} type="date" value={subForm.trialEnd} onChange={(e) => setSubForm({ ...subForm, trialEnd: e.target.value })} /></label>
            <label className="text-xs text-[var(--color-text-muted)]">Fim do período pago<input className={inputCls} type="date" value={subForm.periodEnd} onChange={(e) => setSubForm({ ...subForm, periodEnd: e.target.value })} /></label>
            <input className={`${inputCls} self-end`} placeholder="Observações" value={subForm.notes} onChange={(e) => setSubForm({ ...subForm, notes: e.target.value })} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={saveSub}>Salvar assinatura</Button>
            <Button variant="outline" disabled={busy || !subForm.planId} title="Aplica o plano: assinatura, módulos liberados e teto de IA" onClick={() => run(() => saasApi.applyPlan(selected, subForm.planId), "Plano aplicado: assinatura, módulos e teto de IA atualizados.")}>Aplicar plano (módulos + IA)</Button>
            <Button variant="outline" disabled={busy || !selectedSub} onClick={() => run(() => saasApi.markPaid(selected), "Pagamento registrado — assinatura ativa.")}><CheckCircle2 className="w-4 h-4 mr-1" /> Marcar como pago</Button>
            <Button variant="danger" disabled={busy || !selectedSub} onClick={() => run(() => saasApi.saveSubscription(selected, { status: "suspended" }), "Assinatura suspensa.")}>Suspender</Button>
            <Button variant="outline" disabled={busy || !selectedSub} onClick={() => run(() => saasApi.saveSubscription(selected, { status: "active" }), "Assinatura reativada.")}>Reativar</Button>
          </div>

          <div className="border-t border-[var(--color-border-default)] pt-4 space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)]">Teto de IA (tokens/mês)</h4>
            <div className="grid gap-2 md:grid-cols-4">
              <input className={inputCls} type="number" min={1} placeholder="Sem limite" value={budgetForm.limit} onChange={(e) => setBudgetForm({ ...budgetForm, limit: e.target.value })} />
              <input className={inputCls} type="number" min={1} max={100} placeholder="Avisar em %" value={budgetForm.warnPct} onChange={(e) => setBudgetForm({ ...budgetForm, warnPct: e.target.value })} />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={budgetForm.hardStop} onChange={(e) => setBudgetForm({ ...budgetForm, hardStop: e.target.checked })} /> Pausar a IA ao atingir</label>
              <Button variant="outline" disabled={busy} onClick={saveBudget}>Salvar teto</Button>
            </div>
          </div>

          <div className="border-t border-[var(--color-border-default)] pt-4 space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-muted)]">Cobrança automática (Asaas)</h4>
            {selectedSub?.gateway_subscription_id ? (
              <p className="text-sm">Cobrança recorrente criada no Asaas (<code className="text-xs">{selectedSub.gateway_subscription_id}</code>). Pagamentos confirmam a assinatura pelo webhook.</p>
            ) : (
              <div className="grid gap-2 md:grid-cols-5">
                <input className={inputCls} placeholder="Nome do cliente" value={asaasForm.name} onChange={(e) => setAsaasForm({ ...asaasForm, name: e.target.value })} />
                <input className={inputCls} placeholder="CPF/CNPJ" value={asaasForm.cpfCnpj} onChange={(e) => setAsaasForm({ ...asaasForm, cpfCnpj: e.target.value })} />
                <input className={inputCls} placeholder="E-mail" value={asaasForm.email} onChange={(e) => setAsaasForm({ ...asaasForm, email: e.target.value })} />
                <select className={inputCls} value={asaasForm.billingType} onChange={(e) => setAsaasForm({ ...asaasForm, billingType: e.target.value })}>
                  <option value="UNDEFINED">Cliente escolhe</option><option value="PIX">Pix</option><option value="BOLETO">Boleto</option><option value="CREDIT_CARD">Cartão</option>
                </select>
                <Button variant="outline" disabled={busy || !selectedSub?.plan_id || !asaasForm.name || !asaasForm.cpfCnpj} onClick={() => run(() => saasApi.createAsaas(selected, asaasForm), "Cobrança criada no Asaas.")}>Gerar no Asaas</Button>
              </div>
            )}
            <p className="text-xs text-[var(--color-text-muted)]">Requer ASAAS_API_KEY e ASAAS_WEBHOOK_TOKEN no servidor; webhook em <code>/api/billing/webhook/asaas</code>. Sem isso, use "Marcar como pago" (modo manual).</p>
          </div>
        </Card>
      )}
      </>)}
    </div>
  );
}
