import { X, ImagePlus } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { toast } from "sonner";
import { useDepartamentoOptions } from "../../../../hooks/useDepartamentoOptions";

interface NovoSquadFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  handleCreateSquad: (e: React.FormEvent) => void;
  newSquadName: string;
  setNewSquadName: (v: string) => void;
  newSquadDepartamento: string;
  setNewSquadDepartamento: (v: string) => void;
  newSquadFoco: string;
  setNewSquadFoco: (v: string) => void;
  newSquadCor: string;
  setNewSquadCor: (v: string) => void;
  newSquadLogo: string;
  setNewSquadLogo: (v: string) => void;
  newSquadLeader: string;
  setNewSquadLeader: (v: string) => void;
  colaboradores: any[];
}

const PRESET_COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#64748b"];

export function NovoSquadFormModal({
  isOpen, onClose, handleCreateSquad,
  newSquadName, setNewSquadName, newSquadDepartamento, setNewSquadDepartamento,
  newSquadFoco, setNewSquadFoco, newSquadCor, setNewSquadCor,
  newSquadLogo, setNewSquadLogo, newSquadLeader, setNewSquadLeader,
  colaboradores,
}: NovoSquadFormModalProps) {
  const departamentoOptions = useDepartamentoOptions();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose}>
      <div className="w-full max-w-xl bg-[var(--color-surface)] border border-white/10 rounded-[2.5rem] max-h-[90dvh] overflow-y-auto shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200" onClick={e => e.stopPropagation()}>

        <div
          className="px-8 pt-8 pb-5 border-b border-white/5 flex items-center justify-between"
          style={{ borderLeft: `4px solid ${newSquadCor}` }}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl" style={{ backgroundColor: `${newSquadCor}20`, border: `1px solid ${newSquadCor}40` }}>
              🎯
            </div>
            <div>
              <div className="text-base font-black text-white uppercase tracking-tight">Novo Squad</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">Crie um time para qualquer área da empresa</div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleCreateSquad} className="px-8 py-6 space-y-5">
          {/* Nome + Departamento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nome do Squad</label>
              <Input value={newSquadName} onChange={e => setNewSquadName(e.target.value)} placeholder="Ex: Squad Design, Squad Devs..." className="bg-white/5 border-white/5 h-11 text-sm rounded-xl text-white placeholder:text-slate-600" required />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Departamento</label>
              <select value={newSquadDepartamento} onChange={e => setNewSquadDepartamento(e.target.value)} className="w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-4 h-11 text-sm text-white focus:border-blue-500 focus:outline-none transition-all">
                <option value="">Selecione...</option>
                {departamentoOptions.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Cor de identificação */}
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Cor de Identificação</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setNewSquadCor(c)} className="w-8 h-8 rounded-xl transition-all" style={{ backgroundColor: c, outline: newSquadCor === c ? "3px solid white" : "3px solid transparent", outlineOffset: "2px", transform: newSquadCor === c ? "scale(1.15)" : "scale(1)" }} />
              ))}
              <label className="w-8 h-8 rounded-xl border-2 border-dashed border-white/20 flex items-center justify-center cursor-pointer hover:border-white/40 transition-all overflow-hidden" title="Cor personalizada">
                <input type="color" value={newSquadCor} onChange={e => setNewSquadCor(e.target.value)} className="opacity-0 absolute w-0 h-0" />
                <span className="text-slate-400 text-[10px] font-black">+</span>
              </label>
            </div>
          </div>

          {/* Gestor do Squad */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Gestor do Squad</label>
            <select value={newSquadLeader} onChange={e => setNewSquadLeader(e.target.value)} className="w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-4 h-11 text-sm text-white focus:border-blue-500 focus:outline-none transition-all">
              <option value="">Sem gestor definido</option>
              {colaboradores.map((c: any) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
            </select>
          </div>

          {/* Emblema / Logo */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Emblema / Logo <span className="text-slate-600 normal-case font-normal">(opcional)</span></label>
            <label className="flex items-center gap-4 p-4 border border-dashed border-white/10 rounded-xl cursor-pointer hover:border-blue-500/40 transition-all group">
              {newSquadLogo
                ? <img loading="lazy" decoding="async" src={newSquadLogo} className="w-12 h-12 rounded-xl object-cover" alt="logo" />
                : <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center group-hover:bg-white/10 transition-all"><ImagePlus className="w-5 h-5 text-slate-500" /></div>
              }
              <div>
                <p className="text-sm font-bold text-blue-400 group-hover:text-blue-300 transition-colors">{newSquadLogo ? "Trocar imagem" : "Carregar imagem"}</p>
                <p className="text-[11px] text-slate-500">JPG, PNG ou GIF até 2MB</p>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) { toast.error("Imagem deve ter no máximo 2MB"); return; }
                const reader = new FileReader();
                reader.onload = ev => setNewSquadLogo(ev.target?.result as string);
                reader.readAsDataURL(file);
              }} />
            </label>
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Descrição & Objetivo</label>
            <textarea value={newSquadFoco} onChange={e => setNewSquadFoco(e.target.value)} placeholder="Descreva o objetivo, foco ou observações deste squad..." rows={3} className="w-full bg-white/5 border border-white/5 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:outline-none text-white placeholder:text-slate-600 resize-none leading-relaxed transition-all" />
          </div>

          <div className="pt-2 flex gap-3">
            <Button type="button" onClick={onClose} variant="outline" className="flex-1 bg-transparent border-white/10 text-slate-400 hover:text-white hover:bg-white/5 h-11 font-black text-[9px] uppercase tracking-widest rounded-xl">
              Cancelar
            </Button>
            <Button type="submit" className="flex-1 h-11 font-black text-[9px] uppercase tracking-widest rounded-xl shadow-lg" style={{ backgroundColor: newSquadCor, boxShadow: `0 8px 24px ${newSquadCor}40` }}>
              Criar Squad
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
