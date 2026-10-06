import { useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, CheckCircle2, ExternalLink, MoreVertical, Pencil, Copy, Trash2, ArrowRightLeft } from "lucide-react";
import { Task } from "../../../types";
import { KanbanColConfig } from "../../../hooks/useKanbanConfig";
import { useData } from "../../../contexts/DataContext";
import { cn } from "../../../lib/utils";
import { formatDueDate, isTaskOverdue, parseTaskMeta, initialsOf, PRIORITY_CHIP } from "./taskUtils";

interface TasksKanbanCardProps {
  task: Task;
  draggedTaskId: string | null;
  setDraggedTaskId: (id: string | null) => void;
  setDraggedOverCol: (col: string | null) => void;
  getPriorityColor: (p: string) => string;
  updateTask: (id: string, updates: Partial<Task>) => void;
  setSearchQuery: (q: string) => void;
  openEditTaskModal: (task: Task) => void;
  toggleTaskStatus: (id: string, currentStatus: string) => void;
  handleDeleteTask: (id: string) => void;
  moveTaskStatus: (id: string, newStatus: string) => void;
  duplicateTask: (task: Task) => void;
  onOpenDetails?: (task: Task) => void;
  columns: KanbanColConfig[];
}

export function TasksKanbanCard({
  task, draggedTaskId, setDraggedTaskId, setDraggedOverCol, updateTask,
  openEditTaskModal, toggleTaskStatus, handleDeleteTask, moveTaskStatus, duplicateTask, onOpenDetails, columns,
}: TasksKanbanCardProps) {
  const { colaboradores, leads } = useData();
  const [menuOpen, setMenuOpen] = useState(false);

  // `assigned_to` FK pra `users.id`, não `colaboradores.id` — usa `user_id`.
  const sellerOptions = (colaboradores as any[])
    .filter((c) => c.status !== "Desligado" && c.departamento === "Vendas")
    .map((c) => ({ id: c.user_id as string, nome: c.nome as string }))
    .filter((c) => c.id && c.nome);
  const allColabs = (colaboradores as any[]).filter((c) => c.user_id && c.nome);
  const assigneeName = task.assigned_to ? (allColabs.find((c) => c.user_id === task.assigned_to)?.nome as string | undefined) : undefined;

  const lead = task.lead_id ? (leads as any[]).find((l) => l.id === task.lead_id) : null;
  const leadLabel = lead ? (lead.company || lead.name) : "Interno";

  const done = task.status === "Concluída";
  const overdue = isTaskOverdue(task);
  const meta = parseTaskMeta(task.description);
  const chips = [meta.tipo, ...meta.tags].filter(Boolean) as string[];
  const prio = task.priority || "Média";

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", task.id);
        e.dataTransfer.effectAllowed = "move";
        // Alterar o DOM/estilo do card dentro do próprio dragstart faz o Chrome cancelar o arraste — adia pro próximo tick.
        setTimeout(() => setDraggedTaskId(task.id), 0);
      }}
      onDragEnd={() => { setDraggedTaskId(null); setDraggedOverCol(null); }}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button, select, a, option")) return;
        onOpenDetails?.(task);
      }}
      className={cn(
        "relative rounded-2xl border p-4 pl-5 shadow-sm transition-all cursor-grab active:cursor-grabbing overflow-hidden",
        overdue && !done ? "bg-rose-500/[0.04] border-rose-500/25" : "bg-[var(--color-surface-elevated)] border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/30",
        draggedTaskId === task.id && "opacity-40 scale-95"
      )}
    >
      <span className={cn("absolute left-0 top-0 bottom-0 w-1", done ? "bg-emerald-500" : overdue ? "bg-rose-500" : prio === "Alta" ? "bg-rose-400" : prio === "Média" ? "bg-amber-400" : "bg-emerald-400")} />

      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn("text-[9px] font-black uppercase px-2 py-0.5 rounded-md", PRIORITY_CHIP[prio] ?? PRIORITY_CHIP["Média"])}>{prio}</span>
          <span className={cn("flex items-center gap-1 text-[11px] font-bold", done ? "text-[var(--color-text-faint)]" : overdue ? "text-rose-500" : formatDueDate(task.due_date).startsWith("Hoje") ? "text-amber-500" : "text-[var(--color-text-muted)]")}>
            <Calendar className="w-3 h-3" /> {formatDueDate(task.due_date)}
          </span>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="p-1 rounded-lg text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] bg-transparent border-none cursor-pointer"
            title="Ações"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-20" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-7 z-30 w-44 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] shadow-lg py-1 text-xs font-bold">
                <button type="button" onClick={() => { setMenuOpen(false); openEditTaskModal(task); }} className="w-full flex items-center gap-2 px-3 py-2 text-left bg-transparent border-none cursor-pointer text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"><Pencil className="w-3.5 h-3.5" /> Editar</button>
                <button type="button" onClick={() => { setMenuOpen(false); toggleTaskStatus(task.id, task.status); }} className="w-full flex items-center gap-2 px-3 py-2 text-left bg-transparent border-none cursor-pointer text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"><CheckCircle2 className="w-3.5 h-3.5" /> {done ? "Reabrir" : "Concluir"}</button>
                <button type="button" onClick={() => { setMenuOpen(false); duplicateTask(task); }} className="w-full flex items-center gap-2 px-3 py-2 text-left bg-transparent border-none cursor-pointer text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"><Copy className="w-3.5 h-3.5" /> Duplicar</button>
                {columns.filter((c) => c.id !== task.status).map((c) => (
                  <button key={c.id} type="button" onClick={() => { setMenuOpen(false); moveTaskStatus(task.id, c.id); }} className="w-full flex items-center gap-2 px-3 py-2 text-left bg-transparent border-none cursor-pointer text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)]"><ArrowRightLeft className="w-3.5 h-3.5" /> Mover p/ {c.nome}</button>
                ))}
                <button type="button" onClick={() => { setMenuOpen(false); handleDeleteTask(task.id); }} className="w-full flex items-center gap-2 px-3 py-2 text-left bg-transparent border-none cursor-pointer text-rose-500 hover:bg-rose-500/10"><Trash2 className="w-3.5 h-3.5" /> Excluir</button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex items-start gap-2.5">
        {done && <span className="mt-0.5 w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0"><CheckCircle2 className="w-3.5 h-3.5" /></span>}
        <h4 className={cn("text-sm font-black leading-snug break-words", done ? "text-[var(--color-text-faint)] line-through" : "text-[var(--color-text-primary)]")}>{task.title}</h4>
      </div>

      <div className="mt-1.5">
        {task.lead_id ? (
          <Link draggable={false} to={`/app/crm/pipeline?leadId=${task.lead_id}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] hover:underline truncate max-w-full" title="Abrir lead no pipeline">
            {leadLabel} <ExternalLink className="w-2.5 h-2.5 shrink-0" />
          </Link>
        ) : (
          <span className="text-[11px] text-[var(--color-text-faint)]">{leadLabel}</span>
        )}
      </div>

      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {chips.slice(0, 3).map((c, i) => (
            <span key={`${c}-${i}`} className="px-2 py-0.5 rounded-full bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] text-[10px] font-bold">{c}</span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[var(--color-border-subtle)]">
        <span className={cn("w-7 h-7 rounded-full text-[10px] font-black flex items-center justify-center shrink-0", assigneeName ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]" : "bg-rose-500/10 text-rose-500")}>
          {assigneeName ? initialsOf(assigneeName) : "?"}
        </span>
        <select
          value={task.assigned_to || ""}
          onChange={(e) => updateTask(task.id, { assigned_to: e.target.value || null })}
          className={cn("flex-1 min-w-0 bg-transparent text-[11px] font-bold focus:outline-none cursor-pointer truncate", assigneeName ? "text-[var(--color-text-muted)]" : "text-rose-500")}
          title="Responsável"
        >
          <option value="">Sem responsável</option>
          {(assigneeName && !sellerOptions.some((s) => s.id === task.assigned_to) && task.assigned_to
            ? [{ id: task.assigned_to, nome: assigneeName }, ...sellerOptions]
            : sellerOptions
          ).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
      </div>
    </div>
  );
}
