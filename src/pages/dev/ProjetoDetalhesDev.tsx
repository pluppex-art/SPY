import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Plus, Zap } from "lucide-react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { NovaTarefaSprintModal } from "./modals/NovaTarefaSprintModal";
import { useDevSprints, type Column } from "./hooks/useDevSprints";
import { useDevProjects } from "./hooks/useDevProjects";
import { readKanbanConfig, KANBAN_KEYS, KANBAN_COR_CLASS } from "../../hooks/useKanbanConfig";
import { EditarProjetoDevModal } from "./modals/EditarProjetoDevModal";
import { ApagarProjetoDevModal } from "./modals/ApagarProjetoDevModal";
import { useNavigate } from 'react-router-dom';
import { useData } from "../../contexts/DataContext";


const PRIORITY_STYLE: Record<string, string> = {
  crítica: "text-red-400",
  alta: "text-amber-400",
  média: "text-amber-400",
  baixa: "text-slate-400",
};

const TYPE_ICON: Record<string, string> = {
  feature: "✦",
  bug: "🐛",
  chore: "⚙",
  refactor: "♻",
};

const TYPE_COLOR: Record<string, string> = {
  feature: "text-slate-400",
  bug: "text-red-400",
  chore: "text-slate-400",
  refactor: "text-slate-400",
};

function getSprintColumns(appSettings: Record<string, any>): { id: Column; label: string; dotColor: string }[] {
  return readKanbanConfig(appSettings, KANBAN_KEYS.sprint).map((c: any) => ({
    id: c.id as Column,
    label: c.nome,
    dotColor: KANBAN_COR_CLASS[c.cor] ?? "bg-slate-500",
  }));
}

export default function ProjetoDetalhesDev() {
  const { projectId } = useParams();
  const pid = projectId ?? null;
  const navigate = useNavigate();
  const { appSettings } = useData();

  const COLUMNS = useMemo(() => getSprintColumns(appSettings), [appSettings]);

  // Carrega projetos pra mostrar header/status.
  const { projects, updateProject, deleteProject } = useDevProjects();
  const project = useMemo(() => projects.find((p: any) => String(p.id) === String(pid)), [projects, pid]);


  const { tasks, addTask, moveTask, detalhesDisponiveis } = useDevSprints(pid);
  const [draggedId, setDraggedId] = useState<string | number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<Column | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleDrop = async (col: Column) => {
    if (draggedId === null) return;
    await moveTask(draggedId, col);
    setDraggedId(null);
    setDragOverCol(null);
  };

  const backlogTotalPoints = useMemo(
    () => tasks.filter((t) => t.column === "backlog").reduce((s, t) => s + t.points, 0),
    [tasks]
  );

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);


  const totalPointsDone = useMemo(
    () => tasks.filter((t) => t.column === "done").reduce((s, t) => s + t.points, 0),
    [tasks]
  );

  // Progresso automático (por pontos) baseado em backlog vs done.
  // Se seu prompt exigir por contagem de cards, dá pra trocar para length.
  const progress = useMemo(() => {
    if (!backlogTotalPoints) return tasks.length ? 0 : 0;
    return Math.round((totalPointsDone / backlogTotalPoints) * 100);
  }, [backlogTotalPoints, totalPointsDone, tasks.length]);

  return (
    <PageContainer
      title={project ? `Projeto: ${project.name}` : "Projeto"}
      description="Kanban do backlog/sprint com progresso calculado automaticamente." 
      breadcrumb={[{ label: "Dev & Tecnologia", path: "/app/dev/painel" }, { label: "Projetos", path: "/app/dev/projetos" }, { label: "Detalhes" }]}
      actions={
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/5">
            <Zap className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-xs text-slate-300">{progress}% concluído</span>
          </div>

          {project && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsEditOpen(true)}
                className="rounded-xl h-10 px-5 text-xs gap-2"
              >
                Editar Projeto
              </Button>
              <Button
                type="button"
                variant="danger"
                onClick={() => setIsDeleteOpen(true)}
                className="rounded-xl h-10 px-5 text-xs gap-2"
              >
                Apagar
              </Button>
            </>
          )}

          <Button onClick={() => setIsModalOpen(true)} className="rounded-xl h-10 px-5 text-xs gap-2">
            <Plus className="w-4 h-4" /> Nova Task
          </Button>
        </div>
      }

    >
      <div className="pb-10">
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
          {COLUMNS.map((col) => {
            const colTasks = tasks.filter((t) => t.column === col.id);
            const colPoints = colTasks.reduce((s, t) => s + t.points, 0);
            return (
              <div
                key={col.id}
                className={`flex-shrink-0 w-72 flex flex-col rounded-2xl border ${dragOverCol === col.id ? "border-white/20 bg-white/[0.03]" : "border-white/5 bg-[var(--color-surface)]/40"} transition-all`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCol(col.id);
                }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={() => handleDrop(col.id)}
              >
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${col.dotColor}`} />
                    <span className="text-[11px] font-black text-white uppercase tracking-wider">{col.label}</span>
                    <span className="text-[10px] font-black text-slate-500 ml-1">{colTasks.length}</span>
                  </div>
                  <span className="text-[10px] text-slate-600 font-bold">{colPoints}pts</span>
                </div>

                <div className="flex-1 p-3 space-y-3 min-h-[120px]">
                  {colTasks.map((task) => (
                    <div
                      key={String(task.id)}
                      draggable
                      onDragStart={() => setDraggedId(task.id)}
                      className={`p-4 bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl cursor-grab active:cursor-grabbing hover:border-white/10 transition-all select-none group ${draggedId === task.id ? "opacity-40 scale-95" : ""}`}
                    >
                      <div className="flex items-center justify-between mb-2.5">
                        <span className={`text-[10px] font-black uppercase tracking-wider ${TYPE_COLOR[task.type]}`}> {TYPE_ICON[task.type]} {task.type}</span>
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${PRIORITY_STYLE[task.priority]}`}>{task.priority}</span>
                      </div>

                      <p className="text-xs font-bold text-white leading-snug mb-3">{task.title}</p>

                      <div className="flex flex-wrap gap-1 mb-3">
                        {task.tags.map((tag) => (
                          <span key={tag} className="text-[9px] font-bold text-slate-500 bg-white/[0.03] px-1.5 py-0.5 rounded">#{tag}</span>
                        ))}
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-black text-white border border-white/10">
                          {(task.assignee || "?").split(".")[0]}
                        </div>
                        <span className="text-[10px] font-black text-slate-500">{task.points}pts</span>
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="w-full py-2.5 flex items-center justify-center gap-2 text-slate-600 hover:text-slate-400 hover:bg-white/[0.02] rounded-xl transition-all border border-dashed border-white/[0.04] hover:border-white/10"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-black uppercase tracking-wider">Adicionar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <NovaTarefaSprintModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={addTask}
        comAnexos={detalhesDisponiveis}
      />

      <EditarProjetoDevModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSave={async (payload) => {
              await updateProject({
                ...payload,
                id: String(payload.id),
              });

        }}
        initialData={
          project
            ? {
                id: project.id,
                name: project.name,
                description: project.description,
                status: project.status,
                stack: project.stack,
              }
            : null
        }
      />

      <ApagarProjetoDevModal
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        projectName={project?.name}
        onConfirm={async () => {
          if (!project) return;
          await deleteProject(project.id);
          navigate('/app/dev/projetos');
        }}
      />

    </PageContainer>
  );

}

