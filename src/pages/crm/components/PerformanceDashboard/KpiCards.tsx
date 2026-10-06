import { useState } from "react";
import { Card } from "../../../../components/ui/card";
import { DrillDownPanel, type DrillColumn } from "../../../../components/ui/DrillDownPanel";

const DEFAULT_COLORS = ["text-indigo-500", "text-emerald-500", "text-blue-500", "text-amber-500"];

export function KpiCards(props: {
  stats: Array<{
    label: string;
    value: string | number;
    icon: React.ComponentType<any>;
    color?: string;
    /** Lista real por trás do número — card fica clicável e abre um
     * drill-down com essa lista. Ausente = card sem lista 1:1 (ex.: médias/%),
     * nunca fica clicável sem ter nada real pra mostrar. */
    drill?: { subtitle?: string; rows: any[]; columns: DrillColumn[] };
  }>;
}) {
  const { stats } = props;
  const [drillIndex, setDrillIndex] = useState<number | null>(null);
  const drillStat = drillIndex !== null ? stats[drillIndex] : null;
  return (
    <>
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        const color = stat.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
        return (
          <Card
            key={i}
            onClick={stat.drill ? () => setDrillIndex(i) : undefined}
            className={`p-6 bg-[var(--color-surface-elevated)]/50 border hover:border-white/10 border-white/5 backdrop-blur-md transition-all ${stat.drill ? "cursor-pointer hover:-translate-y-0.5" : ""}`}
          >
            <Icon className={`w-5 h-5 ${color} mb-4`} />
            <div className="text-2xl font-display font-black text-white mb-1 italic">{stat.value}</div>
            <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</div>
          </Card>
        );
      })}
    </div>
    <DrillDownPanel
      isOpen={drillStat !== null}
      onClose={() => setDrillIndex(null)}
      title={drillStat?.label}
      subtitle={drillStat?.drill?.subtitle}
      rows={drillStat?.drill?.rows || []}
      columns={drillStat?.drill?.columns || []}
    />
    </>
  );
}

