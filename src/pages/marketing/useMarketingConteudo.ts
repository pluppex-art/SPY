import { useState, useEffect, useCallback, useRef } from "react";
import { friendlyError } from "../../lib/friendlyError";
import { toast } from "sonner";
import { supabase } from "../../lib/supabase";
import { DropResult } from "@hello-pangea/dnd";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { readKanbanConfig, KANBAN_KEYS, KANBAN_COR_CLASS, KANBAN_COR_DOT } from "../../hooks/useKanbanConfig";
import { enviarParaAprovacao, lerAprovacao, linkVencido, novoToken, versaoDoConteudo } from "../../lib/aprovacaoConteudo";

const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
/** "2026-12-01" vira "1 Dez" sem passar por fuso (new Date de uma data pura mostraria o dia anterior no Brasil). */
export const dataCurta = (iso: string) => {
  const [, mes, dia] = iso.split("-").map(Number);
  return mes && dia ? `${dia} ${MESES_CURTOS[mes - 1]}` : "Sem data";
};

/** Versão do conteúdo da pauta — a mesma conta que o servidor faz para a página do cliente. */
export const versaoDaPauta = (t: any) => versaoDoConteudo({
  titulo: t.title, descricao: t.desc, canal: t.platform, data: t.publishDateISO, formato: t.formato,
  roteiro: t.script, hashtags: t.hashtags, links: t.refs, anexos: t.anexos,
});

