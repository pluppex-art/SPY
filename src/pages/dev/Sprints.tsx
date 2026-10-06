import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from '../../components/ui/kpi-filter-card';
import { useMemo, useState } from 'react';
import { Plus, Zap, Layers, Clock, CheckCircle2, FolderCode, Flame, User } from 'lucide-react';
import { NovaTarefaSprintModal, type TarefaSprintPayload } from './modals/NovaTarefaSprintModal';
import { DetalharTarefaSprintModal } from './modals/DetalharTarefaSprintModal';
import { Button } from '../../components/ui/button';
import { PageContainer } from '../../components/PageContainer';
import { useDevSprints, type Column } from './hooks/useDevSprints';
import { readKanbanConfig, KANBAN_KEYS, KANBAN_COR_CLASS } from '../../hooks/useKanbanConfig';
import { useDevProjectsForFilter } from './hooks/useDevProjectsForFilter';
import { useData } from '../../contexts/DataContext';

const PRIORITY_STYLE: Record<string, string> = {
  crítica: 'bg-red-500/15 text-red-400 border-red-500/25',
  alta: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  média: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  baixa: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
};

const TYPE_ICON: Record<string, string> = {
  feature: '✦',
  bug: '🐛',
  chore: '⚙',
  refactor: '♻',
};

const TYPE_COLOR: Record<string, string> = {
  feature: 'text-blue-400',
  bug: 'text-red-400',
  chore: 'text-slate-400',
  refactor: 'text-indigo-400',
};

function getSprintColumns(appSettings: Record<string, any>): { id: Column; label: string; accent: string; dotColor: string }[] {
  return readKanbanConfig(appSettings, KANBAN_KEYS.sprint).map(c => ({
    id: c.id as Column,
    label: c.nome,
    accent: `border-${c.cor}-500/30`,
    dotColor: KANBAN_COR_CLASS[c.cor] ?? 'bg-slate-500',
  }));
}

type DevProject = { id: string | number; name: string };

