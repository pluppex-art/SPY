import { motion } from 'motion/react';
import { TrendingUp } from 'lucide-react';
import { Card } from '../../../../components/ui/card';
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
  const hasFunnel = funnelData.some(s => s.value > 0);

  return (
    <motion.div
      key="comercial"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="space-y-6 text-left"
    >
      {/* Ranking de Vendas e Funil de Conversão ficam com a MESMA altura
          (items-stretch — o menor acompanha o maior). "Eficiência do
          Pipeline" saiu de dentro do Funil e virou uma faixa só, de largura
          inteira, embaixo dos dois — não faz sentido ficar presa só a um
          dos dois cards quando fala do funil como um todo. */}
      <div className="grid lg:grid-cols-2 gap-6 items-stretch">
        <SalesRankingPodium salesRanking={salesRanking} />
        <FunnelConversionChart funnelData={funnelData} />
      </div>

      <Card className="p-4 bg-[var(--color-primary-blue)]/5 border border-[var(--color-primary-blue)]/20 shadow-sm flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 flex items-center justify-center shrink-0">
          <TrendingUp className="w-4 h-4 text-[var(--color-primary-blue)]" />
        </div>
        <div>
          <h4 className="text-[10px] font-black text-[var(--color-primary-blue)] uppercase tracking-wider">Eficiência do Pipeline</h4>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            {hasFunnel
              ? `${funnelData[0].value} leads em prospecção com taxa de conversão média estimada em ${topConversionRate}%.`
              : 'Cadastre leads e avance os negócios para visualizar a taxa de conversão do time.'}
          </p>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <RadarAtributos salesRanking={salesRanking} funnelLeadsCount={funnelLeadsCount} />
        <RecentActivitiesList recentActivities={recentActivities} />
      </div>
    </motion.div>
  );
}
