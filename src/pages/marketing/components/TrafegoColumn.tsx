import { Droppable, Draggable } from "@hello-pangea/dnd";
import { Calendar, DollarSign } from "lucide-react";
import { Card } from "../../../components/ui/card";
import { useLocalization } from "../../../contexts/LocalizationContext";
import { cn } from "../../../lib/utils";
import type { Campanha } from "../useMarketingTrafego";

interface Coluna { id: string; title: string; color: string }

const COR_PRIORIDADE: Record<string, string> = {
  Alta: "bg-rose-500/10 text-rose-600 border-rose-500/20",
  Média: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  Baixa: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
};

/** Coluna do quadro de tráfego pago: etapa, orçamento somado e os cartões das campanhas. */
export function TrafegoColumn({ col, campanhas, onOpen }: { col: Coluna; campanhas: Campanha[]; onOpen: (c: Campanha) => void }) {
  const { formatCurrency } = useLocalization();
  const daColuna = campanhas.filter((c) => c.colId === col.id);
  const total = daColuna.reduce((s, c) => s + (c.value || 0), 0);

  return (
    <Droppable droppableId={col.id}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={cn(
            "min-w-[300px] w-[300px] shrink-0 flex flex-col max-h-full rounded-2xl border bg-[var(--color-surface-elevated)] transition-colors",
            snapshot.isDraggingOver ? "border-[var(--color-primary-blue)]/50 shadow-lg" : "border-[var(--color-border-default)]",
          )}
        >
          <div className="p-4 border-b border-[var(--color-border-subtle)] space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn("w-2 h-2 rounded-full shrink-0", col.color)} />
                <h3 className="text-[11px] font-black uppercase tracking-wider text-[var(--color-text-muted)] truncate">{col.title}</h3>
              </div>
              <span className="text-[10px] font-black text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] px-2 py-0.5 rounded-full shrink-0">{daColuna.length}</span>
            </div>
            <div className="flex items-center gap-1 text-[10px] font-bold text-[var(--color-primary-blue)]">
              <DollarSign className="w-3 h-3" /> {formatCurrency(total)} <span className="font-medium text-[var(--color-text-faint)]">em orçamento</span>
            </div>
          </div>

          <div className="p-3 flex-1 overflow-y-auto flex flex-col gap-2.5 min-h-[140px]">
            {daColuna.length === 0 && (
              <div className="flex-1 grid place-items-center border-2 border-dashed border-[var(--color-border-subtle)] rounded-xl min-h-[110px]">
                <p className="text-[10px] uppercase tracking-widest text-[var(--color-text-faint)] font-bold">Sem campanhas</p>
              </div>
            )}
            {daColuna.map((c, index) => (
              <Draggable key={c.id} draggableId={c.id} index={index}>
                {(drag, snap) => (
                  <div ref={drag.innerRef} {...drag.draggableProps} {...drag.dragHandleProps} onClick={() => onOpen(c)}>
                    <Card className={cn("p-3 space-y-2 cursor-pointer hover:border-[var(--color-primary-blue)]/50 transition-colors", snap.isDragging && "shadow-xl rotate-1")}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-bold text-[var(--color-text-primary)] leading-snug break-words">{c.title}</p>
                        <span className={cn("text-[9px] font-black uppercase px-1.5 py-0.5 rounded border shrink-0", COR_PRIORIDADE[c.priority])}>{c.priority}</span>
                      </div>
                      {c.desc && <p className="text-[11px] text-[var(--color-text-muted)] line-clamp-2">{c.desc}</p>}
                      <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
                        <span className="px-2 py-0.5 rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] truncate">{c.platform}</span>
                        <span className="font-mono text-[var(--color-text-primary)] shrink-0">{formatCurrency(c.value || 0)}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-[var(--color-text-faint)]">
                        <Calendar className="w-3 h-3" />
                        {c.publishDateISO
                          ? `Início ${c.date}${c.endDateISO ? ` · até ${c.endDateISO.split("-").reverse().slice(0, 2).join("/")}` : ""}`
                          : "Sem data de início"}
                      </div>
                    </Card>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        </div>
      )}
    </Droppable>
  );
}
