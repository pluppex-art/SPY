import React, { useMemo, useState } from "react";
import { prepararValor, valorDoLead } from "../../../../lib/valorDoLead";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { LeadCard } from "./LeadCard";
import { Task } from "../../../../types";
import { useData } from "../../../../contexts/DataContext";
import { useLocalization } from "../../../../contexts/LocalizationContext";

import { calculateLeadScore, normalizeText } from "../../../../lib/leadScore";
import { statusFromStageName, isLeadLost } from "../../../../lib/leadStatus";
import { MotivoModal } from "../../../../components/ui/MotivoModal";
import { MOTIVOS_PERDA_LEAD } from "../../../../lib/motivos";
import { useFillViewportHeight } from "../../../../hooks/useFillViewportHeight";
import { useAuth } from "../../../../contexts/AuthContext";
import { useMaxdataPage, useMaxdataStats, MAXDATA_TODAS } from "../../../../lib/useMaxdataPage";

/** Coluna só de consulta com TODA a base de clientes da Max Data (dezenas de milhares): busca do servidor, 40 por vez. */
function BaseClientesColuna() {
  const { activeTenantId } = useAuth();
  const [limite, setLimite] = useState(40);
  const stats = useMaxdataStats("maxdata_clientes", MAXDATA_TODAS, activeTenantId).stats;
  const lista = useMaxdataPage({ table: "maxdata_clientes", origem: MAXDATA_TODAS, tenantId: activeTenantId, term: "", page: 0, pageSize: limite, searchCols: ["name"], orderBy: "name" });
  const total = stats?.total ?? lista.total;
  if (!total) return null;
  return (
    <div className="shrink-0 snap-start flex flex-col bg-[var(--color-surface)]/40 border-2 border-t-4 border-[var(--color-border-default)] rounded-3xl h-full w-[84vw] max-w-[320px] sm:w-[280px] p-3" style={{ borderTopColor: "#64748b" }}>
      <div className="mb-3 shrink-0 pb-2.5 border-b border-[var(--color-border-default)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-2 h-2 rounded-full shrink-0 bg-slate-500" />
            <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider truncate">Base de clientes</h3>
          </div>
          <span className="text-[10px] font-bold text-[var(--color-text-primary)] bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] px-2 py-0.5 rounded-full shrink-0">{total.toLocaleString("pt-BR")}</span>
        </div>
        <p className="text-[10px] text-[var(--color-text-muted)] mt-1.5">Todos os clientes da Max Data (consulta)</p>
      </div>
      <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pb-3 scrollbar-none">
        {lista.rows.map((c: any) => (
          <div key={c.id} className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface)] p-2.5">
            <p className="text-xs font-semibold text-[var(--color-text-primary)] truncate">{c.name}</p>
            <p className="text-[10px] text-[var(--color-text-muted)] truncate">{[c.phone, c.email, c.city].filter(Boolean).join(" · ") || "Sem contato"}</p>
          </div>
        ))}
        {lista.loading && <p className="text-[10px] text-center text-[var(--color-text-muted)]">Carregando…</p>}
        {total > lista.rows.length && !lista.loading && (
          <button type="button" onClick={() => setLimite((n) => n + 100)} className="w-full py-2 border border-dashed border-[var(--color-border-default)] rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] text-xs font-bold cursor-pointer bg-transparent">
            Carregar mais ({(total - lista.rows.length).toLocaleString("pt-BR")})
          </button>
        )}
      </div>
    </div>
  );
}

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
  const CARDS_PAGE_SIZE = 100;
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
  // Regra única (src/lib/valorDoLead.ts): igual ao card e aos totais do topo.
  const ctxValor = useMemo(() => prepararValor(proposals as any[], products as any[]), [proposals, products]);
  const getLeadValue = (l: any) => valorDoLead(l, ctxValor).valor;

  // Ao soltar um lead em Perdido/Desqualificado, pergunta o motivo (pode pular).
  const [motivoLeadId, setMotivoLeadId] = useState<string | null>(null);

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

      if (isLeadLost(newStatus)) setMotivoLeadId(leadId);
      else if (targetLead?.lost_reason) updateLead(leadId, { lost_reason: null });

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

  // Totais do funil pra mostrar o peso de cada etapa em %. Leads "órfãos" entram na 1ª etapa
  // (ver acima), então somar sobre filteredItemsList bate com a soma das colunas.
  const totalLeadsCount = filteredItemsList.length;
  const totalLeadsValue = filteredItemsList.reduce((sum: number, l: any) => sum + getLeadValue(l), 0);
  const pctOf = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

  return (
    <div ref={fillRef} style={{ height: fillHeight }} className="flex gap-3 max-sm:min-h-[72dvh] overflow-x-auto overscroll-x-contain snap-x snap-mandatory sm:snap-none pb-0 min-h-[320px] scrollbar-none select-none items-stretch">
      {activePipelineStages.map((stage, stageIdx) => {
        const isMinimized = minimizedColumns.has(stage.id);
        const rawStageLeads = filteredItemsList.filter((l: any) => matchesStage(l, stage));
        if (stageIdx === 0) rawStageLeads.push(...unmatchedLeads);
        const stageLeads = sortByRecency(rawStageLeads, stageIdx === 0 ? createdKey : activityKey);
        const visibleCount = visibleCounts[stage.id] ?? CARDS_PAGE_SIZE;
        const visibleStageLeads = stageLeads.slice(0, visibleCount);
        const stageValue = stageLeads.reduce((sum: number, item: any) => sum + getLeadValue(item), 0);
        const stageValuePct = pctOf(stageValue, totalLeadsValue);

        return (
          <div
            key={stage.id}
            onDragOver={(e) => {
              e.preventDefault();
              setDraggedOverStageId(stage.id);
            }}
            onDragLeave={() => setDraggedOverStageId(null)}
            onDrop={(e) => handleDrop(stage, e)}
            style={{ borderTopColor: draggedOverStageId === stage.id ? undefined : stage.color }}
            className={`shrink-0 snap-start max-sm:[content-visibility:auto] max-sm:[contain-intrinsic-size:auto_320px_auto_72dvh] flex flex-col bg-[var(--color-surface)]/40 border-2 border-t-4 border-b-0 rounded-3xl rounded-b-none transition-all duration-300 h-full ${
              isMinimized ? "w-[56px] p-2" : "w-[84vw] max-w-[320px] sm:w-[280px] p-3"
            } ${draggedOverStageId === stage.id ? "border-[var(--color-primary-blue)]/60 bg-[var(--color-primary-blue)]/10 scale-[1.01]" : "border-[var(--color-border-default)] hover:bg-[var(--color-surface-elevated)]/60"}`}
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
                <div className="mb-3 shrink-0 pb-2.5 border-b border-[var(--color-border-default)]">
                  <div className="flex items-center justify-between gap-2">
                    <button type="button" onClick={() => toggleColumn(stage.id)} className="flex items-center gap-2 cursor-pointer group min-w-0">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: stage.color }} />
                      <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider group-hover:text-[var(--color-primary-blue)] transition-colors truncate">{stage.name}</h3>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] font-bold text-[var(--color-text-primary)] bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] px-2 py-0.5 rounded-full">{stageLeads.length}</span>
                      <button
                        type="button"
                        onClick={() => toggleColumn(stage.id)}
                        title="Recolher coluna"
                        aria-label={`Recolher a coluna ${stage.name}`}
                        className="grid place-items-center w-6 h-6 rounded-full text-[var(--color-text-faint)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] transition-colors cursor-pointer"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1.5">
                    <span className="text-[10px] font-mono font-bold text-[var(--color-text-muted)] truncate">{formatCurrency(stageValue)}</span>
                    <span
                      className="text-[10px] font-bold tabular-nums shrink-0"
                      style={{ color: stage.color }}
                      title={`${stageValuePct}% do valor do pipeline`}
                    >
                      {stageValuePct}%
                    </span>
                  </div>
                  <div className="h-1 mt-1.5 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${stageValuePct}%`, backgroundColor: stage.color }} />
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
      {(currentPipeline?.tipo === 'comercial' || currentPipeline?.id === 'comercial') && <BaseClientesColuna />}
      <MotivoModal
        isOpen={motivoLeadId !== null}
        title="Por que o lead foi perdido?"
        description="O motivo aparece na aba Ruptura da Central de Receita."
        opcoes={MOTIVOS_PERDA_LEAD}
        onConfirm={(motivo) => {
          if (motivo && motivoLeadId) updateLead(motivoLeadId, { lost_reason: motivo });
          setMotivoLeadId(null);
        }}
      />
    </div>
  );
}
