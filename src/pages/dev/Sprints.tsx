import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect } from '../../components/ui/kpi-filter-card';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Zap, Layers, Clock, CheckCircle2, FolderCode, Flame, User, Bot, Paperclip, CheckSquare } from 'lucide-react';
import { useAnexoLinks } from './hooks/useAnexoLinks';
import { ehImagem } from './lib/anexos';
import { NovaTarefaSprintModal, type TarefaSprintPayload } from './modals/NovaTarefaSprintModal';
import { TarefaSprintPainel, TIPOS_SPRINT, COR_PRIORIDADE_SPRINT, iniciaisSprint } from './modals/TarefaSprintPainel';
import { Button } from '../../components/ui/button';
import { PageContainer } from '../../components/PageContainer';
import { useDevSprints, type Column } from './hooks/useDevSprints';
import { readKanbanConfig, KANBAN_KEYS, KANBAN_COR_CLASS, KANBAN_COR_DOT } from '../../hooks/useKanbanConfig';
import { useDevProjectsForFilter } from './hooks/useDevProjectsForFilter';
import { useData } from '../../contexts/DataContext';
import { toast } from 'sonner';
import { useDevConfig } from '../../lib/modules/devConfig';

function getSprintColumns(appSettings: Record<string, any>): { id: Column; label: string; accent: string; dotColor: string; hex: string }[] {
  return readKanbanConfig(appSettings, KANBAN_KEYS.sprint).map(c => ({
    id: c.id as Column,
    label: c.nome,
    accent: `border-${c.cor}-500/30`,
    dotColor: KANBAN_COR_CLASS[c.cor] ?? 'bg-slate-500',
    hex: KANBAN_COR_DOT[c.cor] ?? '#64748b',
  }));
}

type DevProject = { id: string | number; name: string };

