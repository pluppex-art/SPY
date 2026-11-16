import { Card } from "../../../../components/ui/card";
import { TrendingUp } from "lucide-react";
import { Inbox } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from "recharts";

interface MonthlyDataItem { name: string; receita: number; meta: number; }
interface PieDataItem { name: string; value: number; color: string; }

interface IndicadoresChartsProps {
  monthlyData: MonthlyDataItem[];
  pieData: PieDataItem[];
}

const SLA_DATA = [
  { name: "Dentro do Prazo", value: 100, color: "#10B981" },
  { name: "Em Risco", value: 0, color: "#F59E0B" },
  { name: "Ultrapassado (Violado)", value: 0, color: "#EF4444" },
];

export function IndicadoresCharts({ monthlyData, pieData }: IndicadoresChartsProps) {
  return (
    <div className="grid lg:grid-cols-4 gap-6">
      <Card className="lg:col-span-2 p-8 border-white/5 bg-[var(--color-surface-elevated)]/80 backdrop-blur-xl group">
        <div className="flex items-center justify-between mb-8">
          <h3 className="font-bold text-xl text-white">Evolução de MRR vs Meta</h3>
          <div className="flex gap-4">
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-[#2563EB]" /><span className="text-[10px] uppercase font-bold text-slate-500">Real</span></div>
            <div className="flex items-center gap-2"><div className="w-2.5 h-2.5 rounded-full bg-white/10" /><span className="text-[10px] uppercase font-bold text-slate-500">Comparativo</span></div>
          </div>
        </div>
        {monthlyData.length === 0 ? (
          <div className="h-[350px] flex flex-col items-center justify-center gap-4 opacity-40">
            <Inbox className="w-12 h-12 text-slate-500" />
            <p className="text-xs font-black text-slate-500 uppercase tracking-widest text-center">Sem histórico financeiro para montar o gráfico.</p>
          </div>
        ) : (
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff05" vertical={false} />
                <XAxis dataKey="name" stroke="#ffffff20" fontSize={10} tickLine={false} axisLine={false} dy={5} />
                <YAxis stroke="#ffffff20" fontSize={10} tickLine={false} axisLine={false} dx={-5} />
                <Tooltip contentStyle={{ backgroundColor: "var(--color-surface)", borderColor: "#ffffff10", borderRadius: "16px" }} cursor={{ fill: "#ffffff03" }} />
                <Bar dataKey="receita" fill="#2563EB" radius={[6, 6, 0, 0]} barSize={40} />
                <Bar dataKey="meta" fill="#ffffff10" radius={[6, 6, 0, 0]} barSize={10} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card className="p-8 border-white/5 bg-[var(--color-surface-elevated)]/80 backdrop-blur-xl flex flex-col relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-5"><TrendingUp className="w-24 h-24 text-[#10B981]" /></div>
        <h3 className="font-bold text-xl text-white mb-8">Cumprimento de SLA</h3>
        <div className="flex-1 flex items-center justify-center relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={SLA_DATA} innerRadius={80} outerRadius={115} paddingAngle={8} dataKey="value" cornerRadius={6}>
                {SLA_DATA.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "var(--color-surface)", border: "none", borderRadius: "12px" }} itemStyle={{ color: "#F8FAFC", fontWeight: "bold" }} formatter={(value: any) => `${value ?? 0}%`} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-4xl font-black text-white">0%</span>
            <span className="text-[10px] text-emerald-500 uppercase tracking-widest font-bold">Nota de saúde</span>
          </div>
        </div>
        <div className="mt-8 grid grid-cols-1 gap-2">
          {[{ name: "Dentro do Prazo", value: 100, color: "#10B981" }, { name: "Em Risco", value: 0, color: "#F59E0B" }, { name: "Ultrapassado", value: 0, color: "#EF4444" }].map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="text-[10px] text-slate-400 font-bold uppercase truncate">{d.name} ({d.value}%)</span>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-8 border-white/5 bg-[var(--color-surface-elevated)]/80 backdrop-blur-xl flex flex-col relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10"><TrendingUp className="w-24 h-24 text-[#06B6D4]" /></div>
        <h3 className="font-bold text-xl text-white mb-8">Conversão por Origem</h3>
        <div className="flex-1 flex items-center justify-center relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={pieData} innerRadius={80} outerRadius={115} paddingAngle={8} dataKey="value" cornerRadius={6}>
                {pieData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: "var(--color-surface)", border: "none", borderRadius: "12px" }} itemStyle={{ color: "#F8FAFC", fontWeight: "bold" }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-4xl font-black text-white">{pieData.reduce((acc, curr) => acc + curr.value, 0)}</span>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Leads Atuais</span>
          </div>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-4">
          {pieData.map((d, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="text-[10px] text-slate-400 font-bold uppercase truncate">{d.name}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
