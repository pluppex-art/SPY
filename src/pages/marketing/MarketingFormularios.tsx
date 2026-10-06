import { useState, useMemo, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { FileText, ChevronRight, Plus, Trash2, Sparkles, CheckCircle2, PauseCircle, Globe } from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { motion, AnimatePresence } from "motion/react";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";
import { toast } from "sonner";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { FormDetail, type FormDefinition } from "./components/Formularios/FormDetail";
import { NovoFormularioModal } from "./components/Formularios/NovoFormularioModal";
import { PLUPPEX_TENANT_ID } from "../../lib/supabase";

const EMPREENDA_PREVIEW_URL = "https://escolaempreendamais.pluppex.com.br/inscricao";

export const DEFAULT_EMPREENDA_FORM: FormDefinition = {
  id: "empreenda",
  name: "Inscrição — E-EMPREENDA+",
  description: "Formulário oficial de qualificação com 5 passos interativos, rodízio de SDRs e captação direta de leads no CRM.",
  previewUrl: EMPREENDA_PREVIEW_URL,
  source: "landing_empreenda",
  active: true,
};

export default function MarketingFormularios() {
  const { activeTenantId } = useAuth();
  const { marketingForms, addMarketingForm, deleteMarketingForm, ensureNicheModulesLoaded } = useData();
  useEffect(() => { ensureNicheModulesLoaded(); }, [ensureNicheModulesLoaded]);
  const [selected, setSelected] = useState<FormDefinition | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("");
  const [origem, setOrigem] = useState("");

  const forms: FormDefinition[] = useMemo(() => {
    const list: FormDefinition[] = (marketingForms || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      description: f.description || "",
      previewUrl: f.preview_url,
      source: f.source,
      active: f.active !== false,
    }));

    const hasEmpreenda = list.some(
      (f) =>
        f.source === "landing_empreenda" ||
        f.id === "empreenda" ||
        f.name.toLowerCase().includes("empreenda")
    );

    // M1 (auditoria 2026-09-21): E-EMPREENDA+ é um produto/funil específico
    // da Pluppex, não uma feature nativa do S.P.Y. — antes era injetado pra
    // TODO tenant com o módulo Marketing habilitado, mesmo mostrando 0 leads
    // (RLS bloqueia os dados reais de outro tenant_id) e falhando ao salvar.
    if (!hasEmpreenda && activeTenantId === PLUPPEX_TENANT_ID) {
      return [DEFAULT_EMPREENDA_FORM, ...list];
    }
    return list;
  }, [marketingForms, activeTenantId]);

  const origens = useMemo(() => Array.from(new Set(forms.map(f => f.source).filter(Boolean))).sort() as string[], [forms]);
  const formsFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return forms.filter(f =>
      (!statusFiltro || (statusFiltro === "ativo" ? f.active : !f.active)) &&
      (!origem || f.source === origem) &&
      (!q || [f.name, f.description, f.previewUrl].some(v => (v || "").toLowerCase().includes(q))),
    );
  }, [forms, busca, statusFiltro, origem]);

  const handleCreate = async (data: { name: string; description: string; previewUrl: string; source: string }) => {
    await addMarketingForm({
      name: data.name,
      description: data.description,
      preview_url: data.previewUrl,
      source: data.source,
      active: true,
    });
    toast.success("Formulário cadastrado.");
    setIsModalOpen(false);
  };

  const handleDelete = async (form: FormDefinition, e: React.MouseEvent) => {
    e.stopPropagation();
    if (form.id === "empreenda" && !(marketingForms || []).some((f: any) => f.id === "empreenda")) {
      toast.info("O formulário E-EMPREENDA+ é o formulário nativo do sistema e não pode ser excluído.");
      return;
    }
    if (!(await confirmDialog({
      title: "Excluir formulário",
      description: `Excluir "${form.name}"? Essa ação não pode ser desfeita.`,
    }))) return;
    await deleteMarketingForm(form.id);
    toast.success("Formulário removido.");
  };

  return (
    <PageContainer
      title="Formulários"
      subtitle="Gerencie formulários de captação de leads conectados ao CRM."
      actions={!selected && (
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500/10 border border-orange-500/20 rounded-xl text-[11px] font-black text-orange-400 hover:bg-orange-500/20 uppercase tracking-widest transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Novo Formulário
        </button>
      )}
    >
      <AnimatePresence mode="wait">
        {selected ? (
          <motion.div key="detail" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
            <div className="flex items-center gap-2 mb-6">
              <button onClick={() => setSelected(null)}
                className="text-[11px] font-black text-slate-500 hover:text-white uppercase tracking-widest transition-colors">
                Formulários
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-[11px] font-black text-white uppercase tracking-widest truncate">{selected.name}</span>
            </div>
            {activeTenantId
              ? <FormDetail form={selected} tenantId={activeTenantId} />
              : <p className="text-sm text-slate-500">Carregando contexto do usuário...</p>
            }
          </motion.div>
        ) : (
          <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {forms.length > 0 && (
              <KpiFilterCard
                id="marketingFormularios"
                className="mb-4"
                kpis={[
                  { label: "Formulários", value: formsFiltrados.length, icon: FileText, tone: "primary" },
                  { label: "Ativos", value: formsFiltrados.filter(f => f.active).length, icon: CheckCircle2, tone: "success" },
                  { label: "Inativos", value: formsFiltrados.filter(f => !f.active).length, icon: PauseCircle, tone: "neutral" },
                  { label: "Origens", value: new Set(formsFiltrados.map(f => f.source).filter(Boolean)).size, icon: Globe, tone: "info" },
                ]}
                activeCount={(busca.trim() ? 1 : 0) + (statusFiltro ? 1 : 0) + (origem ? 1 : 0)}
                onClear={() => { setBusca(""); setStatusFiltro(""); setOrigem(""); }}
              >
                <FilterBar>
                  <FilterSearch value={busca} onChange={setBusca} placeholder="Buscar formulário..." />
                  <FilterSelect icon={Globe} value={origem} onChange={setOrigem} options={origens} allLabel="Todas as origens" />
                  <FilterChips value={statusFiltro} onChange={setStatusFiltro} options={[{ value: "ativo", label: "Ativos" }, { value: "inativo", label: "Inativos" }]} />
                </FilterBar>
              </KpiFilterCard>
            )}
            {forms.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-50">
                <FileText className="w-10 h-10 text-slate-600" />
                <p className="text-sm font-black text-slate-500 uppercase">Nenhum formulário cadastrado</p>
                <p className="text-xs text-slate-600">Cadastre o formulário/landing page externa desta empresa para acompanhar leads e rodízio de SDR.</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {formsFiltrados.map(form => (
                  <div key={form.id} onClick={() => setSelected(form)} role="button" tabIndex={0}
                    className="group text-left w-full flex items-center gap-5 p-5 bg-[var(--color-surface-elevated)]/80 border border-white/5 rounded-2xl hover:border-white/15 hover:bg-white/[0.04] transition-all cursor-pointer">
                    <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-orange-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="text-sm font-black text-white truncate">{form.name}</h3>
                        {form.active && (
                          <span className="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase shrink-0">
                            Ativo
                          </span>
                        )}
                        {(form.id === "empreenda" || form.source === "landing_empreenda") && (
                          <span className="text-[9px] font-black text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2 py-0.5 rounded-full uppercase shrink-0 flex items-center gap-1">
                            <Sparkles className="w-2.5 h-2.5" /> Oficial E-EMPREENDA+
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium">{form.description}</p>
                      <p className="text-[10px] text-slate-600 mt-1">{form.previewUrl}</p>
                    </div>
                    <button
                      onClick={(e) => handleDelete(form, e)}
                      title="Excluir formulário"
                      className="p-2 rounded-lg bg-danger/5 text-slate-600 hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <NovoFormularioModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={handleCreate} />
    </PageContainer>
  );
}
