import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { cn } from "../../../lib/utils";

export type TomKpi = "neutro" | "bom" | "ruim" | "atencao";

const FAIXA: Record<TomKpi, string> = {
  neutro: "bg-[var(--color-primary-blue)]",
  bom: "bg-emerald-500",
  ruim: "bg-rose-500",
  atencao: "bg-amber-500",
};
const VALOR: Record<TomKpi, string> = {
  neutro: "text-[var(--color-text-primary)]",
  bom: "text-emerald-600",
  ruim: "text-rose-600",
  atencao: "text-amber-600",
};

/** Indicador do Financeiro: faixa colorida na lateral, rótulo, número grande e uma linha de apoio. Clicável se tiver `to`. */
export function KpiTile({
  label,
  value,
  icon: Icon,
  apoio,
  tom = "neutro",
  to,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  apoio?: string;
  tom?: TomKpi;
  to?: string;
}) {
  const corpo = (
    <Card className={cn("relative h-full overflow-hidden py-3.5 pl-5 pr-4 transition-all", to && "hover:-translate-y-0.5 hover:shadow-md")}>
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1.5", FAIXA[tom])} />
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <p className={cn("mt-1.5 whitespace-nowrap text-xl font-black tabular-nums leading-tight sm:text-2xl", VALOR[tom])}>{value}</p>
      {apoio && <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">{apoio}</p>}
    </Card>
  );
  return to ? <Link to={to} className="block min-w-0">{corpo}</Link> : <div className="min-w-0">{corpo}</div>;
}

/** Linha de indicadores: 2 colunas no celular, 4 no computador. */
export function KpiLinha({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">{children}</div>;
}
