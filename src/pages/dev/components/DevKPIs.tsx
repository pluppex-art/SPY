import { gradeMd } from "../../../lib/gridCols";
import { Card } from "../../../components/ui/card";
import { Zap, Bug, ListTodo, Server } from "lucide-react";
import type { resumoDev } from "../lib/painelDev";

export function DevKPIs({ resumo, loading, ambientes }: { resumo: ReturnType<typeof resumoDev>; loading: boolean; ambientes: { operacionais: number; total: number } }) {
  const stats = [
    { label: "Pontos concluídos", value: `${resumo.pontosConcluidos}/${resumo.pontosTotal}`, hint: "Pontos em Concluído sobre todos os pontos das tarefas", icon: Zap, color: "text-[var(--color-primary-blue)]" },
    { label: "Tarefas em aberto", value: resumo.tarefasAbertas, hint: `${resumo.emAndamento} em progresso ou revisão`, icon: ListTodo, color: "text-warning" },
    { label: "Bugs em aberto", value: resumo.bugsAbertos, hint: "Tarefas do tipo bug não concluídas e pendências abertas", icon: Bug, color: "text-rose-500" },
    { label: "Ambientes operacionais", value: ambientes.total ? `${ambientes.operacionais}/${ambientes.total}` : "—", hint: ambientes.total ? "Ambientes cadastrados em operação" : "Nenhum ambiente cadastrado", icon: Server, color: "text-emerald-500" },
  ];
  return (
    <div className={`grid grid-cols-2 ${gradeMd(stats.length)} gap-4`}>
      {stats.map((stat) => (
        <Card key={stat.label} className="p-3.5 sm:p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/30 hover:shadow-md transition-all">
          <stat.icon className={`w-5 h-5 ${stat.color} mb-2 sm:mb-3`} />
          <div className="text-lg sm:text-2xl font-display font-black text-[var(--color-text-primary)] mb-1 italic">{loading ? "…" : stat.value}</div>
          <div className="text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-wider">{stat.label}</div>
          <div className="mt-1 text-[10px] text-[var(--color-text-faint)] font-medium leading-tight">{stat.hint}</div>
        </Card>
      ))}
    </div>
  );
}
