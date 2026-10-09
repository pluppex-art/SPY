import React, { useMemo, useState } from "react";
import {
  ShieldCheck, Briefcase, Box, Info, Plus, Lock, Check,
  Users, DollarSign, MessageSquare, Megaphone, Award, Activity, BarChart3, ListChecks, Package, Code2,
  Home, Car, Sun, ShoppingCart, Sparkles, Eraser,
} from "lucide-react";
import { Modal } from "../../../../components/ui/modal";
import { Button } from "../../../../components/ui/button";
import { useAuth } from "../../../../contexts/AuthContext";
import { ModulesCombobox, ALL_MODULES } from "./ModulesCombobox";

interface PermissaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (cargoId: string, modulos: string[]) => void;
  editing: any | null;
  cargos: any[];
}

const MODULE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  crm: Users, financeiro: DollarSign, engajamento: MessageSquare, marketing: Megaphone, educacao: Award,
  clinica: Activity, rh: Users, bi: BarChart3, produtividade: ListChecks, catalogo: Package, dev: Code2,
  imobiliaria: Home, automotivo: Car, solar: Sun, varejo: ShoppingCart, aurora: Sparkles,
};

const MODULE_TONES: Record<string, string> = {
  crm: "text-blue-500", financeiro: "text-emerald-500", engajamento: "text-rose-500", marketing: "text-amber-500",
  educacao: "text-purple-500", clinica: "text-teal-500", rh: "text-blue-500", bi: "text-indigo-500",
  produtividade: "text-cyan-500", catalogo: "text-purple-500", dev: "text-slate-500", imobiliaria: "text-orange-500",
  automotivo: "text-amber-600", solar: "text-yellow-500", varejo: "text-lime-600", aurora: "text-indigo-500",
};

// Módulos de nicho — só aparecem quando a empresa os tem ativos (e ganham um selo).
const NICHE_MODULES = new Set(["imobiliaria", "automotivo", "solar", "varejo", "clinica", "educacao"]);

// Chaves equivalentes (mesmos aliases do ProtectedRoute): a empresa pode ter guardado "concessionaria".
const TENANT_ALIASES: Record<string, string[]> = {
  automotivo: ["automotivo", "concessionaria"],
  solar: ["solar", "energia-solar"],
  clinica: ["clinica", "clinicas"],
};

const labelCls = "flex items-center gap-2 text-sm font-bold text-[var(--color-text-primary)]";
const selectClass = "w-full bg-[var(--color-surface-sunken)] border rounded-lg px-3 h-10 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all cursor-pointer";

