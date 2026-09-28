import { motion } from 'motion/react';
import { SalesRankingPodium } from './SalesRankingPodium';
import { FunnelConversionChart } from './FunnelConversionChart';
import { RadarAtributos } from './RadarAtributos';
import { RecentActivitiesList } from './RecentActivitiesList';

interface FunnelStep {
  label: string;
  value: number;
  drop: number;
  color: string;
}

interface Activity {
  id: string;
  type: string;
  title: string;
  description: string;
  date: string;
  seller?: string;
}

interface SalesEntry {
  name: string;
  total: number;
  deals: number;
  rate: number;
}

interface CommercialViewProps {
  salesRanking: SalesEntry[];
  funnelData: FunnelStep[];
  recentActivities: Activity[];
}

export function CommercialView({ salesRanking, funnelData, recentActivities }: CommercialViewProps) {
  const topConversionRate = salesRanking.length > 0 ? salesRanking[0].rate : 0;
  const funnelLeadsCount = funnelData[0]?.value || 0;

  return (
    <motion.div
      key="comercial"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="space-y-6 text-left"
    >
      {/* Achado real (visto em print): o grid esticava os 2 cards pra mesma
          altura (align-items padrão do grid = stretch) — como o Funil tem
          bem mais linhas que o Ranking, o Ranking sempre sobrava com um
          espaço em branco enorme embaixo. `items-start` faz cada card ficar
          só do tamanho do próprio conteúdo. */}
      <div className="grid lg:grid-cols-2 gap-6 items-start">
        <SalesRankingPodium salesRanking={salesRanking} />
        <FunnelConversionChart funnelData={funnelData} topConversionRate={topConversionRate} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <RadarAtributos salesRanking={salesRanking} funnelLeadsCount={funnelLeadsCount} />
        <RecentActivitiesList recentActivities={recentActivities} />
      </div>
    </motion.div>
  );
}
