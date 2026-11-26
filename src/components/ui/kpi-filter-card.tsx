import { colunasBalanceadas } from "../../lib/gridCols";
import { Children, createContext, isValidElement, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { BarChart3, Search, SlidersHorizontal, X, type LucideIcon } from "lucide-react";
import { Card } from "./card";
import { Button } from "./button";
import { Modal } from "./modal";
import { HeaderSlotContext } from "./header-slot";
import { useAuth } from "../../contexts/AuthContext";
import { cn } from "../../lib/utils";

/**
 * Indicadores e filtros das listagens — o mesmo padrão do Pipeline, para todas as páginas.
 *
 * Os filtros ficam soltos na página (sem cartão em volta), logo acima do conteúdo; os indicadores abrem em
 * uma janela pelo botão "Indicadores", no cabeçalho da página, junto dos demais botões de ação.
 *
 * Uso:
 *   <KpiFilterCard id="clientes" kpis={[{ label: "Ativos", value: 120, icon: Users, tone: "success" }]}
 *                  activeCount={n} onClear={limpar}>
 *     <FilterBar>
 *       <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar clientes..." />
 *       <FilterSelect icon={MapPin} value={cidade} onChange={setCidade} options={cidades} allLabel="Todas as cidades" />
 *     </FilterBar>
 *   </KpiFilterCard>
 *
 * Indicadores com desenho próprio (cartões clicáveis, gráficos) vão em `indicators`.
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

const TONE_VAR: Record<KpiTone, string> = {
  primary: "var(--color-primary-blue)",
  warning: "var(--color-warning)",
  success: "var(--color-success)",
  info: "var(--color-info)",
  accent: "var(--color-accent)",
  danger: "var(--color-danger)",
  neutral: "var(--color-border-default)",
};

export function KpiTiles({ items }: { items: KpiItem[] }) {
  if (items.length === 0) return null;
  // Colunas balanceadas: a última linha nunca fica com um card sozinho (6 → 3+3, 8 → 4+4, 10 → 5+5).
  const n = colunasBalanceadas(items.length, 5);
  const cols = n >= 5 ? "md:grid-cols-5" : n === 4 ? "md:grid-cols-4" : n === 3 ? "md:grid-cols-3" : "md:grid-cols-2";
  return (
    <div className={cn("flex md:grid gap-2.5 sm:gap-4 shrink-0 overflow-x-auto md:overflow-visible snap-x snap-mandatory md:snap-none -mx-4 px-4 md:mx-0 md:px-0 pb-1 md:pb-0 scrollbar-none", cols)}>
      {items.map(({ label, value, icon: Icon, tone = "primary", hint }, i) => (
        <Card
          key={label}
          title={hint}
          style={{ "--bar": TONE_VAR[tone] } as React.CSSProperties}
          className={cn(
            "max-md:border-b-4 max-md:[border-bottom-color:var(--bar)] p-3.5 sm:p-5 min-w-[140px] md:min-w-0 shrink-0 md:shrink snap-start hover:border-[var(--color-border-default)]/80 transition-all",
          )}
        >
          {Icon && <Icon className={cn("w-5 h-5 mb-2 sm:mb-3", TONE_CLASS[tone])} />}
          <div className="text-lg sm:text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic truncate">{value}</div>
          <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">{label}</div>
          <div className="mt-1 min-h-[1.25rem] text-[10px] text-[var(--color-text-faint)] font-medium leading-tight line-clamp-2">{hint ?? ""}</div>
        </Card>
      ))}
    </div>
  );
}

/** Procura o <FilterSearch> dentro de um <FilterBar> filho (usado pra fixar a busca no topo no celular). */
export function findFilterSearch(children: ReactNode): ReactNode {
  for (const child of Children.toArray(children)) {
    if (isValidElement(child) && child.type === FilterBar) {
      const found = Children.toArray((child.props as { children?: ReactNode }).children).find(
        (k) => isValidElement(k) && k.type === FilterSearch,
      );
      if (found) return found;
    }
  }
  return null;
}

interface KpiFilterCardProps {
  /** Identificador da página; no celular vira a chave de preferência `<id>FiltersOpenMobile`. */
  id: string;
  kpis?: KpiItem[];
  /** Blocos de indicadores com desenho próprio; aparecem na mesma janela, depois dos `kpis`. */
  indicators?: ReactNode;
  /** A barra de filtros (use <FilterBar> com <FilterSearch>/<FilterSelect>/etc.). */
  children?: ReactNode;
  /** Quantos filtros estão ativos (mostra o botão "Limpar"). */
  activeCount?: number;
  onClear?: () => void;
  className?: string;
  /** Campo de busca fixo no celular (padrão app). Se omitido, usa o <FilterSearch> encontrado dentro do <FilterBar>. */
  search?: ReactNode;
}

export function KpiFilterCard({ id, kpis = [], indicators, children, activeCount = 0, onClear, className, search }: KpiFilterCardProps) {
  const { user, updatePreferences } = useAuth();
  const headerSlot = useContext(HeaderSlotContext);
  const [showIndicators, setShowIndicators] = useState(false);
  // No celular os filtros extras ficam recolhidos atrás do botão "Filtros" (a preferência é lembrada).
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const prefKey = `${id}FiltersOpenMobile`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const saved = user?.preferences?.[prefKey];
    if (typeof saved === "boolean") setOpen(saved);
  }, [user?.preferences, prefKey]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    updatePreferences({ [prefKey]: next });
  };

  const hasIndicators = kpis.length > 0 || !!indicators;
  const indicatorsButton = hasIndicators ? (
    <Button
      variant="outline"
      onClick={() => setShowIndicators(true)}
      aria-haspopup="dialog"
      className="h-9 md:h-10 px-4 gap-1.5 text-[11px] md:text-[10px] font-bold uppercase tracking-wider border-[var(--color-border-default)] max-md:w-full max-md:order-last"
    >
      <BarChart3 className="w-3.5 h-3.5" /> Indicadores
    </Button>
  ) : null;

  const indicatorsUi = hasIndicators ? (
    <>
      {headerSlot ? createPortal(indicatorsButton, headerSlot) : <div className="flex justify-end">{indicatorsButton}</div>}
      <Modal isOpen={showIndicators} onClose={() => setShowIndicators(false)} title="Indicadores" maxWidth="max-w-6xl">
        <div className="flex flex-col gap-4">
          <KpiTiles items={kpis} />
          {indicators}
        </div>
      </Modal>
    </>
  ) : null;

  const clearButton = activeCount > 0 && onClear ? (
    <button
      type="button"
      onClick={onClear}
      className="shrink-0 flex items-center gap-1 h-[38px] px-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-transparent border-none cursor-pointer whitespace-nowrap"
    >
      <X className="w-3.5 h-3.5" /> Limpar ({activeCount})
    </button>
  ) : null;

  const hasFilters = Children.toArray(children).length > 0;

  // Celular: a busca fica sempre visível, ao lado do botão "Filtros"; os demais filtros abrem ao tocar.
  const mobileSearch: ReactNode = isMobile ? (search ?? findFilterSearch(children)) : null;

  if (mobileSearch) {
    return (
      <div className={cn("flex flex-col gap-2", className)}>
        {indicatorsUi}
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 [&>div]:!col-span-1">{mobileSearch}</div>
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className={cn(
              "shrink-0 h-[42px] px-3.5 flex items-center gap-2 rounded-[var(--radius-control)] border text-xs font-bold cursor-pointer bg-[var(--color-surface-elevated)] whitespace-nowrap",
              open || activeCount > 0
                ? "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]"
                : "border-[var(--color-border-default)] text-[var(--color-text-primary)]",
            )}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filtros{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>
        </div>
        {open && (
          <div className="flex flex-col gap-2 [&_[data-mobile-search]]:hidden">
            {clearButton && <div className="self-start">{clearButton}</div>}
            {children}
          </div>
        )}
      </div>
    );
  }

  // Sem filtros na tela, não sobra nenhum espaço vazio: só o botão no cabeçalho.
  if (!hasFilters && !clearButton) return indicatorsUi;

  return (
    <>
      {indicatorsUi}
      <div className={cn("flex items-start gap-2", className)}>
        <div className="flex-1 min-w-0 flex flex-col gap-2">{children}</div>
        {clearButton}
      </div>
    </>
  );
}

