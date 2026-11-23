import { gradeMd } from "../../../../lib/gridCols";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { motion, AnimatePresence } from "motion/react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis } from "recharts";

interface KpiCard {
  label: string;
  value: string;
  trend: string;
  icon: React.ElementType;
  color: string;
}

interface IndicadoresKPIsProps {
  kpiCards: KpiCard[];
  criticalKPIs: string[];
  selectedKPI: KpiCard | null;
  onSelectKPI: (kpi: KpiCard) => void;
  onCloseKPI: () => void;
}

export function IndicadoresKPIs({ kpiCards, criticalKPIs, selectedKPI, onSelectKPI, onCloseKPI }: IndicadoresKPIsProps) {
  return (
    <>
      <AnimatePresence>
        {selectedKPI && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={onCloseKPI}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-[var(--color-surface-elevated)] border border-white/10 p-8 rounded-2xl max-w-lg w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-white mb-4">{selectedKPI.label} - Histórico (30 dias)</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={[...Array(30).keys()].map((i) => ({ day: i, value: 0 }))}>
                    <Line type="monotone" dataKey="value" stroke="#3B82F6" strokeWidth={2} dot={false} />
                    <XAxis dataKey="day" hide />
                    <YAxis hide />
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <Button className="mt-6 w-full" onClick={onCloseKPI}>Fechar</Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className={`grid grid-cols-1 ${gradeMd(kpiCards.length)} gap-6`}>
        {kpiCards.map((kpi) => (
          <div key={kpi.label} className="h-full">
            <Card
              className={`p-3.5 sm:p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/30 hover:shadow-md transition-all ${criticalKPIs.includes(kpi.label) ? "animate-pulse" : ""}`}
              onDoubleClick={() => onSelectKPI(kpi)}
            >
              <div className="flex justify-between items-start mb-4">
                <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                <span className={`text-[10px] font-bold ${kpi.trend.startsWith("+") ? "text-emerald-400" : "text-rose-400"}`}>{kpi.trend}</span>
              </div>
              <div className="text-lg sm:text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic">{kpi.value}</div>
              <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">{kpi.label}</div>
            </Card>
          </div>
        ))}
      </div>
    </>
  );
}
