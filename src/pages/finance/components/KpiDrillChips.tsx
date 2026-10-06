import { ListFilter } from "lucide-react";

/**
 * Atalhos "Detalhar" para o card KPIs & Filtros: os KPIs do card não são
 * clicáveis, então os drill-downs que antes abriam ao clicar numa StatCell
 * ficam como botões logo abaixo da barra de filtros (mesmo painel, mesmas linhas).
 */
export function KpiDrillChips({ items }: { items: { label: string; onClick: () => void }[] }) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 print:hidden">
      <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
        <ListFilter className="w-3 h-3" /> Detalhar
      </span>
      {items.map(it => (
        <button
          key={it.label}
          type="button"
          onClick={it.onClick}
          className="px-2.5 py-1 text-[11px] font-medium rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-primary-blue)] cursor-pointer transition-colors"
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
