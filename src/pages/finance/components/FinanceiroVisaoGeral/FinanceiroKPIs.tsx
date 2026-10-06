import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight, Minus, type LucideIcon } from "lucide-react";
import { useLocalization } from "../../../../contexts/LocalizationContext";
import { Sparkline } from "../../../../components/ui/sparkline";
import { cn } from "../../../../lib/utils";

export type FinanceiroKpiTone = "green" | "blue" | "rose" | "violet" | "amber" | "sky" | "red";

export interface FinanceiroKpiCard {
  label: string;
  value: number;
  format: "currency" | "percent";
  /** Variação percentual vs. o mês anterior. `null` = sem base de comparação (mês anterior zerado). */
  deltaPct: number | null;
  /** Quando a alta do indicador é boa (receita) ou ruim (despesa/vencido). `null` = delta neutro, sem cor. */
  deltaGoodWhenUp: boolean | null;
  /** Colore o próprio valor de vermelho quando negativo/crítico (ex: resultado negativo, vencido > 0). */
  danger?: boolean;
  count?: number;
  icon: LucideIcon;
  href: string;
  tone?: FinanceiroKpiTone;
  /** Série real dos últimos meses (mais antigo → atual); omitida quando não existe histórico confiável. */
  series?: number[];
  /** "bars" = mini colunas (fluxos mensais); "line" = linha (saldos acumulados). */
  chart?: "bars" | "line";
  /** Texto do rodapé quando não há delta (ex.: "sem histórico mensal"). */
  note?: string;
}

// Mesmo padrão dos cards do Dashboard (QuickStatsGrid): ícone solto colorido em rotação,
// variação no canto, valor grande em itálico e gráfico verde/vermelho conforme a tendência.
const ICON_COLORS = ["text-[var(--color-primary-blue)]", "text-emerald-500", "text-cyan-500", "text-rose-500"];

function DeltaTop({ deltaPct, deltaGoodWhenUp }: { deltaPct: number | null; deltaGoodWhenUp: boolean | null }) {
  if (deltaPct === null) {
    return <span className="text-[9px] font-bold text-[var(--color-text-faint)] uppercase text-right leading-tight">Sem base<br />p/ comparação</span>;
  }
  const isUp = deltaPct > 0;
  const isFlat = Math.abs(deltaPct) < 0.05;
  const isGood = deltaGoodWhenUp === null ? null : deltaGoodWhenUp === isUp;
  const colorClass = isFlat || isGood === null
    ? "text-[var(--color-text-faint)]"
    : isGood
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
  const Icon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("text-xs font-bold flex items-center gap-0.5 tabular-nums", colorClass)}>
      {isUp ? "+" : ""}{deltaPct.toFixed(1)}% <Icon className="w-3.5 h-3.5" />
    </span>
  );
}

export function FinanceiroKPIs({ cards }: { cards: FinanceiroKpiCard[] }) {
  const { formatCurrency } = useLocalization();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((kpi, i) => {
        const Icon = kpi.icon;
        const displayValue = kpi.format === "percent" ? `${kpi.value.toFixed(1)}%` : formatCurrency(kpi.value);
        const valueColor = kpi.danger && kpi.value !== 0 ? "text-rose-500" : "text-[var(--color-text-primary)]";
        const up = (kpi.deltaPct ?? 0) > 0;
        const good = kpi.deltaGoodWhenUp === null ? null : kpi.deltaGoodWhenUp === up;
        const sparkColor = kpi.deltaPct === null || Math.abs(kpi.deltaPct) < 0.05 || good === null
          ? "text-[var(--color-text-faint)]"
          : good ? "text-emerald-500" : "text-rose-500";
        const temSerie = !!kpi.series && kpi.series.length >= 2;
        return (
          <Link key={kpi.label} to={kpi.href} className="group block">
            <div className="h-full p-5 rounded-[var(--radius-panel)] bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/40 transition-all shadow-sm group-hover:-translate-y-0.5 group-hover:shadow-md">
              <div className="flex items-center justify-between mb-3">
                <Icon className={cn("w-5 h-5", ICON_COLORS[i % ICON_COLORS.length])} />
                <DeltaTop deltaPct={kpi.deltaPct} deltaGoodWhenUp={kpi.deltaGoodWhenUp} />
              </div>
              <div className={cn("text-2xl font-display font-black mb-1 italic", valueColor)}>
                {displayValue}
                {typeof kpi.count === "number" && (
                  <span className="text-xs font-medium not-italic text-[var(--color-text-faint)] ml-1.5">({kpi.count})</span>
                )}
              </div>
              <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">{kpi.label}</div>
              <div className="flex items-center justify-between mt-1 gap-2">
                <span className="text-[10px] text-[var(--color-text-faint)] font-medium">{kpi.note ?? "vs. mês anterior"}</span>
                {temSerie && <Sparkline data={kpi.series!} className={cn("w-16 h-5 shrink-0", sparkColor)} />}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
