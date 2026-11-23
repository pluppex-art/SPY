import { gradeMd } from "../../../lib/gridCols";
import { Card } from "../../../components/ui/card";
import { Zap, Bug, Rocket, Server } from "lucide-react";

const STATS = [
  { label: "Pontos no Sprint", value: "--", icon: Zap, color: "text-indigo-500" },
  { label: "Issues em Aberto", value: "--", icon: Bug, color: "text-rose-500" },
  { label: "Deploys Hoje", value: "--", icon: Rocket, color: "text-emerald-500" },
  { label: "Uptime Produção", value: "--", icon: Server, color: "text-cyan-500" },
];

export function DevKPIs() {
  return (
    <div className={`grid grid-cols-2 ${gradeMd(STATS.length)} gap-4`}>
      {STATS.map((stat, i) => (
        <Card key={i} className="p-6 bg-[var(--color-surface-elevated)]/50 border hover:border-white/10 border-white/5 backdrop-blur-md transition-all">
          <stat.icon className={`w-5 h-5 ${stat.color} mb-4`} />
          <div className="text-2xl font-display font-black text-white mb-1 italic">{stat.value}</div>
          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{stat.label}</div>
        </Card>
      ))}
    </div>
  );
}
