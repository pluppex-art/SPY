import React, { useEffect, useMemo, useState } from "react";
import { Building2, Check, ChevronDown, ShieldCheck } from "lucide-react";
import { Modal } from "../../modal";
import { Button } from "../../button";

type PerfilPermissaoPayload = {
  nome: string;
  modulos: string[];
};

type NovoPerfilPermissaoModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: PerfilPermissaoPayload) => void;
  title?: string;
  submitText?: string;
  initialValue?: Partial<PerfilPermissaoPayload> | null;
};

const ALL_MODULES: { id: string; label: string; desc: string }[] = [
  { id: "crm",          label: "CRM & Central de Vendas",        desc: "Leads, funil e SDR IA" },
  { id: "financeiro",   label: "Financeiro",             desc: "Painel, entradas, saídas e DRE" },
  { id: "engajamento",  label: "Engajamento",            desc: "WhatsApp, e-mail e automações" },
  { id: "marketing",    label: "Marketing",              desc: "Campanhas, conteúdo e social" },
  { id: "educacao",     label: "Educação",               desc: "Turmas, alunos e certificados" },
  { id: "clinica",      label: "Clínica & Saúde",        desc: "Prontuários e agendamento" },
  { id: "rh",           label: "RH & Colaboradores",     desc: "Equipe interna e comissões" },
  { id: "bi",           label: "BI & Indicadores",       desc: "Relatórios e estatísticas" },
  { id: "produtividade",label: "Tarefas & Kanban",       desc: "Afazeres e produtividade" },
  { id: "catalogo",     label: "Catálogo de Produtos",   desc: "Estoque, SKUs e iPhones" },
  { id: "dev",          label: "Dev & Tecnologia",       desc: "Projetos, sprints e repositórios" },
];

const labelClass = "text-[10px] font-bold text-slate-400 uppercase tracking-wider";
const inputBaseClass =
  "w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#2563EB] focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 transition-all";

function ModulesCombobox({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };

  const selectAll = () => onChange(ALL_MODULES.map(m => m.id));
  const clearAll  = () => onChange([]);

  const displayText = selected.length === 0
    ? "Selecione os módulos..."
    : selected.length === ALL_MODULES.length
      ? "Todos os módulos"
      : `${selected.length} módulo${selected.length !== 1 ? "s" : ""} selecionado${selected.length !== 1 ? "s" : ""}`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={`${inputBaseClass} flex items-center justify-between text-left`}
      >
        <span className={selected.length === 0 ? "text-slate-600" : "text-white"}>
          {displayText}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-[var(--color-surface)] border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
          {/* Ações rápidas */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
            <button type="button" onClick={selectAll}
              className="text-[10px] font-black uppercase tracking-widest text-blue-400 hover:text-blue-300 transition-colors">
              Todos
            </button>
            <span className="text-slate-700">·</span>
            <button type="button" onClick={clearAll}
              className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-300 transition-colors">
              Limpar
            </button>
          </div>

          {/* Lista */}
          <div className="max-h-56 overflow-y-auto">
            {ALL_MODULES.map(mod => {
              const checked = selected.includes(mod.id);
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => toggle(mod.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-white/[0.04] ${checked ? "bg-blue-600/[0.06]" : ""}`}
                >
                  <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all ${
                    checked ? "bg-blue-600 border-blue-600" : "border-white/20"
                  }`}>
                    {checked && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <div className="text-left min-w-0">
                    <div className="text-[11px] font-black text-white">{mod.label}</div>
                    <div className="text-[9px] text-slate-500 font-bold truncate">{mod.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function NovoPerfilPermissaoModal({
  isOpen,
  onClose,
  onSave,
  initialValue,
  title = "Novo Perfil",
  submitText = "Cadastrar Perfil",
}: NovoPerfilPermissaoModalProps) {
  const [nome, setNome] = useState(initialValue?.nome || "");
  const [modulos, setModulos] = useState<string[]>(initialValue?.modulos || []);
  const [touched, setTouched] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setNome(initialValue?.nome || "");
    setModulos(initialValue?.modulos || []);
    setTouched(false);
    setIsSubmitting(false);
  }, [isOpen, initialValue]);

  const canSubmit = useMemo(
    () => !isSubmitting && Boolean(nome.trim()) && modulos.length > 0,
    [isSubmitting, nome, modulos.length]
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      onSave({ nome: nome.trim(), modulos });
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#2563EB]/10 border border-[#2563EB]/20 flex items-center justify-center mt-0.5">
            <Building2 className="w-4 h-4 text-[#60A5FA]" />
          </div>
          <div className="leading-tight">
            <div className="text-base font-black text-white">{title}</div>
            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-0.5">
              Permissões e módulos de acesso
            </div>
          </div>
        </div>
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white" disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form="novo-perfil-permissoes-form" className="bg-[#2563EB] hover:bg-blue-600 text-white font-bold px-6" disabled={!canSubmit}>
            {isSubmitting ? "Salvando..." : submitText}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="bg-[var(--color-surface)]/40 border border-white/10 rounded-xl p-4 flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mt-0.5 shrink-0">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm text-slate-200 font-bold">Como funciona</p>
            <p className="text-xs text-slate-400 leading-relaxed mt-1">
              Defina o nome do perfil e selecione quais módulos do sistema os usuários com esse perfil poderão acessar.
            </p>
          </div>
        </div>

        <form id="novo-perfil-permissoes-form" onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="perfil-nome" className={labelClass}>Nome do Perfil *</label>
            <input
              id="perfil-nome"
              value={nome}
              onChange={e => setNome(e.target.value)}
              className={inputBaseClass}
              placeholder="Ex.: Admin Master"
              required
            />
            {touched && !nome.trim() && (
              <p className="text-[11px] text-rose-400 font-semibold">Informe um nome.</p>
            )}
          </div>

          <div className="space-y-2">
            <label className={labelClass}>Módulos de Acesso *</label>
            <ModulesCombobox selected={modulos} onChange={setModulos} />
            {touched && modulos.length === 0 && (
              <p className="text-[11px] text-rose-400 font-semibold">Selecione ao menos 1 módulo.</p>
            )}
          </div>

          {modulos.length > 0 && (
            <div className="bg-[var(--color-surface)] border border-white/10 rounded-xl p-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                Módulos selecionados
              </div>
              <div className="flex flex-wrap gap-2">
                {modulos.map(id => {
                  const mod = ALL_MODULES.find(m => m.id === id);
                  return (
                    <span key={id} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-blue-500/30 bg-blue-600/10 text-blue-300 text-[11px] font-bold">
                      {mod?.label ?? id}
                      <button type="button" onClick={() => setModulos(prev => prev.filter(x => x !== id))}
                        className="text-blue-500 hover:text-white transition-colors leading-none">×</button>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </form>
      </div>
    </Modal>
  );
}
