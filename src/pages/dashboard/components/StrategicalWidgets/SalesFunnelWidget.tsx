import { motion } from 'motion/react';
import { Card } from '../../../../components/ui/card';
import { EmptyState } from '../../../../components/ui/empty-state';
import { Filter } from 'lucide-react';

export interface FunnelStepData {
  label: string;
  value: number;
  pct: number;
  color: string;
}

const MIN_FRACTION = 0.22; // faixa nunca fica fina demais pro texto não caber

/** Funil de Vendas: cone contínuo (cada faixa conecta com a largura da próxima — não são
 * retângulos empilhados), 5 etapas genéricas e ACUMULATIVAS — cada uma é um subconjunto real da
 * anterior (ver StrategicalView.tsx), então o funil só pode encolher, nunca "crescer" por acaso
 * dos dados. Todas as faixas ficam no MESMO container (mesma largura de referência) — o
 * clip-path de cada uma é calculado em cima dessa largura comum, senão o topo de uma faixa não
 * bate com o fundo da faixa anterior e o cone fica "desencontrado".
 */
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
        <div className="flex-1 flex flex-col justify-center">
          <div className="mx-auto w-full max-w-[260px]">
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
                  className={`relative w-full h-12 ${s.color} flex items-center justify-between px-4`}
                  style={{ clipPath: clip }}
                >
                  <span className="text-xs font-black !text-white tabular-nums shrink-0">{s.value}</span>
                  <span className="text-[10px] font-bold !text-white/90 truncate mx-2">{s.label}</span>
                  <span className="text-[10px] font-bold !text-white/90 tabular-nums shrink-0">{s.pct}%</span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
