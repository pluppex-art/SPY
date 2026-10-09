import { useState } from "react";
import { ChevronDown, Check } from "lucide-react";

export const ALL_MODULES: { id: string; label: string; desc: string }[] = [
  { id: "crm",          label: "CRM & Pipeline",        desc: "Leads, funil e SDR IA" },
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
  // Módulos de nicho (só aparecem para empresas que os têm ativos — ver PermissaoModal).
  { id: "imobiliaria",  label: "Imobiliária",            desc: "Imóveis, visitas, corretores e propostas" },
  { id: "automotivo",   label: "Concessionária & Automotivo", desc: "Estoque de veículos, trocas e consignações" },
  { id: "solar",        label: "Energia Solar",          desc: "Dimensionamento e funil fotovoltaico" },
  { id: "varejo",       label: "Varejo & PDV",           desc: "Frente de caixa, estoque, compras e fornecedores" },
  { id: "aurora",       label: "Aurora (IA)",            desc: "Assistente executiva com inteligência" },
];

interface ModulesComboboxProps {
  selected: string[];
  onChange: (v: string[]) => void;
  /** Lista exibida (padrão: todos os módulos). Usada para mostrar só os módulos da empresa. */
  options?: { id: string; label: string; desc: string }[];
}

export function ModulesCombobox({ selected, onChange, options = ALL_MODULES }: ModulesComboboxProps) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) =>
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);

  const displayText =
    selected.length === 0
      ? "Selecione os módulos..."
      : (selected.length === options.length && options.length > 0)
      ? "Todos os módulos"
      : `${selected.length} módulo${selected.length !== 1 ? "s" : ""} selecionado${selected.length !== 1 ? "s" : ""}`;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl px-4 py-2.5 text-sm text-[var(--color-text-primary)] focus:border-[var(--color-primary-blue)] focus:outline-none transition-all flex items-center justify-between text-left"
      >
        <span className={selected.length === 0 ? "text-[var(--color-text-faint)]" : "text-[var(--color-text-primary)]"}>{displayText}</span>
        <ChevronDown className={`w-4 h-4 text-[var(--color-text-muted)] shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl shadow-2xl shadow-black/60 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border-subtle)]">
            <button type="button" onClick={() => onChange(options.map((m) => m.id))} className="text-[10px] font-black uppercase tracking-widest text-[var(--color-primary-blue)] hover:opacity-80 transition-colors">Todos</button>
            <span className="text-[var(--color-text-faint)]">·</span>
            <button type="button" onClick={() => onChange([])} className="text-[10px] font-black uppercase tracking-widest text-[var(--color-text-faint)] hover:text-[var(--color-text-muted)] transition-colors">Limpar</button>
          </div>
          <div className="max-h-56 overflow-y-auto">
            {options.map((mod) => {
              const checked = selected.includes(mod.id);
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => toggle(mod.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--color-surface-sunken)] ${checked ? "bg-[var(--color-primary-blue)]/[0.06]" : ""}`}
                >
                  <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all ${checked ? "bg-[var(--color-primary-blue)] border-[var(--color-primary-blue)]" : "border-[var(--color-border-default)]"}`}>
                    {checked && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                  <div className="text-left min-w-0">
                    <div className="text-[11px] font-black text-[var(--color-text-primary)]">{mod.label}</div>
                    <div className="text-[9px] text-[var(--color-text-faint)] font-bold truncate">{mod.desc}</div>
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
