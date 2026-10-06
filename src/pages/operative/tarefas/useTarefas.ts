import { useState, useEffect, useMemo } from "react";
import { useData } from "../../../contexts/DataContext";
import { useAuth } from "../../../contexts/AuthContext";
import { readKanbanConfig, KANBAN_KEYS, KanbanColConfig } from "../../../hooks/useKanbanConfig";
import { Task } from "../../../types";
import { initAuth, googleSignIn, getAccessToken } from "../../../lib/firebase";
import { toast } from "sonner";

export function useTarefas() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'kanban'>('kanban');
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [deadlineFilter, setDeadlineFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("");
  const [clienteFilter, setClienteFilter] = useState<string>("");
  const { tasks, addTask, updateTask, deleteTask, appSettings, leads, colaboradores, products } = useData();
  const { activeTenantId, user } = useAuth();

  const [needsAuth, setNeedsAuth] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    if (!activeTenantId) return;
    const unsubscribe = initAuth(
      activeTenantId,
      () => setNeedsAuth(false),
      () => setNeedsAuth(true)
    );
    return () => unsubscribe();
  }, [activeTenantId]);

  /** Nome de exibição do lead vinculado (substitui o antigo campo livre `related`). */
  const getLeadLabel = (task: Task): string => {
    if (!task.lead_id) return "Interno";
    const lead = (leads as any[]).find(l => l.id === task.lead_id);
    return lead ? (lead.company || lead.name) : "Interno";
  };

  /** Nome de exibição do responsável (substitui o antigo campo livre `seller`). */
  const getAssigneeLabel = (task: Task): string => {
    if (!task.assigned_to) return "";
    const colab = (colaboradores as any[]).find(c => c.user_id === task.assigned_to);
    return colab?.nome || "";
  };

  // `assigned_to` FK pra `users.id` — `user.id` (public.users.id) já é esse
  // valor direto, sem precisar resolver via `colaboradores`.
  const currentUserColaboradorId = user?.id || "";

  const handleSyncGoogleTasks = async () => {
    if (!activeTenantId) return;
    setIsSyncing(true);
    let token = await getAccessToken(activeTenantId);

    try {
      if (!token) {
        const result = await googleSignIn(activeTenantId);
        if (result) {
          token = result.accessToken;
          setNeedsAuth(false);
        } else {
          setIsSyncing(false);
          return;
        }
      }

      const listsRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const listsData = await listsRes.json();

      let importedCount = 0;

      if (listsData.items && listsData.items.length > 0) {
        for (const list of listsData.items) {
           const tasksRes = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${list.id}/tasks`, {
             headers: { Authorization: `Bearer ${token}` }
           });
           const tasksData = await tasksRes.json();

           if (tasksData.items) {
             for (const gTask of tasksData.items) {
               if (!tasks.some(t => t.title === gTask.title)) {
                 addTask({
                   title: gTask.title,
                   description: "Importado do Google Tasks.",
                   priority: "Média",
                   due_date: gTask.due ? new Date(gTask.due).toISOString() : undefined,
                   status: gTask.status === "completed" ? "Concluída" : "Em Aberto",
                 });
                 importedCount++;
               }
             }
           }
        }
      }

      toast.success(`Sincronização concluída: ${importedCount} tarefas importadas.`);

    } catch (err) {
      console.error(err);
      toast.error("Erro ao sincronizar com Google Tasks. Verifique os popups e permissões.");
      setNeedsAuth(true);
    } finally {
      setIsSyncing(false);
    }
  };

  const [mobileActiveCol, setMobileActiveCol] = useState<string>('Em Aberto');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedOverCol, setDraggedOverCol] = useState<string | null>(null);

  /** Formata `due_date` (ISO) pro estilo "Hoje, 09:00" / "Amanhã, 14:00" / "12 mar, 10:00". */
  const formatDueDate = (iso?: string | null): string => {
    if (!iso) return "Sem prazo";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "Sem prazo";
    const now = new Date();
    const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const diffDays = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
    const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (diffDays === 0) return `Hoje, ${time}`;
    if (diffDays === 1) return `Amanhã, ${time}`;
    if (diffDays === -1) return `Ontem, ${time}`;
    return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}, ${time}`;
  };

  /** Converte `due_date` (ISO) pro formato "YYYY-MM-DDTHH:mm" usado pelo <input type="datetime-local"> do modal. */
  const dueDateToDatetimeLocal = (iso?: string | null): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      const leadLabel = getLeadLabel(t).toLowerCase();
      const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            leadLabel.includes(searchQuery.toLowerCase()) ||
                            (t.description || "").toLowerCase().includes(searchQuery.toLowerCase());

      const matchesPriority = selectedPriorities.length === 0 || (t.priority ? selectedPriorities.includes(t.priority) : false);

      const matchesStatus = !statusFilter || t.status === statusFilter;
      const matchesAssignee = !assigneeFilter || (assigneeFilter === "__none__" ? !t.assigned_to : t.assigned_to === assigneeFilter);
      const matchesCliente = !clienteFilter || getLeadLabel(t) === clienteFilter;

      const matchesDeadline = !deadlineFilter || (() => {
        if (!t.due_date) return false;
        const taskDate = new Date(t.due_date);
        const limitDate = new Date(deadlineFilter + 'T23:59:59');
        return taskDate <= limitDate;
      })();

      return matchesSearch && matchesPriority && matchesDeadline && matchesStatus && matchesAssignee && matchesCliente;
    });
  }, [tasks, searchQuery, selectedPriorities, deadlineFilter, statusFilter, assigneeFilter, clienteFilter, leads]);

  // Responsáveis possíveis: colaboradores ativos com usuário vinculado
  // (`assigned_to` é FK pra users.id, não pra colaboradores.id).
  const assigneeOptions = useMemo(
    () => (colaboradores as any[])
      .filter((c) => c.status !== "Desligado" && c.user_id && c.nome)
      .map((c) => ({ id: c.user_id as string, nome: c.nome as string })),
    [colaboradores]
  );

  // Clientes que realmente aparecem em alguma tarefa (via lead vinculado).
  const clienteOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tasks) if (t.lead_id) { const l = getLeadLabel(t); if (l && l !== "Interno") set.add(l); }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [tasks, leads]);

  const clienteLeadIds = useMemo(
    () => clienteFilter ? (leads as any[]).filter((l) => (l.company || l.name) === clienteFilter).map((l) => l.id as string) : [],
    [clienteFilter, leads]
  );

  const clearFilters = () => {
    setSearchQuery(""); setSelectedPriorities([]); setDeadlineFilter("");
    setStatusFilter(""); setAssigneeFilter(""); setClienteFilter("");
  };
  const activeFilterCount = (searchQuery.trim() ? 1 : 0) + (deadlineFilter ? 1 : 0) + (selectedPriorities.length > 0 ? 1 : 0)
    + (statusFilter ? 1 : 0) + (assigneeFilter ? 1 : 0) + (clienteFilter ? 1 : 0);

  const duplicateTask = (task: Task) => {
    addTask({
      title: `${task.title} (cópia)`,
      description: task.description,
      priority: task.priority,
      due_date: task.due_date,
      lead_id: task.lead_id,
      assigned_to: task.assigned_to,
      status: "Em Aberto",
    } as any);
    toast.success("Tarefa duplicada.");
  };

  const totalCount = tasks.length;
  const completedCount = tasks.filter(t => t.status === 'Concluída').length;
  const openCount = tasks.filter(t => t.status === 'Em Aberto').length;
  const overdueCount = tasks.filter(t => t.status === 'Atrasado').length;
  const highPriorityCount = tasks.filter(t => t.priority === 'Alta' && t.status !== 'Concluída').length;
  const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const pushTaskToGoogle = async (task: Task) => {
    if (!activeTenantId) return;
    const token = await getAccessToken(activeTenantId);
    if (!token) return;

    try {
      const listsRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const listsData = await listsRes.json();
      if (!listsData.items || listsData.items.length === 0) return;

      const listId = listsData.items[0].id;

      await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${listId}/tasks`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          title: task.title,
          due: task.due_date ? new Date(task.due_date).toISOString() : undefined
        })
      });
    } catch (err) {
      console.error("Failed to push to Google Tasks:", err);
    }
  };

  const handleSaveTask = (data: any) => {
    const rawDate: string | undefined = data.dataInicio || data.data;
    let dueDateISO: string | undefined;
    if (rawDate) {
      const parsed = new Date(rawDate);
      if (!isNaN(parsed.getTime())) dueDateISO = parsed.toISOString();
    }

    // `tipo` (categoria) e produtos selecionados não têm coluna própria na
    // tabela `tasks` — dobrados dentro de `description`, texto livre, em vez
    // de inventar schema novo (ver comentário no types.ts `Task`).
    const produtoNomes = Array.isArray(data.produtos)
      ? (data.produtos as string[])
          .map(id => (products as any[]).find(p => p.id === id)?.name)
          .filter(Boolean)
      : [];
    const descriptionParts = [
      data.tipo ? `Tipo: ${data.tipo}` : null,
      produtoNomes.length > 0 ? `Produtos: ${produtoNomes.join(', ')}` : null,
      data.tags ? `Tags: ${data.tags}` : null,
    ].filter(Boolean);
    const description = descriptionParts.length > 0 ? descriptionParts.join(' · ') : undefined;

    const commonFields = {
      title: data.nome,
      description,
      priority: data.prioridade || "Média",
      due_date: dueDateISO,
      lead_id: data.relacionado || undefined,
      assigned_to: data.vendedor || undefined,
      convidados: data.convidados,
      calendarLink: data.calendarLink,
    };

    if (editingTask) {
      updateTask(editingTask.id, commonFields);
      toast.success("Tarefa editada com sucesso!");
    } else {
      const newTask: any = {
        ...commonFields,
        status: "Em Aberto",
      };
      addTask(newTask);
      pushTaskToGoogle(newTask);
      toast.success("Tarefa agendada com sucesso!");
    }
    setEditingTask(null);
    setIsModalOpen(false);
  };

  const toggleTaskStatus = (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'Concluída' ? 'Em Aberto' : 'Concluída';
    updateTask(id, { status: newStatus });
    toast.success(`Tarefa marcada como ${newStatus.toLowerCase()}!`);
  };

  const moveTaskStatus = (id: string, newStatus: 'Atrasado' | 'Em Aberto' | 'Concluída') => {
    updateTask(id, { status: newStatus });
    toast.success(`Tarefa movida para ${newStatus}!`);
  };

  const handleDeleteTask = (id: string) => {
    setTaskToDelete(id);
  };
  return {
    columns: readKanbanConfig(appSettings, KANBAN_KEYS.tarefas) as KanbanColConfig[],
    getPriorityColor: (p: string) => {
      switch(p) {
        case "Alta": return "text-rose-400 bg-rose-500/10 border-rose-500/20";
        case "Média": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
        case "Baixa": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
        default: return "text-slate-400 bg-slate-500/10 border-slate-500/20";
      }
    },
    openNewTaskModal: () => {
      setEditingTask(null);
      setIsModalOpen(true);
    },
    openEditTaskModal: (task: Task) => {
      setEditingTask(task);
      setIsModalOpen(true);
    },
    isModalOpen, setIsModalOpen,
    editingTask, setEditingTask,
    taskToDelete, setTaskToDelete,
    viewMode, setViewMode,
    searchQuery, setSearchQuery,
    selectedPriorities, setSelectedPriorities,
    deadlineFilter, setDeadlineFilter,
    statusFilter, setStatusFilter,
    assigneeFilter, setAssigneeFilter,
    clienteFilter, setClienteFilter,
    assigneeOptions, clienteOptions, clienteLeadIds,
    clearFilters, activeFilterCount, duplicateTask,
    tasks, addTask, updateTask, deleteTask,
    needsAuth,
    isSyncing,
    handleSyncGoogleTasks,
    mobileActiveCol, setMobileActiveCol,
    draggedTaskId, setDraggedTaskId,
    draggedOverCol, setDraggedOverCol,
    filteredTasks,
    totalCount,
    completedCount,
    openCount,
    overdueCount,
    highPriorityCount,
    completionRate,
    formatDueDate,
    dueDateToDatetimeLocal,
    getLeadLabel,
    getAssigneeLabel,
    currentUserColaboradorId,
    handleSaveTask,
    toggleTaskStatus,
    moveTaskStatus,
    handleDeleteTask
  };
}
