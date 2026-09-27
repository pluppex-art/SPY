import { motion } from 'motion/react';
import { Card } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Filter } from 'lucide-react';

export interface FunnelStepData {
  label: string;
  value: number;
  pct: number;
  color: string;
  textColor: string;
}

const MIN_FRACTION = 0.22; // faixa nunca fica fina demais visualmente
const CONE_H = 110; // px

/** Funil de Vendas deitado: cone horizontal (largo à esquerda, afinando pra direita), com o
 * número/rótulo/% de cada etapa numa linha abaixo, cada coluna alinhada com a faixa
 * correspondente. 5 etapas genéricas e ACUMULATIVAS — cada uma é um subconjunto real da anterior
 * (ver StrategicalView.tsx), então o funil só pode encolher, nunca "crescer" por acaso dos dados.
 *
 * O texto fica numa camada SEPARADA, embaixo do cone — não dentro da faixa com `clip-path` (ver
 * histórico deste arquivo: texto ancorado dentro de uma forma afunilando é cortado). */
export function SalesFunnelWidget({ steps }: { steps: FunnelStepData[] }) {
  const top = steps[0]?.value || 1;
  const hasData = steps.some((s) => s.value > 0);
  const fractionOf = (v: number) => Math.max(MIN_FRACTION, v / top);
  const colWidth = 100 / steps.length;

  return (
    <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
      <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2 mb-6">
        <Filter className="w-4 h-4 text-purple-500" /> Funil de Vendas
      </h3>
      {!hasData ? (
        <EmptyState icon={Filter} title="Sem leads ainda" description="O funil aparece assim que os primeiros leads entrarem no pipeline." className="py-8" />
      ) : (
        <div className="space-y-4">
          {/* Cone — decorativo, largo à esquerda afinando pra direita */}
          <div className="relative w-full" style={{ height: CONE_H }}>
            {steps.map((s, i) => {
              const leftFrac = fractionOf(s.value);
              const rightFrac = i === steps.length - 1 ? Math.max(MIN_FRACTION * 0.7, leftFrac - 0.12) : fractionOf(steps[i + 1].value);
              const clip = `polygon(0% ${50 - leftFrac * 50}%, 0% ${50 + leftFrac * 50}%, 100% ${50 + rightFrac * 50}%, 100% ${50 - rightFrac * 50}%)`;
              return (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  className={`absolute top-0 bottom-0 ${s.color}`}
                  style={{ left: `${i * colWidth}%`, width: `${colWidth}%`, clipPath: clip }}
                />
              );
            })}
          </div>

          {/* Números — uma coluna por etapa, alinhada com a faixa correspondente do cone */}
          <div className="grid" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
            {steps.map((s) => (
              <div key={s.label} className="text-center px-1">
                <p className={`text-2xl font-black tabular-nums leading-none ${s.textColor}`}>{s.value}</p>
                <p className="text-xs font-semibold text-[var(--color-text-muted)] truncate mt-1">{s.label}</p>
                <p className="text-[11px] font-bold text-[var(--color-text-faint)] tabular-nums mt-0.5">{s.pct}%</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
