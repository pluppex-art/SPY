import { Card } from "../../../../components/ui/card";
import { BarChart3, TrendingUp, Target } from "lucide-react";
import { motion } from "motion/react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { TeamMember, Squad } from "../../hooks/useEquipe";

interface EquipePerformanceProps {
  team: TeamMember[];
  squads: Squad[];
}

export function EquipePerformance({ team, squads }: EquipePerformanceProps) {
  const chartData = squads.map((s) => ({ name: s.name, value: 0, leads: 0 }));

  return (
    <motion.div
      key="performance"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-8"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-black text-white tracking-tighter">Ranking & Desempenho</h2>
          <p className="text-sm text-slate-400 mt-1">Análise volumétrica de conversão e receita por células.</p>
        </div>
        <div className="flex gap-2 p-1 bg-white/5 border border-white/5 rounded-xl">
          <button className="px-4 py-1.5 text-[10px] font-bold text-white bg-white/10 rounded-lg shadow-inner">Mensal</button>
          <button className="px-4 py-1.5 text-[10px] font-bold text-slate-500 hover:text-slate-300">Trimestral</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-8 bg-[var(--color-surface-elevated)]/40 border-white/5 backdrop-blur-xl relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
            <TrendingUp className="w-32 h-32 text-blue-500" />
          </div>
          <h3 className="text-md font-black text-white mb-8 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-blue-500/20 border border-blue-500/20">
              <BarChart3 className="w-4 h-4 text-blue-400" />
            </div>
            Receita Gerada (Total kR$)
          </h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <defs>
                  <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.4} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis dataKey="name" stroke="#475569" fontSize={9} axisLine={false} tickLine={false} dy={10} />
                <YAxis stroke="#475569" fontSize={9} axisLine={false} tickLine={false} />
                <Tooltip
                  cursor={{ fill: "#ffffff05" }}
                  contentStyle={{ backgroundColor: "var(--color-surface)", border: "1px solid #1e293b", borderRadius: "16px", boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.5)" }}
                  itemStyle={{ color: "#3b82f6", fontWeight: "bold", fontSize: "11px" }}
                  labelStyle={{ color: "#fff", fontSize: "12px", fontWeight: "900", marginBottom: "8px" }}
                />
                <Bar dataKey="value" fill="url(#barGradient)" radius={[6, 6, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-8 bg-[var(--color-surface-elevated)]/40 border-white/5 backdrop-blur-xl group">
          <h3 className="text-md font-black text-white mb-8 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/20">
              <Target className="w-4 h-4 text-emerald-400" />
            </div>
            Top Performers (Membro)
          </h3>
          <div className="space-y-5">
            {team.sort((a, b) => b.deals - a.deals).slice(0, 5).map((m, i) => (
              <div key={m.name} className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.01] hover:bg-white/[0.03] transition-all border border-transparent hover:border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-400 border border-white/5">
                    {i + 1}
                  </div>
                  <div>
                    <div className="text-xs font-black text-white">{m.name}</div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">{m.squad}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-black text-emerald-500">{m.deals} leads</div>
                  <div className="text-[9px] text-slate-600 font-bold">FECHADOS</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </motion.div>
  );
}
