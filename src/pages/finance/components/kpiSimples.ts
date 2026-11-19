import type { LucideIcon } from "lucide-react";
import type { FinanceKpi } from "./FinanceKpiGrid";

/** Indicador sem comparação com período anterior — formato dos cards do Financeiro (FinanceKpiGrid). */
export function kpiSimples(label: string, value: string | number, icon: LucideIcon, footer = "", danger = false): FinanceKpi {
  return { label, value: String(value), icon, delta: null, goodUp: null, series: [], hideDelta: true, footer, danger };
}
