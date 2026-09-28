import { useMemo } from 'react';
import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { Card } from '../../../../components/ui/card';
import { Gauge } from 'lucide-react';
import { useData } from '../../../../contexts/DataContext';
import { useLocalization } from '../../../../contexts/LocalizationContext';
import { parseCurrencyBR } from '../../../../lib/utils';

// `lead.date` é texto livre (ver leadDateIso em useDashboard.ts) — mesmo
// fallback pro created_at real do banco quando não é uma data ISO válida.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;
function leadDateIso(l: any): string {
  if (typeof l?.date === 'string' && ISO_DATE_RE.test(l.date)) return l.date;
  return typeof l?.created_at === 'string' ? l.created_at : '';
}
function contractDateToIso(d: string | undefined | null): string | null {
  if (!d) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

// Escala do medidor — não é um "SLA" configurado em lugar nenhum, só o
// range visual do gauge (0 a 60 dias cobre a esmagadora maioria dos ciclos
// de venda B2B; um valor real acima disso satura o gauge no máximo, mas o
// número exibido continua o real, nunca escondido).
const GAUGE_MAX_DAYS = 60;

/**
 * Sales Velocity: tempo médio real entre a criação do lead (lead.created_at/
 * date) e a assinatura do contrato (contract.date) gerado a partir dele
 * (contracts.proposalId -> proposals.lead_id -> leads.id), cruzado com o
 * ticket médio desses mesmos negócios fechados. Só entram contratos com
 * link de verdade até um lead com data válida — sem isso, sem amostra
 * suficiente, mostra estado vazio em vez de inventar um número.
 */
export function SalesVelocityMeter() {
  const { contracts, proposals, leads } = useData();
  const { formatCurrency } = useLocalization();

  const velocity = useMemo(() => {
    const samples: { days: number; value: number }[] = [];
    for (const c of contracts as any[]) {
      if (c.status === 'Cancelado' || !c.proposalId) continue;
      const proposal = (proposals as any[]).find((p) => p.id === c.proposalId);
      if (!proposal?.lead_id) continue;
      const lead = (leads as any[]).find((l) => l.id === proposal.lead_id);
      if (!lead) continue;
      const createdIso = leadDateIso(lead).slice(0, 10);
      const contractIso = contractDateToIso(c.date);
      if (!createdIso || !contractIso) continue;
      const days = Math.round((new Date(contractIso).getTime() - new Date(createdIso).getTime()) / 86400000);
      if (days < 0) continue; // data inconsistente (contrato "antes" do lead) — descarta a amostra, não inverte o sinal
      const value = c.totalValue !== undefined ? Number(c.totalValue) : parseCurrencyBR(c.mrr);
      samples.push({ days, value });
    }
    if (samples.length === 0) return null;
    const avgDays = Math.round(samples.reduce((s, x) => s + x.days, 0) / samples.length);
    const avgTicket = samples.reduce((s, x) => s + x.value, 0) / samples.length;
    return { avgDays, avgTicket, sampleSize: samples.length };
  }, [contracts, proposals, leads]);

  const gaugeData = velocity
    ? [{ name: 'velocidade', value: Math.min(velocity.avgDays, GAUGE_MAX_DAYS), fill: velocity.avgDays <= 21 ? '#10b981' : velocity.avgDays <= 40 ? '#f59e0b' : '#f43f5e' }]
    : [];

  return (
    <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
      <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2 mb-1">
        <Gauge className="w-4 h-4 text-[var(--color-primary-blue)]" /> Velocidade de Vendas
      </h3>
      <p className="text-xs text-[var(--color-text-muted)] mb-4 font-medium">
        Tempo médio real entre a criação do lead e a assinatura do contrato.
      </p>

      {!velocity ? (
        <div className="py-10 text-center text-xs text-[var(--color-text-faint)]">
          Sem contratos vinculados a um lead com data válida ainda.
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <div className="w-28 h-28 shrink-0 relative">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%" cy="50%" innerRadius="70%" outerRadius="100%"
                barSize={10} data={gaugeData} startAngle={90} endAngle={-270}
              >
                <PolarAngleAxis type="number" domain={[0, GAUGE_MAX_DAYS]} angleAxisId={0} tick={false} />
                <RadialBar dataKey="value" background={{ fill: 'var(--color-surface-sunken)' }} cornerRadius={8} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-black text-[var(--color-text-primary)] font-mono leading-none">{velocity.avgDays}</span>
              <span className="text-[9px] text-[var(--color-text-faint)] font-bold uppercase">dias</span>
            </div>
          </div>
          <div className="flex-1 space-y-2">
            <div>
              <p className="text-[10px] text-[var(--color-text-faint)] font-bold uppercase tracking-wider">Ticket Médio</p>
              <p className="text-lg font-black text-[var(--color-text-primary)] font-mono">{formatCurrency(velocity.avgTicket)}</p>
            </div>
            <p className="text-[10px] text-[var(--color-text-faint)]">Baseado em {velocity.sampleSize} contrato(s) com lead de origem identificado.</p>
          </div>
        </div>
      )}
    </Card>
  );
}
