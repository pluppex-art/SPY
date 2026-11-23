import { Droppable, Draggable } from "@hello-pangea/dnd";
import { Calendar, CheckSquare, Clock, Plus, Target } from "lucide-react";
import { useLocalization } from "../../../contexts/LocalizationContext";
import { cn } from "../../../lib/utils";
import type { Campanha } from "../useMarketingTrafego";
import { calcularCronograma, hojeBrasilia, dataCurta, type TomCronograma } from "../trafegoCronograma";
import { corPlataforma, siglaPlataforma } from "../trafegoPlataforma";

export interface ColunaTrafego { id: string; title: string; color: string; hex: string }

export const iniciais = (nome: string) => nome.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "?";

export const COR_PRIORIDADE: Record<string, string> = {
  Alta: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  Média: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  Baixa: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

export const COR_TOM: Record<TomCronograma, string> = {
  neutro: "text-[var(--color-text-faint)]",
  info: "text-sky-600",
  ok: "text-emerald-600",
  alerta: "text-amber-600",
  perigo: "text-rose-600",
};

/** Coluna do quadro de tráfego pago (mesmo desenho da Central de Vendas): faixa colorida, orçamento da etapa e fatia do total. */
export function TrafegoColumn({ col, campanhas, todas, onOpen, onNova }: {
  col: ColunaTrafego; campanhas: Campanha[]; todas: Campanha[]; onOpen: (c: Campanha) => void; onNova: (colId: string) => void;
}) {
  const { formatCurrency } = useLocalization();
  const daColuna = campanhas.filter((c) => c.colId === col.id);
  const total = daColuna.reduce((s, c) => s + (c.value || 0), 0);
  const geral = todas.reduce((s, c) => s + (c.value || 0), 0);
  const pct = geral > 0 ? Math.round((total / geral) * 100) : 0;
  const hoje = hojeBrasilia();

  return (
    <Droppable droppableId={col.id}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          style={{ borderTopColor: snapshot.isDraggingOver ? undefined : col.hex }}
          className={cn(
            "shrink-0 w-[84vw] max-w-[320px] sm:w-[300px] flex flex-col max-h-full rounded-3xl border-2 border-t-4 bg-[var(--color-surface)]/40 p-3 transition-all duration-300",
            snapshot.isDraggingOver ? "border-[var(--color-primary-blue)]/60 bg-[var(--color-primary-blue)]/10" : "border-[var(--color-border-default)] hover:bg-[var(--color-surface-elevated)]/60",
          )}
        >
          <div className="mb-3 shrink-0 pb-2.5 border-b border-[var(--color-border-default)]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: col.hex }} />
                <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider truncate">{col.title}</h3>
              </div>
              <span className="text-[10px] font-bold text-[var(--color-text-primary)] bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] px-2 py-0.5 rounded-full shrink-0">{daColuna.length}</span>
            </div>
            <div className="flex items-center justify-between gap-2 mt-1.5">
              <span className="text-[10px] font-mono font-bold text-[var(--color-text-muted)] truncate">{formatCurrency(total)} <span className="font-sans font-medium text-[var(--color-text-faint)]">em orçamento</span></span>
              <span className="text-[10px] font-bold tabular-nums shrink-0" style={{ color: col.hex }} title={`${pct}% do orçamento total`}>{pct}%</span>
            </div>
            <div className="h-1 mt-1.5 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: col.hex }} />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 min-h-[120px] pb-3 scrollbar-none">
            {daColuna.map((c, index) => {
              const cron = calcularCronograma(c, hoje, col.id === "encerrada");
              const cor = corPlataforma(c.platform);
              return (
                <Draggable key={c.id} draggableId={c.id} index={index}>
                  {(drag, snap) => (
                    <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps} onClick={() => onOpen(c)}>
                      <div className={cn(
                        "rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-3 space-y-2.5 cursor-pointer transition-all hover:border-[var(--color-primary-blue)]/50 hover:shadow-md",
                        snap.isDragging && "shadow-xl rotate-1 border-[var(--color-primary-blue)]/60",
                      )}>
                        <div className="flex items-start gap-2.5">
                          <span className="w-8 h-8 rounded-lg grid place-items-center text-[10px] font-black shrink-0 select-none" style={{ backgroundColor: `${cor}1f`, color: cor }}>{siglaPlataforma(c.platform)}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-[var(--color-text-primary)] leading-snug break-words line-clamp-2">{c.title}</p>
                            <p className="text-[10px] text-[var(--color-text-faint)] font-semibold truncate">{c.platform}</p>
                          </div>
                          <span className={cn("text-[9px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0", COR_PRIORIDADE[c.priority])}>{c.priority}</span>
                        </div>
                        {c.desc && <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-2">{c.desc}</p>}
                        <div className="flex items-end justify-between gap-2">
                          <div>
                            <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--color-text-faint)]">Orçamento</div>
                            <div className="text-sm font-black font-mono text-[var(--color-primary-blue)] leading-tight">{formatCurrency(c.value || 0)}</div>
                          </div>
                          {cron.orcamentoPorDia !== null && (
                            <div className="text-right text-[10px] text-[var(--color-text-faint)] font-semibold">{formatCurrency(cron.orcamentoPorDia)}<span className="font-medium">/dia</span></div>
                          )}
                        </div>
                        {cron.progresso !== null && (
                          <div className="h-1 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden" title={`${cron.progresso}% do período`}>
                            <div className="h-full rounded-full" style={{ width: `${cron.progresso}%`, backgroundColor: col.hex }} />
                          </div>
                        )}
                        {c.objetivo && <p className="flex items-center gap-1 text-[10px] font-semibold text-[var(--color-text-muted)]"><Target className="w-3 h-3 shrink-0 text-[var(--color-text-faint)]" /><span className="truncate">{c.objetivo}</span></p>}
                        <div className="flex items-center justify-between gap-2 text-[10px] font-semibold">
                          <span className="flex items-center gap-1.5 min-w-0" title={c.responsavel ? `Responsável: ${c.responsavel}` : "Sem responsável"}>
                            <span className={cn("w-5 h-5 rounded-full grid place-items-center text-[8px] font-black shrink-0", c.responsavel ? "bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)]" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-faint)]")}>{iniciais(c.responsavel)}</span>
                            <span className="truncate text-[var(--color-text-muted)]">{c.responsavel ? c.responsavel.split(" ")[0] : "Sem responsável"}</span>
                          </span>
                          {c.checklist.length > 0 && (
                            <span className="flex items-center gap-1 text-[var(--color-text-faint)] shrink-0"><CheckSquare className="w-3 h-3" />{c.checklist.filter((i) => i.feito).length}/{c.checklist.length}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[10px] font-semibold pt-2 border-t border-[var(--color-border-subtle)]">
                          <span className="flex items-center gap-1 text-[var(--color-text-faint)] min-w-0">
                            <Calendar className="w-3 h-3 shrink-0" />
                            <span className="truncate">{c.publishDateISO ? `${dataCurta(c.publishDateISO).slice(0, 5)}${c.endDateISO ? ` → ${dataCurta(c.endDateISO).slice(0, 5)}` : ""}` : "Sem data"}</span>
                          </span>
                          <span className={cn("flex items-center gap-1 shrink-0", COR_TOM[cron.tom])}><Clock className="w-3 h-3" />{cron.rotulo}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </Draggable>
              );
            })}
            {provided.placeholder}
            <button
              type="button"
              onClick={() => onNova(col.id)}
              className={cn(
                "w-full py-2 border border-dashed border-[var(--color-border-default)] rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] transition-all flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer bg-transparent",
                daColuna.length === 0 && "min-h-[96px]",
              )}
            >
              <Plus className="w-3.5 h-3.5" /> {daColuna.length === 0 ? "Nova campanha aqui" : "Adicionar"}
            </button>
          </div>
        </div>
      )}
    </Droppable>
  );
}
