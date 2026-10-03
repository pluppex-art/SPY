import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Plus, RefreshCw, CheckCircle2, Play } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { supabase } from "../../../lib/supabase";
import { saasApi, brl, fmtDate, STATUS_LABEL, type Plan, type Subscription } from "../../../lib/saasApi";
import { invalidateBillingStatus } from "../../../hooks/useBillingStatus";

type TenantRow = { id: string; name: string };
type BudgetRow = { tenant_id: string; monthly_token_limit: number | null; warn_pct: number; hard_stop: boolean };

const STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "info" | "neutral"> = {
  active: "success", trial: "info", past_due: "warning", suspended: "destructive", canceled: "destructive",
};
const inputCls = "w-full rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface)] px-3 py-2 text-sm";
const toLocalDate = (iso?: string | null) => (iso ? iso.slice(0, 10) : "");

export function AdminAssinaturasTab() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [subs, setSubs] = useState<Record<string, Subscription>>({});
  const [budgets, setBudgets] = useState<Record<string, BudgetRow>>({});
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);

  // formulário de plano
  const [planForm, setPlanForm] = useState({ code: "", name: "", price: "", interval: "monthly", trialDays: "14", users: "", leads: "", features: "" });
  // formulário de assinatura do tenant selecionado
  const [subForm, setSubForm] = useState({ planId: "", status: "trial", trialEnd: "", periodEnd: "", graceDays: "7", notes: "" });
  const [budgetForm, setBudgetForm] = useState({ limit: "", warnPct: "80", hardStop: true });
  const [asaasForm, setAsaasForm] = useState({ name: "", cpfCnpj: "", email: "", billingType: "UNDEFINED" });

  const load = useCallback(async () => {
    if (!supabase) return;
    const [p, t, s, b] = await Promise.all([
      saasApi.plans().catch(() => [] as Plan[]),
      supabase.from("tenants").select("id, name").is("deleted_at", null).order("name"),
      supabase.from("tenant_subscriptions").select("*"),
      supabase.from("tenant_ai_budget").select("*"),
    ]);
    setPlans(p);
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

  const savePlan = () => run(() => saasApi.savePlan({
    code: planForm.code, name: planForm.name, priceCents: Math.round(parseFloat(planForm.price.replace(",", ".")) * 100) || 0,
    billingInterval: planForm.interval, trialDays: Number(planForm.trialDays) || 0,
    limits: { ...(planForm.users ? { users: Number(planForm.users) } : {}), ...(planForm.leads ? { leads: Number(planForm.leads) } : {}) },
    features: planForm.features.split("\n").map((x) => x.trim()).filter(Boolean),
  }).then(() => setPlanForm({ code: "", name: "", price: "", interval: "monthly", trialDays: "14", users: "", leads: "", features: "" })), "Plano salvo.");

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
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-black text-sm">Planos</h3>
          <Button size="sm" variant="outline" disabled={busy} onClick={() => run(async () => { const r = await saasApi.tick(); toast.info(`${r.changed} assinatura(s) mudaram de status.`); }, "Régua executada.")}>
            <Play className="w-3.5 h-3.5 mr-1" /> Rodar régua de cobrança agora
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[var(--color-text-muted)]"><th className="py-1.5">Plano</th><th>Preço</th><th>Teste</th><th>Limites</th><th>Status</th></tr></thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className="border-t border-[var(--color-border-default)]">
                  <td className="py-1.5 font-semibold">{p.name} <span className="text-xs text-[var(--color-text-muted)]">({p.code})</span></td>
                  <td>{brl(p.price_cents)}/{p.billing_interval === "yearly" ? "ano" : "mês"}</td>
                  <td>{p.trial_days}d</td>
                  <td className="text-xs">{Object.entries(p.limits || {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "—"}</td>
                  <td><Badge variant={p.active ? "success" : "neutral"}>{p.active ? "Ativo" : "Inativo"}</Badge></td>
                </tr>
              ))}
              {plans.length === 0 && <tr><td colSpan={5} className="py-3 text-[var(--color-text-muted)]">Nenhum plano ainda. Crie o primeiro abaixo.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="grid gap-2 md:grid-cols-4 border-t border-[var(--color-border-default)] pt-4">
          <input className={inputCls} placeholder="Código (ex.: pro)" value={planForm.code} onChange={(e) => setPlanForm({ ...planForm, code: e.target.value })} />
          <input className={inputCls} placeholder="Nome (ex.: Profissional)" value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} />
          <input className={inputCls} placeholder="Preço em R$ (ex.: 297,00)" value={planForm.price} onChange={(e) => setPlanForm({ ...planForm, price: e.target.value })} />
          <select className={inputCls} value={planForm.interval} onChange={(e) => setPlanForm({ ...planForm, interval: e.target.value })}><option value="monthly">Mensal</option><option value="yearly">Anual</option></select>
          <input className={inputCls} placeholder="Dias de teste" value={planForm.trialDays} onChange={(e) => setPlanForm({ ...planForm, trialDays: e.target.value })} />
          <input className={inputCls} placeholder="Limite de usuários" value={planForm.users} onChange={(e) => setPlanForm({ ...planForm, users: e.target.value })} />
          <input className={inputCls} placeholder="Limite de leads" value={planForm.leads} onChange={(e) => setPlanForm({ ...planForm, leads: e.target.value })} />
          <Button disabled={busy || !planForm.code || !planForm.name} onClick={savePlan}><Plus className="w-4 h-4 mr-1" /> Criar plano</Button>
          <textarea className={`${inputCls} md:col-span-4`} rows={2} placeholder="Recursos incluídos (um por linha)" value={planForm.features} onChange={(e) => setPlanForm({ ...planForm, features: e.target.value })} />
        </div>
      </Card>

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
    </div>
  );
}
