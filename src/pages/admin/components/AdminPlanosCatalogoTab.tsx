import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ExternalLink, Plus, RefreshCw } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { Badge } from "../../../components/ui/badge";
import { saasApi, planPayload, tierPayload, brl, type Plan, type CreditTier } from "../../../lib/saasApi";
import { invalidateBillingStatus } from "../../../hooks/useBillingStatus";

/**
 * Visão geral dos planos e pacotes de créditos. É só consulta + atalhos: o cadastro (preço, módulos,
 * teto de IA, vitrine) mora no PRODUTO — o botão "Editar no produto" abre o produto na aba Plano & SaaS.
 */
export function AdminPlanosCatalogoTab() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [tiers, setTiers] = useState<CreditTier[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [p, t] = await Promise.all([saasApi.plans().catch(() => [] as Plan[]), saasApi.creditTiers().catch(() => [] as CreditTier[])]);
    setPlans(p);
    setTiers(t);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try { await fn(); toast.success(ok); invalidateBillingStatus(); await load(); }
    catch (e: any) { toast.error(e?.message || "Falha na operação."); }
    finally { setBusy(false); }
  };

  const missingProducts = plans.filter((p) => !p.product_id).length + tiers.filter((t) => !t.product_id).length;
  const createMissingProducts = () => run(async () => {
    for (const p of plans.filter((x) => !x.product_id)) await saasApi.createPlanProduct(p.id);
    for (const t of tiers.filter((x) => !x.product_id)) await saasApi.createTierProduct(t.id);
  }, "Produtos criados e ligados.");

  const editInProduct = (productId: string) => navigate(`/app/produtos?editar=${productId}&aba=saas`);
  const th = "py-1.5 text-left font-semibold text-[var(--color-text-muted)]";
  const row = "border-t border-[var(--color-border-default)]";

  const siteSwitch = (on: boolean, onChange: () => void) => (
    <button type="button" disabled={busy} onClick={onChange}
      className={`px-2 py-0.5 rounded-full text-[11px] font-bold border cursor-pointer transition-colors ${on ? "bg-sky-500/10 text-sky-500 border-sky-500/30" : "bg-transparent text-[var(--color-text-muted)] border-[var(--color-border-default)]"}`}>
      {on ? "No site" : "Oculto"}
    </button>
  );

  return (
    <div className="space-y-6">
      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-black text-sm">Planos de assinatura</h3>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Preço, módulos, teto de IA e vitrine são cadastrados no produto. Aqui você acompanha e liga/desliga o site.</p>
          </div>
          <div className="flex gap-2">
            {missingProducts > 0 && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void createMissingProducts()}>
                Criar {missingProducts} produto{missingProducts === 1 ? "" : "s"} que falta{missingProducts === 1 ? "" : "m"}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => void load()}><RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar</Button>
            <Button size="sm" onClick={() => navigate("/app/produtos?novo=1&type=Digital")}><Plus className="w-3.5 h-3.5 mr-1" /> Novo plano / pacote</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Plano</th><th className={th}>Preço</th><th className={th}>Módulos</th><th className={th}>IA / mês</th><th className={th}>Site</th><th className={th}>Status</th><th /></tr></thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id} className={row}>
                  <td className="py-2 font-semibold">{p.name} <span className="text-xs text-[var(--color-text-muted)]">({p.code})</span></td>
                  <td>{brl(p.price_cents)}/{p.billing_interval === "yearly" ? "ano" : "mês"}</td>
                  <td className="text-xs">{Object.values(p.modules || {}).filter(Boolean).length || "—"}</td>
                  <td className="text-xs">{p.ai_monthly_tokens ? p.ai_monthly_tokens.toLocaleString("pt-BR") : "Sem teto"}</td>
                  <td>{siteSwitch(!!p.show_on_site, () => void run(() => saasApi.savePlan(planPayload(p, { showOnSite: !p.show_on_site })), p.show_on_site ? "Plano oculto do site." : "Plano no site."))}</td>
                  <td><Badge variant={p.active ? "success" : "neutral"}>{p.active ? "Ativo" : "Inativo"}</Badge></td>
                  <td className="text-right">
                    {p.product_id
                      ? <Button size="sm" variant="outline" onClick={() => editInProduct(p.product_id!)}><ExternalLink className="w-3.5 h-3.5 mr-1" /> Editar no produto</Button>
                      : <Button size="sm" variant="outline" disabled={busy} title="Plano antigo, sem produto: cria o produto no catálogo e liga os dois" onClick={() => void run(() => saasApi.createPlanProduct(p.id), "Produto criado e ligado ao plano.")}>Criar produto</Button>}
                  </td>
                </tr>
              ))}
              {plans.length === 0 && <tr><td colSpan={7} className="py-3 text-[var(--color-text-muted)]">Nenhum plano ainda. Cadastre um produto e use a aba "Plano & SaaS".</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <h3 className="font-black text-sm">Pacotes de créditos de IA</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr><th className={th}>Créditos</th><th className={th}>Preço</th><th className={th}>Ordem</th><th className={th}>Site</th><th className={th}>Status</th><th /></tr></thead>
            <tbody>
              {tiers.map((t) => (
                <tr key={t.id} className={row}>
                  <td className="py-2 font-semibold">{t.credits.toLocaleString("pt-BR")}</td>
                  <td>{brl(t.price_cents)}</td>
                  <td>{t.sort_order}</td>
                  <td>{siteSwitch(t.show_on_site !== false, () => void run(() => saasApi.saveCreditTier(tierPayload(t, { showOnSite: t.show_on_site === false })), t.show_on_site === false ? "Pacote no site." : "Pacote oculto do site."))}</td>
                  <td><Badge variant={t.active ? "success" : "neutral"}>{t.active ? "Ativo" : "Inativo"}</Badge></td>
                  <td className="text-right">
                    {t.product_id
                      ? <Button size="sm" variant="outline" onClick={() => editInProduct(t.product_id!)}><ExternalLink className="w-3.5 h-3.5 mr-1" /> Editar no produto</Button>
                      : <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => saasApi.createTierProduct(t.id), "Produto criado e ligado ao pacote.")}>Criar produto</Button>}
                  </td>
                </tr>
              ))}
              {tiers.length === 0 && <tr><td colSpan={6} className="py-3 text-[var(--color-text-muted)]">Nenhum pacote cadastrado (a landing usa os valores padrão).</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">Mudanças de preço e de "No site" aparecem nas landings em até 1 minuto.</p>
      </Card>
    </div>
  );
}
