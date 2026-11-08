import { useState, useEffect } from "react";
import { friendlyError } from "../../lib/friendlyError";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { DropResult } from "@hello-pangea/dnd";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { readKanbanConfig, KANBAN_KEYS, KANBAN_COR_CLASS } from "../../hooks/useKanbanConfig";

function getMarketingColumns(appSettings: Record<string, any>) {
  return readKanbanConfig(appSettings, KANBAN_KEYS.marketing).map(c => ({
    id: c.id,
    title: c.nome,
    color: KANBAN_COR_CLASS[c.cor] ?? "bg-slate-500",
  }));
}

// marketing_content no Supabase so tem id/tenant_id/title/description/platform/status/publish_date
// (sem colId/desc/date/priority/value) - estas duas funcoes fazem a ponte com o formato local do board.
function mapRowToTask(row: any) {
  let date = "Sem data";
  let publishDateISO = "";
  if (row.publish_date) {
    const d = new Date(row.publish_date);
    if (!isNaN(d.getTime())) {
      const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
      date = `${d.getDate()} ${months[d.getMonth()]}`;
      publishDateISO = d.toISOString().slice(0, 10);
    }
  }
  return {
    id: row.id,
    colId: row.status || "ideia",
    title: row.title || "",
    desc: row.description || "",
    platform: row.platform || "Instagram",
    date,
    publishDateISO,
    priority: "Média",
    value: 0,
  };
}

function taskToRow(task: any, tenantId?: string) {
  const row: any = {
    id: task.id,
    title: task.title,
    description: task.desc,
    platform: task.platform,
    status: task.colId,
    ...(tenantId ? { tenant_id: tenantId } : {}),
  };
  if (task.publishDateISO) row.publish_date = task.publishDateISO;
  return row;
}

export function useMarketingConteudo() {
  const { marketingContent: contentRows, appSettings, ensureNicheModulesLoaded } = useData();
  const { activeTenantId } = useAuth();
  const [tasks, setTasks] = useState<any[]>([]);

  useEffect(() => { ensureNicheModulesLoaded(); }, [ensureNicheModulesLoaded]);

  useEffect(() => {
    setTasks(contentRows.map(mapRowToTask));
  }, [contentRows]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'script' | 'refs' | 'ai'>('overview');

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedOverColId, setDraggedOverColId] = useState<string | null>(null);
  const [columnSearches, setColumnSearches] = useState<{ [key: string]: string }>({});

  const [newTitle, setNewTitle] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newPlatform, setNewPlatform] = useState("Instagram");
  const [newDate, setNewDate] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("Média");

  // Tasks are loaded via DataContext

  const updateTaskInDatabase = async (task: any) => {
    if (supabase) {
      try {
        const { error } = await supabase
          .from("marketing_content")
          .upsert(taskToRow(task, activeTenantId));

        if (error) {
          console.error("Supabase upsert failure:", error.message);
          toast.error("Não foi possível salvar a pauta: " + friendlyError(error));
        }
      } catch (err) {
        console.error("Supabase communication exception:", err);
        toast.error("Erro de comunicação ao salvar a pauta.");
      }
    }
  };

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;
    if (!destination) return;

    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const sourceColId = source.droppableId;
    const destColId = destination.droppableId;
    const movedTask = tasks.find(t => t.id === draggableId);
    if (!movedTask) return;

    const tasksInSource = tasks.filter(t => t.colId === sourceColId && t.id !== draggableId);
    const tasksInOtherCols = tasks.filter(t => t.colId !== sourceColId && t.colId !== destColId);

    if (sourceColId === destColId) {
      const reorderedSourceTasks = [...tasksInSource];
      reorderedSourceTasks.splice(destination.index, 0, movedTask);
      const updatedTasks = [...tasksInOtherCols, ...reorderedSourceTasks];
      setTasks(updatedTasks);
      setTasks(updatedTasks);
      
      await updateTaskInDatabase({ ...movedTask, colId: destColId });
    } else {
      const tasksInDest = tasks.filter(t => t.colId === destColId);
      const updatedMovedTask = { ...movedTask, colId: destColId };
      const reorderedDestTasks = [...tasksInDest];
      reorderedDestTasks.splice(destination.index, 0, updatedMovedTask);
      
      const updatedTasks = [...tasksInOtherCols, ...tasksInSource, ...reorderedDestTasks];
      setTasks(updatedTasks);
      setTasks(updatedTasks);

      const colName = getMarketingColumns(appSettings).find(c => c.id === destColId)?.title;
      toast.success(`"${movedTask.title}" movido para ${colName}`);
      
      await updateTaskInDatabase(updatedMovedTask);
    }
  };

  const handleCreateTask = async () => {
    if (!newTitle.trim()) {
      toast.error("Por favor, insira um título para a pauta.");
      return;
    }
    
    let displayDate = "Sem data";
    if (newDate) {
      const parts = newDate.split("-");
      if (parts.length === 3) {
        const months = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
        const day = parts[2];
        const monthIndex = parseInt(parts[1], 10) - 1;
        displayDate = `${day} ${months[monthIndex] || ""}`;
      }
    }

    const newTask = {
      id: crypto.randomUUID(),
      colId: "ideia",
      title: newTitle,
      desc: newDesc || "Sem descrição.",
      platform: newPlatform,
      date: displayDate,
      publishDateISO: newDate || "",
      priority: newPriority,
      value: parseFloat(newValue) || 0
    };
    
    const updated = [...tasks, newTask];
    setTasks(updated);
    setTasks(updated);
    await updateTaskInDatabase(newTask);

    setIsNewTaskModalOpen(false);
    
    setNewTitle("");
    setNewValue("");
    setNewPlatform("Instagram");
    setNewDate("");
    setNewDesc("");
    setNewPriority("Média");
    
    toast.success("Nova pauta criada em 'Ideias'!");
  };

  const openTask = (task: any) => {
    setSelectedTask(task);
    setActiveTab('overview');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedTask(null);
  };

  return {
    tasks, setTasks,
    isModalOpen, setIsModalOpen,
    isNewTaskModalOpen, setIsNewTaskModalOpen,
    selectedTask, setSelectedTask,
    activeTab, setActiveTab,
    draggedTaskId, setDraggedTaskId,
    draggedOverColId, setDraggedOverColId,
    columnSearches, setColumnSearches,
    newTitle, setNewTitle,
    newValue, setNewValue,
    newPlatform, setNewPlatform,
    newDate, setNewDate,
    newDesc, setNewDesc,
    newPriority, setNewPriority,
    initialColumns: getMarketingColumns(appSettings),
    onDragEnd,
    handleCreateTask,
    openTask,
    closeModal,
    updateTaskInDatabase
  };
}
