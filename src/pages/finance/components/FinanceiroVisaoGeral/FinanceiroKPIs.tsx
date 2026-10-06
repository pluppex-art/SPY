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

const TONES: Record<FinanceiroKpiTone, { tile: string; color: string; card: string }> = {
  green:  { tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", color: "#10b981", card: "" },
  blue:   { tile: "bg-blue-500/10 text-blue-600 dark:text-blue-400",          color: "#3b82f6", card: "" },
  rose:   { tile: "bg-rose-500/10 text-rose-600 dark:text-rose-400",          color: "#f43f5e", card: "bg-rose-500/[0.03]" },
  violet: { tile: "bg-violet-500/10 text-violet-600 dark:text-violet-400",    color: "#8b5cf6", card: "" },
  amber:  { tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400",       color: "#f59e0b", card: "" },
  sky:    { tile: "bg-sky-500/10 text-sky-600 dark:text-sky-400",             color: "#0ea5e9", card: "" },
  red:    { tile: "bg-red-500/10 text-red-600 dark:text-red-400",             color: "#ef4444", card: "bg-red-500/[0.03]" },
};

function MiniBars({ data }: { data: number[] }) {
  const max = Math.max(...data.map((v) => Math.abs(v)), 1);
  return (
    <div className="flex items-end gap-[3px] h-9 w-20" aria-hidden="true">
      {data.map((v, i) => (
        <span
          key={i}
          className="flex-1 rounded-sm bg-current"
          style={{ height: `${Math.max(8, (Math.abs(v) / max) * 100)}%`, opacity: 0.35 + (0.65 * (i + 1)) / data.length }}
        />
      ))}
    </div>
  );
}

function DeltaBadge({ deltaPct, deltaGoodWhenUp, note }: { deltaPct: number | null; deltaGoodWhenUp: boolean | null; note?: string }) {
  if (deltaPct === null) {
    return <span className="text-[11px] font-medium text-[var(--color-text-faint)]">{note ?? "Sem base no mês anterior"}</span>;
  }
  const isUp = deltaPct > 0;
  const isFlat = Math.abs(deltaPct) < 0.05;
  const isGood = deltaGoodWhenUp === null ? null : deltaGoodWhenUp === isUp;
  const colorClass = isFlat || isGood === null
    ? "text-[var(--color-text-muted)]"
    : isGood
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-500";
  const Icon = isFlat ? Minus : isUp ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums", colorClass)}>
      <Icon className="w-3 h-3" />
      {isUp ? "+" : ""}{deltaPct.toFixed(0)}% <span className="font-normal text-[var(--color-text-faint)]">vs. mês anterior</span>
    </span>
  );
}

export function FinanceiroKPIs({ cards }: { cards: FinanceiroKpiCard[] }) {
  const { formatCurrency } = useLocalization();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {cards.map((kpi) => {
        const Icon = kpi.icon;
        const tone = TONES[kpi.tone ?? "blue"];
        const displayValue = kpi.format === "percent" ? `${kpi.value.toFixed(1)}%` : formatCurrency(kpi.value);
        const valueColor = kpi.danger && kpi.value !== 0 ? "text-rose-500" : "text-[var(--color-text-primary)]";
        return (
          <Link key={kpi.label} to={kpi.href} className="group block">
            <div className={cn(
              "h-full rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-4 shadow-sm transition-all group-hover:shadow-md group-hover:border-[var(--color-primary-blue)]/30",
              tone.card
            )}>
              <div className="flex items-start gap-3">
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", tone.tile)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--color-text-muted)] truncate">{kpi.label}</p>
                  <p className={cn("text-xl font-black tabular-nums tracking-tight leading-tight mt-0.5", valueColor)}>
                    {displayValue}
                    {typeof kpi.count === "number" && (
                      <span className="text-xs font-medium text-[var(--color-text-faint)] ml-1.5">({kpi.count})</span>
                    )}
                  </p>
                </div>
                {kpi.series && kpi.series.length >= 2 && (
                  <div className="shrink-0 pt-1" style={{ color: tone.color }}>
                    {kpi.chart === "line" ? <Sparkline data={kpi.series} className="w-20 h-9" /> : <MiniBars data={kpi.series} />}
                  </div>
                )}
              </div>
              <div className="mt-3">
                <DeltaBadge deltaPct={kpi.deltaPct} deltaGoodWhenUp={kpi.deltaGoodWhenUp} note={kpi.note} />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
