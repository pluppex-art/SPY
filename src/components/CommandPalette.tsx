import { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import {
  Search, Command, LayoutDashboard, Users,
  FileText, Zap, Settings, Briefcase,
  GraduationCap, UserSquare2, FileSignature, Package,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useNavigate } from "react-router-dom";
import { useLocalization } from "../contexts/LocalizationContext";
import { useData } from "../contexts/DataContext";
import { normalizeText } from "../lib/utils";

const NAV_ACTIONS = [
  { name: "Dashboard Principal", icon: LayoutDashboard, path: "/app/dashboard", category: "Navegação" },
  { name: "Pipeline de Vendas", icon: Briefcase, path: "/app/crm/pipeline", category: "Navegação" },
  { name: "Base de Clientes", icon: Users, path: "/app/crm/clientes", category: "Navegação" },
  { name: "Propostas", icon: FileText, path: "/app/crm/propostas", category: "Navegação" },
  { name: "Contratos", icon: FileSignature, path: "/app/crm/contratos", category: "Navegação" },
  { name: "Produtos", icon: Package, path: "/app/produtos", category: "Navegação" },
  { name: "Automações de Marketing", icon: Zap, path: "/app/automacoes", category: "Navegação" },
  { name: "Gestão de Turmas", icon: GraduationCap, path: "/app/educacao/turmas", category: "Navegação" },
  { name: "Configurações do Sistema", icon: Settings, path: "/app/configuracoes", category: "Navegação" },
];

const RESULT_LIMIT = 5;

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { t } = useLocalization();
  const { leads, clienteBase, proposals, contracts, products } = useData();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setIsOpen((open) => !open);
      }
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Relatado pelo usuário: "não consigo escrever" no campo. O `autoFocus` do
  // <input> sozinho é pouco confiável aqui — o conteúdo entra via
  // createPortal(document.body) DENTRO de um AnimatePresence, então o input
  // ainda nem existe no DOM no instante em que o React processaria
  // autoFocus; algo que já tinha foco (ex.: o próprio botão que abriu o
  // modal) continua retendo o foco do teclado, e as teclas digitadas não
  // chegam a lugar nenhum. Foca explicitamente DEPOIS que `isOpen` vira
  // true e o portal já montou.
  useEffect(() => {
    if (!isOpen) return;
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  const term = normalizeText(search.trim());

  // Busca real sobre os dados já carregados do tenant ativo (useData()) —
  // antes disso eram só 6 atalhos de navegação fixos, sem nenhuma ligação
  // com lead/cliente/proposta/contrato/produto de verdade, então digitar o
  // nome de um cliente aqui nunca encontrava nada.
  const navResults = useMemo(
    () => (term ? NAV_ACTIONS.filter((a) => normalizeText(a.name).includes(term)) : NAV_ACTIONS),
    [term]
  );

  const leadResults = useMemo(() => {
    if (!term) return [];
    return (leads || [])
      .filter((l: any) => normalizeText(l.name).includes(term) || normalizeText(l.company).includes(term))
      .slice(0, RESULT_LIMIT);
  }, [leads, term]);

  const clienteResults = useMemo(() => {
    if (!term) return [];
    return (clienteBase || []).filter((c: any) => normalizeText(c.name).includes(term)).slice(0, RESULT_LIMIT);
  }, [clienteBase, term]);

  const propostaResults = useMemo(() => {
    if (!term) return [];
    return (proposals || [])
      .filter((p: any) => normalizeText(p.cliente).includes(term) || normalizeText(p.titulo).includes(term))
      .slice(0, RESULT_LIMIT);
  }, [proposals, term]);

  const contratoResults = useMemo(() => {
    if (!term) return [];
    return (contracts || [])
      .filter((c: any) => normalizeText(c.client).includes(term) || normalizeText(c.plan).includes(term))
      .slice(0, RESULT_LIMIT);
  }, [contracts, term]);

  const produtoResults = useMemo(() => {
    if (!term) return [];
    return (products || []).filter((p: any) => normalizeText(p.name).includes(term)).slice(0, RESULT_LIMIT);
  }, [products, term]);

  const totalResults =
    navResults.length + leadResults.length + clienteResults.length + propostaResults.length + contratoResults.length + produtoResults.length;

  const handleSelect = (path: string) => {
    navigate(path);
    setIsOpen(false);
    setSearch("");
  };

  const groupClass = "space-y-1";
  const groupLabelClass = "px-3 py-1.5 text-[10px] font-black text-[var(--color-text-faint)] uppercase tracking-[0.2em]";
  const itemClass = "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--color-primary-blue)]/10 group transition-all text-left border-none bg-transparent cursor-pointer";
  const iconWrapClass = "w-9 h-9 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] flex items-center justify-center text-[var(--color-text-faint)] group-hover:text-[var(--color-primary-blue)] group-hover:border-[var(--color-primary-blue)]/25 transition-all shrink-0";
  const itemLabelClass = "text-sm font-bold text-[var(--color-text-muted)] group-hover:text-[var(--color-text-primary)] transition-colors truncate";

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2.5 w-full sm:w-[34rem] px-4 py-2.5 rounded-lg bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-border-default)] transition-all text-sm font-medium"
      >
        <Search className="w-4 h-4 shrink-0" />
        <span className="hidden sm:inline">{t("Buscar clientes, leads, propostas, contratos...")}</span>
        <kbd className="hidden sm:flex items-center gap-1 ml-auto px-1.5 py-0.5 rounded border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] font-mono text-xs">
          <Command className="w-3 h-3" /> K
        </kbd>
      </button>

      <AnimatePresence>
        {isOpen && createPortal(
          <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -20 }}
              className="relative w-full max-w-3xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-2xl shadow-2xl overflow-hidden"
            >
              <div className="flex items-center gap-3 px-5 py-5 border-b border-[var(--color-border-subtle)]">
                <Search className="w-5 h-5 text-[var(--color-text-faint)] shrink-0" />
                <input
                  ref={inputRef}
                  autoFocus
                  placeholder={t("Busque por nome de cliente, lead, proposta, contrato...")}
                  className="bg-transparent border-none text-[var(--color-text-primary)] outline-none flex-1 font-medium text-xl placeholder:text-[var(--color-text-faint)]"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="text-[10px] font-black text-[var(--color-text-faint)] uppercase tracking-widest bg-[var(--color-surface-sunken)] px-2 py-1 rounded-md border border-[var(--color-border-subtle)]">
                  S.P.Y. Command Center
                </div>
              </div>

              <div className="max-h-[400px] overflow-y-auto p-2 scrollbar-none">
                {totalResults > 0 ? (
                  <div className="space-y-4">
                    {leadResults.length > 0 && (
                      <div className={groupClass}>
                        <div className={groupLabelClass}>{t("Leads / Pipeline")}</div>
                        {leadResults.map((l: any) => (
                          <button key={l.id} onClick={() => handleSelect("/app/crm/pipeline")} className={itemClass}>
                            <div className={iconWrapClass}><Briefcase className="w-4 h-4" /></div>
                            <div className="min-w-0">
                              <span className={itemLabelClass}>{l.name}</span>
                              {l.company && <div className="text-[10px] text-[var(--color-text-faint)] truncate">{l.company}</div>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {clienteResults.length > 0 && (
                      <div className={groupClass}>
                        <div className={groupLabelClass}>{t("Clientes")}</div>
                        {clienteResults.map((c: any) => (
                          <button key={c.id} onClick={() => handleSelect("/app/crm/clientes")} className={itemClass}>
                            <div className={iconWrapClass}><UserSquare2 className="w-4 h-4" /></div>
                            <span className={itemLabelClass}>{c.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {propostaResults.length > 0 && (
                      <div className={groupClass}>
                        <div className={groupLabelClass}>{t("Propostas")}</div>
                        {propostaResults.map((p: any) => (
                          <button key={p.id} onClick={() => handleSelect("/app/crm/propostas")} className={itemClass}>
                            <div className={iconWrapClass}><FileText className="w-4 h-4" /></div>
                            <div className="min-w-0">
                              <span className={itemLabelClass}>{p.titulo}</span>
                              <div className="text-[10px] text-[var(--color-text-faint)] truncate">{p.cliente}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {contratoResults.length > 0 && (
                      <div className={groupClass}>
                        <div className={groupLabelClass}>{t("Contratos")}</div>
                        {contratoResults.map((c: any) => (
                          <button key={c.id} onClick={() => handleSelect("/app/crm/contratos")} className={itemClass}>
                            <div className={iconWrapClass}><FileSignature className="w-4 h-4" /></div>
                            <div className="min-w-0">
                              <span className={itemLabelClass}>{c.client}</span>
                              <div className="text-[10px] text-[var(--color-text-faint)] truncate">{c.plan}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {produtoResults.length > 0 && (
                      <div className={groupClass}>
                        <div className={groupLabelClass}>{t("Produtos")}</div>
                        {produtoResults.map((p: any) => (
                          <button key={p.id} onClick={() => handleSelect("/app/produtos")} className={itemClass}>
                            <div className={iconWrapClass}><Package className="w-4 h-4" /></div>
                            <span className={itemLabelClass}>{p.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    {navResults.length > 0 && (
                      <div className={groupClass}>
                        <div className={groupLabelClass}>{t("Navegação")}</div>
                        {navResults.map((action) => (
                          <button key={action.name} onClick={() => handleSelect(action.path)} className={itemClass}>
                            <div className={iconWrapClass}><action.icon className="w-4 h-4" /></div>
                            <span className={itemLabelClass}>{t(action.name)}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <p className="text-sm text-[var(--color-text-faint)] font-medium italic">
                      {t('Nada encontrado para "{search}"').replace("{search}", search)}
                    </p>
                  </div>
                )}
              </div>

              <div className="p-4 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/50 flex items-center justify-between">
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-faint)] font-bold uppercase tracking-wider">
                    <span className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] px-1 rounded text-[var(--color-text-primary)]">ESC</span> {t("Fechar")}
                  </div>
                </div>
                <div className="text-[10px] text-[var(--color-text-faint)] font-bold italic">
                  v2.5.0-stable
                </div>
              </div>
            </motion.div>
          </div>,
          document.body
        )}
      </AnimatePresence>
    </>
  );
}
