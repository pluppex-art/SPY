import { motion } from 'motion/react';
import { Button } from '../../../components/ui/button';

interface NewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  newTitle: string;
  setNewTitle: (v: string) => void;
  newValue: string;
  setNewValue: (v: string) => void;
  newPlatform: string;
  setNewPlatform: (v: string) => void;
  newDate: string;
  setNewDate: (v: string) => void;
  newPriority: string;
  setNewPriority: (v: string) => void;
  newDesc: string;
  setNewDesc: (v: string) => void;
  handleCreateTask: () => void;
}

export function NewTaskModal({
  isOpen,
  onClose,
  newTitle,
  setNewTitle,
  newValue,
  setNewValue,
  newPlatform,
  setNewPlatform,
  newDate,
  setNewDate,
  newPriority,
  setNewPriority,
  newDesc,
  setNewDesc,
  handleCreateTask,
}: NewTaskModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[var(--color-surface-elevated)] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90dvh] overflow-y-auto ring-1 ring-black/5 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200"
      >
         <div className="p-6 border-b border-white/10 flex justify-between items-center text-white text-left">
            <h3 className="text-lg font-black uppercase tracking-tighter">Criar Nova Pauta</h3>
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 border-none bg-transparent cursor-pointer">
              ✕
            </button>
         </div>
         <div className="p-6 space-y-4 text-left">
            <div className="space-y-1.5">
               <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Título da Ideia</label>
               <input 
                 type="text" 
                 value={newTitle}
                 onChange={(e) => setNewTitle(e.target.value)}
                 placeholder="Ex: Tutorial Dashboard Financeiro" 
                 className="w-full bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500 outline-none" 
               />
            </div>
            <div className="space-y-1.5">
               <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Investimento Necessário (R$)</label>
               <input
                 type="number"
                 value={newValue}
                 onChange={(e) => setNewValue(e.target.value)}
                 placeholder="0,00 — deixe em branco se não houver custo"
                 className="w-full bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl px-4 py-3 text-sm text-white focus:border-blue-500 outline-none"
               />
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Plataforma</label>
                  <select 
                    value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value)}
                    className="w-full bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl px-4 py-3 text-sm text-white outline-none"
                  >
                     <option value="Instagram">Instagram</option>
                     <option value="TikTok">TikTok</option>
                     <option value="LinkedIn">LinkedIn</option>
                     <option value="YouTube">YouTube</option>
                     <option value="Blog">Blog</option>
                  </select>
               </div>
               <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Data Limite</label>
                  <input 
                    type="date" 
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl px-4 py-3 text-sm text-[#94A3B8] outline-none" 
                  />
               </div>
            </div>
            <div className="space-y-1.5">
               <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Prioridade</label>
               <div className="grid grid-cols-3 gap-2">
                  {['Alta', 'Média', 'Baixa'].map((p) => {
                     const isSelected = newPriority === p;
                     const activeColors = p === 'Alta' 
                       ? 'bg-rose-500/10 border-rose-500 text-rose-400 font-bold' 
                       : p === 'Média' 
                       ? 'bg-amber-500/10 border-amber-500 text-amber-400 font-bold' 
                       : 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold';
                     return (
                        <button
                           key={p}
                           type="button"
                           onClick={() => setNewPriority(p)}
                           className={`py-2 px-3 rounded-xl border text-xs transition-all cursor-pointer ${
                              isSelected 
                                ? activeColors 
                                : 'bg-[var(--color-surface-elevated)] border-white/5 text-slate-400 hover:text-white'
                           }`}
                        >
                           {p}
                        </button>
                     );
                  })}
               </div>
            </div>
            <div className="space-y-1.5">
               <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Breve Briefing</label>
               <textarea 
                 rows={3} 
                 value={newDesc}
                 onChange={(e) => setNewDesc(e.target.value)}
                 placeholder="Descreva brevemente o objetivo desse conteúdo..." 
                 className="w-full bg-[var(--color-surface-elevated)] border border-white/5 rounded-xl px-4 py-3 text-sm text-white outline-none resize-none"
               ></textarea>
            </div>
         </div>
         <div className="p-6 bg-white/5 flex gap-3">
            <Button variant="ghost" onClick={onClose} className="flex-1 text-slate-400">Cancelar</Button>
            <Button onClick={handleCreateTask} className="flex-1 bg-blue-600 hover:bg-blue-700 font-bold">Criar Pauta</Button>
         </div>
      </motion.div>
    </div>
  );
}
