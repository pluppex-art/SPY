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

const MIN_FRACTION = 0.22; // faixa nunca fica fina demais visualmente

/** Funil de Vendas: cone contínuo (cada faixa conecta com a largura da próxima), 5 etapas
 * genéricas e ACUMULATIVAS — cada uma é um subconjunto real da anterior (ver
 * StrategicalView.tsx), então o funil só pode encolher, nunca "crescer" por acaso dos dados.
 *
 * O texto (valor/rótulo/%) fica numa camada SEPARADA por cima do cone, não dentro da faixa
 * colorida com `clip-path` — colocar texto ancorado nas bordas de um elemento com clip-path
 * tapering quebra: como o corte estreita de cima pra baixo, na ALTURA VERTICAL onde o texto fica
 * centralizado a largura visível já é menor que a do topo da faixa, cortando o texto que estava
 * perto da borda (achado real: valor e % sumiam, só o rótulo central sobrevivia). Com o texto
 * numa camada própria, sem clip-path nenhum, nunca é cortado, mesmo nas faixas mais estreitas.
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
          <div className="mx-auto w-full max-w-[280px]">
            {steps.map((s, i) => {
              const topFrac = fractionOf(s.value);
              const bottomFrac = i === steps.length - 1 ? Math.max(MIN_FRACTION * 0.7, topFrac - 0.12) : fractionOf(steps[i + 1].value);
              const clip = `polygon(${50 - topFrac * 50}% 0%, ${50 + topFrac * 50}% 0%, ${50 + bottomFrac * 50}% 100%, ${50 - bottomFrac * 50}% 100%)`;
              return (
                <div key={s.label} className="relative w-full h-12">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.08, duration: 0.4 }}
                    className={`absolute inset-0 ${s.color}`}
                    style={{ clipPath: clip }}
                  />
                  <div className="relative h-full flex items-center justify-center gap-2.5 px-2">
                    <span className="text-xs font-black !text-white tabular-nums shrink-0 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">{s.value}</span>
                    <span className="text-[10px] font-bold !text-white truncate [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">{s.label}</span>
                    <span className="text-[10px] font-bold !text-white/90 tabular-nums shrink-0 [text-shadow:0_1px_2px_rgba(0,0,0,0.35)]">{s.pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
}
