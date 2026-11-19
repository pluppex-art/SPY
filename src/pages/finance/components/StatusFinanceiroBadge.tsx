import { CheckCircle2, CircleDot, Circle, AlertCircle } from "lucide-react";
import type { StatusFinanceiro } from "../hooks/useFinanceEntriesResumo";

const ESTILO: Record<StatusFinanceiro, { cls: string; Icon: typeof Circle }> = {
  Pago: { cls: "bg-emerald-500/15 text-emerald-600", Icon: CheckCircle2 },
  Parcial: { cls: "bg-amber-500/15 text-amber-600", Icon: CircleDot },
  Pendente: { cls: "bg-slate-500/15 text-slate-600", Icon: Circle },
  Atrasado: { cls: "bg-red-500/15 text-red-600", Icon: AlertCircle },
};

/** Legenda de status padrão do financeiro: Pago, Parcial, Pendente, Atrasado. */
export function StatusFinanceiroBadge({ status }: { status: StatusFinanceiro }) {
  const { cls, Icon } = ESTILO[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      <Icon className="h-3 w-3" />
      {status}
    </span>
  );
}

export function LegendaStatusFinanceiro() {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]">
      <span className="font-semibold">Legenda:</span>
      {(["Pago", "Parcial", "Pendente", "Atrasado"] as StatusFinanceiro[]).map((s) => (
        <StatusFinanceiroBadge key={s} status={s} />
      ))}
    </div>
  );
}
