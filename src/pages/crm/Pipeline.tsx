import { useState, useEffect, useMemo } from "react";
import { PageContainer } from "../../components/PageContainer";
import { KpiFilterCard } from "../../components/ui/kpi-filter-card";
import { useFillViewportHeight } from "../../hooks/useFillViewportHeight";
import { Users, Flame, CheckCircle2, Target, BarChart3 } from "lucide-react";

import { PipelineTopActions } from "./components/Pipeline/PipelineTopActions";

import { NewLeadModal } from "../../components/ui/modals/crm/NewLeadModal";
import { LeadDetailsModal } from "../../components/ui/LeadDetailsModal";
import { AgendarReuniaoModal } from "../../components/ui/modals/crm/AgendarReuniaoModal";
import { toast } from "sonner";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

import { usePipeline } from "./usePipeline";
import { PipelineAnalytics } from "./components/Pipeline/PipelineAnalytics";
import { WebhookModal } from "./components/Pipeline/WebhookModal";
import { PipelineListaView } from "./components/Pipeline/PipelineListaView";
import { PipelineFilterBar } from "./components/Pipeline/PipelineFilterBar";
import { PipelineKanbanBoard } from "./components/Pipeline/PipelineKanbanBoard";
import { PipelineDefaultState } from "./components/Pipeline/PipelineDefaultState";
import { PipelineEmptySelection } from "./components/Pipeline/PipelineEmptySelection";
import { isLeadOpen } from "../../lib/leadStatus";
import { normalizeText } from "../../lib/utils";

type ViewMode = "kanban" | "lista";

const tempOrder: Record<string, number> = { quente: 3, morno: 2, frio: 1 };

