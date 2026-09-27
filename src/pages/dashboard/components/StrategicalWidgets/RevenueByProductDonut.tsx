import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { Card } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { PieChart as PieChartIcon } from 'lucide-react';
import { useLocalization } from '../../../../contexts/LocalizationContext';

export interface RevenueSlice {
  name: string;
  value: number;
  pct: number;
  color: string;
}

/** Receita por Produto: MRR/valor fechado (leads Fechado, mesma fonte do Ranking de Vendas —
 * ver getLeadRealValue em revenueMetrics.ts) somado por categoria de produto vinculado. Lead
 * fechado sem produto vinculado nenhum cai em "Outros" — nunca fica de fora do total. */
export function RevenueByProductDonut({ slices }: { slices: RevenueSlice[] }) {
  const { formatCurrency } = useLocalization();
  const total = slices.reduce((s, x) => s + x.value, 0);

  return (
    <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm h-full flex flex-col">
      <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2 mb-4">
        <PieChartIcon className="w-4 h-4 text-cyan-500" /> Receita por Produto
      </h3>
      {slices.length === 0 ? (
        <EmptyState icon={PieChartIcon} title="Sem vendas fechadas ainda" description="A distribuição por produto aparece assim que houver leads fechados." className="py-8 flex-1" />
      ) : (
        <>
          <div className="relative h-[170px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={150}>
              <PieChart>
                <Pie data={slices} cx="50%" cy="50%" innerRadius={52} outerRadius={72} paddingAngle={3} dataKey="value" stroke="none">
                  {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'var(--color-surface-elevated)', border: '1px solid var(--color-border-default)', borderRadius: '12px', fontSize: '11px' }}
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-sm font-black text-[var(--color-text-primary)] font-mono">{formatCurrency(total)}</span>
              <span className="text-[9px] text-[var(--color-text-faint)] font-bold uppercase">Total</span>
            </div>
          </div>
          <div className="space-y-2 mt-3">
            {slices.map((s) => (
              <div key={s.name} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-[11px] text-[var(--color-text-muted)] font-semibold truncate">{s.name}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-[var(--color-text-faint)] font-mono">{formatCurrency(s.value)}</span>
                  <span className="text-[11px] font-black text-[var(--color-text-primary)] tabular-nums w-10 text-right">{s.pct}%</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}
