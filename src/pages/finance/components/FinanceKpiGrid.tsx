import { ArrowUpRight, ArrowDownRight, Minus, type LucideIcon } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { Sparkline } from "../../../components/ui/sparkline";
import { cn } from "../../../lib/utils";

export interface FinanceKpi {
  label: string;
  value: string;
  icon: LucideIcon;
  /** Variação % vs. período anterior; `null` = sem base. */
  delta: number | null;
  /** true = alta é boa, false = alta é ruim, null = neutro. */
  goodUp: boolean | null;
  series: number[];
  /** Texto do rodapé (esquerda). */
  footer?: string;
  /** Esconde o texto "sem período p/ comparação" quando não faz sentido comparar. */
  hideDelta?: boolean;
  danger?: boolean;
  onClick?: () => void;
}

const ICON_COLORS = ["text-[var(--color-primary-blue)]", "text-emerald-500", "text-cyan-500", "text-rose-500"];

/**
 * Modelo único dos cards de KPI das telas do Financeiro (mesmo tamanho, organização e cores do
 * Dashboard): ícone solto, variação no canto, valor em itálico, rótulo e gráfico mensal.
 * Cada página passa os seus próprios indicadores.
 */
export function FinanceKpiGrid({ cards, noDeltaLabel = "Sem período p/ comparação" }: { cards: FinanceKpi[]; noDeltaLabel?: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((k, i) => {
        const Icon = k.icon;
        const up = (k.delta ?? 0) > 0;
        const flat = k.delta !== null && Math.abs(k.delta) < 0.05;
        const good = k.goodUp === null ? null : k.goodUp === up;
        const neutral = k.delta === null || flat || good === null;
        const deltaColor = neutral ? "text-[var(--color-text-faint)]" : good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
        const sparkColor = neutral ? "text-[var(--color-text-faint)]" : good ? "text-emerald-500" : "text-rose-500";
        const DIcon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight;
        return (
          <Card
            key={k.label}
            onClick={k.onClick}
            className={cn(
              "p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/40 transition-all shadow-sm",
              k.onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <Icon className={cn("w-5 h-5", ICON_COLORS[i % ICON_COLORS.length])} />
              {k.hideDelta ? <span /> : k.delta === null ? (
                <span className="text-[9px] font-bold text-[var(--color-text-faint)] uppercase text-right leading-tight">{noDeltaLabel}</span>
              ) : (
                <span className={cn("text-xs font-bold flex items-center gap-0.5 tabular-nums", deltaColor)}>
                  {up ? "+" : ""}{k.delta.toFixed(1)}% <DIcon className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
            <div className={cn("text-2xl font-display font-black mb-1 italic whitespace-nowrap", k.danger ? "text-rose-500" : "text-[var(--color-text-primary)]")}>{k.value}</div>
            <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">{k.label}</div>
            <div className="flex items-center justify-between mt-1 gap-2">
              <span className="text-[10px] text-[var(--color-text-faint)] font-medium">{k.footer ?? ""}</span>
              {k.series.length >= 2 && <Sparkline data={k.series} className={cn("w-16 h-5 shrink-0", sparkColor)} />}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
