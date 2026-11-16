import { Card } from "../../../../components/ui/card";
import { Clock, Zap, Inbox } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

import { HelpTip } from "../../../../components/ui/help-tip";
interface ChartDay { name: string; consultas: number; noShow: number; }

interface PainelChartsProps {
  clinicData: ChartDay[];
  totalAppointments: number;
  confirmed: number;
  finalized: number;
  late: number;
  occupancyPct: number;
}

export function PainelCharts({ clinicData, totalAppointments, confirmed, finalized, late, occupancyPct }: PainelChartsProps) {
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="lg:col-span-2 p-6 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
        <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text-primary)] flex items-center gap-2">
              <Clock className="w-4 h-4" /> Fluxo de Atendimento
             <HelpTip label="Sobre Fluxo de Atendimento">Mostra quantos atendimentos a clínica fez em cada dia da semana. Serve para ver quais dias são mais cheios e quais são mais vazios.</HelpTip></h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span className="text-xs text-[var(--color-text-muted)]">Compareceu</span></div>
            <div className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-rose-500" /><span className="text-xs text-[var(--color-text-muted)]">Atrasado/Cancelado</span></div>
          </div>
        </div>
        {totalAppointments === 0 ? (
          <div className="h-[320px] flex flex-col items-center justify-center gap-4 opacity-40">
            <Inbox className="w-10 h-10 text-[var(--color-text-faint)]" />
            <p className="text-xs text-[var(--color-text-muted)] text-center">Nenhum agendamento cadastrado ainda.</p>
          </div>
        ) : (
          <div className="h-[320px] -mx-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={clinicData}>
                <defs>
                  <linearGradient id="colorConsultas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="var(--color-text-faint)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--color-text-faint)" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--color-surface-elevated)', border: '1px solid var(--color-border-default)', borderRadius: '8px', color: 'var(--color-text-primary)' }} itemStyle={{ fontSize: '11px' }} />
                <Area type="monotone" dataKey="consultas" stroke="#10b981" fillOpacity={1} fill="url(#colorConsultas)" strokeWidth={2} />
                <Area type="step" dataKey="noShow" stroke="#f43f5e" fillOpacity={0.05} strokeWidth={1.5} strokeDasharray="5 5" fill="#f43f5e" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-6 flex flex-col items-center justify-center bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
        <h3 className="text-sm font-semibold text-[var(--color-text-primary)] mb-6 flex items-center gap-2 w-full">
          <Zap className="w-4 h-4" /> Ocupação Hoje
        </h3>
        <div className="relative w-40 h-40 mb-6">
          <svg className="w-full h-full" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="var(--color-border-default)" strokeWidth="8" />
            <circle cx="50" cy="50" r="45" fill="none" stroke="#10b981" strokeWidth="8"
              strokeDasharray="282.7" strokeDashoffset={282.7 * (1 - occupancyPct / 100)}
              strokeLinecap="round" transform="rotate(-90 50 50)" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold text-[var(--color-text-primary)]">{occupancyPct}<span className="text-sm text-[var(--color-text-muted)]">%</span></span>
            <span className="text-xs text-[var(--color-text-muted)]">Confirmados</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 w-full">
          {[
            { label: 'Total', value: totalAppointments },
            { label: 'Ativos', value: confirmed },
            { label: 'Finalizados', value: finalized },
            { label: 'Atrasados', value: late },
          ].map((s, i) => (
            <div key={i} className="text-center p-3 bg-[var(--color-surface-sunken)] rounded-xl">
              <p className="text-xs text-[var(--color-text-muted)] mb-1">{s.label}</p>
              <p className="text-lg font-semibold text-[var(--color-text-primary)]">{s.value}</p>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
