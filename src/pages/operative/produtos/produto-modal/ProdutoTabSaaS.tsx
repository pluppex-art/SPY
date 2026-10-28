import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Boxes, Sparkles, Globe, Cpu, Loader2, Unlink } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { MODULES } from "../../../admin/components/NovoTenantModal";
import {
  saasApi, planPayload, tierPayload, parseMoneyToCents, centsToInput,
  type Plan, type CreditTier,
} from "../../../../lib/saasApi";
import { invalidateBillingStatus } from "../../../../hooks/useBillingStatus";

type Kind = "none" | "plan" | "tier";

interface ProdutoTabSaaSProps {
  productId: string;
  productName: string;
}

const inputCls =
  "w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3.5 py-2.5 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-faint)] focus:outline-none focus:border-[var(--color-primary-blue)] font-bold transition-all disabled:opacity-60";
const labelCls = "text-[10px] text-[var(--color-text-muted)] font-extrabold uppercase block tracking-wider mb-1";
const sectionCls = "rounded-2xl border border-[var(--color-border-default)] p-4 space-y-3";

const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);

const EMPTY_PLAN = {
  code: "", name: "", trialDays: "14", users: "", leads: "", aiTokens: "", setup: "", sortOrder: "0",
  tagline: "", badge: "", featuresHeader: "", ctaText: "", features: "",
  highlight: false, showOnSite: false, modules: {} as Record<string, boolean>,
};
const EMPTY_TIER = { credits: "", sortOrder: "0", showOnSite: true };

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex items-start gap-2.5 cursor-pointer">
      <input type="checkbox" className="mt-0.5" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="text-xs font-bold text-[var(--color-text-primary)]">
        {label}
        {hint && <span className="block text-[10px] font-medium text-[var(--color-text-muted)]">{hint}</span>}
      </span>
    </label>
  );
}

/**
 * Aba "Plano & SaaS" do cadastro de produto (só no catálogo da plataforma, só master).
 * O produto é a fonte única do preço, do ativo/inativo e da recorrência; esta aba cadastra o que é
 * do plano / pacote (módulos liberados, teto de IA, limites, vitrine do site) sem sair do produto.
 */
