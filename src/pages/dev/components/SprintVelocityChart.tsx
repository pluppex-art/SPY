import { Card } from "../../../components/ui/card";
import { Activity } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export const ESTILO_TOOLTIP = { background: "var(--color-surface-elevated)", border: "1px solid var(--color-border-default)", borderRadius: 12, fontSize: 11 };
export const EIXO = { fill: "var(--color-text-muted)", fontSize: 10, fontWeight: 700 };

export function SprintVelocityChart({ dados }: { dados: { semana: string; pontos: number }[] }) {
  const vazio = dados.every(d => d.pontos === 0);
  return (
    <Card className="lg:col-span-2 p-5 sm:p-8">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-6">
        <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-widest flex items-center gap-2">
          <Activity className="w-4 h-4 text-[var(--color-primary-blue)]" /> Pontos concluídos por semana
        </h3>
        <span className="text-[10px] text-[var(--color-text-muted)] font-bold uppercase tracking-widest">Últimas {dados.length} semanas</span>
      </div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={dados}>
            <defs>
              <linearGradient id="gPontos" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-primary-blue)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="var(--color-primary-blue)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-subtle)" />
            <XAxis dataKey="semana" tick={EIXO} axisLine={false} tickLine={false} />
            <YAxis tick={EIXO} axisLine={false} tickLine={false} allowDecimals={false} width={32} />
            <Tooltip contentStyle={ESTILO_TOOLTIP} labelFormatter={(l) => `Semana de ${l}`} />
            <Area type="monotone" dataKey="pontos" stroke="var(--color-primary-blue)" strokeWidth={2} fill="url(#gPontos)" name="Pontos" />
          </AreaChart>
        </ResponsiveContainer>
        {vazio && <p className="absolute inset-0 grid place-items-center text-xs font-bold text-[var(--color-text-muted)] pointer-events-none">Nenhuma tarefa concluída neste intervalo.</p>}
      </div>
    </Card>
  );
}
