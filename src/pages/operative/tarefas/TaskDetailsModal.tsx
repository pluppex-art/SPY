import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calendar, CheckCircle2, Circle, Clock, Copy, ExternalLink, Flag, Mail, Pencil, Phone,
  Trash2, User, Video, Building2, Tag, Package, AlignLeft, History, AlertTriangle, UserCheck,
} from "lucide-react";
import { Modal } from "../../../components/ui/modal";
import { Button } from "../../../components/ui/button";
import { useData } from "../../../contexts/DataContext";
import { Task } from "../../../types";
import { KanbanColConfig } from "../../../hooks/useKanbanConfig";
import { cn } from "../../../lib/utils";
import { formatDueDate, isTaskOverdue, parseTaskMeta, initialsOf, PRIORITY_CHIP } from "./taskUtils";

interface TaskDetailsModalProps {
  task: Task | null;
  onClose: () => void;
  columns: KanbanColConfig[];
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onDuplicate: (task: Task) => void;
  onToggle: (id: string, status: string) => void;
  onMove: (id: string, status: any) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
}

const STATUS_TONE: Record<string, string> = {
  Atrasado: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25",
  "Em Aberto": "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25",
  "Concluída": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25",
  Cancelado: "bg-slate-500/10 text-slate-500 border-slate-500/25",
};

const fmtFull = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const selectCls =
  "w-full h-9 px-2.5 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40 cursor-pointer";
const fieldLabel = "text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] flex items-center gap-1.5 mb-1.5";