export default function Pipeline() {
  const navigate = useNavigate();
  const { user, updatePreferences, activeTenantId } = useAuth();
  const [view, setView] = useState<ViewMode>("kanban");
  useEffect(() => {
    const saved = user?.preferences?.pipelineView;
    if (saved === "kanban" || saved === "lista") { setView(saved); return; }
    const defaultCrmView = user?.preferences?.systemPreferences?.defaultCrmView;
    if (defaultCrmView === "list") setView("lista");
    else if (defaultCrmView === "kanban") setView("kanban");
  }, [user?.preferences]);

  const handleSetView = (v: ViewMode) => {
    setView(v);
    updatePreferences({ pipelineView: v });
  };

  const [minimizedColumns, setMinimizedColumns] = useState<Set<string>>(new Set());
  const [temperatureFilter, setTemperatureFilter] = useState("Todas");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");
  const [agendarReuniaoLead, setAgendarReuniaoLead] = useState<any | null>(null);

  const {
    isModalOpen, setIsModalOpen,
    selectedLead, setSelectedLead,
    sellerFilter, setSellerFilter,
    companyFilter, setCompanyFilter,
    cityFilter, setCityFilter, citiesList,
    stageFilter, setStageFilter, sourceFilter, setSourceFilter, sourcesList,
    searchQuery, setSearchQuery,
    showAnalytics, setShowAnalytics,
    openDropdownId, setOpenDropdownId,
    tempDropdownId, setTempDropdownId,
    webhookModalLead, setWebhookModalLead,
    webhookUrl, setWebhookUrl,
    leads, updateLead, tasks,
    clientFilter, setClientFilter, clientsList,
    dateFrom, setDateFrom, dateTo, setDateTo,
    currentPipeline, switchPipeline,
    selectedFunilId, setSelectedFunilId,
    comercialFunis, sdrFunis,
    firstComercialStageId, firstSdrStageId,
    draggedLeadId, setDraggedLeadId,
    draggedOverStageId, setDraggedOverStageId,
    companiesList,
    activePipelineStages, sellers,
    filteredItemsList, analyticsData, hotLeadsCount,
    formattedTotalValue, winRate,
    triggerCelebration, exportPDF,
    handleExportIAResume, handleTransferToComercial,
    handleWinStageDrop,
  } = usePipeline();

  const [searchParams] = useSearchParams();
  useEffect(() => {
    const nicho = searchParams.get("nicho") || searchParams.get("filtro");
    if (nicho) {
      setSearchQuery(nicho);
    } else {
      setSearchQuery("");
    }
  }, [searchParams, setSearchQuery]);

  useEffect(() => {
    const targetLeadId = searchParams.get("leadId") || searchParams.get("lead");
    if (targetLeadId && (leads as any[]).length > 0) {
      const found = (leads as any[]).find((l: any) => l.id === targetLeadId);
      if (found) {
        setSelectedLead(found);
      }
    }
  }, [searchParams, leads, setSelectedLead]);

  useEffect(() => {
    setMinimizedColumns(
      new Set(activePipelineStages.filter((s: any) => s.iniciarMinimizado).map((s: any) => s.id))
    );
  }, [activePipelineStages.map((s: any) => s.id).join(",")]);

  const toggleColumn = (stageId: string) =>
    setMinimizedColumns(prev => {
      const next = new Set(prev);
      next.has(stageId) ? next.delete(stageId) : next.add(stageId);
      return next;
    });

  const handleReuniaoStageDrop = (leadId: string, _stage: any) => {
    const lead = (leads as any[]).find((l: any) => l.id === leadId);
    if (lead) setAgendarReuniaoLead(lead);
  };

  const handleReuniaoConfirm = async (reuniaoId: string) => {
    setAgendarReuniaoLead(null);
    let targetStageId = "1";
    if (supabase && activeTenantId) {
      try {
        // Sem o filtro de tenant, contas de parceiro com acesso a vários
        // tenants que também salvaram essa key recebiam múltiplas linhas —
        // .maybeSingle() falha nesse caso e o erro era engolido pelo catch,
        // caindo silenciosamente no stageId "1" padrão em vez do configurado.
        const { data } = await supabase.from("app_settings").select("value").eq("key", "axis_reuniao_config").eq("tenant_id", activeTenantId).maybeSingle();
        if (data?.value) {
          const cfg = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
          if (cfg?.promotionStageId) targetStageId = cfg.promotionStageId;
        }
      } catch {}
    }
    if (agendarReuniaoLead) {
      updateLead(agendarReuniaoLead.id, { pipelineId: "comercial", stageId: targetStageId });
      toast.success("Lead promovido para o funil Comercial!");
    }
    navigate("/app/reunioes/" + reuniaoId);
  };

  const checkCapacityAndOpenModal = () => {
    const count = leads.filter((l: any) => l.pipelineId === "comercial" || !l.pipelineId).length;
    if (count > 50) toast.error(`Capacidade crítica! (${count} leads)`);
    else if (count > 30) toast.warning(`Capacidade próxima ao limite! (${count} leads)`);
    setIsModalOpen(true);
  };

  const { ref: listaRef, height: listaHeight } = useFillViewportHeight<HTMLDivElement>(320);

  const noPipelineConfigured = comercialFunis.length === 0 && sdrFunis.length === 0;

  const kpis = useMemo(() => ({
    // Em aberto: ganhos, perdidos, desqualificados e cancelados saem da contagem (continuam nas colunas finais e no Win Rate).
    total: filteredItemsList.filter((l: any) => isLeadOpen(l.status) && l.status !== "Cancelado").length,
    hot: filteredItemsList.filter((l: any) => l.priority === "Alta").length,
    closed: filteredItemsList.filter((l: any) => l.status === "Fechado").length,
  }), [filteredItemsList]);

  const activeFilterCount =
    (searchQuery.trim() ? 1 : 0) + (companyFilter !== "Todos" ? 1 : 0) + (cityFilter !== "Todos" ? 1 : 0) +
    (clientFilter !== "Todos" ? 1 : 0) + (sellerFilter !== "Todos" ? 1 : 0) + (dateFrom || dateTo ? 1 : 0) +
    (stageFilter !== "Todas" ? 1 : 0) + (sourceFilter !== "Todas" ? 1 : 0);
  const clearFilters = () => {
    setSearchQuery(""); setCompanyFilter("Todos"); setCityFilter("Todos"); setClientFilter("Todos");
    setSellerFilter("Todos"); setDateFrom(null); setDateTo(null); setStageFilter("Todas"); setSourceFilter("Todas");
  };

  const listaLeads = useMemo(() =>
    (filteredItemsList as any[])
      .filter((l: any) => !searchQuery || ["name", "company", "email"].some((k: string) => normalizeText(l[k]).includes(normalizeText(searchQuery))))
      .filter((l: any) => temperatureFilter === "Todas" || l.temperature === temperatureFilter)
      .sort((a: any, b: any) => sortOrder === "desc" ? (tempOrder[b.temperature] || 0) - (tempOrder[a.temperature] || 0) : (tempOrder[a.temperature] || 0) - (tempOrder[b.temperature] || 0)),
    [filteredItemsList, searchQuery, temperatureFilter, sortOrder]);

  return (
    <PageContainer
      title="Leads & Pipeline"
      description="Gerencie oportunidades em visão de lista ou kanban interativo."
      actions={
        <PipelineTopActions
          view={view}
          setView={handleSetView}
          showAnalytics={showAnalytics}
          setShowAnalytics={setShowAnalytics}
          onNewLead={checkCapacityAndOpenModal}
        />
      }
    >
      <div className="flex flex-col space-y-4 flex-1 min-h-0">
        {/* Card "KPIs & Filtros" compartilhado (components/ui/kpi-filter-card) — o mesmo das demais páginas.
            Estado aberto/fechado salvo em users.preferences (pipelineFiltersOpen). */}
        <KpiFilterCard
          id="pipeline"
          className="!overflow-visible"
          activeCount={activeFilterCount}
          onClear={clearFilters}
          kpis={[
            { label: "Em aberto", value: kpis.total, icon: Users, tone: "primary" },
            { label: "Alta Prior.", value: kpis.hot, icon: Flame, tone: "warning" },
            { label: "Ganhos", value: kpis.closed, icon: CheckCircle2, tone: "success" },
            { label: "Win Rate", value: `${winRate}%`, icon: Target, tone: "info" },
            { label: "Total de Ganhos", value: formattedTotalValue, icon: BarChart3, tone: "accent" },
          ]}
        >
          <PipelineFilterBar
            comercialFunis={comercialFunis} sdrFunis={sdrFunis}
            currentPipeline={currentPipeline} setCurrentPipeline={switchPipeline as any}
            selectedFunilId={selectedFunilId} setSelectedFunilId={setSelectedFunilId}
            searchQuery={searchQuery} setSearchQuery={setSearchQuery}
            companyFilter={companyFilter} setCompanyFilter={setCompanyFilter}
            companiesList={companiesList}
            cityFilter={cityFilter} setCityFilter={setCityFilter} citiesList={citiesList}
            clientFilter={clientFilter}
            setClientFilter={setClientFilter} clientsList={clientsList}
            sellerFilter={sellerFilter} setSellerFilter={setSellerFilter}
            sellers={sellers}
            dateFrom={dateFrom} setDateFrom={setDateFrom}
            dateTo={dateTo} setDateTo={setDateTo}
            stageFilter={stageFilter} setStageFilter={setStageFilter}
            stageOptions={activePipelineStages.map((s: any) => ({ id: s.id, name: s.name }))}
            sourceFilter={sourceFilter} setSourceFilter={setSourceFilter} sourcesList={sourcesList}
          />
        </KpiFilterCard>

        {view === "kanban" && (
          <>
            <PipelineAnalytics showAnalytics={showAnalytics} analyticsData={analyticsData} exportPDF={exportPDF} hotLeadsCount={hotLeadsCount} />

            {noPipelineConfigured ? <PipelineDefaultState /> : null}

            {activePipelineStages.length > 0 ? (
              <PipelineKanbanBoard
                activePipelineStages={activePipelineStages}
                filteredItemsList={filteredItemsList} tasks={tasks}
                showAnalytics={showAnalytics}
                draggedLeadId={draggedLeadId} setDraggedLeadId={setDraggedLeadId}
                draggedOverStageId={draggedOverStageId} setDraggedOverStageId={setDraggedOverStageId}
                currentPipeline={currentPipeline} minimizedColumns={minimizedColumns} toggleColumn={toggleColumn}
                updateLead={updateLead} tempDropdownId={tempDropdownId} setTempDropdownId={setTempDropdownId}
                openDropdownId={openDropdownId} setOpenDropdownId={setOpenDropdownId}
                setSelectedLead={setSelectedLead} setIsModalOpen={setIsModalOpen}
                handleTransferToComercial={handleTransferToComercial} handleExportIAResume={handleExportIAResume}
                setWebhookModalLead={setWebhookModalLead} triggerCelebration={triggerCelebration}
                onReuniaoStageDrop={handleReuniaoStageDrop}
                onWinStageDrop={handleWinStageDrop}
              />
            ) : !noPipelineConfigured ? <PipelineEmptySelection /> : null}

          </>
        )}

        {view === "lista" && (
          <div ref={listaRef} style={{ height: listaHeight }} className="overflow-y-auto space-y-4 pr-1">
          <PipelineListaView
            listaLeads={listaLeads}
            temperatureFilter={temperatureFilter} setTemperatureFilter={setTemperatureFilter}
            sortOrder={sortOrder} setSortOrder={setSortOrder}
            setSelectedLead={setSelectedLead} updateLead={updateLead}
            sellers={sellers}
          />
          </div>
        )}
      </div>

      <NewLeadModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} firstComercialStageId={firstComercialStageId} firstSdrStageId={firstSdrStageId} />
      <LeadDetailsModal isOpen={!!selectedLead} onClose={() => setSelectedLead(null)} lead={selectedLead} />
      <WebhookModal webhookModalLead={webhookModalLead} setWebhookModalLead={setWebhookModalLead} webhookUrl={webhookUrl} setWebhookUrl={setWebhookUrl} />
      {agendarReuniaoLead && (
        <AgendarReuniaoModal
          isOpen={!!agendarReuniaoLead}
          onClose={() => setAgendarReuniaoLead(null)}
          lead={{ id: agendarReuniaoLead.id, name: agendarReuniaoLead.name, company: agendarReuniaoLead.company, email: agendarReuniaoLead.email, seller: agendarReuniaoLead.seller, clienteId: agendarReuniaoLead.clientId }}
          onConfirm={handleReuniaoConfirm}
        />
      )}
    </PageContainer>
  );
}
