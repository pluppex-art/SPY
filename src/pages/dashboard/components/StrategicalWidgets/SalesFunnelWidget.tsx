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

/** Funil de Vendas: faixas centralizadas afinando de cima pra baixo (visual de cone), 5 etapas
 * genéricas e ACUMULATIVAS — cada uma é um subconjunto real da anterior (ver
 * StrategicalView.tsx), então o funil só pode encolher, nunca "crescer" por acaso dos dados. */
export function SalesFunnelWidget({ steps }: { steps: FunnelStepData[] }) {
  const top = steps[0]?.value || 1;
  const hasData = steps.some((s) => s.value > 0);

  return (
    <Card className="p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm h-full flex flex-col">
      <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-wider flex items-center gap-2 mb-6">
        <Filter className="w-4 h-4 text-purple-500" /> Funil de Vendas
      </h3>
      {!hasData ? (
        <EmptyState icon={Filter} title="Sem leads ainda" description="O funil aparece assim que os primeiros leads entrarem no pipeline." className="py-8 flex-1" />
      ) : (
        <div className="flex-1 flex flex-col justify-center gap-2">
          {steps.map((s, i) => {
            const widthPct = Math.max(24, Math.round((s.value / top) * 100));
            return (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, scaleX: 0.7 }}
                animate={{ opacity: 1, scaleX: 1 }}
                transition={{ delay: i * 0.08, duration: 0.4 }}
                className={`mx-auto h-11 ${s.color} flex items-center justify-between gap-3 px-4 shadow-sm ${i === 0 ? "rounded-t-xl" : ""} ${i === steps.length - 1 ? "rounded-b-xl" : ""}`}
                style={{ width: `${widthPct}%`, minWidth: 150 }}
              >
                <span className="text-xs font-black text-white tabular-nums shrink-0">{s.value}</span>
                <span className="text-[10px] font-bold !text-white/90 truncate">{s.label}</span>
                <span className="text-[10px] font-bold !text-white/90 tabular-nums shrink-0">{s.pct}%</span>
              </motion.div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
