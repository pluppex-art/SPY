import React from 'react';
import { Card } from '../../../components/ui/card';
import { motion } from 'motion/react';
import { ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';
import { Sparkline } from '../../../components/ui/sparkline';

interface QuickStatsGridProps {
  stats: any[];
  /** Período efetivo dos números acima (ex.: "Todo o período" ou "01/09 – 23/09") — mostrado no lugar do antigo "Proj: --", que aparecia em todo card sem nunca ter um valor real. */
  periodoLabel?: string;
}

const ICON_COLORS = ["text-[var(--color-primary-blue)]", "text-emerald-500", "text-cyan-500", "text-rose-500"];

export function QuickStatsGrid({ stats, periodoLabel }: QuickStatsGridProps) {
  return (
    <motion.div
      key="stats-grid"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
    >
      {stats.map((stat, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08 }}
        >
          <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/40 transition-all shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <stat.icon className={`w-5 h-5 ${ICON_COLORS[i % ICON_COLORS.length]}`} />
              {/* Achado de UX 2026-09-21: `trend` sem valor real (nichos que ainda
                  não calculam variação) chegava aqui como "--", que não começa
                  com "+" e caía sempre no ramo "queda" — todo cliente via uma
                  seta vermelha ao lado do próprio KPI, mesmo sem dado nenhum.
                  Agora mostra explicitamente "Sem dados p/ comparação" em vez
                  de inventar uma variação ou esconder o campo. */}
              {stat.trend && stat.trend !== '--' ? (
                stat.trend.startsWith('+') || stat.trend.startsWith('-') ? (
                  <span className={`text-xs font-bold flex items-center gap-0.5 ${stat.trend.startsWith('+') ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {stat.trend} {stat.trend.startsWith('+') ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                  </span>
                ) : (
                  // "0%" — trend real, mas sem variação (nem alta nem queda): nenhuma seta faz
                  // sentido aqui, então mostra só o número, neutro.
                  <span className="text-xs font-bold text-[var(--color-text-faint)]">{stat.trend}</span>
                )
              ) : (
                <span className="text-[9px] font-bold text-[var(--color-text-faint)] uppercase text-right">Sem dados<br />p/ comparação</span>
              )}
            </div>
            <div className="text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic">
              {stat.value}
            </div>
            <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider flex items-center gap-1">
              {stat.label}
              {stat.tooltip && (
                <Info className="w-3 h-3 text-[var(--color-text-faint)] shrink-0" aria-label={stat.tooltip}>
                  <title>{stat.tooltip}</title>
                </Info>
              )}
            </div>
            <div className="flex items-center justify-between mt-1 gap-2">
              <span className="text-[10px] text-[var(--color-text-faint)] font-medium">
                {periodoLabel || "—"}
              </span>
              {stat.sparkline && stat.sparkline.length >= 2 && (
                <Sparkline
                  data={stat.sparkline}
                  className={`w-16 h-5 shrink-0 ${
                    stat.trend?.startsWith('+') ? 'text-emerald-500' : stat.trend?.startsWith('-') ? 'text-rose-500' : 'text-[var(--color-text-faint)]'
                  }`}
                />
              )}
            </div>
          </Card>
        </motion.div>
      ))}
    </motion.div>
  );
}
