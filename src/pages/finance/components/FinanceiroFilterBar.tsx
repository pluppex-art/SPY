import { FinancePeriodFilter } from "./FinancePeriodFilter";

/** Seletor de período das telas do Financeiro: o mesmo dropdown ("Este mês", "Últimos 30 dias"…) do resto do sistema. */
export function FinanceiroFilterBar() {
  return (
    <div className="flex items-center print:hidden">
      <FinancePeriodFilter />
    </div>
  );
}
