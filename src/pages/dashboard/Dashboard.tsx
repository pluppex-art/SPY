import { PageContainer } from "../../components/PageContainer";
import { DateRangeFilter } from "../../components/ui/DateRangeFilter";

import { useDashboard } from "./useDashboard";
import { DashboardGoalAlerts } from "./components/DashboardGoalAlerts";
import { DashboardActionsTabs } from "./components/DashboardActionsTabs";
import { DashboardTabContent } from "./components/DashboardTabContent";
import { DashboardStatsSection } from "./components/DashboardStatsSection";



export default function Dashboard() {
  const {
    activeLeadsCount,
    activeTab,
    setActiveTab,
    comparisonPeriod,
    setComparisonPeriod,
    goalAlerts,
    totalRevenue,
    conversionRate,
    squads,
    contracts,
    user,
    performanceData,
    salesRanking,
    funnelData,
    recentActivities,
    churnRate,
    hasContractsData,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    serverSummary,
  } = useDashboard();

  return (

    <PageContainer
      title="Inteligência S.P.Y."
      description="Painel de comando estratégico para decisões baseadas em dados."
      actions={
        <DashboardActionsTabs activeTab={activeTab as any} onTabChange={setActiveTab as any} />
      }
    >
      <div className="space-y-6 max-w-[1600px] mx-auto pb-10">

        {/* Filtro de período — afeta cartões, gráfico de Fluxo de Performance,
            Snapshot Financeiro e todo o resto da tela (mesmo intervalo em
            todo componente, ver useDashboard.ts/StrategicalView.tsx). */}
        <div className="w-fit">
          <DateRangeFilter
            dateFrom={dateFrom}
            setDateFrom={setDateFrom}
            dateTo={dateTo}
            setDateTo={setDateTo}
          />
        </div>

        {/* Goal Alerts Banner */}
        <DashboardGoalAlerts goalAlerts={goalAlerts} />


        {/* Quick Stats Grid */}
        <DashboardStatsSection
          tenantNiche={user?.tenantNiche}
          totalRevenue={totalRevenue}
          leadsLength={activeLeadsCount}
          conversionRate={conversionRate}
          churnRate={churnRate}
          hasContractsData={hasContractsData}
          dateFrom={dateFrom}
          dateTo={dateTo}
          performanceData={performanceData}
        />



        <DashboardTabContent
          activeTab={activeTab as any}
          comparisonPeriod={comparisonPeriod}
          setComparisonPeriod={setComparisonPeriod}
          performanceData={performanceData}
          squads={squads}
          contracts={contracts}
          salesRanking={salesRanking}
          funnelData={funnelData}
          recentActivities={recentActivities}
          serverSummary={serverSummary}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />


      </div>
    </PageContainer>
  );
}
