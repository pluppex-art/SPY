import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AgendarReuniaoModal } from "./modals/crm/AgendarReuniaoModal";
import { supabase } from "../../lib/supabase";
import { useLocalization } from "../../contexts/LocalizationContext";
import { Modal } from "./modal";
import { Phone, Activity, TrendingUp, AlertTriangle, CalendarClock } from "lucide-react";

import { LeadDetailsModalTabs } from "./lead-details/LeadDetailsModal.constants";
import { ReservasSection } from "./lead-details/ReservasSection";
import { LeadDetailsTempCfg } from "./lead-details/LeadDetailsModal.constants";
import { formatLeadValueBRL, leadInterestEstimate, safeParseTimeIdle, safeParseProbability } from "./lead-details/LeadDetailsModal.helpers";
import { findWonStage } from "../../lib/funilStages";
import { LeadDetailsModalFooter } from "./lead-details/LeadDetailsModal.Footer";
import { LeadDetailsModalHero } from "./lead-details/LeadDetailsModalHero";

import { useLeadDetails } from "./lead-details/useLeadDetails";
import { LeadCopilot } from "./LeadCopilot";
import { ProfileSection } from "./lead-details/ProfileSection";
import { TimelineSection } from "./lead-details/TimelineSection";
import { ProductsSection } from "./lead-details/ProductsSection";
import { LogsSection } from "./lead-details/LogsSection";
import { NotasSection } from "./lead-details/NotasSection";
import { TarefasSection } from "./lead-details/TarefasSection";
import { useData } from "../../contexts/DataContext";
import { toast } from "sonner";
import { calculateLeadScore } from "../../lib/leadScore";
import { cn } from "../../lib/utils";

interface LeadDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: any;
}

