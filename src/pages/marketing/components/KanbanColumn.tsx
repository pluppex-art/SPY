import React from 'react';
import { Card } from '../../../components/ui/card';
import { Droppable, Draggable } from '@hello-pangea/dnd';
import { DollarSign, MoreHorizontal, Calendar, Image, MessageSquare, GripVertical } from 'lucide-react';
import { useLocalization } from '../../../contexts/LocalizationContext';

interface KanbanColumnProps {
  col: any;
  tasks: any[];
  columnSearches: { [key: string]: string };
  setColumnSearches: React.Dispatch<React.SetStateAction<{ [key: string]: string }>>;
  openTask: (task: any) => void;
}

export function KanbanColumn({
  col,
  tasks,
  columnSearches,
  setColumnSearches,
  openTask
}: KanbanColumnProps) {
  const { formatCurrency } = useLocalization();
  const searchQuery = columnSearches[col.id] || "";
  const colTasksAll = tasks.filter(t => t.colId === col.id);
  const colTasks = colTasksAll.filter(t => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.desc.toLowerCase().includes(q) ||
      t.platform.toLowerCase().includes(q) ||
      (t.priority && t.priority.toLowerCase().includes(q))
    );
  });

  return (
    <Droppable droppableId={col.id}>
      {(provided, snapshot) => (
        <div 
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`min-w-[320px] w-[320px] bg-[var(--color-surface-elevated)] rounded-2xl border transition-all duration-200 flex flex-col max-h-full shrink-0 ${
            snapshot.isDraggingOver 
              ? "border-blue-500/50 bg-[var(--color-surface-elevated)] shadow-lg shadow-blue-500/5" 
              : "border-white/5"
          }`}
        >
           <div className="p-4 border-b border-white/5 flex flex-col gap-3 sticky top-0 bg-[var(--color-surface-elevated)] z-10 rounded-t-2xl kanban-column-header text-left">
             <div className="flex items-center justify-between">
               <div className="flex items-center gap-3 w-full">
                  <div className="flex flex-col gap-1.5 w-full">
                    <div className="flex items-center justify-between gap-4 w-full">
                      <div className="flex items-center gap-2">
                         <div className={`w-1.5 h-1.5 rounded-full ${col.color}`} />
                         <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">{col.title}</h3>
                      </div>
                      
                      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 border border-white/5 text-[9px] font-black text-blue-400/80 shadow-sm shrink-0">
                        <DollarSign className="w-2.5 h-2.5" />
                        {formatCurrency(colTasksAll.reduce((sum, t) => sum + (t.value || 0), 0))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pl-3.5 w-full">
                       <div className="flex items-center gap-1.5">
                         <span className="text-[8px] font-bold text-slate-600 uppercase tracking-tighter">
                           Ticket Médio: 
                           <strong className="text-slate-500 ml-1">
                             {formatCurrency(colTasksAll.length > 0 ? colTasksAll.reduce((sum, t) => sum + (t.value || 0), 0) / colTasksAll.length : 0)}
                           </strong>
                         </span>
                       </div>
                       <span className="text-[9px] font-black text-slate-700 bg-white/[0.02] px-1.5 py-0.5 rounded h-fit">{colTasksAll.length} ops</span>
                    </div>
                  </div>
               </div>
               <button className="p-1 hover:bg-white/10 rounded-lg text-slate-500 transition-colors border-none bg-transparent cursor-pointer">
                  <MoreHorizontal className="w-4 h-4" />
               </button>
             </div>
             
             <div className="relative">
                <input
                  type="text"
                  value={columnSearches[col.id] || ""}
                  onChange={(e) => setColumnSearches(prev => ({ ...prev, [col.id]: e.target.value }))}
                  placeholder="Filtrar por pauta, canal, prioridade..."
                  className="w-full bg-[var(--color-surface-elevated)] border border-white/5 rounded-lg pl-3 pr-8 py-1.5 text-xs text-white placeholder-slate-500 focus:border-blue-500/50 outline-none transition-all"
                />
                {columnSearches[col.id] ? (
                  <button 
                    onClick={() => setColumnSearches(prev => ({ ...prev, [col.id]: "" }))}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white border-none bg-transparent cursor-pointer"
                  >
                    <span className="text-xs">✕</span>
                  </button>
                ) : (
                  <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                )}
             </div>
           </div>
           
           <div className="p-3 flex-1 overflow-y-auto flex flex-col gap-3 min-h-[150px]">
             {colTasks.length === 0 ? (
               <div className="flex-1 flex items-center justify-center border-2 border-dashed border-white/5 rounded-xl min-h-[120px]">
                  <p className="text-[10px] uppercase tracking-widest text-slate-600 font-bold">Sem pautas</p>
               </div>
             ) : (
               colTasks.map((task, index) => (
                 <div key={task.id}>
                   <Draggable draggableId={task.id} index={index}>
                     {(dragProvided, dragSnapshot) => (
                       <div
                         ref={dragProvided.innerRef}
                         {...dragProvided.draggableProps}
                         {...dragProvided.dragHandleProps}
                         className="focus:outline-none text-left"
                         style={dragProvided.draggableProps.style}
                       >
                         <Card 
                           onClick={() => openTask(task)}
                           className={`p-4 bg-[var(--color-surface-elevated)] transition-all cursor-grab active:cursor-grabbing group shadow-sm hover:shadow-xl hover:shadow-blue-900/20 rounded-2xl border ${
                             dragSnapshot.isDragging 
                               ? "ring-2 ring-blue-500 bg-[var(--color-surface-elevated)] scale-[1.02] shadow-2xl border-transparent" 
                               : "border-white/5 hover:border-blue-500/30"
                           }`}
                         >
                           <div className="flex items-start justify-between mb-3">
                             <div className="flex flex-wrap gap-1.5 items-center">
                               {task.platform === 'Instagram' && <span className="text-[10px] px-2 py-0.5 rounded uppercase font-black bg-pink-500/10 text-pink-400 border border-pink-500/20">{task.platform}</span>}
                               {task.platform === 'TikTok' && <span className="text-[10px] px-2 py-0.5 rounded uppercase font-black bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">{task.platform}</span>}
                               {task.platform === 'Blog' && <span className="text-[10px] px-2 py-0.5 rounded uppercase font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{task.platform}</span>}
                               {task.platform === 'LinkedIn' && <span className="text-[10px] px-2 py-0.5 rounded uppercase font-black bg-blue-500/10 text-blue-400 border border-blue-500/20">{task.platform}</span>}
                               {task.platform === 'YouTube' && <span className="text-[10px] px-2 py-0.5 rounded uppercase font-black bg-rose-500/10 text-rose-400 border border-rose-500/20">{task.platform}</span>}
                               
                               {task.priority === 'Alta' && (
                                 <span className="text-[10px] px-2 py-0.5 rounded uppercase font-black bg-red-500/10 text-red-400 border border-red-500/20 shadow-[0_0_8px_rgba(239,68,68,0.1)]">
                                   Alta
                                 </span>
                               )}
                               {task.priority === 'Média' && (
                                 <span className="text-[10px] px-2 py-0.5 rounded uppercase font-black bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-[0_0_8px_rgba(245,158,11,0.1)]">
                                   Média
                                 </span>
                               )}
                               {task.priority === 'Baixa' && (
                                 <span className="text-[10px] px-2 py-0.5 rounded uppercase font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_8px_rgba(16,185,129,0.1)]">
                                   Baixa
                                 </span>
                               )}
                             </div>
                             <GripVertical className="w-4 h-4 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                           </div>
                           
                           <h4 className="text-sm font-bold text-white mb-1 line-clamp-2">{task.title}</h4>
                           <div className="flex items-center gap-2 mb-2">
                             <span className="text-[10px] font-bold text-blue-400">
                               {formatCurrency(task.value || 0)}
                             </span>
                           </div>
                           <p className="text-xs text-slate-400 mb-4 line-clamp-2">{task.desc}</p>
                           
                           <div className="flex items-center justify-between pt-3 border-t border-white/5">
                             <div className="flex items-center gap-3">
                               <div className="flex items-center gap-1.5 text-slate-400 text-[10px] font-bold">
                                  <Calendar className="w-3 h-3" /> {task.date}
                               </div>
                             </div>
                             <div className="flex items-center text-slate-500 gap-2">
                                <Image className="w-3.5 h-3.5" />
                                <MessageSquare className="w-3.5 h-3.5" />
                             </div>
                           </div>
                         </Card>
                       </div>
                     )}
                   </Draggable>
                 </div>
               ))
             )}
             {snapshot.isDraggingOver && <div className="h-10 w-full" />}
             {provided.placeholder}
           </div>
        </div>
      )}
    </Droppable>
  );
}
