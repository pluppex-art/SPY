import { gradeLg } from "../../../../lib/gridCols";
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
    <div className={`grid grid-cols-2 ${gradeLg(stats.length)} gap-3 mb-6`}>
      {stats.map((stat, i) => {
        const Icon = stat.icon;
        const color = stat.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length];
        return (
          <Card
            key={i}
            onClick={stat.drill ? () => setDrillIndex(i) : undefined}
            className={`p-3.5 sm:p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/30 hover:shadow-md transition-all ${stat.drill ? "cursor-pointer hover:-translate-y-0.5" : ""}`}
          >
            <Icon className={`w-5 h-5 ${color} mb-2 sm:mb-3`} />
            <div className="text-lg sm:text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic">{stat.value}</div>
            <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">{stat.label}</div>
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

