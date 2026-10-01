import { Card } from "../../../../components/ui/card";
import { Users, Flame, CheckCircle2, Target, BarChart3 } from "lucide-react";

interface PipelineKPIsProps {
  total: number;
  hot: number;
  closed: number;
  winRate: number;
  formattedTotalValue: string;
}

export function PipelineKPIs({ total, hot, closed, winRate, formattedTotalValue }: PipelineKPIsProps) {
  const items = [
    { label: "Em aberto", value: total, icon: Users, color: "text-[var(--color-primary-blue)]" },
    { label: "Alta Prior.", value: hot, icon: Flame, color: "text-warning" },
    { label: "Ganhos", value: closed, icon: CheckCircle2, color: "text-success" },
    { label: "Win Rate", value: `${winRate}%`, icon: Target, color: "text-info" },
    { label: "Total de Ganhos", value: formattedTotalValue, icon: BarChart3, color: "text-accent", wide: true },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 shrink-0">
      {items.map(({ label, value, icon: Icon, color, wide }) => (
        <Card
          key={label}
          className={`p-4 hover:border-[var(--color-border-default)]/80 transition-all ${wide ? "col-span-2 md:col-span-1" : ""}`}
        >
          <Icon className={`w-4 h-4 ${color} mb-2`} />
          <div className="text-xl font-display font-black text-[var(--color-text-primary)] mb-1 italic">{value}</div>
          <div className="text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-widest">{label}</div>
        </Card>
      ))}
    </div>
  );
}