function getMarketingColumns(appSettings: Record<string, any>) {
  return readKanbanConfig(appSettings, KANBAN_KEYS.marketing).map(c => ({
    id: c.id,
    title: c.nome,
    color: KANBAN_COR_CLASS[c.cor] ?? "bg-slate-500",
    hex: KANBAN_COR_DOT[c.cor] ?? "#64748b",
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
      publishDateISO = d.toISOString().slice(0, 10);
      date = dataCurta(publishDateISO);
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
    createdAt: row.created_at || "",
    priority: row.priority === "Alta" || row.priority === "Baixa" ? row.priority : "Média",
    value: Number(row.extras?.value) || 0,
    responsavel: typeof row.extras?.responsavel === "string" ? row.extras.responsavel : "",
    formato: typeof row.extras?.formato === "string" ? row.extras.formato : "",
    notas: Array.isArray(row.extras?.notas) ? row.extras.notas.filter((n: any) => n && typeof n.texto === "string") : [],
    checklist: Array.isArray(row.extras?.checklist) ? row.extras.checklist : undefined,
    script: row.extras?.script || "",
    hashtags: Array.isArray(row.extras?.hashtags) ? row.extras.hashtags : [],
    refs: Array.isArray(row.extras?.refs) ? row.extras.refs : [],
    anexos: Array.isArray(row.extras?.anexos) ? row.extras.anexos : [],
    clienteId: typeof row.extras?.clienteId === "string" ? row.extras.clienteId : "",
    aprovacao: lerAprovacao(row.extras?.aprovacao),
  };
}

// A coluna `priority` vem da migração 20261124_marketing_content_priority; sem ela, grava como antes (sem prioridade) em vez de falhar.
let gravaPrioridade = true;
// Checklist, roteiro, links e anexos vão na coluna `extras` (migração 20261124); sem ela, grava só o resto.
let gravaExtras = true;

/**
 * `extrasNoBanco` é o que está gravado agora: a resposta do cliente chega por lá, então salvar a pauta nunca a
 * sobrescreve com a cópia (possivelmente antiga) da tela. Trocar a pauta de cliente cancela o pedido de aprovação.
 */
function taskToRow(task: any, tenantId?: string, extrasNoBanco: Record<string, any> = {}) {
  const row: any = {
    id: task.id,
    title: task.title,
    description: task.desc,
    platform: task.platform,
    status: task.colId,
    ...(tenantId ? { tenant_id: tenantId } : {}),
  };
  row.publish_date = task.publishDateISO || null;
  if (gravaPrioridade && task.priority) row.priority = task.priority;
  if (gravaExtras) row.extras = { ...extrasNoBanco, clienteId: task.clienteId || "", value: Math.max(0, Number(task.value) || 0), responsavel: task.responsavel || "", formato: task.formato || "", notas: Array.isArray(task.notas) ? task.notas.slice(-100) : [], checklist: task.checklist, script: task.script || "", hashtags: task.hashtags || [], refs: task.refs || [], anexos: task.anexos || [] };
  if (row.extras && (extrasNoBanco.clienteId || "") !== row.extras.clienteId) delete row.extras.aprovacao;
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
  const [activeTab, setActiveTab] = useState<'overview' | 'script' | 'refs' | 'ai' | 'notas'>('overview');

  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [draggedOverColId, setDraggedOverColId] = useState<string | null>(null);
  const [columnSearches, setColumnSearches] = useState<{ [key: string]: string }>({});

  const [newTitle, setNewTitle] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newPlatform, setNewPlatform] = useState("Instagram");
  const [newDate, setNewDate] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPriority, setNewPriority] = useState("Média");
  const [newClienteId, setNewClienteId] = useState("");

  // Gravações em fila: a leitura do que está no banco e a escrita não se atropelam.
  const fila = useRef<Promise<unknown>>(Promise.resolve());
  const naFila = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const proxima = fila.current.then(fn, fn);
    fila.current = proxima.catch(() => {});
    return proxima;
  }, []);

  const lerLinhas = useCallback(async (): Promise<any[] | null> => {
    if (!supabase || !activeTenantId) return null;
    const linhas: any[] = [];
    for (let de = 0; ; de += 1000) {
      const { data, error } = await supabase.from("marketing_content").select("*")
        .eq("tenant_id", activeTenantId).is("deleted_at", null).order("created_at").order("id").range(de, de + 999);
      if (error) { console.error("Falha ao atualizar pautas:", error.message); return null; }
      linhas.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) return linhas;
    }
  }, [activeTenantId]);

  /** Busca direto no banco: é assim que as respostas dos clientes aparecem sem recarregar o sistema. */
  const recarregar = useCallback(() => naFila(async () => {
    const linhas = await lerLinhas();
    if (!linhas) return;
    const novas = linhas.map(mapRowToTask);
    setTasks(novas);
    setSelectedTask((atual: any) => (atual ? { ...atual, aprovacao: novas.find((t) => t.id === atual.id)?.aprovacao } : atual));
  }), [naFila, lerLinhas]);

  useEffect(() => {
    void recarregar();
    const aoVoltar = () => { void recarregar(); };
    window.addEventListener("focus", aoVoltar);
    return () => window.removeEventListener("focus", aoVoltar);
  }, [recarregar]);

  const gravarExtras = async (id: string, extras: Record<string, any>) => {
    const { error } = await supabase!.from("marketing_content")
      .update({ extras, updated_at: new Date().toISOString() }).eq("id", id).eq("tenant_id", activeTenantId!);
    if (error) throw error;
  };

  /** Marca as pautas como "aguardando o cliente" e devolve o token do link (o mesmo link vale para o cliente todo). */
  const pedirAprovacao = async (ids: string[], clienteId: string): Promise<string | null> => {
    try {
      const token = await naFila(async () => {
        const linhas = await lerLinhas();
        if (!linhas) throw new Error("sem conexão com o banco");
        const alvo = linhas.filter((r) => ids.includes(r.id) && (r.extras?.clienteId || "") === clienteId);
        if (!alvo.length) throw new Error("nenhuma pauta encontrada");
        const valido = (r: any) => { const a = lerAprovacao(r.extras?.aprovacao); return a && !linkVencido(a) ? a.token : ""; };
        const atual = linhas.filter((r) => (r.extras?.clienteId || "") === clienteId).map(valido).find(Boolean);
        const token = atual || novoToken();
        for (const r of alvo) {
          await gravarExtras(r.id, { ...r.extras, aprovacao: enviarParaAprovacao(token, lerAprovacao(r.extras?.aprovacao)) });
        }
        return token;
      });
      await recarregar();
      return token;
    } catch (e: any) {
      toast.error("Não foi possível gerar o link: " + friendlyError(e));
      await recarregar();
      return null;
    }
  };

  /** Tira as pautas do link: o cliente deixa de vê-las. */
  const cancelarAprovacao = async (ids: string[]): Promise<boolean> => {
    try {
      await naFila(async () => {
        const linhas = await lerLinhas();
        if (!linhas) throw new Error("sem conexão com o banco");
        for (const r of linhas.filter((l) => ids.includes(l.id) && l.extras?.aprovacao)) {
          const { aprovacao: _removida, ...resto } = r.extras;
          await gravarExtras(r.id, resto);
        }
      });
      await recarregar();
      return true;
    } catch (e: any) {
      toast.error("Não foi possível cancelar: " + friendlyError(e));
      await recarregar();
      return false;
    }
  };

  const updateTaskInDatabase = (task: any) => naFila(async () => {
    if (supabase) {
      try {
        let noBanco: Record<string, any> = {};
        if (gravaExtras) {
          const { data, error: erroLeitura } = await supabase.from("marketing_content").select("extras").eq("id", task.id).maybeSingle();
          if (erroLeitura) {
            if (/extras/i.test(erroLeitura.message)) gravaExtras = false;
            else { toast.error("Não foi possível salvar a pauta: " + friendlyError(erroLeitura)); return; }
          }
          noBanco = (data?.extras as Record<string, any>) || {};
        }
        let { error } = await supabase
          .from("marketing_content")
          .upsert(taskToRow(task, activeTenantId, noBanco));
        // Colunas novas ainda não criadas no banco: tira o campo que falta e tenta de novo (no máximo duas vezes).
        for (let t = 0; t < 2 && error; t++) {
          if (gravaExtras && /extras/i.test(error.message)) gravaExtras = false;
          else if (gravaPrioridade && /priority/i.test(error.message)) gravaPrioridade = false;
          else break;
          ({ error } = await supabase.from("marketing_content").upsert(taskToRow(task, activeTenantId, noBanco)));
        }
        if (error) {
          console.error("Supabase upsert failure:", error.message);
          toast.error("Não foi possível salvar a pauta: " + friendlyError(error));
        }
      } catch (err) {
        console.error("Supabase communication exception:", err);
        toast.error("Erro de comunicação ao salvar a pauta.");
      }
    }
  });

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
    
    const newTask = {
      id: crypto.randomUUID(),
      colId: "ideia",
      title: newTitle,
      desc: newDesc || "Sem descrição.",
      platform: newPlatform,
      date: newDate ? dataCurta(newDate) : "Sem data",
      publishDateISO: newDate || "",
      priority: newPriority,
      value: parseFloat(newValue) || 0,
      clienteId: newClienteId,
      createdAt: new Date().toISOString(), // só para a tela; no banco quem carimba é o próprio banco
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
    newClienteId, setNewClienteId,
    pedirAprovacao, cancelarAprovacao, recarregar,
    initialColumns: getMarketingColumns(appSettings),
    onDragEnd,
    handleCreateTask,
    openTask,
    closeModal,
    updateTaskInDatabase
  };
}
