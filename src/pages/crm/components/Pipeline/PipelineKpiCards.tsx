import { ArrowUpRight, ArrowDownRight, Minus, type LucideIcon } from "lucide-react";
import { Sparkline } from "../../../../components/ui/sparkline";
import { cn } from "../../../../lib/utils";

export interface PipelineKpi {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /** Série real (coorte de leads por mês de cadastro, mais antigo → atual). */
  series: number[];
  /** Variação mês atual vs. anterior; `null` = sem base. */
  delta: number | null;
  /** "pct" = variação percentual; "pp" = pontos percentuais (taxas). */
  deltaUnit: "pct" | "pp";
  tone: "orange" | "rose" | "emerald" | "blue" | "violet";
}

const TONES = {
  orange: { card: "bg-orange-500/[0.05]", tile: "bg-orange-500/10 text-orange-500", color: "#f97316" },
  rose: { card: "bg-rose-500/[0.05]", tile: "bg-rose-500/10 text-rose-500", color: "#f43f5e" },
  emerald: { card: "bg-emerald-500/[0.05]", tile: "bg-emerald-500/10 text-emerald-500", color: "#10b981" },
  blue: { card: "bg-blue-500/[0.05]", tile: "bg-blue-500/10 text-blue-500", color: "#3b82f6" },
  violet: { card: "bg-violet-500/[0.05]", tile: "bg-violet-500/10 text-violet-500", color: "#8b5cf6" },
} as const;

export function PipelineKpiCards({ kpis }: { kpis: PipelineKpi[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
      {kpis.map((k) => {
        const t = TONES[k.tone];
        const Icon = k.icon;
        const flat = k.delta !== null && Math.abs(k.delta) < 0.05;
        const up = (k.delta ?? 0) > 0;
        return (
          <div
            key={k.label}
            className={cn("rounded-2xl border border-[var(--color-border-default)] p-4 shadow-sm", t.card, "bg-[var(--color-surface-elevated)]")}
            style={{ backgroundImage: `linear-gradient(135deg, ${t.color}0D, transparent 60%)` }}
          >
            <div className="flex items-start gap-3">
              <span className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shrink-0", t.tile)}><Icon className="w-6 h-6" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-black uppercase tracking-wider text-[var(--color-text-muted)] truncate">{k.label}</p>
                <p className="text-2xl font-black text-[var(--color-text-primary)] tabular-nums tracking-tight leading-tight truncate">{k.value}</p>
              </div>
            </div>
            <div className="flex items-end justify-between gap-2 mt-3">
              <div className="min-w-0">
                {k.delta === null ? (
                  <p className="text-[11px] text-[var(--color-text-faint)]">sem base no mês anterior</p>
                ) : (
                  <>
                    <p className={cn("text-xs font-bold flex items-center gap-1", flat ? "text-[var(--color-text-muted)]" : up ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500")}>
                      {flat ? <Minus className="w-3 h-3" /> : up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                      {up ? "+" : ""}{k.deltaUnit === "pp" ? `${k.delta.toFixed(1)} p.p.` : `${k.delta.toFixed(0)}%`}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-faint)]" title="Compara os leads cadastrados no mês atual com os do mês anterior (status atual de cada lead)">vs. mês anterior</p>
                  </>
                )}
              </div>
              <div className="w-24 h-10 shrink-0" style={{ color: t.color }}>
                <Sparkline data={k.series} className="w-full h-full" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
