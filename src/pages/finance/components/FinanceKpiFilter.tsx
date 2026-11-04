import { useState, type ReactNode } from "react";
import { X, Activity, SlidersHorizontal } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { FilterVariantContext, FilterTabsSlotContext, findFilterSearch, type KpiItem } from "../../../components/ui/kpi-filter-card";
import { FinanceKpiGrid } from "./FinanceKpiGrid";

interface FinanceKpiFilterProps {
  /** Mantido por compatibilidade com o antigo KpiFilterCard (o painel não recolhe mais). */
  id?: string;
  title?: string;
  defaultOpen?: boolean;
  kpis?: KpiItem[];
  children?: ReactNode;
  activeCount?: number;
  onClear?: () => void;
  className?: string;
}

/**
 * Padrão de KPIs + filtros das telas do Financeiro (mesmo de Receitas, Despesas e Todas as
 * Movimentações): linha de cards (FinanceKpiGrid) e, logo abaixo, um cartão de filtros com a barra
 * da página. API compatível com o antigo KpiFilterCard — cada página mantém os próprios indicadores.
 */
export function FinanceKpiFilter({ kpis = [], children, activeCount = 0, onClear }: FinanceKpiFilterProps) {
  const [tabsSlot, setTabsSlot] = useState<HTMLDivElement | null>(null);
  // Celular: busca sempre visível + botão "Filtros" que recolhe o resto (padrão de app).
  const [open, setOpen] = useState(false);
  const isMobile = typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
  const mobileSearch = isMobile ? findFilterSearch(children) : null;
  return (
    <div className="space-y-4">
      {kpis.length > 0 && (
        <FinanceKpiGrid
          cards={kpis.map((k) => ({
            label: k.label,
            value: typeof k.value === "string" || typeof k.value === "number" ? String(k.value) : k.value,
            icon: k.icon ?? Activity,
            delta: null,
            goodUp: null,
            series: [],
            footer: k.hint ?? "",
            hideDelta: true,
            danger: k.tone === "danger",
          }))}
        />
      )}
      {children && mobileSearch && (
        <Card className="p-2 rounded-xl">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <FilterVariantContext.Provider value="model">{mobileSearch}</FilterVariantContext.Provider>
            </div>
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className={`shrink-0 h-11 px-3.5 flex items-center gap-2 rounded-lg border text-xs font-bold cursor-pointer bg-[var(--color-surface-elevated)] whitespace-nowrap ${open || activeCount > 0 ? "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]" : "border-[var(--color-border-default)] text-[var(--color-text-primary)]"}`}
            >
              <SlidersHorizontal className="w-4 h-4" /> Filtros{activeCount > 0 ? ` (${activeCount})` : ""}
            </button>
          </div>
          {/* Só esconde (não desmonta): as abas de status são renderizadas via portal fora deste card. */}
          {
            <div className={`pt-2.5 space-y-2.5 [&_[data-mobile-search]]:hidden ${open ? "" : "hidden"}`}>
              {activeCount > 0 && onClear && (
                <button type="button" onClick={onClear} className="flex items-center gap-1 text-xs font-bold text-[var(--color-text-muted)] bg-transparent border-none cursor-pointer p-0">
                  <X className="w-3 h-3" /> Limpar filtros ({activeCount})
                </button>
              )}
              <FilterVariantContext.Provider value="model"><FilterTabsSlotContext.Provider value={tabsSlot}>{children}</FilterTabsSlotContext.Provider></FilterVariantContext.Provider>
            </div>
          }
        </Card>
      )}
      {children && !mobileSearch && (
        <Card className="p-2.5 rounded-xl">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-0 space-y-2.5"><FilterVariantContext.Provider value="model"><FilterTabsSlotContext.Provider value={tabsSlot}>{children}</FilterTabsSlotContext.Provider></FilterVariantContext.Provider></div>
            {activeCount > 0 && onClear && (
              <button
                type="button"
                onClick={onClear}
                className="flex items-center gap-1 px-2 h-9 text-xs font-bold text-[var(--color-text-muted)] hover:text-rose-500 bg-transparent border-none cursor-pointer whitespace-nowrap"
              >
                <X className="w-3 h-3" /> Limpar ({activeCount})
              </button>
            )}
          </div>
        </Card>
      )}
      <div ref={setTabsSlot} className="empty:hidden" />
    </div>
  );
}