// ─── Peças de filtro (mesmo visual da barra do Pipeline) ────────────────────

/** "model" = padrão visual do Financeiro (controles h-9, cantos arredondados, abas em pílulas) — ver FinanceKpiFilter. */
export const FilterVariantContext = createContext<"default" | "model">("default");
/** Elemento (linha de abas abaixo do cartão de filtros) onde os FilterChips da variante "model" são renderizados. */
export const FilterTabsSlotContext = createContext<HTMLElement | null>(null);

const CONTROL_BOX =
  "flex items-center gap-1.5 bg-[var(--color-surface-elevated)] px-3 rounded-[var(--radius-control)] border border-[var(--color-border-default)] h-[42px] sm:h-[38px] min-w-0 sm:max-w-[200px]";

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0 max-[479px]:[&>*]:col-span-2", className)}>{children}</div>;
}

export function FilterSearch({ value, onChange, placeholder = "Buscar..." }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const model = useContext(FilterVariantContext) === "model";
  return (
    <div data-mobile-search className={cn("relative col-span-2 sm:col-span-1 sm:flex-1", model ? "sm:min-w-[220px]" : "sm:min-w-[160px]")}>
      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn("bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] pl-9 pr-3 text-xs text-[var(--color-text-primary)] focus:outline-none w-full", model ? "rounded-lg h-11 sm:h-9 placeholder:text-[var(--color-text-faint)] focus:ring-2 focus:ring-[var(--color-primary-blue)]/40" : "rounded-[var(--radius-control)] h-[42px] sm:h-[38px] focus:border-[var(--color-primary-blue)]")}
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
    <div className={model ? "flex items-center gap-1.5 bg-[var(--color-surface-elevated)] px-3 rounded-lg border border-[var(--color-border-default)] h-11 sm:h-9 min-w-0 sm:max-w-[240px] focus-within:ring-2 focus-within:ring-[var(--color-primary-blue)]/40" : CONTROL_BOX} title={title}>
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
  const slot = useContext(FilterTabsSlotContext);
  const chips = (
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
  return model && slot ? createPortal(chips, slot) : chips;
}
