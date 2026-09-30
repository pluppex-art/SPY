import { StrategicalView } from "./StrategicalView";
import { CommercialView } from "./CommercialView";
import { MarketingView } from "./MarketingView";
import { CustomerSuccessView } from "./CustomerSuccessView";
import { BusinessIntelligenceView } from "./BusinessIntelligenceView";
import type { DashboardSummary } from "../useDashboard";

export function DashboardTabContent(props: {
  activeTab: "executivo" | "comercial" | "marketing" | "sucesso" | "bi";
  performanceData: any[];
  squads: any[];
  contracts: any[];
  salesRanking: any[];
  funnelData: any[];
  recentActivities: any[];
  serverSummary: DashboardSummary | null;
  dateFrom: string | null;
  dateTo: string | null;
}) {
  const {
    activeTab,
    performanceData,
    squads,
    contracts,
    salesRanking,
    funnelData,
    recentActivities,
    serverSummary,
    dateFrom,
    dateTo,
  } = props;

  return (
    <>
      {activeTab === "executivo" && (
        <StrategicalView
          performanceData={performanceData}
          squads={squads}
          contracts={contracts}
          serverSummary={serverSummary}
          dateFrom={dateFrom}
          dateTo={dateTo}
        />
      )}

      {activeTab === "comercial" && (
        <CommercialView
          salesRanking={salesRanking}
          funnelData={funnelData}
          recentActivities={recentActivities}
        />
      )}

      {activeTab === "marketing" && <MarketingView />}

      {activeTab === "sucesso" && <CustomerSuccessView serverSummary={serverSummary} />}

      {activeTab === "bi" && <BusinessIntelligenceView />}
    </>
  );
}

