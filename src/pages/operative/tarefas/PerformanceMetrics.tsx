import React from "react";
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
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="p-6 bg-[var(--color-surface-elevated)]/50 border hover:border-white/10 border-white/5 backdrop-blur-md transition-all flex flex-col justify-between">
        <div>
          <CheckCircle2 className="w-5 h-5 text-emerald-500 mb-4" />
          <div className="text-2xl font-display font-black text-white mb-1 italic">{completionRate}%</div>
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Taxa de Conclusão</div>
        </div>
        <div className="mt-4">
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${completionRate}%` }}></div>
          </div>
          <span className="text-[10px] text-slate-500 mt-1.5 block font-medium">{completedCount} de {totalCount} concluídas</span>
        </div>
      </Card>

      <Card className="p-6 bg-[var(--color-surface-elevated)]/50 border hover:border-white/10 border-white/5 backdrop-blur-md transition-all flex flex-col justify-between">
        <div>
          <Clock className="w-5 h-5 text-rose-500 mb-4" />
          <div className="text-2xl font-display font-black text-white mb-1 italic">{overdueCount}</div>
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Atrasadas / Pendentes</div>
        </div>
        <div className="mt-4 text-[10px] text-slate-500 font-medium">
          Exige atenção imediata de follow-up.
        </div>
      </Card>

      <Card className="p-6 bg-[var(--color-surface-elevated)]/50 border hover:border-white/10 border-white/5 backdrop-blur-md transition-all flex flex-col justify-between">
        <div>
          <Clock className="w-5 h-5 text-amber-500 mb-4" />
          <div className="text-2xl font-display font-black text-white mb-1 italic">{openCount}</div>
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Em Aberto / Hoje</div>
        </div>
        <div className="mt-4 text-[10px] text-slate-500 font-medium">
          Sincronizadas com agenda interna.
        </div>
      </Card>

      <Card className="p-6 bg-[var(--color-surface-elevated)]/50 border hover:border-white/10 border-white/5 backdrop-blur-md transition-all flex flex-col justify-between">
        <div>
          <AlertTriangle className="w-5 h-5 text-rose-500 mb-4" />
          <div className="text-2xl font-display font-black text-white mb-1 italic">{highPriorityCount}</div>
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Urgente Alta Prioridade</div>
        </div>
        <div className="mt-4 text-[10px] text-rose-400/80 font-semibold uppercase tracking-wider">
          Prioridade máxima!
        </div>
      </Card>
    </div>
  );
}
