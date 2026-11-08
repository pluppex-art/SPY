import { X, ImagePlus } from "lucide-react";
import { Button } from "../../../../components/ui/button";
import { toast } from "sonner";
import { useDepartamentoOptions } from "../../../../hooks/useDepartamentoOptions";

const PRESET_COLORS = ["#2563EB", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899", "#06B6D4", "#64748B"];

interface NewSquadModalProps {
  colaboradores: any[];
  newSquadName: string; setNewSquadName: (v: string) => void;
  newSquadDepartamento: string; setNewSquadDepartamento: (v: string) => void;
  newSquadFoco: string; setNewSquadFoco: (v: string) => void;
  newSquadCor: string; setNewSquadCor: (v: string) => void;
  newSquadLogo: string; setNewSquadLogo: (v: string) => void;
  newSquadLeader: string; setNewSquadLeader: (v: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onClose: () => void;
}

const inputClass =
  "w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all";
const labelClass = "text-xs font-bold text-[var(--color-text-muted)] mb-1 block";

export function NewSquadModal({
  colaboradores, newSquadName, setNewSquadName,
  newSquadDepartamento, setNewSquadDepartamento,
  newSquadFoco, setNewSquadFoco,
  newSquadCor, setNewSquadCor,
  newSquadLogo, setNewSquadLogo,
  newSquadLeader, setNewSquadLeader,
  onSubmit, onClose,
}: NewSquadModalProps) {
  const departamentoOptions = useDepartamentoOptions();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose}>
      <div className="w-full max-w-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-2xl max-h-[90dvh] overflow-y-auto shadow-2xl animate-in fade-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
        <div
          className="px-6 py-4 border-b border-[var(--color-border-subtle)] flex items-center justify-between bg-[var(--color-surface-sunken)]"
          style={{ borderLeft: `4px solid ${newSquadCor}` }}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg" style={{ backgroundColor: `${newSquadCor}20`, border: `1px solid ${newSquadCor}40` }}>
              🎯
            </div>
            <div>
              <div className="text-sm font-bold text-[var(--color-text-primary)]">Novo Squad</div>
              <div className="text-[10px] text-[var(--color-text-muted)]">Crie um time para qualquer área da empresa</div>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="w-8 h-8 rounded-full bg-[var(--color-surface)] border border-[var(--color-border-default)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nome do Squad *</label>
              <input value={newSquadName} onChange={e => setNewSquadName(e.target.value)} placeholder="Ex: Squad Growth, Squad Tech..." className={inputClass} required />
            </div>
            <div>
              <label className={labelClass}>Departamento</label>
              <select value={newSquadDepartamento} onChange={e => setNewSquadDepartamento(e.target.value)} className={inputClass}>
                <option value="">Selecione...</option>
                {departamentoOptions.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>Cor de Identificação</label>
            <div className="flex items-center gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button key={c} type="button" onClick={() => setNewSquadCor(c)} className="w-7 h-7 rounded-lg transition-all cursor-pointer"
                  style={{ backgroundColor: c, outline: newSquadCor === c ? "2px solid var(--color-text-primary)" : "none", outlineOffset: "2px", transform: newSquadCor === c ? "scale(1.1)" : "scale(1)" }}
                />
              ))}
              <label className="w-7 h-7 rounded-lg border border-dashed border-[var(--color-border-default)] flex items-center justify-center cursor-pointer hover:border-[var(--color-primary-blue)] transition-all overflow-hidden" title="Cor personalizada">
                <input type="color" value={newSquadCor} onChange={e => setNewSquadCor(e.target.value)} className="opacity-0 absolute w-0 h-0" />
                <span className="text-[var(--color-text-muted)] text-xs font-bold">+</span>
              </label>
            </div>
          </div>

          <div>
            <label className={labelClass}>Gestor / Líder do Squad</label>
            <select value={newSquadLeader} onChange={e => setNewSquadLeader(e.target.value)} className={inputClass}>
              <option value="">Sem gestor definido</option>
              {colaboradores.map((c: any) => <option key={c.id} value={c.nome}>{c.nome}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>Emblema / Logo <span className="text-[var(--color-text-faint)] font-normal">(opcional)</span></label>
            <label className="flex items-center gap-3 p-3 border border-dashed border-[var(--color-border-default)] rounded-[var(--radius-control)] cursor-pointer hover:border-[var(--color-primary-blue)] transition-all group bg-[var(--color-surface-sunken)]">
              {newSquadLogo ? (
                <img loading="lazy" decoding="async" src={newSquadLogo} className="w-10 h-10 rounded-lg object-cover" alt="logo" />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border-default)] flex items-center justify-center">
                  <ImagePlus className="w-4 h-4 text-[var(--color-text-muted)]" />
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-[var(--color-primary-blue)]">{newSquadLogo ? "Trocar imagem" : "Carregar emblema"}</p>
                <p className="text-[10px] text-[var(--color-text-faint)]">JPG ou PNG até 2MB</p>
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

          <div>
            <label className={labelClass}>Descrição & Foco do Time</label>
            <textarea value={newSquadFoco} onChange={e => setNewSquadFoco(e.target.value)} placeholder="Descreva os objetivos deste squad..." rows={2}
              className={`${inputClass} resize-none`}
            />
          </div>

          <div className="pt-2 flex justify-end gap-2 border-t border-[var(--color-border-subtle)]">
            <Button type="button" onClick={onClose} variant="outline" className="h-9 px-4 text-xs font-bold border-[var(--color-border-default)]">
              Cancelar
            </Button>
            <Button type="submit" className="h-9 px-5 text-xs font-bold shadow-xs text-white" style={{ backgroundColor: newSquadCor }}>
              Criar Squad
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