export default function Sprints() {
  const { appSettings } = useData();
  const COLUMNS = getSprintColumns(appSettings);

  const projects = useDevProjectsForFilter() as DevProject[];

  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

  const [filterColumns, setFilterColumns] = useState<Record<Column, boolean>>({
    backlog: true,
    todo: true,
    inprogress: true,
    review: true,
    done: true,
  });

  const { tasks, addTask, moveTask } = useDevSprints(activeProjectId);

  const [search, setSearch] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  const assigneeOpcoes = useMemo(() => Array.from(new Set(tasks.map(t => t.assignee).filter(a => a && a !== '-'))).sort() as string[], [tasks]);
  const priorityOpcoes = useMemo(() => Array.from(new Set(tasks.map(t => t.priority).filter(Boolean))) as string[], [tasks]);

  const tasksFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter(t =>
      filterColumns[t.column] &&
      (!q || t.title.toLowerCase().includes(q) || (t.tags || []).some(tag => tag.toLowerCase().includes(q))) &&
      (!filterAssignee || t.assignee === filterAssignee) &&
      (!filterPriority || t.priority === filterPriority)
    );
  }, [tasks, filterColumns, search, filterAssignee, filterPriority]);

  const etapasOcultas = (Object.keys(filterColumns) as Column[]).filter(c => !filterColumns[c]).length;
  const clearFilters = () => {
    setActiveProjectId(null);
    setSearch('');
    setFilterAssignee('');
    setFilterPriority('');
    setFilterColumns({ backlog: true, todo: true, inprogress: true, review: true, done: true });
  };

  const totalPoints = tasksFiltered.filter(t => t.column === 'done').reduce((s, t) => s + t.points, 0);
  const totalSprintPoints = tasksFiltered.reduce((s, t) => s + t.points, 0);

  const [draggedId, setDraggedId] = useState<string | number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<Column | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [selectedTaskId, setSelectedTaskId] = useState<string | number | null>(null);

  const handleSaveTarefa = async (data: TarefaSprintPayload) => {
    await addTask(data);
  };

  const handleDrop = async (col: Column) => {
    if (draggedId === null) return;
    await moveTask(draggedId, col);
    setDraggedId(null);
    setDragOverCol(null);
  };

  const selectedTask = useMemo(() => {
    if (selectedTaskId == null) return null;
    return tasks.find(t => String(t.id) === String(selectedTaskId)) ?? null;
  }, [selectedTaskId, tasks]);

  return (
    <PageContainer
      title="Sprint Atual"
      description="Quadro Kanban do sprint em andamento — filtre por projeto e por etapas. Arraste os cards para mover. Clique no card para abrir detalhes."
      breadcrumb={[{ label: 'Dev & Tecnologia', path: '/app/dev/painel' }, { label: 'Sprints' }]}
      actions={
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-4 py-2 bg-blue-600/10 border border-blue-500/20 rounded-xl">
            <Zap className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">
              {totalPoints}/{totalSprintPoints} pts concluídos
            </span>
          </div>
          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 px-5 text-[10px] font-black uppercase tracking-widest gap-2"
          >
            <Plus className="w-4 h-4" /> Nova Task
          </Button>
        </div>
      }
    >
      <div className="pb-10 space-y-4">
        <KpiFilterCard
          id="devSprints"
          kpis={[
            { label: 'Tarefas', value: tasksFiltered.length, icon: Layers, tone: 'primary' },
            { label: 'Em Andamento', value: tasksFiltered.filter(t => t.column === 'inprogress').length, icon: Clock, tone: 'warning' },
            { label: 'Concluídas', value: tasksFiltered.filter(t => t.column === 'done').length, icon: CheckCircle2, tone: 'success' },
            { label: 'Pontos Concluídos', value: `${totalPoints}/${totalSprintPoints}`, icon: Zap, tone: 'info' },
          ]}
          activeCount={(activeProjectId ? 1 : 0) + (etapasOcultas > 0 ? 1 : 0) + (search ? 1 : 0) + (filterAssignee ? 1 : 0) + (filterPriority ? 1 : 0)}
          onClear={clearFilters}
        >
          <FilterBar>
            <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por título ou tag..." />
            <FilterSelect
              icon={FolderCode}
              value={activeProjectId ?? ''}
              onChange={v => setActiveProjectId(v ? v : null)}
              allLabel="Todos os projetos"
              options={projects.map(p => ({ value: String(p.id), label: p.name }))}
            />
            <FilterSelect icon={User} value={filterAssignee} onChange={setFilterAssignee} allLabel="Todos os responsáveis" options={assigneeOpcoes} />
            <FilterSelect icon={Flame} value={filterPriority} onChange={setFilterPriority} allLabel="Todas as prioridades" options={priorityOpcoes} />
            <div className="flex items-center gap-1 bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] flex-wrap" title="Etapas visíveis">
              {(Object.keys(filterColumns) as Column[]).map(colId => {
                const cfg = COLUMNS.find(c => c.id === colId);
                const label = cfg?.label ?? colId;
                const checked = filterColumns[colId];
                return (
                  <button
                    key={colId}
                    type="button"
                    onClick={() => setFilterColumns(prev => ({ ...prev, [colId]: !prev[colId] }))}
                    className={`px-3 py-1 text-xs font-medium rounded cursor-pointer transition-all ${
                      checked
                        ? 'bg-[var(--color-primary-blue)] !text-white'
                        : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </FilterBar>
        </KpiFilterCard>

        {/* Board */}
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
          {COLUMNS.map(col => {
            const colTasks = tasksFiltered.filter(t => t.column === col.id);
            const colPoints = colTasks.reduce((s, t) => s + t.points, 0);

            return (
              <div
                key={col.id}
                className={`flex-shrink-0 w-72 flex flex-col rounded-2xl border ${
                  dragOverCol === col.id ? 'border-blue-500/40 bg-blue-600/[0.03]' : 'border-white/5 bg-[var(--color-surface)]/40'
                } transition-all`}
                onDragOver={e => {
                  e.preventDefault();
                  setDragOverCol(col.id);
                }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={() => handleDrop(col.id)}
              >
                {/* Column Header */}
                <div className="p-4 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${col.dotColor}`} />
                    <span className="text-[11px] font-black text-white uppercase tracking-wider">{col.label}</span>
                    <span className="text-[10px] font-black text-slate-500 ml-1">{colTasks.length}</span>
                  </div>
                  <span className="text-[10px] text-slate-600 font-bold">{colPoints}pts</span>
                </div>

                {/* Tasks */}
                <div className="flex-1 p-3 space-y-3 min-h-[120px]">
                  {colTasks.map(task => (
                    <div
                      key={String(task.id)}
                      draggable
                      onDragStart={() => setDraggedId(task.id)}
                      onClick={() => setSelectedTaskId(task.id)}
                      className={`p-4 bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl cursor-grab active:cursor-grabbing hover:border-white/10 transition-all select-none group ${
                        draggedId === task.id ? 'opacity-40 scale-95' : ''
                      }`}
                      role="button"
                      tabIndex={0}
                    >
                      {/* Type + Priority */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[10px] font-black uppercase tracking-wider ${TYPE_COLOR[task.type] ?? 'text-slate-400'}`}
                            >
                              {TYPE_ICON[task.type] ?? '•'} {task.type}
                            </span>
                          </div>

                          <p className="text-xs font-bold text-white leading-snug mt-2 line-clamp-3">{task.title}</p>
                        </div>

                        <span
                          className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg border ${
                            PRIORITY_STYLE[task.priority] ?? 'bg-slate-500/10 text-slate-300 border-slate-500/20'
                          }`}
                        >
                          {task.priority}
                        </span>
                      </div>

                      {/* Tags */}
                      {task.tags?.length ? (
                        <div className="flex flex-wrap gap-1 mb-3">
                          {(task.tags || []).slice(0, 5).map(tag => (
                            <span key={tag} className="text-[9px] font-bold text-slate-500 bg-white/[0.03] px-1.5 py-0.5 rounded">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-500 mb-3">Sem tags</div>
                      )}

                      {/* Footer */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-[9px] font-black text-white border border-white/10 shrink-0">
                            {(task.assignee || '?').split('.')[0]}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] font-black text-slate-500 truncate">{task.assignee || '?'}</div>
                            <div className="text-[9px] text-slate-600">{task.column}</div>
                          </div>
                        </div>
                        <span className="text-[10px] font-black text-slate-500">{task.points} pts</span>
                      </div>
                    </div>
                  ))}

                  <button
                    onClick={() => setIsModalOpen(true)}
                    className="w-full py-2.5 flex items-center justify-center gap-2 text-slate-600 hover:text-slate-400 hover:bg-white/[0.02] rounded-xl transition-all border border-dashed border-white/[0.04] hover:border-white/10"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-black uppercase tracking-wider">Adicionar</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <NovaTarefaSprintModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveTarefa}
      />

      <DetalharTarefaSprintModal
        isOpen={selectedTaskId !== null}
        onClose={() => setSelectedTaskId(null)}
        task={selectedTask}
      />
    </PageContainer>
  );
}

