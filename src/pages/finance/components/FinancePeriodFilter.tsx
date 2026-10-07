import { DateRangeFilter } from "../../../components/ui/DateRangeFilter";
import { useFinanceiroFiltro } from "../FinanceiroFilterContext";

/**
 * Seletor "Período: Tudo" do cabeçalho das telas do Financeiro que usam o período global do módulo
 * (FinanceiroFilterContext). Cada tela lê `dataInicio`/`dataFim` de `useFinanceiroFiltro()`.
 */
export function FinancePeriodFilter() {
  const { periodoFrom, periodoTo, setPeriodoFrom, setPeriodoTo } = useFinanceiroFiltro();
  return <DateRangeFilter dateFrom={periodoFrom} setDateFrom={setPeriodoFrom} dateTo={periodoTo} setDateTo={setPeriodoTo} className="!h-9 !rounded-lg" />;
}
