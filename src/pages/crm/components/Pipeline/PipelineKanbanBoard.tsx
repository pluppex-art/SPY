import React, { useState } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { LeadCard } from "./LeadCard";
import { Task } from "../../../../types";
import { leadInterestEstimate } from "../../../../components/ui/lead-details/LeadDetailsModal.helpers";
import { useData } from "../../../../contexts/DataContext";
import { useLocalization } from "../../../../contexts/LocalizationContext";

import { parseCurrencyBR } from "../../../../lib/utils";
import { calculateLeadScore, normalizeText } from "../../../../lib/leadScore";
import { statusFromStageName } from "../../../../lib/leadStatus";
import { useFillViewportHeight } from "../../../../hooks/useFillViewportHeight";

interface PipelineKanbanBoardProps {
  activePipelineStages: any[];
  filteredItemsList: any[];
  tasks: Task[];
  showAnalytics?: boolean;
  draggedLeadId: string | null;
  setDraggedLeadId: (id: string | null) => void;
  draggedOverStageId: string | null;
  setDraggedOverStageId: (id: string | null) => void;
  currentPipeline: any;
  minimizedColumns: Set<string>;
  toggleColumn: (stageId: string) => void;
  updateLead: (id: string, updates: any) => void;
  tempDropdownId: string | null;
  setTempDropdownId: (id: string | null) => void;
  openDropdownId: string | null;
  setOpenDropdownId: (id: string | null) => void;
  setSelectedLead: (lead: any) => void;
  setIsModalOpen: (open: boolean) => void;
  handleTransferToComercial: (e: any, lead: any) => void;
  handleExportIAResume: (e: any, lead: any) => void;
  setWebhookModalLead: (lead: any) => void;
  triggerCelebration?: () => void;
  onReuniaoStageDrop?: (leadId: string, stage: any) => void;
  onWinStageDrop?: (leadId: string, stage: any) => void;
}

