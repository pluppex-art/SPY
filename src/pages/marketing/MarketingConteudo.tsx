import { PageContainer } from "../../components/PageContainer";
import { useCallback, useMemo, useState } from "react";
import { Plus, Calendar, CheckCircle2, X, FileText, Share2, CalendarCheck, Layers, Columns3, User, Users, Send, Clock, MessageSquareWarning } from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, usePeriodoIndicadores } from "../../components/ui/kpi-filter-card";
import { Button } from "../../components/ui/button";
import { ViewToggle, HEADER_ACTIONS, HEADER_BUTTON, HEADER_PRIMARY_BUTTON } from "../../components/ui/view-toggle";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { DragDropContext } from "@hello-pangea/dnd";
import { supabase } from "../../lib/supabase";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";

import { useMarketingConteudo } from "./useMarketingConteudo";
import { KanbanColumn } from "./components/KanbanColumn";
import { ConteudoCalendario } from "./components/ConteudoCalendario";
import { NewTaskModal } from "./components/NewTaskModal";
import { TaskDetailsDrawer } from "./components/TaskDetailsDrawer";
import { EnviarAprovacaoModal, SeloAprovacao, situacaoDaPauta } from "./components/Aprovacao";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { friendlyError } from "../../lib/friendlyError";

export default function MarketingConteudo() {
  const {
    tasks,
    setTasks,
    isModalOpen,
    isNewTaskModalOpen,
    setIsNewTaskModalOpen,
    selectedTask,
    setSelectedTask,
    activeTab,
    setActiveTab,
    columnSearches,
    setColumnSearches,
    newTitle,
    setNewTitle,
    newValue,
    setNewValue,
    newPlatform,
    setNewPlatform,
    newDate,
    setNewDate,
    newDesc,
    setNewDesc,
    newPriority,
    setNewPriority,
    initialColumns,
    onDragEnd,
    handleCreateTask,
    openTask,
    closeModal,
    updateTaskInDatabase,
    newClienteId,
    setNewClienteId,
    pedirAprovacao,
    cancelarAprovacao,
  } = useMarketingConteudo();
  const { deleteMarketingContent, empresaFiliais } = useData() as any;
  const { activeFilialId } = useAuth();

  // Clientes atendidos (agência, contabilidade, BPO). Com um cliente escolhido no menu lateral, a tela fica nele.
  const clientes = useMemo(
    () => (empresaFiliais as any[]).filter((f) => f.status === "Cliente").map((f) => ({ id: String(f.id), nome: String(f.nome) })).sort((a, b) => a.nome.localeCompare(b.nome)),
    [empresaFiliais],
  );
  const clienteDoMenu = clientes.some((c) => c.id === activeFilialId) ? (activeFilialId as string) : "";
  const [clienteEscolhido, setClienteEscolhido] = useState("");
  const clienteAtivo = clienteDoMenu || (clientes.some((c) => c.id === clienteEscolhido) || clienteEscolhido === "sem" ? clienteEscolhido : "");
  const clienteDe = useCallback((t: any) => (clientes.some((c) => c.id === t.clienteId) ? (t.clienteId as string) : ""), [clientes]);
  const nomeCliente = useCallback((t: any) => (clienteAtivo ? "" : clientes.find((c) => c.id === t.clienteId)?.nome ?? ""), [clientes, clienteAtivo]);
  const [aprovacaoFiltro, setAprovacaoFiltro] = useState("");
  const [envio, setEnvio] = useState<{ pauta: string | null } | null>(null);

  const novaPauta = (dataISO: string) => {
    setNewDate(dataISO);
    setNewClienteId(clienteAtivo && clienteAtivo !== "sem" ? clienteAtivo : "");
    setIsNewTaskModalOpen(true);
  };

  const [busca, setBusca] = useState("");
  const [plataforma, setPlataforma] = useState("");
  const [etapa, setEtapa] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [visao, setVisao] = useState<"quadro" | "calendario">("quadro");

  const doCliente = useMemo(
    () => (clienteAtivo ? tasks.filter((t) => clienteDe(t) === (clienteAtivo === "sem" ? "" : clienteAtivo)) : tasks),
    [tasks, clienteAtivo, clienteDe],
  );
  const plataformas = useMemo(() => Array.from(new Set(doCliente.map(t => t.platform).filter(Boolean))).sort() as string[], [doCliente]);
  const tasksFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return doCliente.filter(t =>
      (!aprovacaoFiltro || situacaoDaPauta(t) === aprovacaoFiltro) &&
      (!plataforma || t.platform === plataforma) &&
      (!etapa || t.colId === etapa) &&
      (!responsavel || t.responsavel === responsavel) &&
      (!q || [t.title, t.desc, t.platform].some((v: string) => (v || "").toLowerCase().includes(q))),
    );
  }, [doCliente, busca, plataforma, etapa, responsavel, aprovacaoFiltro]);
  const responsaveis = useMemo(() => Array.from(new Set(tasks.map((t: any) => t.responsavel).filter(Boolean))).sort() as string[], [tasks]);
  const periodo = usePeriodoIndicadores("data de criação da pauta");
  const base = periodo.filtrar(tasksFiltradas, (t) => t.createdAt);
  const colunasVisiveis = etapa ? initialColumns.filter(c => c.id === etapa) : initialColumns;
  const ultimaCol = initialColumns[initialColumns.length - 1];

  const handleConcluir = () => {
    if (!selectedTask) return;
    const lastCol = initialColumns[initialColumns.length - 1];
    const updated = { ...selectedTask, colId: lastCol.id };
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? updated : t));
    updateTaskInDatabase(updated);
    toast.success(`Movido para: ${lastCol.title}`);
    closeModal();
  };

  const handleArquivar = async () => {
    if (!selectedTask || !supabase) return;
    const { error } = await supabase.from("marketing_content").update({ deleted_at: new Date().toISOString() }).eq("id", selectedTask.id);
    if (error) { toast.error(`Erro ao arquivar: ${friendlyError(error)}`); return; }
    setTasks(prev => prev.filter(t => t.id !== selectedTask.id));
    toast.success('Pauta arquivada.');
    closeModal();
  };

  const handleExcluir = () => {
    if (!selectedTask) return;
    deleteMarketingContent(selectedTask.id);
    setTasks(prev => prev.filter(t => t.id !== selectedTask.id));
    toast.success('Pauta excluída.');
    closeModal();
  };

  const handleSalvar = () => {
    if (!selectedTask) return;
    updateTaskInDatabase(selectedTask);
    toast.success('Alterações salvas!');
    closeModal();
  };

  return (
    <PageContainer
      title="Gestão de Conteúdo (Kanban)"
      subtitle={clienteAtivo && clienteAtivo !== "sem"
        ? `Pautas e calendário de ${clientes.find((c) => c.id === clienteAtivo)?.nome}.`
        : "Organize postagens, vídeos e criativos em um quadro visual por etapa."}
      actions={
        <div className={HEADER_ACTIONS}>
          <Button variant="outline" onClick={() => setEnvio({ pauta: null })} className={HEADER_BUTTON}>
            <Send className="w-3.5 h-3.5" /> Enviar para aprovação
          </Button>
          <ViewToggle value={visao} onChange={setVisao} options={[{ id: "quadro", label: "Quadro", icon: Columns3 }, { id: "calendario", label: "Calendário", icon: Calendar }]} />
          <Button onClick={() => novaPauta("")} className={HEADER_PRIMARY_BUTTON}>
            <Plus className="w-4 h-4" /> Nova Pauta
          </Button>
        </div>
      }
    >
      <KpiFilterCard
        id="marketingConteudo"
        periodo={periodo}
        className="mb-4"
        kpis={[
          { label: "Pautas", value: base.length, icon: FileText, tone: "primary" },
          { label: "Canais", value: new Set(base.map(t => t.platform)).size, icon: Share2, tone: "info" },
          { label: ultimaCol ? ultimaCol.title : "Concluídas", value: ultimaCol ? base.filter(t => t.colId === ultimaCol.id).length : 0, icon: CheckCircle2, tone: "success", hint: "Pautas na última etapa do fluxo" },
          { label: "Com data de publicação", value: base.filter(t => t.publishDateISO).length, icon: CalendarCheck, tone: "accent" },
          { label: "Aguardando cliente", value: base.filter(t => situacaoDaPauta(t) === "aguardando").length, icon: Clock, tone: "warning" },
          { label: "Ajustes pedidos", value: base.filter(t => situacaoDaPauta(t) === "ajustes").length, icon: MessageSquareWarning, tone: "danger" },
        ]}
        activeCount={(busca.trim() ? 1 : 0) + (plataforma ? 1 : 0) + (etapa ? 1 : 0) + (responsavel ? 1 : 0) + (aprovacaoFiltro ? 1 : 0) + (clienteEscolhido && !clienteDoMenu ? 1 : 0)}
        onClear={() => { setBusca(""); setPlataforma(""); setEtapa(""); setResponsavel(""); setAprovacaoFiltro(""); setClienteEscolhido(""); }}
      >
        <FilterBar>
          <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar pauta, descrição ou canal..." />
          {clientes.length > 0 && !clienteDoMenu && (
            <FilterSelect icon={Users} value={clienteEscolhido} onChange={setClienteEscolhido} options={[...clientes.map(c => ({ value: c.id, label: c.nome })), { value: "sem", label: "Sem cliente" }]} allLabel="Todos os clientes" />
          )}
          <FilterSelect icon={CheckCircle2} value={aprovacaoFiltro} onChange={setAprovacaoFiltro} options={[
            { value: "nao_enviado", label: "Não enviadas" }, { value: "aguardando", label: "Aguardando cliente" }, { value: "aprovado", label: "Aprovadas" },
            { value: "ajustes", label: "Ajustes pedidos" }, { value: "alterada", label: "Alteradas depois da resposta" }, { value: "vencido", label: "Link vencido" },
          ]} allLabel="Qualquer aprovação" />
          <FilterSelect icon={Share2} value={plataforma} onChange={setPlataforma} options={plataformas} allLabel="Todos os canais" />
          <FilterSelect icon={Layers} value={etapa} onChange={setEtapa} options={initialColumns.map(c => ({ value: c.id, label: c.title }))} allLabel="Todas as etapas" />
          <FilterSelect icon={User} value={responsavel} onChange={setResponsavel} options={responsaveis} allLabel="Todos os responsáveis" />
        </FilterBar>
      </KpiFilterCard>

      {visao === "calendario" ? (
        <ConteudoCalendario
          tasks={tasksFiltradas}
          colunas={initialColumns}
          onOpenTask={openTask}
          onNovaPauta={novaPauta}
          etiqueta={nomeCliente}
          marcador={(t) => <SeloAprovacao task={t} soIcone />}
        />
      ) : (
      <div id="app-marketing-conteudo-kanban-board" className="w-full flex-1 flex flex-col min-h-0">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="flex gap-6 overflow-x-auto min-h-[500px] scrollbar-thin pb-6 flex-1 items-start">
            {colunasVisiveis.map(col => (
              <div key={col.id}>
                <KanbanColumn
                  col={col}
                  tasks={tasksFiltradas}
                  columnSearches={columnSearches}
                  setColumnSearches={setColumnSearches}
                  openTask={openTask}
                  nomeCliente={nomeCliente}
                />
              </div>
            ))}
          </div>
        </DragDropContext>
      </div>
      )}

      {/* Modal: Nova Pauta */}
      <NewTaskModal
        isOpen={isNewTaskModalOpen}
        onClose={() => setIsNewTaskModalOpen(false)}
        newTitle={newTitle}
        setNewTitle={setNewTitle}
        newValue={newValue}
        setNewValue={setNewValue}
        newPlatform={newPlatform}
        setNewPlatform={setNewPlatform}
        newDate={newDate}
        setNewDate={setNewDate}
        newPriority={newPriority}
        setNewPriority={setNewPriority}
        newDesc={newDesc}
        setNewDesc={setNewDesc}
        handleCreateTask={handleCreateTask}
        clientes={clientes}
        newClienteId={newClienteId}
        setNewClienteId={setNewClienteId}
      />

      <EnviarAprovacaoModal
        isOpen={!!envio}
        onClose={() => setEnvio(null)}
        tasks={tasks}
        clientes={clientes}
        clienteDe={clienteDe}
        clienteInicial={clienteAtivo === "sem" ? "" : clienteAtivo}
        pautaInicial={envio?.pauta}
        ultimaEtapa={ultimaCol?.id}
        pedirAprovacao={pedirAprovacao}
        cancelarAprovacao={cancelarAprovacao}
      />

      {/* Modal: Detalhes da Pauta */}
      <Modal 
        isOpen={isModalOpen && !!selectedTask} 
        onClose={closeModal} 
        maxWidth="max-w-xl"
        position="right"
        title={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleConcluir}
              className="text-emerald-400 border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/25 h-9 px-4 rounded-full gap-2 font-bold shadow-sm transition-all text-[10px] uppercase tracking-widest cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" /> Concluir
            </Button>
            <Button
              variant="outline"
              onClick={handleArquivar}
              className="text-rose-400 border-rose-400/20 bg-rose-400/10 hover:bg-rose-400/25 h-9 px-4 rounded-full gap-2 font-bold shadow-sm transition-all text-[10px] uppercase tracking-widest cursor-pointer"
            >
              <X className="w-4 h-4" /> Arquivar
            </Button>
          </div>
        }
        footer={
          <div className="flex items-center justify-between w-full gap-2">
            <Button
              variant="outline"
              onClick={handleExcluir}
              className="border-white/5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 gap-1.5 h-10 px-4 text-[10px] uppercase font-black cursor-pointer bg-transparent"
            >
              Excluir
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={closeModal} className="text-slate-400 font-bold px-4 text-[10px] uppercase cursor-pointer">Fechar</Button>
              <Button onClick={handleSalvar} className="bg-[#2563EB] hover:bg-blue-600 text-white font-bold px-6 text-[10px] uppercase cursor-pointer">Salvar</Button>
            </div>
          </div>
        }
      >
        {selectedTask && (
          <TaskDetailsDrawer
            selectedTask={selectedTask}
            setSelectedTask={setSelectedTask}
            tasks={tasks}
            setTasks={setTasks}
            initialColumns={initialColumns}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            updateTaskInDatabase={updateTaskInDatabase}
            clientes={clientes}
            onPedirAprovacao={() => { setEnvio({ pauta: selectedTask.id }); closeModal(); }}
            onCancelarAprovacao={async () => {
              const ok = await confirmDialog({
                title: "Cancelar o pedido de aprovação?",
                description: "A pauta sai do link do cliente e as respostas registradas nela são apagadas.",
                confirmLabel: "Cancelar pedido",
              });
              if (ok && await cancelarAprovacao([selectedTask.id])) toast.success("Pedido de aprovação cancelado.");
            }}
          />
        )}
      </Modal>
    </PageContainer>
  );
}
