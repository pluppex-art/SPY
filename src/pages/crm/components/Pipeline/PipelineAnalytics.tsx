import React from 'react';
import { Card } from '../../../../components/ui/card';
import { Button } from '../../../../components/ui/button';
import { ResponsiveContainer, BarChart, XAxis, Tooltip, Bar, Cell } from 'recharts';
import { Activity, Download } from 'lucide-react';


interface PipelineAnalyticsProps {
  showAnalytics: boolean;
  analyticsData: any[];
  exportPDF: () => void;
  hotLeadsCount: number;
}

export function PipelineAnalytics({
  showAnalytics,
  analyticsData,
  exportPDF,
  hotLeadsCount,
}: PipelineAnalyticsProps) {
  if (!showAnalytics) return null;
  const totalValue = analyticsData.reduce((sum, d) => sum + (Number(d.value) || 0), 0);

  return (
    <div className="overflow-hidden text-left">
      <Card className="p-6 flex flex-col md:flex-row gap-6 mb-2">
        <div className="flex-1 min-h-[200px]">
          <h4 className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-4 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Distribuição Financeira por Fase
          </h4>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={analyticsData}>
              <XAxis dataKey="name" hide />
              <Tooltip
                formatter={(v: any) => {
                  const n = Number(v) || 0;
                  const pct = totalValue > 0 ? Math.round((n / totalValue) * 1000) / 10 : 0;
                  return [`${n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} · ${pct}%`, "Valor"];
                }}
                contentStyle={{ backgroundColor: 'var(--color-surface-elevated)', border: '1px solid var(--color-border-default)', borderRadius: '12px' }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {analyticsData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="w-full md:w-64 space-y-3">
          <h4 className="text-[10px] font-bold text-[var(--color-text-muted)] uppercase tracking-widest mb-4">Relatórios</h4>
          <Button onClick={exportPDF} variant="subtle" className="w-full text-xs font-bold h-10 gap-2">
            <Download className="w-4 h-4" /> Exportar PDF Completo
          </Button>
          <div className="p-3 bg-[var(--color-primary-blue)]/5 rounded-[var(--radius-control)] border border-[var(--color-primary-blue)]/10">
             <p className="text-[9px] text-[var(--color-primary-blue)] font-bold uppercase mb-1">Leads Quentes</p>
             <p className="text-xs text-[var(--color-text-muted)] font-medium">
               {hotLeadsCount > 0
                 ? `${hotLeadsCount} lead(s) com Score IA ≥ 80 ou temperatura quente, ainda em aberto.`
                 : "Nenhum lead com Score IA ≥ 80 em aberto no momento."}
             </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