export function TaskDetailsModal({ task, onClose, columns, onEdit, onDelete, onDuplicate, onToggle, onMove, updateTask }: TaskDetailsModalProps) {
  const navigate = useNavigate();
  const { leads, colaboradores, reunioes, tasks } = useData();

  // Sempre a versão viva da tarefa (mudanças inline refletem na hora).
  const live = useMemo(() => (task ? (tasks as Task[]).find((t) => t.id === task.id) ?? task : null), [task, tasks]);

  const lead = live?.lead_id ? (leads as any[]).find((l) => l.id === live.lead_id) : null;
  const colabs = (colaboradores as any[]).filter((c) => c.user_id && c.nome);
  const assigneeName = live?.assigned_to ? colabs.find((c) => c.user_id === live.assigned_to)?.nome : null;
  const creatorName = live?.creator_id ? colabs.find((c) => c.user_id === live.creator_id)?.nome : null;
  const sellerOptions = colabs.filter((c) => c.status !== "Desligado" && c.departamento === "Vendas");
  const assigneeOptions = live?.assigned_to && !sellerOptions.some((c) => c.user_id === live.assigned_to) && assigneeName
    ? [colabs.find((c) => c.user_id === live.assigned_to)!, ...sellerOptions]
    : sellerOptions;

  const meetings = useMemo(() => {
    if (!lead) return [] as any[];
    return (reunioes as any[])
      .filter((r) => r.leadId === lead.id)
      .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
      .slice(0, 3);
  }, [reunioes, lead]);

  if (!live) return null;

  const done = live.status === "Concluída";
  const overdue = isTaskOverdue(live);
  const meta = parseTaskMeta(live.description);
  const prio = live.priority || "Média";

  const timeline = [
    { label: "Tarefa criada", when: live.created_at, who: creatorName, icon: Circle, tone: "text-[var(--color-primary-blue)]" },
    ...(live.updated_at && live.created_at && Math.abs(new Date(live.updated_at).getTime() - new Date(live.created_at).getTime()) > 60000 && !done
      ? [{ label: "Última atualização", when: live.updated_at, who: null, icon: Clock, tone: "text-amber-500" }] : []),
    ...(done && live.completed_at ? [{ label: "Concluída", when: live.completed_at, who: null, icon: CheckCircle2, tone: "text-emerald-500" }] : []),
  ].filter((t) => t.when);

  return (
    <Modal
      isOpen={!!task}
      onClose={onClose}
      maxWidth="max-w-3xl"
      title={
        <div className="flex items-start gap-3 min-w-0">
          <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center shrink-0", done ? "bg-emerald-500/10 text-emerald-500" : overdue ? "bg-rose-500/10 text-rose-500" : "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]")}>
            {done ? <CheckCircle2 className="w-5 h-5" /> : overdue ? <AlertTriangle className="w-5 h-5" /> : <Flag className="w-5 h-5" />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={cn("text-[10px] font-black uppercase px-2 py-0.5 rounded-md", PRIORITY_CHIP[prio] ?? PRIORITY_CHIP["Média"])}>{prio}</span>
              <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-md border", STATUS_TONE[live.status] ?? STATUS_TONE["Em Aberto"])}>{live.status}</span>
              {overdue && !done && live.status !== "Atrasado" && <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-rose-500/10 text-rose-500">Prazo vencido</span>}
            </div>
            <h3 className={cn("text-lg font-black leading-snug break-words", done ? "text-[var(--color-text-muted)] line-through" : "text-[var(--color-text-primary)]")}>{live.title}</h3>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-2 w-full flex-wrap">
          <Button variant="ghost" onClick={() => { onDelete(live.id); onClose(); }} className="h-9 px-3 text-xs font-bold gap-1.5 text-rose-500 hover:bg-rose-500/10">
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </Button>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={() => { onDuplicate(live); onClose(); }} className="h-9 px-3 text-xs font-bold gap-1.5"><Copy className="w-3.5 h-3.5" /> Duplicar</Button>
            <Button variant="outline" onClick={() => { onEdit(live); onClose(); }} className="h-9 px-3 text-xs font-bold gap-1.5"><Pencil className="w-3.5 h-3.5" /> Editar</Button>
            <Button onClick={() => onToggle(live.id, live.status)} className={cn("h-9 px-4 text-xs font-black gap-1.5", done ? "" : "bg-emerald-600 hover:bg-emerald-500 text-white")}>
              <CheckCircle2 className="w-3.5 h-3.5" /> {done ? "Reabrir tarefa" : "Concluir tarefa"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid md:grid-cols-[1.4fr_1fr] gap-5 py-1">
        {/* Coluna principal */}
        <div className="space-y-5 min-w-0">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}><Clock className="w-3 h-3" /> Status</label>
              <select value={live.status} onChange={(e) => onMove(live.id, e.target.value)} className={selectCls}>
                {columns.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={fieldLabel}><Flag className="w-3 h-3" /> Prioridade</label>
              <select value={prio} onChange={(e) => updateTask(live.id, { priority: e.target.value as Task["priority"] })} className={selectCls}>
                {["Alta", "Média", "Baixa"].map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={fieldLabel}><UserCheck className="w-3 h-3" /> Responsável</label>
              <select value={live.assigned_to || ""} onChange={(e) => updateTask(live.id, { assigned_to: e.target.value || null })} className={selectCls}>
                <option value="">Sem responsável</option>
                {assigneeOptions.map((c) => <option key={c.user_id} value={c.user_id}>{c.nome}</option>)}
              </select>
            </div>
            <div>
              <label className={fieldLabel}><Calendar className="w-3 h-3" /> Prazo</label>
              <div className={cn("h-9 px-2.5 rounded-lg border flex items-center text-xs font-bold", overdue && !done ? "bg-rose-500/5 border-rose-500/25 text-rose-500" : "bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] text-[var(--color-text-primary)]")}>
                {formatDueDate(live.due_date)}
              </div>
            </div>
          </div>

          {(meta.tipo || meta.tags.length > 0 || meta.produtos.length > 0) && (
            <div className="space-y-2">
              {(meta.tipo || meta.tags.length > 0) && (
                <div>
                  <label className={fieldLabel}><Tag className="w-3 h-3" /> Tipo e tags</label>
                  <div className="flex flex-wrap gap-1.5">
                    {[meta.tipo, ...meta.tags].filter(Boolean).map((c, i) => (
                      <span key={`${c}-${i}`} className="px-2.5 py-1 rounded-full bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] text-[11px] font-bold">{c}</span>
                    ))}
                  </div>
                </div>
              )}
              {meta.produtos.length > 0 && (
                <div>
                  <label className={fieldLabel}><Package className="w-3 h-3" /> Produtos</label>
                  <div className="flex flex-wrap gap-1.5">
                    {meta.produtos.map((p) => <span key={p} className="px-2.5 py-1 rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] text-[11px] font-bold">{p}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}

          <div>
            <label className={fieldLabel}><AlignLeft className="w-3 h-3" /> Descrição</label>
            <div className="rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] p-3 text-xs text-[var(--color-text-muted)] leading-relaxed whitespace-pre-wrap">
              {meta.resto || <span className="text-[var(--color-text-faint)]">Sem descrição.</span>}
            </div>
          </div>

          {meetings.length > 0 && (
            <div>
              <label className={fieldLabel}><Video className="w-3 h-3" /> Reuniões do lead</label>
              <div className="space-y-1.5">
                {meetings.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => { onClose(); navigate(`/app/reunioes/${r.id}`); }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-xl border border-[var(--color-border-default)] bg-transparent hover:bg-[var(--color-surface-sunken)] cursor-pointer text-left transition-colors"
                  >
                    <span className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0"><Video className="w-4 h-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-bold text-[var(--color-text-primary)] truncate">{r.companyName || r.leadName}</span>
                      <span className="block text-[10px] text-[var(--color-text-muted)]">{new Date(r.scheduledAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })} · {r.status}</span>
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 text-[var(--color-text-faint)] shrink-0" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Coluna lateral */}
        <div className="space-y-5 min-w-0">
          <div>
            <label className={fieldLabel}><Building2 className="w-3 h-3" /> Lead / cliente</label>
            {lead ? (
              <div className="rounded-2xl border border-[var(--color-border-default)] p-3.5 space-y-2.5">
                <div className="flex items-center gap-3">
                  <span className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 text-xs font-black flex items-center justify-center shrink-0">{initialsOf(lead.company || lead.name)}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-black text-[var(--color-text-primary)] truncate">{lead.company || lead.name}</p>
                    {lead.company && lead.name && <p className="text-[11px] text-[var(--color-text-muted)] truncate">{lead.name}</p>}
                  </div>
                </div>
                {lead.status && <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]">Etapa: {lead.status}</span>}
                {lead.email && <p className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)] truncate"><Mail className="w-3 h-3 shrink-0" /> {lead.email}</p>}
                {lead.phone && <p className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]"><Phone className="w-3 h-3 shrink-0" /> {lead.phone}</p>}
                <Button variant="outline" onClick={() => { onClose(); navigate(`/app/crm/pipeline?leadId=${lead.id}`); }} className="w-full h-8 text-[11px] font-bold gap-1.5">
                  <ExternalLink className="w-3 h-3" /> Abrir no pipeline
                </Button>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] p-3.5 text-xs text-[var(--color-text-faint)] text-center">Tarefa interna — sem lead vinculado.</div>
            )}
          </div>

          <div>
            <label className={fieldLabel}><User className="w-3 h-3" /> Pessoas</label>
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <span className={cn("w-8 h-8 rounded-full text-[10px] font-black flex items-center justify-center shrink-0", assigneeName ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]" : "bg-rose-500/10 text-rose-500")}>{assigneeName ? initialsOf(assigneeName) : "?"}</span>
                <div className="min-w-0"><p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{assigneeName || "Sem responsável"}</p><p className="text-[10px] text-[var(--color-text-faint)]">Responsável</p></div>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] text-[10px] font-black flex items-center justify-center shrink-0">{creatorName ? initialsOf(creatorName) : "—"}</span>
                <div className="min-w-0"><p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{creatorName || "Não identificado"}</p><p className="text-[10px] text-[var(--color-text-faint)]">Criada por</p></div>
              </div>
            </div>
          </div>

          <div>
            <label className={fieldLabel}><History className="w-3 h-3" /> Histórico</label>
            <div className="space-y-3 relative pl-1">
              {timeline.map((t, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <t.icon className={cn("w-4 h-4 mt-0.5 shrink-0", t.tone)} />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[var(--color-text-primary)]">{t.label}{t.who ? ` · ${t.who}` : ""}</p>
                    <p className="text-[10px] text-[var(--color-text-faint)]">{fmtFull(t.when)}</p>
                  </div>
                </div>
              ))}
              {timeline.length === 0 && <p className="text-[11px] text-[var(--color-text-faint)]">Sem registros de data.</p>}
            </div>
          </div>
        </div>
      </div>
    </Modal>
  );
}