export function PipelineKanbanBoard({
  activePipelineStages,
  filteredItemsList,
  tasks,
  draggedLeadId,
  setDraggedLeadId,
  draggedOverStageId,
  setDraggedOverStageId,
  currentPipeline,
  minimizedColumns,
  toggleColumn,
  updateLead,
  tempDropdownId,
  setTempDropdownId,
  openDropdownId,
  setOpenDropdownId,
  setSelectedLead,
  setIsModalOpen,
  handleTransferToComercial,
  handleExportIAResume,
  setWebhookModalLead,
  triggerCelebration,
  onReuniaoStageDrop,
  onWinStageDrop,
}: PipelineKanbanBoardProps) {
  const { products, proposals } = useData();
  const { formatCurrency } = useLocalization();

  // Colunas com centenas de cards (base migrada tem +3 mil leads distribuídos
  // pelas etapas) deixavam o board muito pesado pra montar/arrastar. Os
  // totais/contadores de cada coluna continuam somando TODOS os leads da
  // etapa — só a quantidade de cards desenhados é limitada, com "carregar
  // mais" por coluna.
  const CARDS_PAGE_SIZE = 40;
  const [visibleCounts, setVisibleCounts] = useState<Record<string, number>>({});
  const showMore = (stageId: string) =>
    setVisibleCounts((prev) => ({ ...prev, [stageId]: (prev[stageId] ?? CARDS_PAGE_SIZE) + CARDS_PAGE_SIZE }));

  // Mesma regra do LeadCard: quando o lead tem produtos vinculados, o valor
  // exibido vem da soma dos preços dos produtos, não do campo value/valor —
  // ignorar isso aqui fazia o total da coluna mostrar R$ 0 com leads que já
  // exibiam valor (via produto) nos cards. Se não há productIds nem value mas
  // existe proposta vinculada (proposals.lead_id), usa o valor dela — mesmo
  // fallback do LeadCard, pro total da coluna bater com os cards.
  // `l.value` é a fonte de verdade (soma corretamente múltiplas propostas já
  // realizadas/aceitas pro mesmo lead) — só cai pra soma de preço de catálogo
  // dos produtos vinculados quando o lead genuinamente não tem valor nenhum
  // ainda (produto vinculado sem sincronização de valor completa).
  const getLeadValue = (l: any) => {
    // Sem proposta e com tags de interesse em uso: soma das tags (igual ao card).
    const interest = leadInterestEstimate(l, proposals as any[], products as any[]);
    if (interest !== null) return interest;
    const parsed = parseCurrencyBR(l.value ?? l.valor);
    if (parsed > 0) return parsed;
    // SEM fallback pro preço de catálogo dos productIds: um lead ganho por R$ 0 (proposta aceita
    // com valor 0) passava a contar o preço de tabela na coluna e o total da coluna deixava de
    // bater com o "Total de Ganhos" do topo (que soma só `value`) — ex.: R$ 18.943 x R$ 17.946.
    const linkedProposal = (proposals as any[] || [])
      .filter((p) => p.lead_id === l.id)
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
    return linkedProposal?.valor ? Number(linkedProposal.valor) || 0 : 0;
  };

  const handleDrop = (stage: any, e: React.DragEvent) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData("text/plain") || draggedLeadId;
    if (leadId) {
      const targetLead = filteredItemsList.find((l: any) => l.id === leadId);
      const newStatus = statusFromStageName(stage.name);
      const isWon = newStatus === "Fechado";

      // Recalcular Score IA do Lead considerando a nova etapa e as notas existentes do cliente
      const scoreCalculation = calculateLeadScore(
        targetLead ? { ...targetLead, stageId: stage.id, status: newStatus } : { stageId: stage.id, status: newStatus },
        stage,
        activePipelineStages
      );

      updateLead(leadId, {
        stageId: stage.id,
        status: newStatus,
        scoreIA: scoreCalculation.score,
        score_ia: scoreCalculation.score,
        temperature: scoreCalculation.rawTemperature,
        probability: scoreCalculation.probability,
      });

      if (isWon) {
        triggerCelebration?.();
        onWinStageDrop?.(leadId, stage);
      }

      // Abre o modal de nova reunião para todas as etapas que tenham a palavra "reunião" (ou "reuniao").
      // Expressamente NÃO abre para "diagnostico" (a menos que contenha a palavra reunião).
      const stageNameNorm = normalizeText(stage.name || "");
      const isReuniaoStage = stageNameNorm.includes("reuniao") || (stage.id && String(stage.id).toLowerCase().includes("reuniao"));

      if (isReuniaoStage && onReuniaoStageDrop) {
        onReuniaoStageDrop(leadId, stage);
      }
    }
    setDraggedOverStageId(null);
    setDraggedLeadId(null);
  };

  const matchesStage = (l: any, stage: any) =>
    String(l.stageId) === String(stage.id) ||
    String(l.stage) === String(stage.id) ||
    l.status === stage.id ||
    l.status === stage.name;

  // Leads cujo stageId não bate com NENHUMA coluna atual — acontece quando uma
  // etapa é reordenada/excluída em Configurações > CRM > Funis (os ids das etapas
  // são calculados pela posição no array, então leads que já estavam numa etapa
  // seguinte ficam com um stageId "órfão"), ou quando o lead pertence a outro funil
  // do mesmo tipo. Sem isso, esses leads desapareciam do Kanban mas continuavam
  // aparecendo no modo Lista (que não valida stageId), sumindo silenciosamente.
  const unmatchedLeads = filteredItemsList.filter(
    (l: any) => !activePipelineStages.some((stage) => matchesStage(l, stage))
  );

  // Ordem do card dentro da coluna: na 1ª etapa (entrada do funil — "Novo Lead" na maioria dos
  // funis) o mais recente é quem ACABOU DE CHEGAR, então ordena por data de criação; ali um
  // reprocessamento em massa (reimportação, sincronização de integração tocando muitos leads de
  // uma vez) não pode embaralhar quem chegou primeiro. Da 2ª etapa em diante o lead já está sendo
  // trabalhado, então o mais recente é quem teve a ÚLTIMA ATIVIDADE (updated_at, atualizado pelo
  // banco a cada mudança — mover de coluna, editar um campo, etc.), pra quem foi mexido por último
  // subir. Achado real (2026-09-27): um ajuste em massa nas tags de interesse de ~1150 leads
  // "Novo" carimbou o updated_at de todos com o mesmo instante, embaralhando a ordem de chegada
  // deles — por isso a 1ª etapa não pode depender de updated_at.
  const createdKey = (l: any): string => l.created_at ?? l.createdAt ?? "";
  const activityKey = (l: any): string => l.updated_at ?? l.updatedAt ?? l.created_at ?? l.createdAt ?? "";
  const sortByRecency = (list: any[], key: (l: any) => string) =>
    [...list].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      if (!ka && !kb) return 0;
      if (!ka) return -1;
      if (!kb) return 1;
      return kb > ka ? 1 : kb < ka ? -1 : 0;
    });

  const { ref: fillRef, height: fillHeight } = useFillViewportHeight<HTMLDivElement>(320);

  return (
    <div ref={fillRef} style={{ height: fillHeight }} className="flex gap-3 overflow-x-auto pb-4 min-h-[320px] scrollbar-none select-none items-stretch">
      {activePipelineStages.map((stage, stageIdx) => {
        const isMinimized = minimizedColumns.has(stage.id);
        const rawStageLeads = filteredItemsList.filter((l: any) => matchesStage(l, stage));
        if (stageIdx === 0) rawStageLeads.push(...unmatchedLeads);
        const stageLeads = sortByRecency(rawStageLeads, stageIdx === 0 ? createdKey : activityKey);
        const visibleCount = visibleCounts[stage.id] ?? CARDS_PAGE_SIZE;
        const visibleStageLeads = stageLeads.slice(0, visibleCount);

        return (
          <div
            key={stage.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDraggedOverStageId(stage.id);
            }}
            onDragLeave={() => setDraggedOverStageId(null)}
            onDrop={(e) => handleDrop(stage, e)}
            className={`shrink-0 flex flex-col bg-[var(--color-surface)]/40 border rounded-3xl transition-all duration-300 h-full ${
              isMinimized ? "w-[56px] p-2" : "w-[280px] p-3"
            } ${draggedOverStageId === stage.id ? "border-[var(--color-primary-blue)]/50 bg-[var(--color-primary-blue)]/10 scale-[1.01]" : "border-[var(--color-border-subtle)] hover:border-[var(--color-border-default)] hover:bg-[var(--color-surface-elevated)]/60"}`}
          >
            {isMinimized ? (
              <button
                type="button"
                onClick={() => toggleColumn(stage.id)}
                className="flex flex-col items-center gap-3 py-2 w-full cursor-pointer"
                title={`${stage.name} (${stageLeads.length})`}
              >
                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                <span
                  className="text-[9px] font-bold text-[var(--color-text-muted)] uppercase tracking-wider"
                  style={{ writingMode: "vertical-rl", textOrientation: "mixed", transform: "rotate(180deg)" }}
                >
                  {stage.name}
                </span>
                <span className="text-[10px] font-bold text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] px-1.5 py-0.5 rounded-full">{stageLeads.length}</span>
                <ChevronRight className="w-3 h-3 text-[var(--color-text-faint)] mt-auto" />
              </button>
            ) : (
              <>
                <div className="flex items-center justify-between gap-2 mb-3 shrink-0">
                  <button type="button" onClick={() => toggleColumn(stage.id)} className="flex items-center gap-2 cursor-pointer group min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                    <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider group-hover:text-[var(--color-primary-blue)] transition-colors truncate">{stage.name}</h3>
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] font-mono font-bold text-[var(--color-text-muted)]">
                      {formatCurrency(
                        stageLeads.reduce((sum: number, item: any) => sum + getLeadValue(item), 0)
                      )}
                    </span>
                    <span className="text-[10px] font-bold text-[var(--color-text-primary)] bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] px-2 py-0.5 rounded-full shrink-0">{stageLeads.length}</span>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pb-3 scrollbar-none">
                  {visibleStageLeads.map((item: any) => (
                    <div key={item.id}>
                      <LeadCard
                        item={item} tasks={tasks} stageName={stage.name} draggedLeadId={draggedLeadId} setDraggedLeadId={setDraggedLeadId}
                        updateLead={updateLead} tempDropdownId={tempDropdownId} setTempDropdownId={setTempDropdownId}
                        openDropdownId={openDropdownId} setOpenDropdownId={setOpenDropdownId}
                        setSelectedLead={setSelectedLead} handleTransferToComercial={handleTransferToComercial}
                        handleExportIAResume={handleExportIAResume} setWebhookModalLead={setWebhookModalLead}
                        currentPipeline={currentPipeline}
                      />
                    </div>
                  ))}
                  {stageLeads.length > visibleCount && (
                    <button
                      type="button"
                      onClick={() => showMore(stage.id)}
                      className="w-full py-2 border border-dashed border-[var(--color-border-default)] rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] transition-all text-xs font-bold cursor-pointer bg-transparent"
                    >
                      Carregar mais ({stageLeads.length - visibleCount})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(true)}
                    className="w-full py-2 border border-dashed border-[var(--color-border-default)] rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-default)]/80 hover:bg-[var(--color-surface-sunken)] transition-all flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer bg-transparent"
                  >
                    <Plus className="w-3.5 h-3.5" /> Novo Lead
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
