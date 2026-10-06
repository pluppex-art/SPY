import { QuickStatsGrid } from './QuickStatsGrid';
import { DashboardStatsByNiche } from './DashboardStatsByNiche';

export function DashboardStatsSection({
  tenantNiche,
  totalRevenue,
  faturamentoContratado,
  leadsLength,
  conversionRate,
  churnRate,
  hasContractsData,
  dateFrom,
  dateTo,
  performanceData,
  leads,
  contracts,
}: {
  tenantNiche: string | undefined;
  totalRevenue: number;
  /** Faturamento contratado (recorrente + avulso/implantação) — distinto do
   * `totalRevenue` acima, que é só MRR (ver revenueMetrics.getFaturamentoContratado
   * e o comentário em DashboardStatsByNiche.tsx). Opcional pra não quebrar
   * outro chamador que ainda não passe essa prop — cai pro próprio
   * `totalRevenue` nesse caso (nunca mostra "sem dado" onde já existia número). */
  faturamentoContratado?: number;
  leadsLength: number;
  conversionRate: number | string;
  churnRate: number;
  hasContractsData: boolean;
  dateFrom: string | null;
  dateTo: string | null;
  /** Mesma série do Fluxo de Performance — dá a tendência real e o
   * mini-gráfico de cada KPI (ver DashboardStatsByNiche.tsx). Opcional pra
   * não quebrar outro chamador que ainda não passe essa prop. */
  performanceData?: { name: string; vendas: number; faturamento?: number; leads: number; retention: number }[];
  /** Arrays reais por trás dos números — ver mesma prop em DashboardStatsByNiche.tsx. */
  leads?: any[];
  contracts?: any[];
}) {
  const stats = DashboardStatsByNiche({
    tenantNiche,
    totalRevenue,
    faturamentoContratado,
    leadsLength,
    conversionRate: typeof conversionRate === "string" ? parseFloat(conversionRate) : conversionRate,
    churnRate,
    hasContractsData,
    performanceData,
    leads,
    contracts,
  });

  const periodoLabel = !dateFrom && !dateTo
    ? "Todo o período"
    : `${dateFrom ? dateFrom.split("-").reverse().join("/") : "…"} – ${dateTo ? dateTo.split("-").reverse().join("/") : "…"}`;

  return <QuickStatsGrid stats={stats} periodoLabel={periodoLabel} />;
}

