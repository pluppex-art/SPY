import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { motion } from "motion/react";
import { Task } from "../../../types";
import { TasksKanbanCard } from "./TasksKanbanCard";
import { KanbanColConfig, KANBAN_COR_CLASS, KANBAN_COR_DOT } from "../../../hooks/useKanbanConfig";

interface TasksKanbanModeProps {
  columns: KanbanColConfig[];
  filteredTasks: Task[];
  mobileActiveCol: string;
  setMobileActiveCol: (col: string) => void;
  draggedTaskId: string | null;
  setDraggedTaskId: (id: string | null) => void;
  draggedOverCol: string | null;
  setDraggedOverCol: (col: string | null) => void;
  openNewTaskModal: () => void;
  moveTaskStatus: (id: string, newStatus: string) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  openEditTaskModal: (task: Task) => void;
  toggleTaskStatus: (id: string, currentStatus: string) => void;
  handleDeleteTask: (id: string) => void;
  setSearchQuery: (q: string) => void;
  duplicateTask: (task: Task) => void;
  onOpenDetails?: (task: Task) => void;
  getPriorityColor: (p: string) => string;
}

export function TasksKanbanMode({
  columns,
  filteredTasks,
  mobileActiveCol,
  setMobileActiveCol,
  draggedTaskId,
  setDraggedTaskId,
  draggedOverCol,
  setDraggedOverCol,
  openNewTaskModal,
  moveTaskStatus,
  updateTask,
  openEditTaskModal,
  toggleTaskStatus,
  handleDeleteTask,
  setSearchQuery,
  duplicateTask,
  onOpenDetails,
  getPriorityColor,
}: TasksKanbanModeProps) {
  // Colunas como "Concluída" chegam a milhares de tarefas — desenhar todas
  // de uma vez trava o navegador; mostra em blocos de 30.
  const KANBAN_PAGE = 30;
  const [visible, setVisible] = useState<Record<string, number>>({});

  // Ordem dentro da coluna: concluídas pela mais recente primeiro (uma tarefa
  // recém-solta aparece no topo, não perdida no meio de milhares); demais por
  // prazo mais próximo, sem prazo por último.
  const colTasksIds = useMemo(() => new Set(filteredTasks.map((t) => t.id)), [filteredTasks]);
  const tasksByCol = useMemo(() => {
    const out: Record<string, Task[]> = {};
    for (const col of columns) {
      const list = filteredTasks.filter((t) => t.status === col.id);
      list.sort((a, b) => {
        if (col.id === "Concluída") {
          const ta = new Date(a.completed_at || a.updated_at || a.created_at || 0).getTime();
          const tb = new Date(b.completed_at || b.updated_at || b.created_at || 0).getTime();
          return tb - ta;
        }
        const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
        const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
        return da - db;
      });
      out[col.id] = list;
    }
    return out;
  }, [columns, filteredTasks]);
  return (
    <div className="space-y-4">
      {/* Mobile Segments Header */}
      <div className="flex md:hidden bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl p-1 w-full shrink-0 relative">
        {columns.map(col => {
          const isActive = mobileActiveCol === col.id;
          const count = filteredTasks.filter(t => t.status === col.id).length;
          const dotColor = KANBAN_COR_DOT[col.cor] ?? '#64748b';

          return (
            <button
              key={col.id}
              onClick={() => setMobileActiveCol(col.id)}
              className="flex-1 text-center py-2.5 text-xs font-bold rounded-xl transition-all relative flex items-center justify-center gap-2 select-none cursor-pointer border-none bg-transparent"
            >
              {isActive && (
                <motion.div
                  layoutId="activeKanbanTabIndicator"
                  className="absolute inset-0 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-xl shadow-sm"
                  transition={{ type: "spring", stiffness: 350, damping: 28 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: isActive ? '#60a5fa' : dotColor }}
                />
                <span className={isActive ? "text-[var(--color-text-primary)] font-extrabold" : "text-[var(--color-text-muted)] font-medium"}>
                  {col.nome}
                </span>
              </span>
              <span className={`relative z-10 text-[9px] px-1.5 py-0.5 rounded-full font-black transition-colors ${
                isActive ? 'bg-[#2563EB]/20 text-blue-500 border border-[#2563EB]/30' : 'bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]'
              }`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {columns.map(col => {
          const colTasks = tasksByCol[col.id] ?? [];
          const count = colTasks.length;
          const isVisibleOnMobile = mobileActiveCol === col.id;
          const dotColor = KANBAN_COR_DOT[col.cor] ?? '#64748b';
          const dotClass = KANBAN_COR_CLASS[col.cor] ?? 'bg-slate-500';

          return (
            <motion.div
              key={col.id}
              initial={{ opacity: 0, x: isVisibleOnMobile ? 12 : 0 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className={`flex flex-col gap-4 min-w-0 ${isVisibleOnMobile ? 'flex' : 'hidden md:flex'}`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-3 py-2.5 shrink-0 rounded-2xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${dotClass}`} style={{ boxShadow: `0 0 8px ${dotColor}80` }} />
                  <h3 className="text-sm font-black text-[var(--color-text-primary)]">{col.nome}</h3>
                  <span className="text-[10px] bg-[var(--color-surface-sunken)] px-2 py-0.5 rounded-full text-[var(--color-text-muted)] font-extrabold">{count}</span>
                </div>
                <button className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors bg-transparent border-none p-0 cursor-pointer" onClick={openNewTaskModal}>
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Column Contents */}
              <div
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDragEnter={(e) => { e.preventDefault(); setDraggedOverCol(col.id); }}
                onDragLeave={(e) => {
                  // dragleave também dispara ao passar por filhos do container — só limpa ao sair de verdade.
                  if (!e.currentTarget.contains(e.relatedTarget as Node | null) && draggedOverCol === col.id) setDraggedOverCol(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  // O id vem do estado do arraste; o dataTransfer pode conter a URL do link do card quando ele é o ponto de pega.
                  const fromData = e.dataTransfer.getData("text/plain");
                  const taskId = draggedTaskId ?? (colTasksIds.has(fromData) ? fromData : null);
                  if (taskId) moveTaskStatus(taskId, col.id);
                  setDraggedOverCol(null);
                  setDraggedTaskId(null);
                }}
                className={`space-y-4 pr-1 min-h-[350px] rounded-2xl transition-all duration-300 ${
                  draggedOverCol === col.id
                    ? 'bg-[#2563EB]/10 ring-2 ring-[#2563EB]/40 border-2 border-dashed border-[#2563EB]/50 p-2'
                    : 'p-0'
                }`}
              >
                {count > 0 ? (
                  <>
                  {colTasks.slice(0, visible[col.id] ?? KANBAN_PAGE).map(task => (
                    <div key={task.id}>
                      <TasksKanbanCard
                        task={task}
                        draggedTaskId={draggedTaskId}
                        setDraggedTaskId={setDraggedTaskId}
                        setDraggedOverCol={setDraggedOverCol}
                        getPriorityColor={getPriorityColor}
                        updateTask={updateTask}
                        setSearchQuery={setSearchQuery}
                        duplicateTask={duplicateTask}
                        onOpenDetails={onOpenDetails}
                        openEditTaskModal={openEditTaskModal}
                        toggleTaskStatus={toggleTaskStatus}
                        handleDeleteTask={handleDeleteTask}
                        moveTaskStatus={moveTaskStatus}
                        columns={columns.map(c => c.id) as any}
                      />
                    </div>
                  ))}
                  {count > (visible[col.id] ?? KANBAN_PAGE) && (
                    <button
                      type="button"
                      onClick={() => setVisible((v) => ({ ...v, [col.id]: (v[col.id] ?? KANBAN_PAGE) + KANBAN_PAGE }))}
                      className="w-full py-2.5 rounded-xl border border-dashed border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] bg-transparent cursor-pointer"
                    >
                      Ver mais ({count - (visible[col.id] ?? KANBAN_PAGE)} restantes)
                    </button>
                  )}
                  </>
                ) : (
                  <div className="py-12 border border-dashed border-[var(--color-border-default)] rounded-2xl text-center">
                    <span className="w-8 h-8 text-[var(--color-text-faint)] mx-auto mb-2 block">✓</span>
                    <p className="text-[11px] text-[var(--color-text-muted)] font-bold">Coluna vazia</p>
                    <p className="text-[10px] text-[var(--color-text-faint)] px-3 mt-0.5">Sem tarefas nesta classificação.</p>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