export function ProdutoTabSaaS({ productId, productName }: ProdutoTabSaaSProps) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [tier, setTier] = useState<CreditTier | null>(null);
  const [kind, setKind] = useState<Kind>("none");
  const [pf, setPf] = useState(EMPTY_PLAN);
  const [tf, setTf] = useState(EMPTY_TIER);

  const fillPlan = (p: Plan) => setPf({
    code: p.code, name: p.name, trialDays: String(p.trial_days ?? 0),
    users: p.limits?.users != null ? String(p.limits.users) : "", leads: p.limits?.leads != null ? String(p.limits.leads) : "",
    aiTokens: p.ai_monthly_tokens ? String(p.ai_monthly_tokens) : "", setup: p.setup_price_cents ? centsToInput(p.setup_price_cents) : "",
    sortOrder: String(p.sort_order ?? 0), tagline: p.tagline ?? "", badge: p.badge ?? "", featuresHeader: p.features_header ?? "",
    ctaText: p.cta_text ?? "", features: (p.features || []).join("\n"), highlight: !!p.highlight, showOnSite: !!p.show_on_site,
    modules: { ...(p.modules || {}) },
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plans, tiers] = await Promise.all([saasApi.plans(), saasApi.creditTiers()]);
      const p = plans.find((x) => x.product_id === productId) ?? null;
      const t = tiers.find((x) => x.product_id === productId) ?? null;
      setPlan(p); setTier(t);
      if (p) { setKind("plan"); fillPlan(p); }
      else if (t) { setKind("tier"); setTf({ credits: String(t.credits), sortOrder: String(t.sort_order ?? 0), showOnSite: t.show_on_site !== false }); }
      else { setKind("none"); setPf({ ...EMPTY_PLAN, name: productName.replace(/^Licença S\.?P\.?Y\s*\|\s*/i, "").trim(), code: slug(productName) }); setTf(EMPTY_TIER); }
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível carregar o plano deste produto.");
    } finally {
      setLoading(false);
    }
  }, [productId, productName]);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); invalidateBillingStatus(); await load(); }
    catch (e: any) { toast.error(e?.message || "Falha na operação."); }
    finally { setBusy(false); }
  };

  const enabledModules = useMemo(() => Object.values(pf.modules).filter(Boolean).length, [pf.modules]);

  const savePlan = () => run(() => saasApi.savePlan({
    id: plan?.id, code: pf.code, name: pf.name, productId,
    // preço/intervalo/ativo vêm do produto (o servidor sobrescreve); mandamos o que já existe só p/ novo plano
    priceCents: plan?.price_cents ?? 0, billingInterval: plan?.billing_interval ?? "monthly", active: plan?.active ?? true,
    trialDays: Number(pf.trialDays) || 0,
    limits: {
      ...Object.fromEntries(Object.entries(plan?.limits || {}).filter(([k]) => k !== "users" && k !== "leads")),
      ...(pf.users ? { users: Number(pf.users) } : {}), ...(pf.leads ? { leads: Number(pf.leads) } : {}),
    },
    features: pf.features.split("\n").map((x) => x.trim()).filter(Boolean),
    tagline: pf.tagline, setupPriceCents: parseMoneyToCents(pf.setup), badge: pf.badge, featuresHeader: pf.featuresHeader,
    ctaText: pf.ctaText, highlight: pf.highlight, showOnSite: pf.showOnSite, sortOrder: Number(pf.sortOrder) || 0,
    modules: pf.modules, aiMonthlyTokens: pf.aiTokens ? Number(pf.aiTokens.replace(/\D/g, "")) : null,
  }), plan ? "Plano atualizado." : "Produto transformado em plano.");

  const saveTier = () => run(() => saasApi.saveCreditTier({
    id: tier?.id, productId, credits: Number(tf.credits.replace(/\D/g, "")),
    priceCents: tier?.price_cents ?? 0, sortOrder: Number(tf.sortOrder) || 0, active: tier?.active ?? true, showOnSite: tf.showOnSite,
  }), tier ? "Pacote atualizado." : "Produto transformado em pacote de créditos.");

  const unlink = () => {
    if (!window.confirm("Desvincular este produto? O plano/pacote continua existindo, mas passa a ter preço manual.")) return;
    void run(() => (plan ? saasApi.savePlan(planPayload(plan, { productId: null })) : saasApi.saveCreditTier(tierPayload(tier!, { productId: null }))), "Produto desvinculado.");
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] py-10 justify-center"><Loader2 className="w-4 h-4 animate-spin" /> Carregando…</div>;
  }

  const linked = kind === "plan" ? !!plan : kind === "tier" ? !!tier : false;

  return (
    <div className="space-y-5">
      <div className={sectionCls}>
        <div className="flex items-center gap-2">
          <Boxes className="w-4 h-4 text-[var(--color-primary-blue)]" />
          <h4 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)]">O que este produto vende na plataforma?</h4>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([["none", "Nada (produto comum)"], ["plan", "Plano de assinatura"], ["tier", "Pacote de créditos de IA"]] as const).map(([id, label]) => (
            <button key={id} type="button" disabled={linked && id !== kind} onClick={() => setKind(id)}
              className={`px-3 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wide border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                kind === id ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/40 text-[var(--color-primary-blue)]" : "bg-transparent border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"}`}>
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)]">
          Preço, recorrência e ativo/inativo vêm das abas <b>Cadastro</b> e <b>Comercial</b> deste produto — mude lá e o plano, a cobrança e o site acompanham.
        </p>
        {linked && (
          <button type="button" onClick={unlink} disabled={busy} className="text-[11px] font-bold text-rose-500 hover:underline flex items-center gap-1 cursor-pointer bg-transparent border-none p-0">
            <Unlink className="w-3 h-3" /> Desvincular do plano/pacote
          </button>
        )}
      </div>

      {kind === "plan" && (
        <>
          <div className={sectionCls}>
            <h4 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)]">Identificação e limites</h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className={labelCls}>Código (único)</label><input className={inputCls} value={pf.code} onChange={(e) => setPf({ ...pf, code: e.target.value })} placeholder="ex.: pro" /></div>
              <div><label className={labelCls}>Nome do plano</label><input className={inputCls} value={pf.name} onChange={(e) => setPf({ ...pf, name: e.target.value })} placeholder="ex.: Profissional" /></div>
              <div><label className={labelCls}>Dias de teste</label><input className={inputCls} inputMode="numeric" value={pf.trialDays} onChange={(e) => setPf({ ...pf, trialDays: e.target.value })} /></div>
              <div><label className={labelCls}>Implantação (R$)</label><input className={inputCls} value={pf.setup} onChange={(e) => setPf({ ...pf, setup: e.target.value })} placeholder="ex.: 2.997,00" /></div>
              <div><label className={labelCls}>Limite de usuários</label><input className={inputCls} inputMode="numeric" value={pf.users} onChange={(e) => setPf({ ...pf, users: e.target.value })} placeholder="vazio = sem limite" /></div>
              <div><label className={labelCls}>Limite de leads</label><input className={inputCls} inputMode="numeric" value={pf.leads} onChange={(e) => setPf({ ...pf, leads: e.target.value })} placeholder="vazio = sem limite" /></div>
            </div>
          </div>

          <div className={sectionCls}>
            <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-500" /><h4 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)]">Inteligência artificial</h4></div>
            <div><label className={labelCls}>Teto de IA do plano (tokens/mês)</label>
              <input className={inputCls} inputMode="numeric" value={pf.aiTokens} onChange={(e) => setPf({ ...pf, aiTokens: e.target.value })} placeholder="vazio = sem teto" />
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)]">Aplicado ao cliente quando ele assina o plano. Pacotes de créditos extras são cadastrados como outro produto.</p>
          </div>

          <div className={sectionCls}>
            <div className="flex items-center gap-2"><Cpu className="w-4 h-4 text-emerald-500" /><h4 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)]">Módulos liberados <span className="text-[var(--color-text-muted)] normal-case font-bold">({enabledModules} marcado{enabledModules === 1 ? "" : "s"})</span></h4></div>
            <div className="grid gap-2 sm:grid-cols-2">
              {MODULES.map((m) => (
                <Toggle key={m.id} label={m.label} checked={!!pf.modules[m.id]} onChange={(v) => setPf({ ...pf, modules: { ...pf.modules, [m.id]: v } })} />
              ))}
            </div>
            <p className="text-[11px] text-[var(--color-text-muted)]">Nenhum marcado = o plano não mexe nos módulos do cliente. Também dá para ligar/desligar por módulo em Admin → Módulos.</p>
          </div>

          <div className={sectionCls}>
            <div className="flex items-center gap-2"><Globe className="w-4 h-4 text-sky-500" /><h4 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)]">Vitrine no site</h4></div>
            <Toggle checked={pf.showOnSite} onChange={(v) => setPf({ ...pf, showOnSite: v })} label="Mostrar este plano e valor no site" hint="Alimenta as landings (/lp e /landing) em até 1 minuto." />
            {pf.showOnSite && (
              <div className="grid gap-3 sm:grid-cols-2 pt-1">
                <div className="sm:col-span-2"><label className={labelCls}>Frase de apoio</label><input className={inputCls} maxLength={300} value={pf.tagline} onChange={(e) => setPf({ ...pf, tagline: e.target.value })} /></div>
                <div><label className={labelCls}>Selo</label><input className={inputCls} maxLength={40} value={pf.badge} onChange={(e) => setPf({ ...pf, badge: e.target.value })} placeholder="ex.: MAIS ESCOLHIDO" /></div>
                <div><label className={labelCls}>Texto do botão</label><input className={inputCls} maxLength={60} value={pf.ctaText} onChange={(e) => setPf({ ...pf, ctaText: e.target.value })} placeholder="ex.: Começar agora" /></div>
                <div><label className={labelCls}>Título da lista</label><input className={inputCls} maxLength={80} value={pf.featuresHeader} onChange={(e) => setPf({ ...pf, featuresHeader: e.target.value })} placeholder="ex.: Tudo do START +" /></div>
                <div><label className={labelCls}>Ordem no site</label><input className={inputCls} type="number" min={0} value={pf.sortOrder} onChange={(e) => setPf({ ...pf, sortOrder: e.target.value })} /></div>
                <div className="sm:col-span-2"><Toggle checked={pf.highlight} onChange={(v) => setPf({ ...pf, highlight: v })} label="Destacar este plano" /></div>
                <div className="sm:col-span-2"><label className={labelCls}>Recursos incluídos (um por linha)</label><textarea className={inputCls} rows={5} value={pf.features} onChange={(e) => setPf({ ...pf, features: e.target.value })} /></div>
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button type="button" disabled={busy || !pf.code.trim() || !pf.name.trim()} onClick={savePlan}>
              {busy ? "Salvando…" : plan ? "Salvar plano" : "Transformar em plano"}
            </Button>
          </div>
        </>
      )}

      {kind === "tier" && (
        <>
          <div className={sectionCls}>
            <div className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-indigo-500" /><h4 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)]">Pacote de créditos de IA</h4></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div><label className={labelCls}>Créditos do pacote</label><input className={inputCls} inputMode="numeric" value={tf.credits} onChange={(e) => setTf({ ...tf, credits: e.target.value })} placeholder="ex.: 10000" /></div>
              <div><label className={labelCls}>Ordem no site</label><input className={inputCls} type="number" min={0} value={tf.sortOrder} onChange={(e) => setTf({ ...tf, sortOrder: e.target.value })} /></div>
            </div>
            <Toggle checked={tf.showOnSite} onChange={(v) => setTf({ ...tf, showOnSite: v })} label="Mostrar este pacote e valor no site" hint="Desmarcado = continua à venda no sistema, mas não aparece nas landings." />
          </div>
          <div className="flex justify-end">
            <Button type="button" disabled={busy || !Number(tf.credits.replace(/\D/g, ""))} onClick={saveTier}>
              {busy ? "Salvando…" : tier ? "Salvar pacote" : "Transformar em pacote"}
            </Button>
          </div>
        </>
      )}

      {kind === "none" && (
        <p className="text-xs text-[var(--color-text-muted)] text-center py-4">
          Produto comum: não aparece como plano nem como pacote. Escolha uma das opções acima para vendê-lo como assinatura ou créditos de IA.
        </p>
      )}
    </div>
  );
}
