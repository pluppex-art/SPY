import { PageContainer } from "../../components/PageContainer";
import { useMemo, useState } from "react";
import { Plus, Calendar, CheckCircle2, X, FileText, Share2, CalendarCheck, Layers } from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from "../../components/ui/kpi-filter-card";
import { Button } from "../../components/ui/button";
import { Modal } from "../../components/ui/modal";
import { toast } from "sonner";
import { DragDropContext } from "@hello-pangea/dnd";
import { supabase } from "../../lib/supabase";
import { useData } from "../../contexts/DataContext";

import { useMarketingConteudo } from "./useMarketingConteudo";
import { KanbanColumn } from "./components/KanbanColumn";
import { NewTaskModal } from "./components/NewTaskModal";
import { TaskDetailsDrawer } from "./components/TaskDetailsDrawer";
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
  } = useMarketingConteudo();
  const { deleteMarketingContent } = useData();

  const [busca, setBusca] = useState("");
  const [plataforma, setPlataforma] = useState("");
  const [etapa, setEtapa] = useState("");

  const plataformas = useMemo(() => Array.from(new Set(tasks.map(t => t.platform).filter(Boolean))).sort() as string[], [tasks]);
  const tasksFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return tasks.filter(t =>
      (!plataforma || t.platform === plataforma) &&
      (!etapa || t.colId === etapa) &&
      (!q || [t.title, t.desc, t.platform].some((v: string) => (v || "").toLowerCase().includes(q))),
    );
  }, [tasks, busca, plataforma, etapa]);
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
      subtitle="Organize postagens, vídeos, e criativos em um fluxo visual."
    >
      <KpiFilterCard
        id="marketingConteudo"
        className="mb-6"
        kpis={[
          { label: "Pautas", value: tasksFiltradas.length, icon: FileText, tone: "primary" },
          { label: "Canais", value: new Set(tasksFiltradas.map(t => t.platform)).size, icon: Share2, tone: "info" },
          { label: ultimaCol ? ultimaCol.title : "Concluídas", value: ultimaCol ? tasksFiltradas.filter(t => t.colId === ultimaCol.id).length : 0, icon: CheckCircle2, tone: "success", hint: "Pautas na última etapa do fluxo" },
          { label: "Com data de publicação", value: tasksFiltradas.filter(t => t.publishDateISO).length, icon: CalendarCheck, tone: "accent" },
        ]}
        activeCount={(busca.trim() ? 1 : 0) + (plataforma ? 1 : 0) + (etapa ? 1 : 0)}
        onClear={() => { setBusca(""); setPlataforma(""); setEtapa(""); }}
      >
        <FilterBar>
          <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar pauta, descrição ou canal..." />
          <FilterSelect icon={Share2} value={plataforma} onChange={setPlataforma} options={plataformas} allLabel="Todos os canais" />
          <FilterSelect icon={Layers} value={etapa} onChange={setEtapa} options={initialColumns.map(c => ({ value: c.id, label: c.title }))} allLabel="Todas as etapas" />
        </FilterBar>
      </KpiFilterCard>

      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-4 items-center overflow-x-auto pb-2 scrollbar-none">
          <Button 
            onClick={() => setIsNewTaskModalOpen(true)}
            className="bg-[#2563EB] hover:bg-blue-600 shadow-lg text-xs font-bold gap-2"
          >
             <Plus className="w-4 h-4" /> Nova Pauta
          </Button>
          <Button
            onClick={() => toast.info("Visualização em calendário ainda não disponível — em breve.")}
            variant="outline" className="border-white/10 text-xs font-bold gap-2 bg-transparent"
          >
             <Calendar className="w-4 h-4" /> Calendário
          </Button>
        </div>
      </div>

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
                />
              </div>
            ))}
          </div>
        </DragDropContext>
      </div>

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
          />
        )}
      </Modal>
    </PageContainer>
  );
}
