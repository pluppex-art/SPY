import React, { useState } from 'react';
import { StatCard } from '../../../components/ui/stat-card';
import { motion } from 'motion/react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Sparkline } from '../../../components/ui/sparkline';
import { DrillDownPanel } from '../../../components/ui/DrillDownPanel';

interface QuickStatsGridProps {
  stats: any[];
  /** Período efetivo dos números acima (ex.: "Todo o período" ou "01/09 – 23/09") — mostrado no lugar do antigo "Proj: --", que aparecia em todo card sem nunca ter um valor real. */
  periodoLabel?: string;
}

const ICON_COLORS = ["var(--color-primary-blue)", "#10b981", "#06b6d4", "#f43f5e"];

export function QuickStatsGrid({ stats, periodoLabel }: QuickStatsGridProps) {
  const [drillIndex, setDrillIndex] = useState<number | null>(null);
  const drillStat = drillIndex !== null ? stats[drillIndex] : null;
  // Nicho Master/default agora tem 5 cards (Receita + Receita MRR separados,
  // ver DashboardStatsByNiche.tsx) — em lg:grid-cols-4 isso deixava o 5º card
  // sozinho numa linha nova, esticado. Classe literal (Tailwind JIT não
  // aceita `lg:grid-cols-${n}` dinâmico) — outros nichos continuam com 4.
  const gridColsClass = stats.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4';
  return (
    <>
    <motion.div
      key="stats-grid"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={`grid grid-cols-1 sm:grid-cols-2 ${gridColsClass} gap-4`}
    >
      {stats.map((stat, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
        >
          <StatCard
            icon={stat.icon}
            label={stat.label}
            hint={stat.tooltip}
            value={stat.value}
            color={ICON_COLORS[i % ICON_COLORS.length]}
            sub={stat.trend && stat.trend !== '--'
              ? <span className={`flex items-center gap-0.5 ${stat.trend.startsWith('+') ? 'text-emerald-600 dark:text-emerald-400' : stat.trend.startsWith('-') ? 'text-rose-600 dark:text-rose-400' : ''}`}>{stat.trend} {stat.trend.startsWith('+') ? <ArrowUpRight className="w-3.5 h-3.5" /> : stat.trend.startsWith('-') ? <ArrowDownRight className="w-3.5 h-3.5" /> : null}</span>
              : 'Sem dados p/ comparação'}
            caption={periodoLabel || "—"}
            onClick={stat.drill ? () => setDrillIndex(i) : undefined}
            footer={stat.sparkline && stat.sparkline.length >= 2 ? (
              <Sparkline
                data={stat.sparkline}
                className={`w-16 h-5 shrink-0 ${stat.trend?.startsWith('+') ? 'text-emerald-500' : stat.trend?.startsWith('-') ? 'text-rose-500' : 'text-[var(--color-text-faint)]'}`}
              />
            ) : undefined}
          />
        </motion.div>
      ))}
    </motion.div>
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
