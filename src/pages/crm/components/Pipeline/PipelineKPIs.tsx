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
    { label: "Total de Ganhos", value: formattedTotalValue, icon: BarChart3, color: "text-accent" },
  ];

  // Pedido explícito do usuário: cards menores e em linha rolável (não mais
  // um grid rígido que esticava cada card pra preencher a largura toda).
  return (
    <div className="flex gap-2 overflow-x-auto scrollbar-none shrink-0 pb-0.5">
      {items.map(({ label, value, icon: Icon, color }) => (
        <Card
          key={label}
          className="p-3 hover:border-[var(--color-border-default)]/80 transition-all shrink-0 w-[140px]"
        >
          <Icon className={`w-3.5 h-3.5 ${color} mb-1.5`} />
          <div className="text-base font-display font-black text-[var(--color-text-primary)] mb-0.5 italic truncate">{value}</div>
          <div className="text-[9px] font-black text-[var(--color-text-muted)] uppercase tracking-widest truncate">{label}</div>
        </Card>
      ))}
    </div>
  );
}
