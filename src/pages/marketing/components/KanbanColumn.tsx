import React from 'react';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { Calendar, CheckSquare, Paperclip, Search, X, Shapes } from 'lucide-react';
import { useLocalization } from '../../../contexts/LocalizationContext';
import { cn } from '../../../lib/utils';
import { iniciais, COR_PRIORIDADE } from './TrafegoColumn';
import { SeloAprovacao } from './Aprovacao';

interface KanbanColumnProps {
  col: any;
  tasks: any[];
  columnSearches: { [key: string]: string };
  setColumnSearches: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  openTask: (task: any) => void;
  /** Nome do cliente da pauta (vazio quando não há ou quando a tela já está filtrada por um). */
  nomeCliente: (task: any) => string;
}

/** Coluna do quadro de Conteúdo (mesmo desenho da Central de Vendas): faixa na cor da etapa, valor da etapa, filtro e cartões das pautas. */
export function KanbanColumn({ col, tasks, columnSearches, setColumnSearches, openTask, nomeCliente }: KanbanColumnProps) {
  const { formatCurrency } = useLocalization();
  const busca = columnSearches[col.id] || '';
  const daColuna = tasks.filter((t) => t.colId === col.id);
  const visiveis = daColuna.filter((t) => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return [t.title, t.desc, t.platform, t.priority, t.responsavel, t.formato].some((v) => String(v || '').toLowerCase().includes(q));
  });
  const total = daColuna.reduce((s, t) => s + (t.value || 0), 0);
  const geral = tasks.reduce((s, t) => s + (t.value || 0), 0);
  const pct = geral > 0 ? Math.round((total / geral) * 100) : 0;
  const hex = col.hex || '#64748b';

  return (
    <Droppable droppableId={col.id}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          style={{ borderTopColor: snapshot.isDraggingOver ? undefined : hex }}
          className={cn(
            'shrink-0 w-[84vw] max-w-[320px] sm:w-[300px] flex flex-col max-h-full rounded-3xl border-2 border-t-4 bg-[var(--color-surface)]/40 p-3 transition-all duration-300',
            snapshot.isDraggingOver ? 'border-[var(--color-primary-blue)]/60 bg-[var(--color-primary-blue)]/10' : 'border-[var(--color-border-default)] hover:bg-[var(--color-surface-elevated)]/60',
          )}
        >
          <div className="mb-3 shrink-0 pb-2.5 border-b border-[var(--color-border-default)] space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hex }} />
                <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider truncate">{col.title}</h3>
              </div>
              <span className="text-[10px] font-bold text-[var(--color-text-primary)] bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] px-2 py-0.5 rounded-full shrink-0">{daColuna.length}</span>
            </div>
            {geral > 0 && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono font-bold text-[var(--color-text-muted)] truncate">{formatCurrency(total)}</span>
                  <span className="text-[10px] font-bold tabular-nums shrink-0" style={{ color: hex }}>{pct}%</span>
                </div>
                <div className="h-1 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: hex }} /></div>
              </>
            )}
            <div className="relative">
              <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] pointer-events-none" />
              <input
                type="text"
                value={busca}
                onChange={(e) => setColumnSearches((prev) => ({ ...prev, [col.id]: e.target.value }))}
                placeholder="Filtrar nesta etapa…"
                aria-label={`Filtrar pautas em ${col.title}`}
                className="w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-lg pl-7 pr-7 py-1.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:border-[var(--color-primary-blue)] outline-none transition-all"
              />
              {busca && (
                <button type="button" onClick={() => setColumnSearches((prev) => ({ ...prev, [col.id]: '' }))} aria-label="Limpar filtro" className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] border-none bg-transparent cursor-pointer p-0">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 min-h-[120px] pb-3 scrollbar-none">
            {visiveis.length === 0 && (
              <div className="grid place-items-center border-2 border-dashed border-[var(--color-border-subtle)] rounded-xl min-h-[96px]">
                <p className="text-[10px] uppercase tracking-widest text-[var(--color-text-faint)] font-bold">{busca ? 'Nada encontrado' : 'Sem pautas'}</p>
              </div>
            )}
            {visiveis.map((task, index) => {
              const feitos = Array.isArray(task.checklist) ? task.checklist.filter(Boolean).length : 0;
              const totalCheck = Array.isArray(task.checklist) ? task.checklist.length : 0;
              const anexos = Array.isArray(task.anexos) ? task.anexos.length : 0;
              return (
                <Draggable key={task.id} draggableId={task.id} index={index}>
                  {(drag, snap) => (
                    <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps} style={drag.draggableProps.style} className="focus:outline-none text-left" onClick={() => openTask(task)}>
                      <div className={cn(
                        'rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-3 space-y-2.5 cursor-pointer transition-all hover:border-[var(--color-primary-blue)]/50 hover:shadow-md',
                        snap.isDragging && 'shadow-xl rotate-1 border-[var(--color-primary-blue)]/60',
                      )}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-bold text-[var(--color-text-primary)] leading-snug break-words line-clamp-2">{task.title}</p>
                          <span className={cn('text-[9px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0', COR_PRIORIDADE[task.priority])}>{task.priority}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {nomeCliente(task) && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border border-[var(--color-border-default)] text-[var(--color-text-primary)] truncate max-w-full">{nomeCliente(task)}</span>}
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]">{task.platform}</span>
                          <SeloAprovacao task={task} />
                          {task.formato && <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]"><Shapes className="w-3 h-3" />{task.formato}</span>}
                        </div>
                        {task.desc && <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-2">{task.desc}</p>}
                        {task.value > 0 && <div className="text-sm font-black font-mono text-[var(--color-primary-blue)] leading-tight">{formatCurrency(task.value)}</div>}
                        <div className="flex items-center justify-between gap-2 text-[10px] font-semibold">
                          <span className="flex items-center gap-1.5 min-w-0" title={task.responsavel ? `Responsável: ${task.responsavel}` : 'Sem responsável'}>
                            <span className={cn('w-5 h-5 rounded-full grid place-items-center text-[8px] font-black shrink-0', task.responsavel ? 'bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)]' : 'bg-[var(--color-surface-sunken)] text-[var(--color-text-faint)]')}>{iniciais(task.responsavel || '')}</span>
                            <span className="truncate text-[var(--color-text-muted)]">{task.responsavel ? String(task.responsavel).split(' ')[0] : 'Sem responsável'}</span>
                          </span>
                          <span className="flex items-center gap-2 text-[var(--color-text-faint)] shrink-0">
                            {totalCheck > 0 && <span className="flex items-center gap-1"><CheckSquare className="w-3 h-3" />{feitos}/{totalCheck}</span>}
                            {anexos > 0 && <span className="flex items-center gap-1"><Paperclip className="w-3 h-3" />{anexos}</span>}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] font-semibold text-[var(--color-text-faint)] pt-2 border-t border-[var(--color-border-subtle)]">
                          <Calendar className="w-3 h-3" /> {task.publishDateISO ? `Publica em ${task.date}` : 'Sem data de publicação'}
                        </div>
                      </div>
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
          </div>
        </div>
      )}
    </Droppable>
  );
}
