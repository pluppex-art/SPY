import { motion } from 'motion/react';
import { Card } from '../../../../components/ui/card';
import { Filter, AlertTriangle } from 'lucide-react';
import { EmptyState } from '../../../../components/ui/empty-state';

interface FunnelStep {
  label: string;
  value: number;
  /** null = sem base real pra comparar (1ª etapa, ou etapa anterior
   * zerada) — distinto de 0 (comparou e ficou igual, um valor real). */
  drop: number | null;
  color: string;
}

interface FunnelConversionChartProps {
  funnelData: FunnelStep[];
}

/** "Eficiência do Pipeline" saiu daqui — virou uma faixa só, de largura
 * inteira, compartilhada com o Ranking de Vendas (ver CommercialView/index.tsx),
 * em vez de um card embutido só deste componente. */
export function FunnelConversionChart({ funnelData }: FunnelConversionChartProps) {
  const hasFunnel = funnelData.some(s => s.value > 0);
  const maxFunnelValue = funnelData[0]?.value || 1;

  // Maior gargalo REAL: a etapa com a maior queda (drop) já calculada — nunca
  // um motivo/causa inventado, só aponta ONDE a queda é maior entre as que
  // já existem no funil. i=0 e etapas sem base real (drop null) nunca entram
  // na comparação.
  let bottleneck: { label: string; drop: number; i: number } | null = null;
  if (hasFunnel) {
    funnelData.forEach((step, i) => {
      if (i > 0 && step.drop !== null && step.drop > (bottleneck?.drop ?? -1)) bottleneck = { label: step.label, drop: step.drop, i };
    });
  }

  return (
    <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] relative shadow-sm h-full flex flex-col">
      <h3 className="text-xs font-black text-[var(--color-text-primary)] mb-6 uppercase tracking-wider flex items-center gap-2 shrink-0">
        <Filter className="w-4 h-4 text-[var(--color-primary-blue)]" /> Funil de Conversão Comercial
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
                  {/* Achado real: só mostrava queda (drop > 0) — uma alta real
                      entre 2 etapas adjacentes (comum num funil custom, onde a
                      contagem é "quantos leads estão AGORA nessa etapa", não um
                      fluxo estritamente decrescente) ficava escondida atrás de
                      "—", como se não houvesse dado nenhum ali. */}
                  <span className={`text-[10px] font-bold w-10 text-right ${
                    step.drop === null ? "text-[var(--color-text-faint)]"
                    : step.drop > 0 ? "text-danger"
                    : step.drop < 0 ? "text-success"
                    : "text-[var(--color-text-faint)]"
                  }`}>
                    {step.drop === null ? "—" : step.drop === 0 ? "0%" : step.drop > 0 ? `-${step.drop}%` : `+${Math.abs(step.drop)}%`}
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

      {bottleneck && bottleneck.drop > 0 && (
        <div className="mt-5 pt-4 border-t border-[var(--color-border-subtle)] flex items-start gap-2.5 shrink-0">
          <AlertTriangle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            <strong className="text-[var(--color-text-primary)] font-bold">Maior gargalo:</strong>{" "}
            {funnelData[bottleneck.i - 1]?.label} → {bottleneck.label}, queda de {bottleneck.drop}%.
          </p>
        </div>
      )}
    </Card>
  );
}
