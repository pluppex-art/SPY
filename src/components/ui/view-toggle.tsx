import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";

/** Botões do cabeçalho das telas de quadro (mesmo tamanho e letra em todas). */
export const HEADER_BUTTON = "w-full md:w-auto h-9 md:h-10 px-4 gap-1.5 text-[11px] md:text-[10px] font-bold uppercase tracking-wider";
export const HEADER_PRIMARY_BUTTON = "w-full md:w-auto h-12 md:h-10 px-5 gap-1.5 text-[11px] md:text-[10px] font-bold uppercase tracking-wider shadow-xs";
/** Linha dos botões do cabeçalho: empilha no celular, uma linha no desktop. */
export const HEADER_ACTIONS = "flex flex-col md:flex-row md:items-center gap-2 shrink-0 w-full md:w-auto";

/** Seletor de visão (Lista/Kanban, Quadro/Calendário…), o mesmo da Central de Vendas. */
export function ViewToggle<T extends string>({ value, onChange, options, className }: {
  value: T;
  onChange: (v: NoInfer<T>) => void;
  options: readonly { id: NoInfer<T>; label: string; icon?: LucideIcon }[];
  className?: string;
}) {
  return (
    <div className={cn("self-center md:self-auto shrink-0 flex items-center bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] h-8 md:h-10", className)}>
      {options.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          aria-pressed={value === id}
          className={cn(
            "relative before:content-[''] before:absolute before:inset-x-0 before:-inset-y-1 md:before:hidden first:rounded-l-[calc(var(--radius-control)-1px)] last:rounded-r-[calc(var(--radius-control)-1px)] flex items-center justify-center gap-1.5 px-4 md:px-3.5 h-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border-none",
            value === id ? "bg-[var(--color-primary-blue)] !text-white shadow-xs" : "bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
          )}
        >
          {Icon && <Icon className="w-3.5 h-3.5" />} {label}
        </button>
      ))}
    </div>
  );
}
