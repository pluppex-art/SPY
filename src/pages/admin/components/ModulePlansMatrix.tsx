import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "../../../components/ui/card";
import { MODULES } from "./NovoTenantModal";
import { saasApi, planPayload, type Plan } from "../../../lib/saasApi";

/**
 * Visão por módulo: em quais planos ele é liberado. Marcar/desmarcar grava no plano
 * (o mesmo `modules` editável na aba Plano & SaaS do produto) — passa a valer para quem
 * assinar ou reaplicar o plano; não mexe em clientes que já estão ativos.
 */
export function ModulePlansMatrix() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPlans(await saasApi.plans().catch(() => [] as Plan[]));
  }, []);
  useEffect(() => { void load(); }, [load]);

  const toggle = async (plan: Plan, moduleId: string) => {
    const key = `${plan.id}:${moduleId}`;
    setBusyKey(key);
    const modules = { ...(plan.modules || {}), [moduleId]: !plan.modules?.[moduleId] };
    try {
      const saved = await saasApi.savePlan(planPayload(plan, { modules }));
      setPlans((prev) => prev.map((p) => (p.id === plan.id ? { ...p, ...saved } : p)));
    } catch (e: any) {
      toast.error(e?.message || "Não foi possível atualizar o plano.");
    } finally {
      setBusyKey(null);
    }
  };

  if (plans.length === 0) return null;

  return (
    <Card className="p-5 space-y-3 mt-6">
      <div>
        <h3 className="font-black text-sm">Planos que liberam cada módulo</h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
          Vale para quem assinar ou reaplicar o plano. Plano sem nenhum módulo marcado não altera os módulos do cliente.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[var(--color-text-muted)]">
              <th className="py-1.5 font-semibold">Módulo</th>
              {plans.map((p) => <th key={p.id} className="px-3 font-semibold text-center whitespace-nowrap">{p.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {MODULES.map((m) => (
              <tr key={m.id} className="border-t border-[var(--color-border-default)]">
                <td className="py-1.5 font-semibold">{m.label}</td>
                {plans.map((p) => (
                  <td key={p.id} className="px-3 text-center">
                    <input type="checkbox" checked={!!p.modules?.[m.id]} disabled={busyKey === `${p.id}:${m.id}`} onChange={() => void toggle(p, m.id)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
