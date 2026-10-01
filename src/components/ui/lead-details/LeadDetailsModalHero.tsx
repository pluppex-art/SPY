import React from "react";
import { Trophy, ThumbsDown, X, Brain, ChevronRight, User, Check, CalendarPlus } from "lucide-react";
import { cn } from "../../../lib/utils";
import { toast } from "sonner";

interface LeadDetailsModalHeroProps {
  tc: {
    stripe: string;
    hero: string;
    avatar: string;
    badge: string;
    icon: React.ElementType;
    label: string;
  };
  initials: string;
  companyName: string;
  leadName: string;
  formattedValue: string;
  priority: string;
  slaStatus: string;
  stagesDef: any[];
  currentStageId: string;
  lead: any;
  seller: string;
  setAlterationLogs: React.Dispatch<React.SetStateAction<any[]>>;
  updateLead: (id: string, data: any) => void;
  showCopilot: boolean;
  setShowCopilot: (v: boolean) => void;
  onClose: () => void;
  moveToStage: (stg: any) => void;
  onAgendarReuniao?: () => void;
}

export function LeadDetailsModalHero({
  tc,
  initials,
  companyName,
  leadName,
  formattedValue,
  priority,
  slaStatus,
  stagesDef,
  currentStageId,
  lead,
  seller,
  setAlterationLogs,
  updateLead,
  showCopilot,
  setShowCopilot,
  onClose,
  moveToStage,
  onAgendarReuniao,
}: LeadDetailsModalHeroProps) {
  const TempIcon = tc.icon;
  const currentStageIdx = stagesDef.findIndex((s) => s.id === currentStageId);

  return (
    <>
      {/* Top indicator stripe */}
      <div className={`h-[3px] shrink-0 bg-gradient-to-r ${tc.stripe}`} />

      <div className="relative shrink-0 bg-[var(--color-surface-elevated)] border-b border-[var(--color-border-default)] overflow-hidden">
        {/* Top action bar */}
        <div className="relative flex items-center justify-between px-5 pt-3.5 pb-2.5">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const lastStage = stagesDef[stagesDef.length - 1];
                updateLead(lead.id, {
                  stageId: lastStage?.id ?? "5",
                  status: "Fechado",
                  scoreIA: 100,
                  score_ia: 100,
                  temperature: "quente",
                });
                toast.success("Lead fechado como GANHO! 🏆");
                setAlterationLogs((prev) => [
                  { id: Date.now().toString(), author: seller || "Sistema", desc: "MARCOU COMO GANHO (Score IA: 100)", time: "Agora" },
                  ...prev,
                ]);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-control)] border border-success/30 bg-success/10 hover:bg-success/20 text-success text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
            >
              <Trophy className="w-3 h-3" /> Ganho
            </button>
            <button
              onClick={() => {
                updateLead(lead.id, {
                  status: "Perdido",
                  scoreIA: 10,
                  score_ia: 10,
                  temperature: "frio",
                });
                toast.warning("Lead marcado como Perdido.");
                setAlterationLogs((prev) => [
                  { id: Date.now().toString(), author: seller || "Sistema", desc: "MARCOU COMO PERDIDO (Score IA: 10)", time: "Agora" },
                  ...prev,
                ]);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-control)] border border-danger/30 bg-danger/10 hover:bg-danger/20 text-danger text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
            >
              <ThumbsDown className="w-3 h-3" /> Perdido
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {onAgendarReuniao && (
              <button
                type="button"
                onClick={onAgendarReuniao}
                title="Agendar Reunião"
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--radius-control)] border border-[var(--color-primary-blue)]/30 bg-[var(--color-primary-blue)]/10 hover:bg-[var(--color-primary-blue)]/20 text-[var(--color-primary-blue)] text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
              >
                <CalendarPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reunião</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowCopilot(!showCopilot)}
              title="IA Copilot"
              className={cn(
                "p-1.5 rounded-[var(--radius-control)] border transition-all cursor-pointer",
                showCopilot
                  ? "bg-[var(--color-primary-blue)]/20 border-[var(--color-primary-blue)]/40 text-[var(--color-primary-blue)] shadow-sm"
                  : "border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-primary-blue)] hover:border-[var(--color-primary-blue)]/30 hover:bg-[var(--color-primary-blue)]/10"
              )}
            >
              <Brain className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-elevated)] hover:border-[var(--color-border-default)] rounded-[var(--radius-control)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lead Identity Summary */}
        <div className="relative flex items-center gap-3.5 px-5 pb-3.5">
          <div
            className={cn(
              "w-12 h-12 rounded-xl flex items-center justify-center text-lg font-black shrink-0 select-none",
              tc.avatar
            )}
          >
            {initials}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-black text-[var(--color-text-primary)] truncate leading-tight">
                {companyName || leadName || <span className="text-[var(--color-text-faint)] italic font-normal text-sm">Sem nome cadastrado</span>}
              </h2>
              <span className={cn(
                "inline-flex items-center gap-1 text-[9px] font-black px-2 py-0.5 rounded-full border uppercase tracking-wider shrink-0",
                tc.badge
              )}>
                <TempIcon className="w-2.5 h-2.5" />
                {tc.label}
              </span>
            </div>

            {companyName && leadName && (
              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 flex items-center gap-1 truncate">
                <User className="w-3 h-3 shrink-0 text-[var(--color-text-faint)]" />
                <span>{leadName}</span>
              </p>
            )}

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-sm font-black text-[var(--color-primary-blue)] font-mono tracking-tight">
                {formattedValue}
              </span>
              <div className="w-px h-3 bg-[var(--color-border-default)] shrink-0" />
              <span className={cn(
                "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                priority === "Alta"
                  ? "bg-danger/10 border-danger/20 text-danger"
                  : priority === "Média"
                  ? "bg-warning/10 border-warning/20 text-warning"
                  : "bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] text-[var(--color-text-muted)]"
              )}>
                ▲ {priority}
              </span>
              {slaStatus && (
                <span className={cn(
                  "text-[10px] font-bold px-2 py-0.5 rounded-full border",
                  slaStatus === "Em Dia"
                    ? "bg-success/10 border-success/20 text-success"
                    : slaStatus === "Crítico"
                    ? "bg-warning/10 border-warning/20 text-warning"
                    : "bg-danger/10 border-danger/20 text-danger"
                )}>
                  SLA · {slaStatus}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stage stepper */}
        <div className="relative px-5 pb-3.5 overflow-x-auto scrollbar-none border-t border-[var(--color-border-subtle)] pt-2.5">
          <div className="flex items-center min-w-max">
            {stagesDef.map((stg: any, idx: number) => {
              const isActive = currentStageId === stg.id;
              const isPast = currentStageIdx > idx;
              const isLast = idx === stagesDef.length - 1;
              return (
                <React.Fragment key={stg.id}>
                  <button
                    onClick={() => moveToStage(stg)}
                    className={cn(
                      "flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--radius-control)] text-[10px] font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer border",
                      isActive
                        ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/30 font-black shadow-sm"
                        : isPast
                        ? "text-success border-transparent hover:border-[var(--color-border-default)] hover:bg-[var(--color-surface-sunken)]"
                        : "text-[var(--color-text-muted)] border-transparent hover:text-[var(--color-text-primary)] hover:border-[var(--color-border-default)] hover:bg-[var(--color-surface-sunken)]"
                    )}
                  >
                    {isActive && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary-blue)] animate-pulse shrink-0" />
                    )}
                    {isPast && (
                      <span className="w-3.5 h-3.5 rounded-full bg-success/15 flex items-center justify-center shrink-0">
                        <Check className="w-2 h-2 text-success" />
                      </span>
                    )}
                    {stg.name}
                  </button>
                  {!isLast && (
                    <ChevronRight className="w-3 h-3 text-[var(--color-text-faint)] shrink-0 mx-0.5" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
