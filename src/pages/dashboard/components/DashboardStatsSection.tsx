import { QuickStatsGrid } from './QuickStatsGrid';
import { DashboardStatsByNiche } from './DashboardStatsByNiche';

export function DashboardStatsSection({
  tenantNiche,
  totalRevenue,
  leadsLength,
  conversionRate,
  churnRate,
  hasContractsData,
  dateFrom,
  dateTo,
  performanceData,
}: {
  tenantNiche: string | undefined;
  totalRevenue: number;
  leadsLength: number;
  conversionRate: number | string;
  churnRate: number;
  hasContractsData: boolean;
  dateFrom: string | null;
  dateTo: string | null;
  /** Mesma série do Fluxo de Performance — dá a tendência real e o
   * mini-gráfico de cada KPI (ver DashboardStatsByNiche.tsx). Opcional pra
   * não quebrar outro chamador que ainda não passe essa prop. */
  performanceData?: { name: string; vendas: number; leads: number; retention: number }[];
}) {
  const stats = DashboardStatsByNiche({
    tenantNiche,
    totalRevenue,
    leadsLength,
    conversionRate: typeof conversionRate === "string" ? parseFloat(conversionRate) : conversionRate,
    churnRate,
    hasContractsData,
    performanceData,
  });

  const periodoLabel = !dateFrom && !dateTo
    ? "Todo o período"
    : `${dateFrom ? dateFrom.split("-").reverse().join("/") : "…"} – ${dateTo ? dateTo.split("-").reverse().join("/") : "…"}`;

  return <QuickStatsGrid stats={stats} periodoLabel={periodoLabel} />;
}

