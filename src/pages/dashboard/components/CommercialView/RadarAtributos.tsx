import { Card } from '../../../../components/ui/card';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip } from 'recharts';
import { Compass } from 'lucide-react';

interface SalesEntry {
  name: string;
  total: number;
  deals: number;
  rate: number;
}

interface RadarAtributosProps {
  salesRanking: SalesEntry[];
  funnelLeadsCount: number;
}

export function RadarAtributos({ salesRanking, funnelLeadsCount }: RadarAtributosProps) {
  const top = salesRanking[0];

  const radarData = [
    { subject: 'Velocidade', A: top ? Math.min(150, top.rate * 1.5) : 0, fullMark: 150 },
    { subject: 'Ticket Médio', A: top ? Math.min(150, (top.total / Math.max(top.deals, 1)) / 1000) : 0, fullMark: 150 },
    { subject: 'Volume', A: top ? Math.min(150, top.deals * 10) : 0, fullMark: 150 },
    { subject: 'Qualidade', A: top ? Math.min(150, top.rate) : 0, fullMark: 150 },
    { subject: 'Saúde CRM', A: Math.min(150, funnelLeadsCount * 5), fullMark: 150 },
  ];

  return (
    <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] lg:col-span-1 shadow-sm">
      <h3 className="text-xs font-black text-[var(--color-text-primary)] mb-6 uppercase tracking-wider flex items-center gap-2">
        <Compass className="w-4 h-4 text-purple-500" /> Radar de Competências
      </h3>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
            <PolarGrid stroke="rgba(148, 163, 184, 0.2)" />
            <PolarAngleAxis dataKey="subject" stroke="var(--color-text-muted)" fontSize={10} fontStyle="bold" />
            {/* Sem isso, o gráfico mostrava só uma forma sem nenhuma régua —
                dava pra ver "maior/menor" entre os eixos, mas não o valor em
                si (achado real: item 6 do pedido, "boa escala"). */}
            <PolarRadiusAxis angle={90} domain={[0, 150]} tick={{ fontSize: 9, fill: 'var(--color-text-faint)' }} tickCount={4} axisLine={false} />
            <Tooltip
              contentStyle={{ backgroundColor: 'var(--color-surface-elevated)', border: '1px solid var(--color-border-default)', borderRadius: '12px', fontSize: '11px' }}
              itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
            />
            <Radar name="Desempenho Comercial" dataKey="A" stroke="#2563EB" fill="#2563EB" fillOpacity={0.35} />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-4">
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-[var(--color-primary-blue)]" />
          <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-wider">Desempenho Comercial</span>
        </div>
      </div>
    </Card>
  );
}
