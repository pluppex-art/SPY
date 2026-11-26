import { useNavigate } from "react-router-dom";
import { Card } from "../../../components/ui/card";
import { Bug, CheckCircle2, GitBranch, ListTodo, PencilLine } from "lucide-react";
import { haQuanto, type TarefaPainel, type IssuePainel } from "../lib/painelDev";

const ETAPA: Record<string, string> = { backlog: "Backlog", todo: "A Fazer", inprogress: "Em Progresso", review: "Em Review", done: "Concluído" };

/** As últimas movimentações: tarefas criadas, atualizadas ou concluídas e pendências abertas. */
export function DevRecentActivity({ tarefas, issues, projetos, loading }: { tarefas: TarefaPainel[]; issues: IssuePainel[]; projetos: Map<string, string>; loading: boolean }) {
  const navigate = useNavigate();
  const itens = [
    ...tarefas.map((t) => {
      const quando = t.updated_at || t.created_at;
      const nova = Math.abs(Date.parse(quando) - Date.parse(t.created_at)) < 60_000;
      const pid = t.project_id || t.project;
      return {
        chave: `t-${t.id}`, titulo: t.title, quando,
        detalhe: `${t.column_id === "done" ? "Tarefa concluída" : nova ? "Tarefa criada" : `Tarefa atualizada · ${ETAPA[t.column_id] ?? t.column_id}`}${pid && projetos.get(pid) ? ` · ${projetos.get(pid)}` : ""}`,
        Icone: t.column_id === "done" ? CheckCircle2 : nova ? ListTodo : PencilLine,
        cor: t.column_id === "done" ? "text-success" : "text-[var(--color-primary-blue)]",
        destino: pid ? `/app/dev/sprints?projeto=${encodeURIComponent(pid)}` : "/app/dev/sprints",
      };
    }),
    ...issues.map((i) => ({ chave: `i-${i.id}`, titulo: i.title, quando: i.updated_at || i.created_at, detalhe: `Pendência · ${i.status}`, Icone: Bug, cor: "text-rose-500", destino: "/app/dev/issues" })),
  ].sort((a, b) => (b.quando > a.quando ? 1 : -1)).slice(0, 8);

  return (
    <Card className="lg:col-span-2 overflow-hidden">
      <div className="p-5 border-b border-[var(--color-border-subtle)] flex justify-between items-center">
        <h3 className="text-xs font-black text-[var(--color-text-primary)] uppercase tracking-widest flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-[var(--color-primary-blue)]" /> Atividade Recente
        </h3>
        <button type="button" onClick={() => navigate("/app/dev/sprints")} className="text-[10px] text-[var(--color-primary-blue)] font-black uppercase tracking-widest hover:underline bg-transparent border-none cursor-pointer">
          Ver quadro
        </button>
      </div>
      <div className="divide-y divide-[var(--color-border-subtle)]">
        {itens.map((item) => (
          <button key={item.chave} type="button" onClick={() => navigate(item.destino)} className="w-full text-left flex items-center gap-4 p-4 hover:bg-[var(--color-surface-sunken)] transition-colors cursor-pointer bg-transparent border-x-0 border-t-0">
            <span className="p-2 rounded-xl bg-[var(--color-surface-sunken)] shrink-0"><item.Icone className={`w-4 h-4 ${item.cor}`} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-[var(--color-text-primary)] truncate">{item.titulo}</span>
              <span className="block text-[11px] text-[var(--color-text-muted)] truncate">{item.detalhe}</span>
            </span>
            <span className="text-[10px] text-[var(--color-text-faint)] font-bold shrink-0">{haQuanto(item.quando)}</span>
          </button>
        ))}
        {itens.length === 0 && (
          <div className="p-8 text-center text-[var(--color-text-muted)] text-xs font-bold">
            {loading ? "Carregando…" : "Nenhuma tarefa ou pendência registrada nesta empresa."}
          </div>
        )}
      </div>
    </Card>
  );
}
