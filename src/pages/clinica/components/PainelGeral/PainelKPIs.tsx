import type { ComponentType } from 'react';
import { useState } from 'react';
import { Card } from "../../../../components/ui/card";
import { DrillDownPanel, type DrillColumn } from "../../../../components/ui/DrillDownPanel";

interface Stat {
  label: string;
  value: string;
  trend: string | null;
  icon: ComponentType<{ className?: string }>;
  color: string;
  bg: string;
  /** Lista real por trás do número — card fica clicável e abre um
   * drill-down. Ausente = card sem lista 1:1 (ex.: vem de cache do servidor
   * sem array local equivalente), nunca fica clicável sem dado real. */
  drill?: { subtitle?: string; rows: any[]; columns: DrillColumn[] };
}

interface PainelKPIsProps { stats: Stat[]; }

const ICON_COLORS = ["text-indigo-500", "text-emerald-500", "text-blue-500", "text-rose-500", "text-amber-500", "text-cyan-500", "text-purple-500"];

export function PainelKPIs({ stats }: PainelKPIsProps) {
  const [drillIndex, setDrillIndex] = useState<number | null>(null);
  const drillStat = drillIndex !== null ? stats[drillIndex] : null;
  return (
    <>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat, i) => (
        <Card
          key={i}
          onClick={stat.drill ? () => setDrillIndex(i) : undefined}
          className={`p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-blue-500/30 hover:shadow-md transition-all ${stat.drill ? "cursor-pointer hover:-translate-y-0.5" : ""}`}
        >
          <stat.icon className={`w-5 h-5 ${ICON_COLORS[i % ICON_COLORS.length]} mb-4`} />
          <div className="text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic">{stat.value}</div>
          <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">{stat.label}</div>
          {stat.trend && (
            <div className={`text-xs mt-1 ${stat.trend.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>
              {stat.trend}
            </div>
          )}
        </Card>
      ))}
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