export function LeadDetailsModal({ isOpen, onClose, lead }: LeadDetailsModalProps) {
  const { updateLead, leadActivities, proposals, products, leads: allLeads } = useData();
  const { formatCurrency } = useLocalization();
  const navigate = useNavigate();
  const [currentTab, setCurrentTab] = useState("informacoes");
  const [showCopilot, setShowCopilot] = useState(false);
  const [showAgendarReuniao, setShowAgendarReuniao] = useState(false);

  const {
    isConfirmDeleteOpen, setIsConfirmDeleteOpen,
    customFieldsState, setCustomFieldsState,
    activityType, setActivityType,
    activityDesc, setActivityDesc,
    activityTitle, setActivityTitle,
    activityDate, setActivityDate,
    activityTime, setActivityTime,
    activityError, setActivityError,
    selectedFiles, setSelectedFiles,
    isEditingInline, setIsEditingInline,
    leadName, setLeadName,
    companyName, setCompanyName,
    phone, setPhone,
    cnpj, setCnpj,
    email, setEmail,
    title, setTitle,
    value, setValue,
    seller, setSeller,
    priority, setPriority,
    score,
    temperature,
    probability,
    slaStatus,
    timeIdle,
    customTags,
    newTagInput, setNewTagInput,
    alterationLogs, setAlterationLogs,
    handleAddTag,
    handleRemoveTag,
    handleConvertLead,
    handleRegisterActivity,
    handleSaveAll,
    handleConfirmDelete,
    availableProducts,
    handleUpdateScore,
    stagesDef,
    currentStageId, setCurrentStageId,
    tempColors,
    customLeadFields,
    enrollInLinkedTurmas,
  } = useLeadDetails(lead, onClose);

  useEffect(() => {
    setCurrentTab("informacoes");
    setShowCopilot(false);
  }, [lead?.id]);

  const handleReuniaoConfirm = async (reuniaoId: string, _meetLink: string) => {
    setShowAgendarReuniao(false);
    let targetStageId = "1";
    if (supabase) {
      try {
        const { data } = await supabase
          .from("app_settings")
          .select("value")
          .eq("key", "axis_reuniao_config")
          .maybeSingle();
        if (data?.value) {
          const cfg = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
          if (cfg?.promotionStageId) targetStageId = cfg.promotionStageId;
        }
      } catch {}
    }
    updateLead(lead.id, { pipelineId: "comercial", stageId: targetStageId });
    toast.success("Lead promovido para o funil Comercial!");
    navigate("/app/reunioes/" + reuniaoId);
  };

  // Histórico de reservas (sincronizado via API de integrações, ex.: to na
  // pista) só existe pra leads originados desse fluxo — a aba fica escondida
  // pros demais, pra não poluir a tela de tenants de outros ramos.
  const reservationsHistory: any[] = Array.isArray(lead?.customFields?.reservationsHistory)
    ? lead.customFields.reservationsHistory
    : [];
  const tabsToShow = reservationsHistory.length > 0
    ? [
        ...LeadDetailsModalTabs.slice(0, 1),
        { id: "reservas", label: "Reservas", short: "RESERVAS", icon: CalendarClock } as const,
        ...LeadDetailsModalTabs.slice(1),
      ]
    : LeadDetailsModalTabs;

  if (!lead) return null;

  const leadActs = leadActivities.filter((a: any) => a.leadId === lead.id);
  const timeIdleNum = safeParseTimeIdle(timeIdle);
  const probNum = safeParseProbability(probability);

  const tc = LeadDetailsTempCfg[temperature as keyof typeof LeadDetailsTempCfg] || LeadDetailsTempCfg.Frio;
  // BUG real (achado em produção 2026-09-21): preferia a soma do preço ATUAL de catálogo dos
  // produtos vinculados em vez de lead.value — ignorava quantidade/desconto/valor realmente
  // fechado (mesmo bug corrigido no "Total de Ganhos" do Pipeline, ver usePipeline.ts).
  // lead.value já é a fonte de verdade, sincronizada com a proposta aceita.
  // `lead` chega por prop (um retrato de quando o modal abriu) — marcar/desmarcar produto de
  // interesse muda o lead no contexto, então o valor do cabeçalho lê a versão AO VIVO de lá.
  const liveLead = (allLeads as any[]).find((l: any) => l.id === lead.id) ?? lead;
  const interestEstimate = leadInterestEstimate(liveLead, proposals as any[], products as any[]);
  const formattedValue = interestEstimate !== null
    ? formatCurrency(interestEstimate)
    : formatLeadValueBRL(liveLead?.value ?? value, formatCurrency);
  const initials = ((companyName || leadName || "LD").substring(0, 2)).toUpperCase();

  const moveToStage = (stg: any) => {
    setCurrentStageId(stg.id);
    const newStatus = stg.status || ((stg.name || "").toLowerCase().includes("ganho") || (stg.name || "").toLowerCase().includes("fechado") ? "Fechado" : (stg.name || "").toLowerCase().includes("perdid") ? "Perdido" : "Em Aberto");
    updateLead(lead.id, { stageId: stg.id, status: newStatus });

    // Recalcular Score IA do Lead considerando a nova etapa e anotações
    const evalResult = calculateLeadScore(
      { ...lead, stageId: stg.id, status: newStatus },
      stg,
      stagesDef
    );
    handleUpdateScore(evalResult.score, evalResult.temperature);

    setAlterationLogs((prev: any[]) => [
      { id: Date.now().toString(), author: seller || "Sistema", desc: `Moveu para '${stg.name}' (Score IA: ${evalResult.score}/100)`, time: "Agora" },
      ...prev,
    ]);
    if ((stg.name || "").toLowerCase().includes("reuni")) {
      setShowAgendarReuniao(true);
      return;
    }
    toast.success(`Etapa: ${stg.name}`);
    if (newStatus === "Fechado" || stg.id === findWonStage(stagesDef)?.id) {
      enrollInLinkedTurmas();
    }
  };

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        maxWidth="max-w-[546px]"
        position="right"
        overlay="light"
        noPadding
        footer={
          <LeadDetailsModalFooter
            isEditingInline={isEditingInline}
            setIsEditingInline={setIsEditingInline}
            handleSaveAll={handleSaveAll}
            isConfirmDeleteOpen={isConfirmDeleteOpen}
            setIsConfirmDeleteOpen={setIsConfirmDeleteOpen}
            onClose={onClose}
            onConfirmDelete={handleConfirmDelete}
            companyName={companyName}
            leadName={leadName}
          />
        }
      >
        {/* `key={lead.id}` força um remount leve deste bloco ao trocar de lead
            direto pelo Pipeline (painel já é uma instância única, só o `lead`
            muda) — dá o "atualiza visualmente" pedido em vez de um corte seco,
            sem fechar/reabrir o painel nem empilhar nada por cima. */}
        <div key={lead.id} className="flex flex-col h-full overflow-hidden bg-[var(--color-surface)] animate-in fade-in duration-150">
          <LeadDetailsModalHero
            tc={tc}
            initials={initials}
            companyName={companyName}
            leadName={leadName}
            formattedValue={formattedValue}
            priority={priority}
            slaStatus={slaStatus}
            stagesDef={stagesDef}
            currentStageId={currentStageId}
            lead={lead}
            seller={seller}
            setAlterationLogs={setAlterationLogs}
            updateLead={updateLead}
            showCopilot={showCopilot}
            setShowCopilot={setShowCopilot}
            onClose={onClose}
            moveToStage={moveToStage}
            onAgendarReuniao={() => setShowAgendarReuniao(true)}
          />

          {/* ── Tab bar ── */}
          <div className="flex border-b border-[var(--color-border-subtle)] overflow-x-auto scrollbar-none shrink-0 bg-[var(--color-surface-elevated)] px-2 pt-1.5 gap-1">
            {tabsToShow.map((tab) => {
              const isActive = currentTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setCurrentTab(tab.id)}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-1 pt-2 pb-2.5 px-3 text-[9px] font-black tracking-wider whitespace-nowrap transition-all shrink-0 cursor-pointer min-w-[64px] rounded-t-lg",
                    isActive
                      ? "text-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10 font-bold"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
                  )}
                >
                  <tab.icon className={cn("w-3.5 h-3.5 transition-all", isActive ? "scale-110 text-[var(--color-primary-blue)]" : "text-[var(--color-text-faint)]")} />
                  <span>{tab.short}</span>
                  {isActive && (
                    <div className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full bg-[var(--color-primary-blue)]" />
                  )}
                </button>
              );
            })}
          </div>

          {/* ── Tab content ── */}
          <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin scrollbar-thumb-[var(--color-border-default)] scrollbar-track-transparent">
              <div className="h-full">
                {currentTab === "informacoes" && (
                  <div className="px-5 py-4 space-y-3">
                    <ProfileSection
                      lead={lead}
                      companyName={companyName}    setCompanyName={setCompanyName}
                      leadName={leadName}          setLeadName={setLeadName}
                      phone={phone}                setPhone={setPhone}
                      cnpj={cnpj}                  setCnpj={setCnpj}
                      email={email}                setEmail={setEmail}
                      title={title}                setTitle={setTitle}
                      value={value}                setValue={setValue}
                      seller={seller}              setSeller={setSeller}
                      priority={priority}          setPriority={setPriority}
                      score={score}
                      temperature={temperature}
                      probability={probability}
                      slaStatus={slaStatus}
                      timeIdle={timeIdle}
                      customTags={customTags}
                      newTagInput={newTagInput}    setNewTagInput={setNewTagInput}
                      isEditingInline={isEditingInline}
                      setIsEditingInline={setIsEditingInline}
                      tempColors={tempColors}
                      customLeadFields={customLeadFields}
                      customFieldsState={customFieldsState}
                      setCustomFieldsState={setCustomFieldsState}
                      handleAddTag={handleAddTag}
                      handleRemoveTag={handleRemoveTag}
                      handleConvertLead={handleConvertLead}
                      setAlterationLogs={setAlterationLogs}
                      updateLead={updateLead}
                    />

                    {/* Stats compactas */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex items-center gap-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] rounded-xl px-3 py-2.5">
                        <div className="w-6 h-6 rounded-lg bg-[var(--color-primary-blue)]/10 flex items-center justify-center shrink-0">
                          <Activity className="w-3 h-3 text-[var(--color-primary-blue)]" />
                        </div>
                        <div>
                          <div className="text-sm font-black text-[var(--color-text-primary)] tabular-nums leading-none">{leadActs.length}</div>
                          <div className="text-[8px] font-bold text-[var(--color-text-faint)] uppercase tracking-wider mt-0.5">Interações</div>
                        </div>
                      </div>

                      <div className={cn(
                        "flex items-center gap-2 rounded-xl px-3 py-2.5 border",
                        timeIdleNum > 7 ? "bg-danger/[0.08] border-danger/20"
                        : timeIdleNum > 3 ? "bg-warning/[0.08] border-warning/15"
                        : "bg-[var(--color-surface-elevated)] border-[var(--color-border-subtle)]"
                      )}>
                        <div className={cn(
                          "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                          timeIdleNum > 7 ? "bg-danger/15" : timeIdleNum > 3 ? "bg-warning/15" : "bg-[var(--color-surface-sunken)]"
                        )}>
                          {timeIdleNum > 7
                            ? <AlertTriangle className="w-3 h-3 text-danger animate-pulse" />
                            : <Phone className={cn("w-3 h-3", timeIdleNum > 3 ? "text-warning" : "text-[var(--color-text-faint)]")} />
                          }
                        </div>
                        <div>
                          <div className={cn(
                            "text-sm font-black tabular-nums leading-none",
                            timeIdleNum > 7 ? "text-danger" : timeIdleNum > 3 ? "text-warning" : "text-[var(--color-text-primary)]"
                          )}>
                            {timeIdleNum}<span className="text-[10px]">d</span>
                          </div>
                          <div className="text-[8px] font-bold text-[var(--color-text-faint)] uppercase tracking-wider mt-0.5">Sem Contato</div>
                        </div>
                      </div>

                      <div className={cn(
                        "flex items-center gap-2 rounded-xl px-3 py-2.5 border",
                        probNum >= 70 ? "bg-success/[0.08] border-success/20"
                        : probNum >= 40 ? "bg-warning/[0.08] border-warning/15"
                        : "bg-[var(--color-surface-elevated)] border-[var(--color-border-subtle)]"
                      )}>
                        <div className={cn(
                          "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                          probNum >= 70 ? "bg-success/15" : probNum >= 40 ? "bg-warning/15" : "bg-[var(--color-surface-sunken)]"
                        )}>
                          <TrendingUp className={cn(
                            "w-3 h-3",
                            probNum >= 70 ? "text-success" : probNum >= 40 ? "text-warning" : "text-[var(--color-text-faint)]"
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={cn(
                            "text-sm font-black tabular-nums leading-none",
                            probNum >= 70 ? "text-success" : probNum >= 40 ? "text-warning" : "text-[var(--color-text-primary)]"
                          )}>
                            {probNum}<span className="text-[10px]">%</span>
                          </div>
                          <div className="mt-1 h-[2px] bg-[var(--color-border-subtle)] rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all duration-700",
                                probNum >= 70 ? "bg-success" : probNum >= 40 ? "bg-warning" : "bg-[var(--color-border-default)]"
                              )}
                              style={{ width: `${probNum}%` }}
                            />
                          </div>
                          <div className="text-[8px] font-bold text-[var(--color-text-faint)] uppercase tracking-wider mt-0.5">Prob. Ganho</div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {currentTab === "reservas" && (
                  <ReservasSection lead={lead} />
                )}

                {currentTab === "notas" && (
                  <NotasSection
                    lead={lead}
                    leadName={leadName}
                    companyName={companyName}
                    updateLead={updateLead}
                    score={score}
                    temperature={temperature}
                    probability={probability}
                    handleUpdateScore={handleUpdateScore}
                    seller={seller}
                    setAlterationLogs={setAlterationLogs}
                  />
                )}

                {currentTab === "tarefas" && (
                  <TarefasSection
                    lead={lead}
                    leadName={leadName}
                    seller={seller}
                  />
                )}

                {currentTab === "historico" && (
                  <div className="px-5 py-4">
                    <TimelineSection
                      lead={lead}
                      leadActivities={leadActivities}
                      activityType={activityType}        setActivityType={setActivityType}
                      activityTitle={activityTitle}      setActivityTitle={setActivityTitle}
                      activityDate={activityDate}        setActivityDate={setActivityDate}
                      activityTime={activityTime}        setActivityTime={setActivityTime}
                      activityDesc={activityDesc}        setActivityDesc={setActivityDesc}
                      activityError={activityError}      setActivityError={setActivityError}
                      selectedFiles={selectedFiles}      setSelectedFiles={setSelectedFiles}
                      handleRegisterActivity={handleRegisterActivity}
                      seller={seller}
                    />
                  </div>
                )}

                {currentTab === "produtos" && (
                  <div className="px-5 py-4">
                    <ProductsSection
                      availableProducts={availableProducts}
                      seller={seller}
                      setAlterationLogs={setAlterationLogs}
                      leadName={leadName}
                      companyName={companyName}
                      leadId={lead.id}
                    />
                  </div>
                )}

                {currentTab === "logs" && (
                  <div className="px-5 py-4">
                    <LogsSection alterationLogs={alterationLogs} />
                  </div>
                )}
              </div>
            </div>
          </div>
      </Modal>

      {lead && (
        <AgendarReuniaoModal
          isOpen={showAgendarReuniao}
          onClose={() => setShowAgendarReuniao(false)}
          lead={{ id: lead.id, name: leadName, company: companyName, email: email, seller, clienteId: lead.clientId }}
          onConfirm={handleReuniaoConfirm}
        />
      )}

      {showCopilot && (
        <div className="fixed top-0 bottom-0 right-[546px] w-[300px] z-[110] bg-[var(--color-surface)] border-r border-[var(--color-border-subtle)] overflow-hidden shadow-2xl rounded-l-2xl animate-in slide-in-from-right-10 duration-200 flex flex-col">
          <LeadCopilot
            onClose={() => setShowCopilot(false)}
            leadContext={{
              name: leadName,
              company: companyName,
              iaSummary: lead.iaSummary,
              scoreIA: lead.scoreIA,
              temperature: lead.temperature,
              lead_interesse: lead.lead_interesse_cliente,
              stage: lead.stageId,
              product: lead.productIds?.join(", "),
            }}
          />
        </div>
      )}
    </>
  );
}
