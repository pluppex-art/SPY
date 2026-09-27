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
const ROW_H = 62; // px — altura de cada faixa do cone = altura de cada linha da lista (ficam alinhadas)

/** Funil de Vendas: cone (só a forma, sem texto dentro — ver por quê no SalesFunnelWidget antigo)
 * à esquerda, com o número/rótulo/% de cada etapa numa lista à direita, cada linha alinhada com a
 * faixa correspondente. 5 etapas genéricas e ACUMULATIVAS — cada uma é um subconjunto real da
 * anterior (ver StrategicalView.tsx), então o funil só pode encolher, nunca "crescer" por acaso
 * dos dados. */
export function SalesFunnelWidget({ steps }: { steps: FunnelStepData[] }) {
  const top = steps[0]?.value || 1;
  const hasData = steps.some((s) => s.value > 0);
  const fractionOf = (v: number) => Math.max(MIN_FRACTION, v / top);

  return (
    <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm h-full flex flex-col">
      <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2 mb-6">
        <Filter className="w-4 h-4 text-purple-500" /> Funil de Vendas
      </h3>
      {!hasData ? (
        <EmptyState icon={Filter} title="Sem leads ainda" description="O funil aparece assim que os primeiros leads entrarem no pipeline." className="py-8 flex-1" />
      ) : (
        <div className="flex-1 flex items-center gap-5">
          {/* Cone — decorativo, cada faixa proporcional ao valor real da etapa */}
          <div className="w-[42%] max-w-[170px] shrink-0" style={{ height: ROW_H * steps.length }}>
            {steps.map((s, i) => {
              const topFrac = fractionOf(s.value);
              const bottomFrac = i === steps.length - 1 ? Math.max(MIN_FRACTION * 0.7, topFrac - 0.12) : fractionOf(steps[i + 1].value);
              const clip = `polygon(${50 - topFrac * 50}% 0%, ${50 + topFrac * 50}% 0%, ${50 + bottomFrac * 50}% 100%, ${50 - bottomFrac * 50}% 100%)`;
              return (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.08, duration: 0.4 }}
                  className={`w-full ${s.color}`}
                  style={{ height: ROW_H, clipPath: clip }}
                />
              );
            })}
          </div>

          {/* Números — uma linha por etapa, alinhada com a faixa correspondente do cone */}
          <div className="flex-1 min-w-0">
            {steps.map((s) => (
              <div key={s.label} className="flex items-center justify-between gap-3" style={{ height: ROW_H }}>
                <div className="min-w-0">
                  <p className={`text-2xl font-black tabular-nums leading-none ${s.textColor}`}>{s.value}</p>
                  <p className="text-xs font-semibold text-[var(--color-text-muted)] truncate mt-0.5">{s.label}</p>
                </div>
                <span className="text-base font-bold text-[var(--color-text-faint)] tabular-nums shrink-0">{s.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
