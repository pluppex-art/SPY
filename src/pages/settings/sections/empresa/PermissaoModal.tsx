import React, { useState } from "react";
import { ShieldCheck, Check } from "lucide-react";
import { ModulesCombobox, ALL_MODULES } from "./ModulesCombobox";

interface PermissaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (cargoId: string, modulos: string[]) => void;
  editing: any | null;
  cargos: any[];
}

const MODULE_LABELS: Record<string, string> = {
  crm: "CRM & Pipeline", financeiro: "Financeiro", engajamento: "Engajamento",
  marketing: "Marketing", educacao: "Educação", clinica: "Clínica",
  rh: "RH", bi: "BI", produtividade: "Tarefas", catalogo: "Catálogo", dev: "Dev",
};

const selectClass = "w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary-blue)] focus:outline-none transition-all";

export function PermissaoModal({ isOpen, onClose, onSave, editing, cargos }: PermissaoModalProps) {
  const [cargoId, setCargoId] = useState("");
  const [modulos, setModulos] = useState<string[]>([]);

  React.useEffect(() => {
    if (!isOpen) return;
    setCargoId(editing?.id ?? "");
    setModulos(editing?.modulos ?? []);
  }, [isOpen, editing]);

  if (!isOpen) return null;

  const disponíveis = editing ? cargos : cargos.filter((c) => !c.modulos || c.modulos.length === 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150" onClick={onClose}>
      <div className="w-full max-w-lg bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-[2rem] overflow-hidden shadow-2xl ring-1 ring-[var(--color-border-subtle)] animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-8 pt-8 pb-4 border-b border-[var(--color-border-subtle)]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-[var(--color-primary-blue)]" />
            </div>
            <div>
              <div className="text-base font-black text-[var(--color-text-primary)]">{editing ? "Editar Permissões" : "Nova Permissão"}</div>
              <div className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)]">Módulos de acesso por cargo</div>
            </div>
          </div>
        </div>

        <div className="px-8 py-6 space-y-5">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Cargo</label>
            {editing ? (
              <div className={`${selectClass} opacity-60 cursor-not-allowed`}>{editing.nome}</div>
            ) : (
              <select value={cargoId} onChange={(e) => setCargoId(e.target.value)} className={selectClass}>
                <option value="">Selecione um cargo...</option>
                {disponíveis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            )}
            {!editing && disponíveis.length === 0 && (
              <p className="text-[11px] text-warning font-semibold">Todos os cargos já têm permissões configuradas.</p>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">Módulos de Acesso</label>
            <ModulesCombobox selected={modulos} onChange={setModulos} />
          </div>

          {modulos.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {modulos.map((id) => (
                <span key={id} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--color-primary-blue)]/30 bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] text-[10px] font-bold">
                  {MODULE_LABELS[id] ?? id}
                  <button type="button" onClick={() => setModulos((prev) => prev.filter((x) => x !== id))} className="text-[var(--color-primary-blue)] hover:text-[var(--color-text-primary)] leading-none ml-0.5">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="px-8 pb-8 flex gap-3">
          <button onClick={onClose} className="flex-1 h-11 rounded-xl border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] font-black text-[10px] uppercase tracking-widest transition-colors">Cancelar</button>
          <button
            onClick={() => { const id = editing?.id ?? cargoId; if (id && modulos.length > 0) { onSave(id, modulos); onClose(); } }}
            className="flex-1 h-11 rounded-xl bg-[var(--color-primary-blue)] hover:brightness-110 text-white font-black text-[10px] uppercase tracking-widest transition-colors shadow-lg shadow-[var(--color-primary-blue)]/20"
          >
            {editing ? "Salvar" : "Criar Permissão"}
          </button>
        </div>
      </div>
    </div>
  );
}
