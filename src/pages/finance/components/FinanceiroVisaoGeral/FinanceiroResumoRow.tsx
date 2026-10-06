import { Link } from "react-router-dom";
import { Card } from "../../../../components/ui/card";
import { ArrowUpRight, ArrowDownRight, TrendingUp, Wallet, AlertCircle, Clock, Repeat2, CheckCircle2, type LucideIcon } from "lucide-react";
import { useLocalization } from "../../../../contexts/LocalizationContext";
import { cn } from "../../../../lib/utils";

export interface ResumoLinha {
  label: string;
  value: number;
  tone: "green" | "rose" | "violet" | "blue";
  deltaPct: number | null;
  /** Rótulo opcional abaixo do valor (ex.: "(30d)"). */
  hint?: string;
  strong?: boolean;
}

export interface ProximoItem {
  id: string;
  label: string;
  value: number;
  dateLabel: string;
  type: "pagar" | "receber";
  overdue?: boolean;
}

export interface AtencaoItem {
  tone: "danger" | "warning" | "info" | "neutral";
  title: string;
  detail: string;
  href: string;
  /** Número de destaque no ícone (ex.: contas vencidas). */
  badge?: number;
}

const ROW_TONE = {
  green: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: ArrowUpRight },
  rose: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", icon: ArrowDownRight },
  violet: { bg: "bg-violet-500/10", text: "text-violet-600 dark:text-violet-400", icon: TrendingUp },
  blue: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", icon: Wallet },
} as const;

const ATENCAO_TONE: Record<AtencaoItem["tone"], { bg: string; text: string; icon: LucideIcon }> = {
  danger: { bg: "bg-rose-500/10", text: "text-rose-600 dark:text-rose-400", icon: AlertCircle },
  warning: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", icon: Clock },
  info: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", icon: Repeat2 },
  neutral: { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", icon: CheckCircle2 },
};

function Pct({ value, goodWhenUp }: { value: number | null; goodWhenUp: boolean }) {
  if (value === null) return <span className="text-[11px] text-[var(--color-text-faint)] w-14 text-right">—</span>;
  const up = value >= 0;
  const good = up === goodWhenUp;
  return (
    <span className={cn("text-[11px] font-bold tabular-nums w-14 text-right flex items-center justify-end gap-0.5", Math.abs(value) < 0.5 ? "text-[var(--color-text-muted)]" : good ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500")}>
      {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{Math.abs(value).toFixed(0)}%
    </span>
  );
}

interface Props {
  mesLabel: string;
  resumo: ResumoLinha[];
  proximos: ProximoItem[];
  atencao: AtencaoItem[];
  liquidez: number | null;
  burnRate: number;
}

/** Linha inferior do painel: Resumo do Mês, Próximos 7 dias e Atenção. */
export function FinanceiroResumoRow({ mesLabel, resumo, proximos, atencao, liquidez, burnRate }: Props) {
  const { formatCurrency } = useLocalization();

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      <Card className="p-5 rounded-2xl">
        <h3 className="text-sm font-black text-[var(--color-text-primary)] mb-1">Resumo do Mês</h3>
        <p className="text-[11px] text-[var(--color-text-muted)] mb-3">{mesLabel}</p>
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {resumo.map((r) => {
            const t = ROW_TONE[r.tone];
            const Icon = t.icon;
            return (
              <div key={r.label} className="flex items-center gap-3 py-2.5">
                <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", t.bg, t.text)}><Icon className="w-4 h-4" /></span>
                <span className="flex-1 min-w-0 text-xs text-[var(--color-text-muted)] truncate">{r.label}{r.hint && <span className="text-[var(--color-text-faint)]"> {r.hint}</span>}</span>
                <span className={cn("text-xs tabular-nums", r.strong ? "font-black text-[var(--color-text-primary)]" : "font-semibold text-[var(--color-text-primary)]", r.value < 0 && "text-rose-500")}>{formatCurrency(r.value)}</span>
                <Pct value={r.deltaPct} goodWhenUp={r.tone !== "rose"} />
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-[var(--color-border-subtle)]">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Liquidez do mês</p>
            <p className="text-sm font-black tabular-nums text-[var(--color-text-primary)]">{liquidez !== null ? `${liquidez.toFixed(0)}%` : "—"}</p>
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Queima de caixa</p>
            <p className={cn("text-sm font-black tabular-nums", burnRate > 0 ? "text-rose-500" : "text-[var(--color-text-primary)]")}>{formatCurrency(burnRate)}</p>
          </div>
        </div>
      </Card>

      <Card className="p-5 rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-[var(--color-text-primary)]">Próximos 7 dias</h3>
          <Link to="/app/financeiro/transacoes" className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-[var(--color-border-default)] text-[var(--color-primary-blue)] hover:bg-[var(--color-surface-sunken)]">Ver todos</Link>
        </div>
        {proximos.length === 0 ? (
          <div className="py-10 text-center text-xs text-[var(--color-text-faint)] border border-dashed border-[var(--color-border-subtle)] rounded-xl">Nenhum vencimento nos próximos 7 dias.</div>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {proximos.map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2.5">
                <span className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", p.overdue ? "bg-rose-500/10 text-rose-500" : p.type === "receber" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/10 text-rose-600 dark:text-rose-400")}>
                  {p.overdue ? <AlertCircle className="w-4 h-4" /> : p.type === "receber" ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                </span>
                <span className="flex-1 min-w-0 text-xs font-medium text-[var(--color-text-primary)] truncate">{p.label}</span>
                <span className="text-xs font-semibold tabular-nums text-[var(--color-text-primary)]">{formatCurrency(p.value)}</span>
                <span className="text-[11px] text-[var(--color-text-faint)] w-11 text-right">{p.dateLabel}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5 rounded-2xl">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-black text-[var(--color-text-primary)]">Atenção</h3>
          <Link to="/app/financeiro/inadimplencia" className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-[var(--color-border-default)] text-[var(--color-primary-blue)] hover:bg-[var(--color-surface-sunken)]">Ver todos</Link>
        </div>
        <div className="space-y-3">
          {atencao.map((a, i) => {
            const t = ATENCAO_TONE[a.tone];
            const Icon = t.icon;
            return (
              <Link key={i} to={a.href} className="flex items-start gap-3 group">
                <span className={cn("w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-black", t.bg, t.text)}>
                  {typeof a.badge === "number" ? a.badge : <Icon className="w-4 h-4" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-bold text-[var(--color-text-primary)] group-hover:underline">{a.title}</span>
                  <span className="block text-[11px] text-[var(--color-text-muted)]">{a.detail}</span>
                </span>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
