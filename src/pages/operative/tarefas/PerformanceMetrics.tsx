import { Card } from "../../../components/ui/card";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";

interface PerformanceMetricsProps {
  completionRate: number;
  completedCount: number;
  totalCount: number;
  overdueCount: number;
  openCount: number;
  highPriorityCount: number;
}

export function PerformanceMetrics({
  completionRate,
  completedCount,
  totalCount,
  overdueCount,
  openCount,
  highPriorityCount
}: PerformanceMetricsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
      <Card className="p-3.5 sm:p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/30 hover:shadow-md transition-all flex flex-col justify-between">
        <div>
          <CheckCircle2 className="w-5 h-5 text-emerald-500 mb-2 sm:mb-3" />
          <div className="text-lg sm:text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic">{completionRate}%</div>
          <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">Taxa de Conclusão</div>
        </div>
        <div className="mt-4">
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${completionRate}%` }}></div>
          </div>
          <span className="text-[10px] text-slate-500 mt-1.5 block font-medium">{completedCount} de {totalCount} concluídas</span>
        </div>
      </Card>

      <Card className="p-3.5 sm:p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/30 hover:shadow-md transition-all flex flex-col justify-between">
        <div>
          <Clock className="w-5 h-5 text-rose-500 mb-2 sm:mb-3" />
          <div className="text-lg sm:text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic">{overdueCount}</div>
          <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">Atrasadas / Pendentes</div>
        </div>
        <div className="mt-4 text-[10px] text-slate-500 font-medium">
          Exige atenção imediata de retomada.
        </div>
      </Card>

      <Card className="p-3.5 sm:p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/30 hover:shadow-md transition-all flex flex-col justify-between">
        <div>
          <Clock className="w-5 h-5 text-amber-500 mb-2 sm:mb-3" />
          <div className="text-lg sm:text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic">{openCount}</div>
          <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">Em Aberto / Hoje</div>
        </div>
        <div className="mt-4 text-[10px] text-slate-500 font-medium">
          Sincronizadas com agenda interna.
        </div>
      </Card>

      <Card className="p-3.5 sm:p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/30 hover:shadow-md transition-all flex flex-col justify-between">
        <div>
          <AlertTriangle className="w-5 h-5 text-rose-500 mb-2 sm:mb-3" />
          <div className="text-lg sm:text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic">{highPriorityCount}</div>
          <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">Urgente Alta Prioridade</div>
        </div>
        <div className="mt-4 text-[10px] text-rose-400/80 font-semibold uppercase tracking-wider">
          Prioridade máxima!
        </div>
      </Card>
    </div>
  );
}
