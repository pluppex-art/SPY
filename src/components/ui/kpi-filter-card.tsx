import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Search, SlidersHorizontal, X, type LucideIcon } from "lucide-react";
import { Card } from "./card";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";

/**
 * Card "KPIs & Filtros" — o mesmo do Pipeline, para todas as páginas.
 *
 * Um único card com cabeçalho clicável (chevron abre/fecha): os KPIs em cima e a barra de filtros
 * embaixo. O estado aberto/fechado fica salvo em users.preferences (`<id>FiltersOpen`), então continua
 * do jeito que a pessoa deixou depois de recarregar. Cada página passa um `id` próprio (ex.: "clientes").
 *
 * Uso:
 *   <KpiFilterCard id="clientes" kpis={[{ label: "Ativos", value: 120, icon: Users, tone: "success" }]}
 *                  activeCount={n} onClear={limpar}>
 *     <FilterBar>
 *       <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar clientes..." />
 *       <FilterSelect icon={MapPin} value={cidade} onChange={setCidade} options={cidades} allLabel="Todas as cidades" />
 *     </FilterBar>
 *   </KpiFilterCard>
 */

export type KpiTone = "primary" | "warning" | "success" | "info" | "accent" | "danger" | "neutral";

export interface KpiItem {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  tone?: KpiTone;
  /** Texto curto de apoio, aparece como tooltip. */
  hint?: string;
}

const TONE_CLASS: Record<KpiTone, string> = {
  primary: "text-[var(--color-primary-blue)]",
  warning: "text-warning",
  success: "text-success",
  info: "text-info",
  accent: "text-accent",
  danger: "text-[var(--color-danger)]",
  neutral: "text-[var(--color-text-muted)]",
};

export function KpiTiles({ items }: { items: KpiItem[] }) {
  if (items.length === 0) return null;
  // Até 5 colunas (como no Pipeline); com mais KPIs a linha quebra.
  const cols = items.length >= 5 ? "md:grid-cols-5" : items.length === 4 ? "md:grid-cols-4" : items.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2";
  return (
    <div className={cn("grid grid-cols-2 gap-2 shrink-0", cols)}>
      {items.map(({ label, value, icon: Icon, tone = "primary", hint }, i) => (
        <Card
          key={label}
          title={hint}
          className={cn(
            "p-4 hover:border-[var(--color-border-default)]/80 transition-all",
            // KPI ímpar na última posição ocupa a linha toda no mobile.
            items.length % 2 === 1 && i === items.length - 1 && "col-span-2 md:col-span-1",
          )}
        >
          {Icon && <Icon className={cn("w-4 h-4 mb-2", TONE_CLASS[tone])} />}
          <div className="text-xl font-display font-black text-[var(--color-text-primary)] mb-1 italic truncate">{value}</div>
          <div className="text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">{label}</div>
        </Card>
      ))}
    </div>
  );
}

interface KpiFilterCardProps {
  /** Identificador da página; vira a chave de preferência `<id>FiltersOpen`. */
  id: string;
  title?: string;
  kpis?: KpiItem[];
  /** A barra de filtros (use <FilterBar> com <FilterSearch>/<FilterSelect>/etc.). */
  children?: ReactNode;
  /** Quantos filtros estão ativos (mostra um selo no cabeçalho e o botão "Limpar"). */
  activeCount?: number;
  onClear?: () => void;
  defaultOpen?: boolean;
  className?: string;
}

export function KpiFilterCard({ id, title = "KPIs & Filtros", kpis = [], children, activeCount = 0, onClear, defaultOpen = true, className }: KpiFilterCardProps) {
  const { user, updatePreferences } = useAuth();
  const prefKey = `${id}FiltersOpen`;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    const saved = user?.preferences?.[prefKey];
    if (typeof saved === "boolean") setOpen(saved);
  }, [user?.preferences, prefKey]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    updatePreferences({ [prefKey]: next });
  };

  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-2 pr-4">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex-1 flex items-center justify-between gap-2 px-4 py-3 border-none bg-transparent cursor-pointer hover:bg-[var(--color-surface-sunken)] transition-colors"
        >
          <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)]">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--color-text-muted)]" />
            {title}
            {activeCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)] text-[10px] font-black normal-case tracking-normal">
                {activeCount} {activeCount === 1 ? "filtro" : "filtros"}
              </span>
            )}
          </span>
          <ChevronDown className={cn("w-4 h-4 text-[var(--color-text-muted)] transition-transform", open && "rotate-180")} />
        </button>
        {activeCount > 0 && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer"
          >
            <X className="w-3 h-3" /> Limpar
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-4 px-4 pb-4">
          <KpiTiles items={kpis} />
          {children}
        </div>
      )}
    </Card>
  );
}

