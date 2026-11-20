import type { LucideIcon } from "lucide-react";
import type { FinanceKpi } from "./FinanceKpiGrid";

/** Indicador sem comparação com período anterior — usa o cartão padrão do Financeiro (FinanceKpiGrid), sem alterá-lo. */
export function kpiSimples(label: string, value: string | number, icon: LucideIcon, footer = "", danger = false, onClick?: () => void): FinanceKpi {
  return { label, value: String(value), icon, delta: null, goodUp: null, series: [], hideDelta: true, footer, danger, onClick };
}
