import { X, ImagePlus } from "lucide-react";
import { Input } from "../../../../components/ui/input";
import { Squad } from "../../../../types";
import { useDepartamentoOptions } from "../../../../hooks/useDepartamentoOptions";

interface SquadEditModalProps {
  editingSquad: Squad | null;
  editNome: string;
  setEditNome: (v: string) => void;
  editDepartamento: string;
  setEditDepartamento: (v: string) => void;
  editFoco: string;
  setEditFoco: (v: string) => void;
  editCor: string;
  setEditCor: (v: string) => void;
  editLeader: string;
  setEditLeader: (v: string) => void;
  editLogo: string;
  setEditLogo: (v: string) => void;
  colaboradores: any[];
  onClose: () => void;
  onSave: () => void;
  onLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const PRESET_COLORS = ["#6366f1","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#64748b"];

export function SquadEditModal({
  editingSquad, editNome, setEditNome, editDepartamento, setEditDepartamento,
  editFoco, setEditFoco, editCor, setEditCor, editLeader, setEditLeader,
  editLogo, setEditLogo, colaboradores, onClose, onSave, onLogoUpload,
}: SquadEditModalProps) {
  const departamentoOptions = useDepartamentoOptions();
  if (!editingSquad) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose} />
      <div
        className="relative w-full max-w-md bg-[var(--color-surface)] border border-white/10 rounded-3xl p-7 max-h-[90dvh] overflow-y-auto shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200"
        style={{ borderLeft: `4px solid ${editCor}` }}
      >
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-base font-black text-white uppercase tracking-tight">Editar Squad</h3>
            <p className="text-[9px] text-slate-500 uppercase tracking-widest mt-0.5">{editingSquad.nome}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Nome do Squad</label>
            <Input value={editNome} onChange={e => setEditNome(e.target.value)} className="bg-white/5 border-white/10 rounded-xl text-sm text-white" placeholder="Ex: Code Titans" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Departamento</label>
              <select value={editDepartamento} onChange={e => setEditDepartamento(e.target.value)} className="w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none transition-all">
                <option value="">Selecione...</option>
                {departamentoOptions.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gestor</label>
              <select value={editLeader} onChange={e => setEditLeader(e.target.value)} className="w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none transition-all">
                <option value="">Sem gestor</option>
                {colaboradores.map((c: any) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Foco Comercial</label>
            <Input value={editFoco} onChange={e => setEditFoco(e.target.value)} className="bg-white/5 border-white/10 rounded-xl text-sm text-white" placeholder="Ex: Prospecção outbound B2B" />
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Cor de Identificação</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setEditCor(c)} className="w-7 h-7 rounded-full transition-all" style={{ backgroundColor: c, outline: editCor === c ? "2px solid white" : "none", outlineOffset: "2px", transform: editCor === c ? "scale(1.2)" : "scale(1)" }} />
              ))}
              <input type="color" value={editCor} onChange={e => setEditCor(e.target.value)} className="w-7 h-7 rounded-full cursor-pointer border-0 bg-transparent" title="Cor personalizada" />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Emblema / Logo</label>
            <label className="flex items-center gap-3 p-3 border border-dashed border-white/20 rounded-xl cursor-pointer hover:border-white/40 transition-colors group">
              {editLogo
                ? <img loading="lazy" decoding="async" src={editLogo} className="w-10 h-10 rounded-lg object-cover" alt="logo" />
                : <div className="w-10 h-10 rounded-lg bg-white/5 flex items-center justify-center"><ImagePlus className="w-5 h-5 text-slate-500 group-hover:text-slate-300 transition-colors" /></div>
              }
              <div>
                <p className="text-xs font-bold text-slate-300">{editLogo ? "Trocar imagem" : "Carregar imagem"}</p>
                <p className="text-[9px] text-slate-500">PNG, JPG — máx. 2MB</p>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={onLogoUpload} />
            </label>
            {editLogo && (
              <button type="button" onClick={() => setEditLogo("")} className="text-[9px] text-rose-400 hover:text-rose-300 uppercase tracking-widest font-black">
                Remover logo
              </button>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-3 border border-white/10 rounded-xl text-sm font-black text-slate-400 hover:text-white hover:border-white/20 transition-all uppercase tracking-wider">
            Cancelar
          </button>
          <button onClick={onSave} className="flex-1 py-3 rounded-xl text-sm font-black text-white transition-all uppercase tracking-wider" style={{ backgroundColor: editCor, boxShadow: `0 4px 20px ${editCor}50` }}>
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  );
}
