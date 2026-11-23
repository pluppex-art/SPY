import { useMemo } from 'react';
import { X } from 'lucide-react';
import { Modal } from '../../../components/ui/modal';
import { Button } from '../../../components/ui/button';
import type { SprintTask } from '../hooks/useDevSprints';

const TYPE_ICON: Record<string, string> = {
  feature: '✦',
  bug: '🐛',
  chore: '⚙',
  refactor: '♻',
};

const PRIORITY_BADGE: Record<string, string> = {
  crítica: 'bg-red-500/15 text-red-400 border-red-500/25',
  alta: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  média: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  baixa: 'bg-slate-500/15 text-slate-400 border-slate-500/25',
};

export function DetalharTarefaSprintModal({
  isOpen,
  onClose,
  task,
}: {
  isOpen: boolean;
  onClose: () => void;
  task: SprintTask | null;
}) {
  const title = useMemo(() => {
    if (!task) return 'Detalhes da Task';
    return task.title;
  }, [task]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-base font-black text-white truncate">Detalhes da Task</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Sprint / Dev & Tecnologia</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-slate-500 hover:text-white transition-colors shrink-0"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      }
      footer={
        <Button type="button" variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">
          Fechar
        </Button>
      }
    >
      {!task ? (
        <div className="text-slate-400 text-sm">Nenhuma task selecionada.</div>
      ) : (
        <div className="space-y-5">
          {/* Title + meta */}
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-slate-200 font-bold">Task</div>
                <div className="text-lg font-black text-white leading-snug mt-1 whitespace-pre-line">{title}</div>
              </div>
              <div className="shrink-0 flex flex-col items-end gap-2">
                <div
                  className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-lg border bg-white/[0.02] text-slate-300 border-white/10`}
                >
                  {TYPE_ICON[task.type] ?? '•'} {task.type}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span
                className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-lg border ${
                  PRIORITY_BADGE[task.priority] ?? 'bg-slate-500/15 text-slate-400 border-slate-500/25'
                }`}
              >
                {task.priority}
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-lg border bg-white/[0.02] text-slate-300 border-white/10">
                {task.points} pts
              </span>
              <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-lg border bg-white/[0.02] text-slate-300 border-white/10">
                {task.column}
              </span>
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tags</div>
            {task.tags?.length ? (
              <div className="flex flex-wrap gap-2">
                {task.tags.map(tag => (
                  <span key={tag} className="text-[9px] font-bold text-slate-500 bg-white/[0.03] px-2 py-1 rounded">
                    #{tag}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500">Sem tags</div>
            )}
          </div>

          {/* Assignee */}
          <div className="space-y-2">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Responsável</div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-sm font-black text-white border border-white/10">
                {(task.assignee || '?').split('.')[0]}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold text-white truncate">{task.assignee || '?'}</div>
                <div className="text-xs text-slate-500">Assignee do card (campo assignee)</div>
              </div>
            </div>
          </div>

          {/* Readable hint */}
          <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5">
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Como ler</div>
            <div className="text-sm text-slate-200 mt-2 leading-relaxed">
              O <span className="text-white font-bold">title</span> já vem da IA como um roteiro: objetivo + entrega + critério de qualidade.
              Use as tags e a prioridade para priorizar o trabalho.
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

