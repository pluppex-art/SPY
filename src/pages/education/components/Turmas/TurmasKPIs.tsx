import { gradeLg } from "../../../../lib/gridCols";
import { Card } from "../../../../components/ui/card";

interface TurmasKPIsStat {
  label: string;
  value: string;
  icon: React.ElementType;
  color: string;
  bg: string;
}

interface TurmasKPIsProps {
  stats: TurmasKPIsStat[];
}

const ICON_COLORS = ["text-indigo-500", "text-emerald-500", "text-blue-500", "text-rose-500", "text-amber-500", "text-cyan-500", "text-purple-500"];

export function TurmasKPIs({ stats }: TurmasKPIsProps) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 ${gradeLg(stats.length)} gap-4`}>
      {stats.map((stat, i) => (
        <Card key={i} className="p-3.5 sm:p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/30 hover:shadow-md transition-all">
          <stat.icon className={`w-5 h-5 ${ICON_COLORS[i % ICON_COLORS.length]} mb-2 sm:mb-3`} />
          <div className="text-lg sm:text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic">{stat.value}</div>
          <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">{stat.label}</div>
        </Card>
      ))}
    </div>
  );
}
