import type { ReactNode } from "react";
import { X, Activity } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { FilterVariantContext, type KpiItem } from "../../../components/ui/kpi-filter-card";
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
      {children && (
        <Card className="p-2.5 rounded-xl">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex-1 min-w-0"><FilterVariantContext.Provider value="model">{children}</FilterVariantContext.Provider></div>
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
    </div>
  );
}