// ─── Peças de filtro (mesmo visual da barra do Pipeline) ────────────────────

/** "model" = padrão visual do Financeiro (controles h-9, cantos arredondados, abas em pílulas) — ver FinanceKpiFilter. */
export const FilterVariantContext = createContext<"default" | "model">("default");

const CONTROL_BOX =
  "flex items-center gap-1.5 bg-[var(--color-surface-elevated)] px-3 rounded-[var(--radius-control)] border border-[var(--color-border-default)] h-[38px] max-w-[200px]";

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center gap-2 shrink-0", className)}>{children}</div>;
}

export function FilterSearch({ value, onChange, placeholder = "Buscar..." }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const model = useContext(FilterVariantContext) === "model";
  return (
    <div className={cn("relative flex-1", model ? "min-w-[220px]" : "min-w-[160px]")}>
      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn("bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] pl-9 pr-3 text-xs text-[var(--color-text-primary)] focus:outline-none w-full", model ? "rounded-lg h-9 placeholder:text-[var(--color-text-faint)] focus:ring-2 focus:ring-[var(--color-primary-blue)]/40" : "rounded-[var(--radius-control)] h-[38px] focus:border-[var(--color-primary-blue)]")}
      />
    </div>
  );
}

export type FilterOption = string | { value: string; label: string };

interface FilterSelectProps {
  value: string;
  onChange: (v: string) => void;
  options: FilterOption[];
  /** Rótulo da opção "todos" (valor ""), ex.: "Todas as cidades". Sem ele, não há opção neutra. */
  allLabel?: string;
  /** Valor que significa "sem filtro". Padrão "" (use "Todos" se a página já usa essa convenção). */
  allValue?: string;
  icon?: LucideIcon;
  title?: string;
}

export function FilterSelect({ value, onChange, options, allLabel, allValue = "", icon: Icon, title }: FilterSelectProps) {
  const model = useContext(FilterVariantContext) === "model";
  return (
    <div className={model ? "flex items-center gap-1.5 bg-[var(--color-surface-elevated)] px-3 rounded-lg border border-[var(--color-border-default)] h-9 max-w-[240px] focus-within:ring-2 focus-within:ring-[var(--color-primary-blue)]/40" : CONTROL_BOX} title={title}>
      {Icon && <Icon className="w-3 h-3 text-[var(--color-text-muted)] shrink-0" />}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-transparent border-none text-[var(--color-text-primary)] focus:outline-none text-xs font-bold cursor-pointer w-full truncate"
      >
        {allLabel !== undefined && <option value={allValue} className="bg-[var(--color-surface-elevated)]">{allLabel}</option>}
        {options.map(o => {
          const v = typeof o === "string" ? o : o.value;
          const l = typeof o === "string" ? o : o.label;
          return <option key={v} value={v} className="bg-[var(--color-surface-elevated)]">{l}</option>;
        })}
      </select>
    </div>
  );
}

/** Grupo de botões (chips) para filtros de poucos valores, ex.: status. */
export function FilterChips({ value, onChange, options, allLabel = "Todos", allValue = "" }: {
  value: string; onChange: (v: string) => void; options: FilterOption[]; allLabel?: string; allValue?: string;
}) {
  const items: { value: string; label: string }[] = [
    { value: allValue, label: allLabel },
    ...options.map(o => (typeof o === "string" ? { value: o, label: o } : o)),
  ];
  const model = useContext(FilterVariantContext) === "model";
  return (
    <div className={model ? "flex items-center gap-2 flex-wrap" : "flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] flex-wrap"}>
      {items.map(o => (
        <button
          key={o.value || "__todos__"}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            model
              ? "px-3 py-2 text-xs font-bold rounded-lg border cursor-pointer transition-all"
              : "px-3 py-1 text-xs font-medium rounded cursor-pointer transition-all",
            model
              ? (value === o.value ? "bg-[var(--color-primary-blue)] !text-white border-transparent shadow-sm" : "bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] border-[var(--color-border-default)] hover:text-[var(--color-text-primary)]")
              : (value === o.value ? "bg-[var(--color-primary-blue)] !text-white" : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"),
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
