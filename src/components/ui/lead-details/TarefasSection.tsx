import { useState, useEffect } from "react";
import {
  ListTodo, Plus, CheckCircle2, Circle, Clock, Trash2,
  Users, ExternalLink, CalendarCheck, X, Loader2,
} from "lucide-react";
import { useData } from "../../../contexts/DataContext";
import { useAuth } from "../../../contexts/AuthContext";
import { createCalendarEvent } from "../../../lib/google-calendar";
import { getGoogleCalendarStatus } from "../../../lib/google-auth";
import { toast } from "sonner";
import { cn } from "../../../lib/utils";
import { Button } from "../button";
import { Card } from "../card";
import { Badge } from "../badge";
import { Input } from "../input";
import { FormField } from "../form-field";
import { confirmDialog } from "../confirm-dialog";

interface TarefasSectionProps {
  lead: any;
  leadName: string;
  seller: string;
}

export function TarefasSection({ lead, leadName, seller }: TarefasSectionProps) {
  const { tasks, addTask, updateTask, deleteTask, colaboradores } = useData();
  const { activeTenantId, user } = useAuth();

  const leadTasks = (tasks as any[]).filter((t) => t.lead_id === lead.id);

  // `assigned_to` FK pra `users.id` — `user.id` (public.users.id) já é esse
  // valor direto, não precisa passar por `colaboradores.id` (que é texto e
  // nem sequer é uuid).
  const currentUserColaboradorId = user?.id;

  const [showForm, setShowForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [newTime, setNewTime] = useState("09:00");
  const [newDuration, setNewDuration] = useState(30);
  const [newPriority, setNewPriority] = useState<"Alta" | "Média" | "Baixa">("Média");

  const [convidados, setConvidados] = useState<string[]>([]);
  const [novoConvidado, setNovoConvidado] = useState("");
  const [vincularGoogle, setVincularGoogle] = useState(false);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!activeTenantId) return;
    getGoogleCalendarStatus(activeTenantId).then((status) => {
      if (status.connected) {
        setGoogleConnected(true);
        setVincularGoogle(true);
      }
    });
  }, [activeTenantId]);

  const handleAddConvidado = (emailToAdd?: string) => {
    const val = (emailToAdd || novoConvidado).trim().toLowerCase();
    if (!val) return;
    if (!convidados.includes(val)) {
      setConvidados((prev) => [...prev, val]);
    }
    setNovoConvidado("");
  };

  const handleRemoveConvidado = (email: string) => {
    setConvidados((prev) => prev.filter((c) => c !== email));
  };

  const handleAdd = async () => {
    if (!newTitle.trim()) { toast.error("Título da tarefa é obrigatório."); return; }
    if (!newDate || !newTime) { toast.error("Informe a data e o horário da tarefa."); return; }

    setSaving(true);
    let calendarLink: string | undefined;
    let googleEventId: string | undefined;

    if (vincularGoogle && activeTenantId) {
      try {
        const startISO = `${newDate}T${newTime}:00`;
        const endDate = new Date(`${newDate}T${newTime}:00`);
        endDate.setMinutes(endDate.getMinutes() + newDuration);
        const endISO = endDate.toISOString().slice(0, 19);

        const attendees = Array.from(new Set([...convidados])).filter(Boolean);

        const calEvent = await createCalendarEvent(activeTenantId, {
          title: `Tarefa — ${newTitle.trim()} (${lead.company || leadName})`,
          description: [
            `📋 Tarefa: ${newTitle.trim()}`,
            newDesc.trim() ? `📝 Descrição: ${newDesc.trim()}` : "",
            `👤 Responsável: ${user?.name || seller || "Comercial"}`,
            `🏢 Lead: ${lead.company || leadName}`,
            attendees.length > 0 ? `👥 Participantes: ${attendees.join(", ")}` : "",
          ].filter(Boolean).join("\n"),
          startISO,
          endISO,
          attendeeEmails: attendees,
          skipConferenceData: true,
        });
        calendarLink = calEvent.htmlLink;
        googleEventId = calEvent.id;
      } catch (err: any) {
        toast.warning("Tarefa criada, mas não foi possível sincronizar com o Google Calendar.");
      }
    }

    const dueDate = new Date(`${newDate}T${newTime}:00`);
    addTask({
      title: newTitle.trim(),
      description: newDesc.trim() || undefined,
      lead_id: lead.id,
      due_date: isNaN(dueDate.getTime()) ? undefined : dueDate.toISOString(),
      status: "A Fazer",
      priority: newPriority,
      assigned_to: currentUserColaboradorId,
      convidados: convidados.length > 0 ? convidados : undefined,
      calendarLink,
      googleEventId,
    });

    setNewTitle("");
    setNewDesc("");
    setNewPriority("Média");
    setConvidados([]);
    setNovoConvidado("");
    setShowForm(false);
    setSaving(false);
    toast.success(calendarLink
      ? "Tarefa vinculada e sincronizada no Google Calendar!"
      : "Tarefa vinculada ao lead com sucesso!"
    );
  };

  const toggleDone = (task: any) => {
    const isDone = task.status === "Concluída";
    updateTask(task.id, { status: isDone ? "A Fazer" : "Concluída" });
  };

  const pending = leadTasks.filter((t) => t.status !== "Concluída" && t.status !== "Cancelado");
  const done = leadTasks.filter((t) => t.status === "Concluída" || t.status === "Cancelado");

  return (
    <div className="px-5 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center">
            <ListTodo className="w-4 h-4 text-[var(--color-primary-blue)]" />
          </div>
          <div>
            <p className="text-xs font-bold text-[var(--color-text-primary)]">Tarefas & Compromissos</p>
            <p className="text-[10px] text-[var(--color-text-faint)] uppercase tracking-wider">
              {pending.length} pendente{pending.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        <Button
          onClick={() => setShowForm((v) => !v)}
          size="sm"
          className="text-xs font-bold gap-1.5 h-8"
        >
          <Plus className="w-3.5 h-3.5" /> Nova Tarefa
        </Button>
      </div>

      {/* Formulário nova tarefa */}
      {showForm && (
        <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] space-y-3 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-primary-blue)]">
            Cadastrar Nova Tarefa
          </p>

          <FormField label="Título da Tarefa" required>
            <Input
              type="text"
              placeholder="Ex: Ligar para confirmar envio da proposta..."
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            />
          </FormField>

          <FormField label="Descrição (Opcional)">
            <textarea
              placeholder="Detalhes adicionais sobre o compromisso..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              rows={2}
              className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] p-3 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all resize-none"
            />
          </FormField>

          <div className="grid grid-cols-3 gap-3">
            <FormField label="Data">
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </FormField>

            <FormField label="Horário">
              <Input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
              />
            </FormField>

            <FormField label="Duração">
              <select
                value={newDuration}
                onChange={(e) => setNewDuration(Number(e.target.value))}
                className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] h-9"
              >
                <option value={15}>15 minutos</option>
                <option value={30}>30 minutos</option>
                <option value={45}>45 minutos</option>
                <option value={60}>1 hora</option>
                <option value={120}>2 horas</option>
              </select>
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <FormField label="Prioridade">
              <select
                value={newPriority}
                onChange={(e) => setNewPriority(e.target.value as any)}
                className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] h-9"
              >
                <option value="Alta">Alta Prioridade</option>
                <option value="Média">Média Prioridade</option>
                <option value="Baixa">Baixa Prioridade</option>
              </select>
            </FormField>

            <FormField label="Responsável">
              <input
                readOnly
                value={user?.name || seller || "Você (usuário logado)"}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-muted)] h-9 font-medium cursor-not-allowed"
              />
            </FormField>
          </div>

          {/* Outros participantes / convidados */}
          <div className="space-y-2 p-3 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl">
            <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" />
              Outros Participantes (E-mails)
            </label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="convidado@empresa.com"
                value={novoConvidado}
                onChange={(e) => setNovoConvidado(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddConvidado();
                  }
                }}
                className="text-xs"
              />
              <Button
                type="button"
                onClick={() => handleAddConvidado()}
                variant="outline"
                size="sm"
                className="text-xs shrink-0"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar
              </Button>
            </div>
            {/* Equipe rápida */}
            {colaboradores && (colaboradores as any[]).filter((c: any) => c.email && !convidados.includes(c.email.toLowerCase())).length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[10px] text-[var(--color-text-faint)]">Equipe:</span>
                {(colaboradores as any[])
                  .filter((c: any) => c.email && !convidados.includes(c.email.toLowerCase()))
                  .slice(0, 4)
                  .map((c: any) => (
                    <button
                      key={c.email}
                      type="button"
                      onClick={() => handleAddConvidado(c.email)}
                      className="text-[10px] px-2 py-0.5 rounded bg-[var(--color-surface-elevated)] hover:bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)] transition-colors"
                    >
                      + {(c.nome || c.name)?.split(" ")[0]}
                    </button>
                  ))}
              </div>
            )}
            {convidados.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {convidados.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-md text-[11px] text-[var(--color-text-muted)] font-medium"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => handleRemoveConvidado(email)}
                      className="hover:text-danger p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Sincronização Google Calendar */}
          <div className="p-3 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <CalendarCheck className={cn("w-4 h-4 shrink-0", vincularGoogle ? "text-[var(--color-primary-blue)]" : "text-[var(--color-text-faint)]")} />
              <div className="min-w-0">
                <p className="text-xs font-bold text-[var(--color-text-primary)]">Vincular ao Google Agenda</p>
                <p className="text-[10px] text-[var(--color-text-muted)] truncate">
                  {googleConnected
                    ? "Cria o evento na agenda e notifica os participantes convidados"
                    : "Conecte sua conta Google no módulo de Agenda ou configurações"}
                </p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={vincularGoogle}
                onChange={(e) => setVincularGoogle(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-[var(--color-border-default)] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[var(--color-primary-blue)]"></div>
            </label>
          </div>

          <div className="flex gap-2 pt-2 justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setShowForm(false)}
              className="text-xs"
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleAdd}
              disabled={saving}
              className="text-xs font-bold gap-1.5"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {saving ? "Salvando..." : "Criar Tarefa"}
            </Button>
          </div>
        </Card>
      )}

      {/* Lista pendentes */}
      {pending.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">
            Pendentes ({pending.length})
          </p>
          {pending.map((task) => (
            <TaskCard key={task.id} task={task} onToggle={toggleDone} onDelete={deleteTask} colaboradores={colaboradores as any[]} />
          ))}
        </div>
      )}

      {/* Lista concluídas */}
      {done.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)] mt-3">
            Concluídas ({done.length})
          </p>
          {done.map((task) => (
            <TaskCard key={task.id} task={task} onToggle={toggleDone} onDelete={deleteTask} dimmed colaboradores={colaboradores as any[]} />
          ))}
        </div>
      )}

      {/* Vazio */}
      {leadTasks.length === 0 && !showForm && (
        <div className="flex flex-col items-center gap-2 py-8 text-center border border-dashed border-[var(--color-border-default)] rounded-[var(--radius-panel)]">
          <ListTodo className="w-6 h-6 text-[var(--color-text-faint)]" />
          <p className="text-xs text-[var(--color-text-muted)] font-bold">Nenhuma tarefa associada.</p>
          <p className="text-[11px] text-[var(--color-text-faint)]">Clique no botão acima para agendar uma atividade.</p>
        </div>
      )}
    </div>
  );
}

