import { useState } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import { LayoutGrid, List as ListIcon, RefreshCw, Plus } from "lucide-react";
import { NovaTarefaModal } from "../../components/ui/modals/productivity/NovaTarefaModal";
import { ConfirmModal } from "../../components/ui/modals/shared/ConfirmModal";
import { TaskDetailsModal } from "./tarefas/TaskDetailsModal";
import { NovaPautaModal } from "../../components/ui/modals/productivity/NovaPautaModal";

import { useTarefas } from "./tarefas/useTarefas";
import { useTarefasList } from "./tarefas/useTarefasList";
import { WorkloadBento } from "./tarefas/WorkloadBento";
import { TasksFilter } from "./tarefas/TasksFilter";
import { TasksListMode } from "./tarefas/TasksListMode";
import { TasksKanbanMode } from "./tarefas/TasksKanbanMode";
import { Pagination } from "../../components/ui/Pagination";

export default function Tarefas() {
  const {
    tasks,
    addTask,
    updateTask,
    deleteTask,
    isModalOpen,
    setIsModalOpen,
    editingTask,
    setEditingTask,
    taskToDelete,
    setTaskToDelete,
    viewMode,
    setViewMode,
    searchQuery,
    setSearchQuery,
    selectedPriorities,
    setSelectedPriorities,
    deadlineFilter,
    setDeadlineFilter,
    statusFilter, setStatusFilter, assigneeFilter, setAssigneeFilter, clienteFilter, setClienteFilter,
    assigneeOptions, clienteOptions, clienteLeadIds, clearFilters, activeFilterCount, duplicateTask,
    needsAuth,
    isSyncing,
    handleSyncGoogleTasks,
    mobileActiveCol,
    setMobileActiveCol,
    draggedTaskId,
    setDraggedTaskId,
    draggedOverCol,
    setDraggedOverCol,
    columns,
    getPriorityColor,
    filteredTasks,
    totalCount,
    completedCount,
    openCount,
    overdueCount,
    highPriorityCount,
    completionRate,
    dueDateToDatetimeLocal,
    handleSaveTask,
    openNewTaskModal,
    openEditTaskModal,
    toggleTaskStatus,
    moveTaskStatus,
    handleDeleteTask,
  } = useTarefas();

  const [isPautaModalOpen, setIsPautaModalOpen] = useState(false);
  const [detailTask, setDetailTask] = useState<any | null>(null);

  // Modo Lista pagina de verdade no servidor (só ativo quando viewMode ===
  // 'list', pra não disparar uma busca à toa enquanto o usuário está no
  // Kanban). O Kanban continua em `filteredTasks` (array completo do
  // DataContext) porque precisa mostrar todas as colunas/status juntas —
  // ver useTarefasList.ts.
  const {
    tasks: pagedTasks, total: pagedTotal, page: tasksPage, setPage: setTasksPage,
    totalPages: tasksTotalPages, pageSize: tasksPageSize, loading: tasksLoading,
    refetch: refetchTasksList,
  } = useTarefasList({ searchQuery, selectedPriorities, deadlineFilter, active: viewMode === "list", statusFilter, assigneeFilter, clienteFilter, clienteLeadIds });

  const refetchIfList = () => { if (viewMode === "list") setTimeout(refetchTasksList, 300); };

  const listToggleTaskStatus = (id: string, status: string) => { toggleTaskStatus(id, status); refetchIfList(); };
  const listMoveTaskStatus = (id: string, newStatus: any) => { moveTaskStatus(id, newStatus); refetchIfList(); };
  const listUpdateTask = (id: string, updates: any) => { updateTask(id, updates); refetchIfList(); };

  return (
    <PageContainer
      title="Tarefas S.P.Y."
      description="Organize suas demandas comerciais, reuniões de diagnóstico e follow-ups de vendas."
      actions={
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="flex items-center bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] p-0.5 h-9">
            <button
              type="button"
              onClick={() => setViewMode('kanban')}
              className={`px-3 py-1 text-xs font-bold rounded cursor-pointer transition-all flex items-center gap-1.5 ${viewMode === 'kanban' ? 'bg-[var(--color-primary-blue)] !text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Quadro
            </button>
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 text-xs font-bold rounded cursor-pointer transition-all flex items-center gap-1.5 ${viewMode === 'list' ? 'bg-[var(--color-primary-blue)] !text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'}`}
            >
              <ListIcon className="w-3.5 h-3.5" /> Lista
            </button>
          </div>
          <Button 
            variant="outline"
            onClick={handleSyncGoogleTasks} 
            disabled={isSyncing} 
            className="h-9 px-4 text-xs font-bold gap-1.5 border-[var(--color-border-default)]"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Sincronizando...' : 'Google Tasks'}
          </Button>
          <Button 
            variant="outline"
            onClick={() => setIsPautaModalOpen(true)} 
            className="h-9 px-4 text-xs font-bold gap-1.5 border-[var(--color-border-default)]"
          >
            <Plus className="w-3.5 h-3.5" /> Nova Pauta
          </Button>
          <Button 
            onClick={openNewTaskModal} 
            className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" /> Cadastrar Tarefa
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Workload Section */}
        <WorkloadBento
          tasks={tasks}
          onExpandTask={setDetailTask}
          googleConnected={!needsAuth}
        />

        <TasksFilter
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          deadlineFilter={deadlineFilter}
          setDeadlineFilter={setDeadlineFilter}
          selectedPriorities={selectedPriorities}
          setSelectedPriorities={setSelectedPriorities}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          assigneeFilter={assigneeFilter}
          setAssigneeFilter={setAssigneeFilter}
          clienteFilter={clienteFilter}
          setClienteFilter={setClienteFilter}
          statusOptions={columns.map((c) => ({ id: c.id, nome: c.nome }))}
          assigneeOptions={assigneeOptions}
          clienteOptions={clienteOptions}
          activeCount={activeFilterCount}
          onClear={clearFilters}
        />

        {/* Views */}
        {viewMode === 'list' ? (
          <>
            <TasksListMode
              filteredTasks={pagedTasks}
              toggleTaskStatus={listToggleTaskStatus}
              getPriorityColor={getPriorityColor}
              updateTask={listUpdateTask}
              columns={columns}
              moveTaskStatus={listMoveTaskStatus}
              openEditTaskModal={openEditTaskModal}
              handleDeleteTask={handleDeleteTask}
              onOpenDetails={setDetailTask}
            />
            <Pagination
              page={tasksPage}
              totalPages={tasksTotalPages}
              total={pagedTotal}
              pageSize={tasksPageSize}
              loading={tasksLoading}
              onPageChange={setTasksPage}
              itemLabel="tarefa"
            />
          </>
        ) : (
          <TasksKanbanMode
            columns={columns}
            filteredTasks={filteredTasks}
            mobileActiveCol={mobileActiveCol}
            setMobileActiveCol={setMobileActiveCol}
            draggedTaskId={draggedTaskId}
            setDraggedTaskId={setDraggedTaskId}
            draggedOverCol={draggedOverCol}
            setDraggedOverCol={setDraggedOverCol}
            openNewTaskModal={openNewTaskModal}
            moveTaskStatus={moveTaskStatus}
            updateTask={updateTask}
            openEditTaskModal={openEditTaskModal}
            toggleTaskStatus={toggleTaskStatus}
            handleDeleteTask={handleDeleteTask}
            setSearchQuery={setSearchQuery}
            duplicateTask={duplicateTask}
            onOpenDetails={setDetailTask}
            getPriorityColor={getPriorityColor}
          />
        )}
      </div>

      <TaskDetailsModal
        task={detailTask}
        onClose={() => setDetailTask(null)}
        columns={columns}
        onEdit={openEditTaskModal}
        onDelete={handleDeleteTask}
        onDuplicate={duplicateTask}
        onToggle={listToggleTaskStatus}
        onMove={listMoveTaskStatus}
        updateTask={listUpdateTask}
      />

      {/* Creation/Edition Modal */}
      <NovaTarefaModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTask(null);
        }}
        onSave={(data: any) => { handleSaveTask(data); refetchIfList(); }}
        initialValue={editingTask ? {
          nome: editingTask.title,
          prioridade: editingTask.priority,
          dataInicio: dueDateToDatetimeLocal(editingTask.due_date),
          relacionado: editingTask.lead_id || "",
          vendedor: editingTask.assigned_to || "",
        } : undefined}
      />

      <ConfirmModal
        isOpen={taskToDelete !== null}
        onClose={() => setTaskToDelete(null)}
        onConfirm={() => {
          if (taskToDelete) {
            deleteTask(taskToDelete);
            refetchIfList();
          }
        }}
        title="Confirmar Exclusão de Tarefa"
        message="Tem certeza de que deseja remover permanentemente esta tarefa? Essa ação não pode ser desfeita."
      />

      <NovaPautaModal
        isOpen={isPautaModalOpen}
        onClose={() => setIsPautaModalOpen(false)}
        onSave={(data) => {
          let dueDateISO: string | undefined;
          if (data.data) {
            const combined = new Date(`${data.data}T${data.hora || "00:00"}`);
            if (!isNaN(combined.getTime())) dueDateISO = combined.toISOString();
          }
          const description = [
            data.descricao,
            data.responsavel ? `Responsável: ${data.responsavel}` : null,
            data.participantes ? `Participantes: ${data.participantes}` : null,
          ].filter(Boolean).join(' · ') || undefined;
          addTask({
            title: data.titulo,
            description,
            priority: "Média",
            due_date: dueDateISO,
            status: "Em Aberto",
          });
        }}
      />
    </PageContainer>
  );
}
