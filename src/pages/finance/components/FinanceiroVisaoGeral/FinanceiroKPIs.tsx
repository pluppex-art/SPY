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

// Padrão único de cores: todos os cards usam a cor primária do tema; só o delta (alta/queda)
// e valores críticos (negativo/vencido) usam cor semântica.
const TILE = "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]";
const SPARK_COLOR = "var(--color-primary-blue)";

function MiniBars({ data }: { data: number[] }) {
  const max = Math.max(...data.map((v) => Math.abs(v)), 1);
  return (
    <div className="flex items-end gap-[3px] h-8 w-20" aria-hidden="true">
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
        const displayValue = kpi.format === "percent" ? `${kpi.value.toFixed(1)}%` : formatCurrency(kpi.value);
        const valueColor = kpi.danger && kpi.value !== 0 ? "text-rose-500" : "text-[var(--color-text-primary)]";
        const temSerie = !!kpi.series && kpi.series.length >= 2;
        return (
          <Link key={kpi.label} to={kpi.href} className="group block">
            <div className="h-full rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-4 shadow-sm transition-all group-hover:shadow-md group-hover:border-[var(--color-primary-blue)]/30">
              <div className="flex items-center gap-3">
                <div className={cn("w-11 h-11 rounded-xl flex items-center justify-center shrink-0", TILE)}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-[var(--color-text-muted)]">{kpi.label}</p>
                  <p className={cn("text-xl font-black tabular-nums tracking-tight leading-tight mt-0.5", valueColor)}>
                    {displayValue}
                    {typeof kpi.count === "number" && (
                      <span className="text-xs font-medium text-[var(--color-text-faint)] ml-1.5">({kpi.count})</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-end justify-between gap-3">
                <DeltaBadge deltaPct={kpi.deltaPct} deltaGoodWhenUp={kpi.deltaGoodWhenUp} note={kpi.note} />
                {temSerie && (
                  <div className="shrink-0" style={{ color: SPARK_COLOR }}>
                    {kpi.chart === "line" ? <Sparkline data={kpi.series!} className="w-20 h-8" /> : <MiniBars data={kpi.series!} />}
                  </div>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
