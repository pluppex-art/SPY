import { useMemo } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell } from 'recharts';
import { Card } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Waves } from 'lucide-react';
import { useLocalization } from '../../../../contexts/LocalizationContext';

export interface DespesaCategoria {
  category: string;
  value: number;
}

interface RevenueWaterfallChartProps {
  receita: number;
  despesasPorCategoria: DespesaCategoria[];
  receitaLiquida: number;
}

const tickCurrencyShort = (v: number) => {
  const abs = Math.abs(v);
  if (abs >= 1000) return `R$${(v / 1000).toFixed(0)}k`;
  return `R$${v}`;
};

/**
 * Waterfall: Receita Bruta -> (- cada categoria de despesa paga no período,
 * mesmo dado de FinanceEntry.category) -> Lucro Líquido. Recharts não tem um
 * tipo "waterfall" nativo — é uma BarChart empilhada de 2 séries por barra:
 * `base` (invisível, só posiciona onde a barra visível começa) + `bar`
 * (visível, a "queda" ou o total). Nenhum valor novo: mesma Receita/Despesa/
 * Receita Líquida já mostradas no Snapshot Financeiro acima, só quebrado por
 * categoria em vez de um total só.
 */
export function RevenueWaterfallChart({ receita, despesasPorCategoria, receitaLiquida }: RevenueWaterfallChartProps) {
  const { formatCurrency } = useLocalization();

  const data = useMemo(() => {
    if (receita <= 0) return [];
    let running = receita;
    const steps: { name: string; base: number; bar: number; display: number; kind: 'total' | 'despesa' }[] = [
      { name: 'Receita Bruta', base: 0, bar: receita, display: receita, kind: 'total' },
    ];
    for (const d of despesasPorCategoria) {
      if (d.value <= 0) continue;
      running -= d.value;
      steps.push({ name: d.category, base: Math.max(0, running), bar: d.value, display: -d.value, kind: 'despesa' });
    }
    steps.push({ name: 'Lucro Líquido', base: 0, bar: Math.max(0, running), display: running, kind: 'total' });
    return steps;
  }, [receita, despesasPorCategoria]);

  return (
    <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
      <div className="mb-5">
        <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2">
          <Waves className="w-4 h-4 text-[var(--color-primary-blue)]" /> Receita Bruta → Lucro Líquido
        </h3>
        <p className="text-xs text-[var(--color-text-muted)] mt-1 font-medium">
          De onde saiu o dinheiro — receita recebida no período menos cada categoria de despesa paga, até sobrar o resultado líquido.
        </p>
      </div>
      {data.length === 0 ? (
        <EmptyState icon={Waves} title="Sem lançamentos pagos no período" description="O waterfall aparece assim que houver receita e despesas pagas." className="py-8" />
      ) : (
        <div className="h-[300px] w-full min-w-0">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260}>
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" interval={0} height={60} />
              <YAxis tickFormatter={tickCurrencyShort} tick={{ fontSize: 10 }} width={56} />
              <Tooltip
                contentStyle={{ backgroundColor: 'var(--color-surface-elevated)', border: '1px solid var(--color-border-default)', borderRadius: '12px', fontSize: '11px' }}
                formatter={(_: number, __: string, item: any) => [formatCurrency(item.payload.display), item.payload.kind === 'total' ? 'Total' : 'Despesa']}
              />
              <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
              <Bar dataKey="bar" stackId="wf" radius={[4, 4, 0, 0]}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.kind === 'total' ? (d.name === 'Lucro Líquido' && d.display < 0 ? '#f43f5e' : '#2563EB') : '#f43f5e'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