function TaskCard({ task, onToggle, onDelete, dimmed, colaboradores }: {
  task: any;
  onToggle: (t: any) => void;
  onDelete: (id: string) => void;
  dimmed?: boolean;
  colaboradores: any[];
}) {
  const isDone = task.status === "Concluída" || task.status === "Cancelado";
  const assigneeName = task.assigned_to
    ? colaboradores.find((c: any) => c.user_id === task.assigned_to)?.nome
    : null;
  const dueDateLabel = (() => {
    if (!task.due_date) return null;
    const d = new Date(task.due_date);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  })();

  return (
    <Card className={cn(
      "flex items-start gap-3 p-3 transition-all",
      dimmed
        ? "bg-[var(--color-surface-sunken)] opacity-60"
        : "bg-[var(--color-surface-elevated)] hover:border-[var(--color-border-default)]"
    )}>
      <button onClick={() => onToggle(task)} className="mt-0.5 shrink-0 cursor-pointer">
        {isDone ? (
          <CheckCircle2 className="w-4 h-4 text-success" />
        ) : (
          <Circle className="w-4 h-4 text-[var(--color-text-faint)] hover:text-[var(--color-primary-blue)] transition-colors" />
        )}
      </button>

      <div className="flex-1 min-w-0 space-y-1">
        <p className={cn("text-xs font-bold leading-snug", isDone ? "line-through text-[var(--color-text-faint)]" : "text-[var(--color-text-primary)]")}>
          {task.title}
        </p>
        {task.description && (
          <p className="text-[11px] text-[var(--color-text-muted)] leading-snug line-clamp-2">{task.description}</p>
        )}
        <div className="flex items-center gap-2 flex-wrap pt-0.5">
          {dueDateLabel && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-faint)] font-medium">
              <Clock className="w-3 h-3" /> {dueDateLabel}
            </span>
          )}
          {task.priority && (
            <Badge
              variant={task.priority === "Alta" ? "destructive" : task.priority === "Média" ? "warning" : "secondary"}
              className="text-[9px] py-0 px-1.5"
            >
              {task.priority}
            </Badge>
          )}
          <span className="text-[10px] font-bold text-[var(--color-text-muted)]">
            {task.status}
          </span>
          {assigneeName && (
            <span className="text-[10px] text-[var(--color-text-faint)]">
              · {assigneeName}
            </span>
          )}
          {task.convidados && task.convidados.length > 0 && (
            <span className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] font-medium">
              <Users className="w-3 h-3" /> {task.convidados.length} convidado{task.convidados.length !== 1 ? "s" : ""}
            </span>
          )}
          {task.calendarLink && (
            <a
              href={task.calendarLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-[var(--color-primary-blue)] hover:opacity-80 font-bold transition-colors ml-auto"
            >
              <CalendarCheck className="w-3 h-3" /> Google Agenda
            </a>
          )}
        </div>
      </div>

      <button
        onClick={async () => {
          if (!(await confirmDialog({
            title: "Excluir tarefa",
            description: `Excluir a tarefa "${task.title}"? Essa ação não pode ser desfeita.`,
          }))) return;
          onDelete(task.id);
          toast.info("Tarefa removida.");
        }}
        className="shrink-0 p-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:bg-danger/10 rounded text-[var(--color-text-faint)] hover:text-danger transition-all cursor-pointer"
        title="Remover Tarefa"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </Card>
  );
}
