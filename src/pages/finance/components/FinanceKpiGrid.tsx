import type { ReactNode } from "react";
import { ArrowUpRight, ArrowDownRight, Minus, type LucideIcon } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { Sparkline } from "../../../components/ui/sparkline";
import { cn } from "../../../lib/utils";

export interface FinanceKpi {
  label: string;
  value: ReactNode;
  icon: LucideIcon;
  /** Variação % vs. período anterior; `null` = sem base. */
  delta: number | null;
  /** true = alta é boa, false = alta é ruim, null = neutro. */
  goodUp: boolean | null;
  series: number[];
  /** Sufixo do delta (padrão "%"; use " p.p." para pontos percentuais). */
  deltaSuffix?: string;
  /** Texto do rodapé (esquerda). */
  footer?: string;
  /** Esconde o texto "sem período p/ comparação" quando não faz sentido comparar. */
  hideDelta?: boolean;
  danger?: boolean;
  onClick?: () => void;
}

const ICON_COLORS = ["text-[var(--color-primary-blue)]", "text-emerald-500", "text-cyan-500", "text-rose-500"];
const BAR_COLORS = ["var(--color-primary-blue)", "#10b981", "#06b6d4", "#f43f5e"];

/**
 * Modelo único dos cards de KPI das telas do Financeiro (mesmo tamanho, organização e cores do
 * Dashboard): ícone solto, variação no canto, valor em itálico, rótulo e gráfico mensal.
 * Cada página passa os seus próprios indicadores.
 */
export function FinanceKpiGrid({ cards }: { cards: FinanceKpi[]; noDeltaLabel?: string }) {
  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
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
              "relative min-w-0 overflow-hidden py-3.5 pl-5 pr-4 transition-all",
              k.onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-md"
            )}
          >
            <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: k.danger ? "#f43f5e" : BAR_COLORS[i % BAR_COLORS.length] }} />
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
                <Icon className={cn("h-3.5 w-3.5 shrink-0", ICON_COLORS[i % ICON_COLORS.length])} />
                <span className="truncate">{k.label}</span>
              </div>
              {!k.hideDelta && k.delta !== null && (
                <span className={cn("flex shrink-0 items-center gap-0.5 text-xs font-bold tabular-nums", deltaColor)}>
                  {up ? "+" : ""}{k.delta.toFixed(1)}{k.deltaSuffix ?? "%"} <DIcon className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <div className={cn("mt-1.5 truncate text-xl font-black tabular-nums leading-tight sm:text-2xl", k.danger ? "text-rose-600" : "text-[var(--color-text-primary)]")}>{k.value}</div>
            <div className="mt-0.5 flex min-h-[1.25rem] items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs text-[var(--color-text-muted)]">{k.footer ?? ""}</span>
              {k.series.length >= 2 && <Sparkline data={k.series} className={cn("h-5 w-16 shrink-0", sparkColor)} />}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