export function PermissaoModal({ isOpen, onClose, onSave, editing, cargos }: PermissaoModalProps) {
  const { user, activeTenantName, allTenantModules } = useAuth();
  const [cargoId, setCargoId] = useState("");
  const [modulos, setModulos] = useState<string[]>([]);
  const [tentou, setTentou] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    setCargoId(editing?.id ?? "");
    setModulos(editing?.modulos ?? []);
    setTentou(false);
  }, [isOpen, editing]);

  // Módulos que a empresa realmente tem ativos. Sem o cadastro da empresa carregado, mostra todos
  // (não esconde nada por engano) e módulos já marcados nunca somem da lista.
  const options = useMemo(() => {
    const tenantName = (activeTenantName || user?.tenantName || "").toLowerCase();
    const key = Object.keys(allTenantModules || {}).find((k) => k.toLowerCase() === tenantName);
    const mods = key ? allTenantModules[key] || {} : null;
    return ALL_MODULES.filter((m) => {
      if (modulos.includes(m.id)) return true;
      if (!mods) return !NICHE_MODULES.has(m.id) || m.id === "clinica" || m.id === "educacao";
      const aliases = TENANT_ALIASES[m.id] || [m.id];
      return aliases.some((a) => !!mods[a]);
    });
  }, [activeTenantName, user?.tenantName, allTenantModules, modulos]);

  const disponiveis = editing ? cargos : cargos.filter((c) => !c.modulos || c.modulos.length === 0);
  const cargoSelecionado = editing ?? cargos.find((c) => c.id === cargoId);

  const erroCargo = !editing && !cargoId ? "Selecione o cargo que receberá esta permissão." : "";
  const erroModulos = modulos.length === 0 ? "Escolha pelo menos um módulo." : "";

  const toggle = (id: string) => setModulos((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const todosMarcados = options.length > 0 && options.every((o) => modulos.includes(o.id));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTentou(true);
    const id = editing?.id ?? cargoId;
    if (!id || modulos.length === 0) return;
    onSave(id, modulos);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-lg font-black text-[var(--color-text-primary)] leading-tight">{editing ? "Editar Permissões" : "Nova Permissão"}</div>
            <div className="text-xs font-normal text-[var(--color-text-muted)]">Defina os módulos que o cargo poderá acessar no sistema.</div>
          </div>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="space-y-1.5">
          <div className={labelCls}><Briefcase className="w-4 h-4 text-[var(--color-primary-blue)]" /> Cargo {!editing && <span className="text-[var(--color-danger)]">*</span>}</div>
          <p className="text-[11px] text-[var(--color-text-muted)]">Selecione o cargo que receberá esta permissão.</p>
          {editing ? (
            <div className={`${selectClass} border-[var(--color-border-default)] flex items-center opacity-70 cursor-not-allowed`}>{editing.nome}</div>
          ) : (
            <select value={cargoId} onChange={(e) => setCargoId(e.target.value)} className={`${selectClass} ${tentou && erroCargo ? "border-[var(--color-danger)]" : "border-[var(--color-border-default)]"}`}>
              <option value="">Selecione um cargo...</option>
              {disponiveis.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          )}
          {!editing && disponiveis.length === 0 && (
            <p className="text-[11px] text-warning font-semibold">Todos os cargos já têm permissões configuradas.</p>
          )}
          {tentou && erroCargo && <p className="text-[11px] text-[var(--color-danger)]">{erroCargo}</p>}
        </div>

        <div className="space-y-1.5">
          <div className={labelCls}><Box className="w-4 h-4 text-[var(--color-primary-blue)]" /> Módulos de Acesso <span className="text-[var(--color-danger)]">*</span></div>
          <p className="text-[11px] text-[var(--color-text-muted)]">Escolha quais módulos do sistema o cargo poderá acessar.</p>
          <ModulesCombobox selected={modulos} onChange={setModulos} options={options} />
          {tentou && erroModulos && <p className="text-[11px] text-[var(--color-danger)]">{erroModulos}</p>}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[var(--color-primary-blue)]/8 border border-[var(--color-primary-blue)]/20 text-[11px] text-[var(--color-primary-blue)]">
            <Info className="w-4 h-4 shrink-0 mt-px" />
            <span>
              Esta permissão permitirá que todos os usuários {cargoSelecionado ? <>do cargo <strong>{cargoSelecionado.nome}</strong></> : "deste cargo"} tenham acesso aos módulos selecionados.
              Só aparecem os módulos ativos para a sua empresa.
            </span>
          </div>
        </div>

        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-black text-[var(--color-text-primary)]">Módulos da sua empresa</h4>
            <div className="flex items-center gap-2">
              {modulos.length > 0 && (
                <button type="button" onClick={() => setModulos([])} className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] bg-transparent border-none cursor-pointer">
                  <Eraser className="w-3.5 h-3.5" /> Limpar
                </button>
              )}
              <button
                type="button"
                onClick={() => setModulos(todosMarcados ? [] : options.map((o) => o.id))}
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg text-xs font-bold text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 hover:bg-[var(--color-primary-blue)]/15 border-none cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> {todosMarcados ? "Desmarcar todos" : "Selecionar todos"}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {options.map((m) => {
              const Icon = MODULE_ICONS[m.id] || Box;
              const checked = modulos.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => toggle(m.id)}
                  aria-pressed={checked}
                  title={m.desc}
                  className={`flex items-center gap-2.5 px-3 h-12 rounded-xl border text-left cursor-pointer transition-all ${checked ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/5" : "border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] hover:border-[var(--color-primary-blue)]/50"}`}
                >
                  <Icon className={`w-4.5 h-4.5 shrink-0 ${MODULE_TONES[m.id] || "text-[var(--color-text-muted)]"}`} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-xs font-bold text-[var(--color-text-primary)] truncate">{m.label}</span>
                    {NICHE_MODULES.has(m.id) && m.id !== "clinica" && m.id !== "educacao" && (
                      <span className="block text-[9px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">Nicho</span>
                    )}
                  </span>
                  <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${checked ? "bg-[var(--color-primary-blue)] border-[var(--color-primary-blue)]" : "border-[var(--color-border-default)]"}`}>
                    {checked && <Check className="w-3.5 h-3.5 text-white" />}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-4 border-t border-[var(--color-border-subtle)]">
          <Button type="button" variant="outline" onClick={onClose} className="h-10 px-5 text-xs font-bold border-[var(--color-border-default)]">Cancelar</Button>
          <Button type="submit" className="h-10 px-5 text-xs font-bold gap-2 shadow-xs">
            <Lock className="w-4 h-4" /> {editing ? "Salvar Permissões" : "Criar Permissão"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