export default function Sprints() {
  const { appSettings } = useData();
  const COLUMNS = getSprintColumns(appSettings);
  const { sprint: sprintCfg } = useDevConfig();

  const projects = useDevProjectsForFilter() as DevProject[];

  // O projeto filtrado fica na URL (?projeto=<id>): é assim que a tela Projetos abre o quadro já filtrado,
  // e o filtro continua depois de recarregar ou ao compartilhar o link.
  const [searchParams, setSearchParams] = useSearchParams();
  const activeProjectId = searchParams.get('projeto');
  const setActiveProjectId = (id: string | null) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (id) next.set('projeto', id); else next.delete('projeto');
      return next;
    }, { replace: true });
  };

  const [filterColumns, setFilterColumns] = useState<Record<Column, boolean>>({
    backlog: true,
    todo: true,
    inprogress: true,
    review: true,
    done: true,
  });

  const { tasks, addTask, moveTask, updateTask, addAttachments, removeAttachment, detalhesDisponiveis } = useDevSprints(activeProjectId);
  const linkDoAnexo = useAnexoLinks(useMemo(() => tasks.flatMap(t => t.attachments.filter(ehImagem).slice(0, 1)), [tasks]));

  const [search, setSearch] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  const assigneeOpcoes = useMemo(() => Array.from(new Set(tasks.map(t => t.assignee).filter(a => a && a !== '-'))).sort() as string[], [tasks]);
  const priorityOpcoes = useMemo(() => Array.from(new Set(tasks.map(t => t.priority).filter(Boolean))) as string[], [tasks]);

  const tasksFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tasks.filter(t =>
      filterColumns[t.column] &&
      (!q || [t.title, t.description, t.errorDetail, t.source?.solicitante, ...(t.tags || [])].some(v => (v || '').toLowerCase().includes(q))) &&
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

  const capacidade = Number(sprintCfg.capacidadePontos) || 0;
  const pontosPlanejados = tasks.reduce((s, t) => s + t.points, 0);
  // A capacidade é de um sprint: só faz sentido comparar com um projeto escolhido, não com a soma de todos.
  const mostrarCapacidade = capacidade > 0 && !!activeProjectId;
  const acimaCapacidade = mostrarCapacidade && pontosPlanejados > capacidade;

  const [draggedId, setDraggedId] = useState<string | number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<Column | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [selectedTaskId, setSelectedTaskId] = useState<string | number | null>(null);

  // A tarefa precisa pertencer a um projeto: em "Todos os projetos", avisa antes de abrir o formulário.
  const abrirNovaTarefa = () => {
    if (!activeProjectId) {
      toast.info('Escolha um projeto no filtro para adicionar uma tarefa.');
      return;
    }
    setIsModalOpen(true);
  };

  const nomeDoProjeto = useMemo(() => new Map(projects.map(p => [String(p.id), p.name])), [projects]);

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
          {mostrarCapacidade && (
            <div
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${acimaCapacidade ? 'bg-red-500/10 border-red-500/30' : 'bg-emerald-500/10 border-emerald-500/20'}`}
              title={acimaCapacidade ? 'O planejado ultrapassa a capacidade do sprint' : 'Dentro da capacidade do sprint'}
            >
              <span className={`text-[10px] font-black uppercase tracking-widest ${acimaCapacidade ? 'text-red-400' : 'text-emerald-400'}`}>
                Capacidade {pontosPlanejados}/{capacidade} pts
              </span>
            </div>
          )}
          <Button
            onClick={abrirNovaTarefa}
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
            <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por título, descrição, erro ou tag..." />
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
        <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin">
          {COLUMNS.map(col => {
            const colTasks = tasksFiltered.filter(t => t.column === col.id);
            const colPoints = colTasks.reduce((s, t) => s + t.points, 0);
            const pct = totalSprintPoints > 0 ? Math.round((colPoints / totalSprintPoints) * 100) : 0;

            return (
              <div
                key={col.id}
                style={{ borderTopColor: dragOverCol === col.id ? undefined : col.hex }}
                className={`shrink-0 w-[84vw] max-w-[320px] sm:w-[300px] flex flex-col rounded-3xl border-2 border-t-4 p-3 transition-all duration-300 ${
                  dragOverCol === col.id ? 'border-[var(--color-primary-blue)]/60 bg-[var(--color-primary-blue)]/10' : 'border-[var(--color-border-default)] bg-[var(--color-surface)]/40 hover:bg-[var(--color-surface-elevated)]/60'
                }`}
                onDragOver={e => { e.preventDefault(); setDragOverCol(col.id); }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={() => handleDrop(col.id)}
              >
                <div className="mb-3 shrink-0 pb-2.5 border-b border-[var(--color-border-default)]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col.hex }} />
                      <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider truncate">{col.label}</h3>
                    </div>
                    <span className="text-[10px] font-bold text-[var(--color-text-primary)] bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] px-2 py-0.5 rounded-full shrink-0">{colTasks.length}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <span className="text-[10px] font-mono font-bold text-[var(--color-text-muted)]">{colPoints} pts</span>
                    <span className="text-[10px] font-bold tabular-nums" style={{ color: col.hex }} title={`${pct}% dos pontos do sprint`}>{pct}%</span>
                  </div>
                  <div className="h-1 mt-1.5 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: col.hex }} /></div>
                </div>

                <div className="flex-1 space-y-2 min-h-[120px] pb-3">
                  {colTasks.map(task => {
                    const semResp = !task.assignee || task.assignee === '?' || task.assignee === '-';
                    const tipo = TIPOS_SPRINT.find(x => x.id === task.type);
                    return (
                      <div
                        key={String(task.id)}
                        draggable
                        onDragStart={() => setDraggedId(task.id)}
                        onDragEnd={() => { setDraggedId(null); setDragOverCol(null); }}
                        onClick={() => setSelectedTaskId(task.id)}
                        className={`rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-3 space-y-2.5 cursor-pointer active:cursor-grabbing transition-all hover:border-[var(--color-primary-blue)]/50 hover:shadow-md select-none ${draggedId === task.id ? 'opacity-40 scale-95' : ''}`}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter') setSelectedTaskId(task.id); }}
                      >
                        {(() => {
                          const capa = task.attachments.find(ehImagem);
                          const url = capa && linkDoAnexo(capa);
                          return url ? <img src={url} alt="" loading="lazy" draggable={false} className="w-full h-28 object-cover rounded-xl border border-[var(--color-border-subtle)]" /> : null;
                        })()}
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-bold text-[var(--color-text-primary)] leading-snug break-words line-clamp-3">{task.title}</p>
                          <span className={`shrink-0 text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${COR_PRIORIDADE_SPRINT[task.priority] ?? COR_PRIORIDADE_SPRINT.baixa}`}>{task.priority}</span>
                        </div>
                        {(task.description || task.errorDetail || task.source?.mensagem) && (
                          <p className="text-[11px] leading-snug text-[var(--color-text-muted)] line-clamp-3 break-words">{task.description || task.errorDetail || task.source?.mensagem}</p>
                        )}
                        {(task.source?.solicitante || task.attachments.length > 0 || task.checklist.length > 0 || (task.tags || []).includes('agente-secreto')) && (
                          <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-[var(--color-text-faint)]">
                            {(task.source?.origem === 'agente-secreto' || (task.tags || []).includes('agente-secreto')) && <span className="inline-flex items-center gap-1 text-[var(--color-primary-blue)]" title="Pedido lido pelo Agente Secreto"><Bot className="w-3 h-3" /> Agente</span>}
                            {task.source?.solicitante && <span className="truncate max-w-[130px]" title={`Pedido por ${task.source.solicitante}`}>{task.source.solicitante}</span>}
                            {task.attachments.length > 0 && <span className="inline-flex items-center gap-1" title="Anexos"><Paperclip className="w-3 h-3" />{task.attachments.length}</span>}
                            {task.checklist.length > 0 && <span className="inline-flex items-center gap-1" title="Passos concluídos"><CheckSquare className="w-3 h-3" />{task.checklist.filter(p => p.feito).length}/{task.checklist.length}</span>}
                          </div>
                        )}
                        {!activeProjectId && task.projectId && nomeDoProjeto.has(String(task.projectId)) && (
                          <span className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-text-muted)] min-w-0">
                            <FolderCode className="w-3 h-3 shrink-0" /> <span className="truncate">{nomeDoProjeto.get(String(task.projectId))}</span>
                          </span>
                        )}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]">{tipo ? `${tipo.icon} ${tipo.label}` : task.type}</span>
                          {(task.tags || []).slice(0, 3).map(tag => <span key={tag} className="text-[10px] font-semibold text-[var(--color-text-faint)]">#{tag}</span>)}
                          {(task.tags || []).length > 3 && <span className="text-[10px] text-[var(--color-text-faint)]">+{task.tags.length - 3}</span>}
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--color-border-subtle)] text-[10px] font-semibold">
                          <span className="flex items-center gap-1.5 min-w-0" title={semResp ? 'Sem responsável' : `Responsável: ${task.assignee}`}>
                            <span className={`w-5 h-5 rounded-full grid place-items-center text-[8px] font-black shrink-0 ${semResp ? 'bg-[var(--color-surface-sunken)] text-[var(--color-text-faint)]' : 'bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)]'}`}>{iniciaisSprint(semResp ? '' : task.assignee)}</span>
                            <span className="truncate text-[var(--color-text-muted)]">{semResp ? 'Sem responsável' : task.assignee.split(' ')[0]}</span>
                          </span>
                          <span className="font-black text-[var(--color-primary-blue)] shrink-0">{task.points} pts</span>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    onClick={abrirNovaTarefa}
                    className="w-full py-2 border border-dashed border-[var(--color-border-default)] rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] transition-all flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer bg-transparent"
                  >
                    <Plus className="w-3.5 h-3.5" /> Adicionar
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
        comAnexos={detalhesDisponiveis}
      />

      <TarefaSprintPainel
        task={selectedTask}
        colunas={COLUMNS.map(c => ({ id: c.id, label: c.label, hex: c.hex }))}
        projetos={projects}
        onClose={() => setSelectedTaskId(null)}
        onMover={moveTask}
        onSalvar={updateTask}
        onAnexar={addAttachments}
        onRemoverAnexo={removeAttachment}
        detalhesDisponiveis={detalhesDisponiveis}
      />
    </PageContainer>
  );
}

