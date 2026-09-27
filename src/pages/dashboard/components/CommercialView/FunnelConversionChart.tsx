import { motion } from 'motion/react';
import { Card } from '../../../../components/ui/card';
import { Filter, TrendingUp } from 'lucide-react';
import { EmptyState } from '../../../../components/ui/empty-state';

interface FunnelStep {
  label: string;
  value: number;
  drop: number;
  color: string;
}

interface FunnelConversionChartProps {
  funnelData: FunnelStep[];
  topConversionRate: number;
}

export function FunnelConversionChart({ funnelData, topConversionRate }: FunnelConversionChartProps) {
  const hasFunnel = funnelData.some(s => s.value > 0);
  const maxFunnelValue = funnelData[0]?.value || 1;

  return (
    <div className="space-y-4">
      <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] relative shadow-sm">
        <h3 className="text-xs font-black text-[var(--color-text-primary)] mb-6 uppercase tracking-wider flex items-center gap-2">
          <Filter className="w-4 h-4 text-emerald-500" /> Funil de Conversão Comercial
        </h3>
        {!hasFunnel ? (
          <EmptyState
            icon={Filter}
            title="Funil sem movimentações"
            description="Cadastre oportunidades e avance de etapas no Kanban."
            className="py-10"
          />
        ) : (
          <div className="space-y-3.5">
            {funnelData.map((step, i) => (
              <div key={i} className="relative">
                <div className="flex items-center justify-between mb-1 px-1">
                  <p className="text-xs font-bold text-[var(--color-text-muted)]">{step.label}</p>
                  <div className="flex items-center gap-2 w-20 justify-end shrink-0">
                    <span className="text-xs font-black text-[var(--color-text-primary)] font-mono">{step.value}</span>
                    <span className={`text-[10px] font-bold w-10 text-right ${step.drop > 0 ? "text-rose-500" : "text-[var(--color-text-faint)]"}`}>
                      {step.drop > 0 ? `-${step.drop}%` : "—"}
                    </span>
                  </div>
                </div>
                <div className="w-full h-2 bg-[var(--color-surface-sunken)] rounded-full overflow-hidden relative">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(step.value > 0 ? 3 : 0, (step.value / maxFunnelValue) * 100)}%` }}
                    transition={{ delay: i * 0.08, duration: 0.8 }}
                    className={`h-full rounded-full ${step.color}`}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4 bg-[var(--color-primary-blue)]/5 border border-[var(--color-primary-blue)]/20 shadow-sm relative">
        <h4 className="text-[10px] font-black text-[var(--color-primary-blue)] uppercase tracking-wider mb-1 flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5" /> Eficiência do Pipeline
        </h4>
        <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
          {hasFunnel
            ? `${funnelData[0].value} leads em prospecção com taxa de conversão média estimada em ${topConversionRate}%.`
            : 'Cadastre leads e avance os negócios para visualizar a taxa de conversão do time.'}
        </p>
      </Card>
    </div>
  );
}
