import { useState } from "react";
import { CalendarClock, Clock, Loader2, Play, User } from "lucide-react";
import { ImplementationProgressBar } from "./ImplementationProgressBar";
import { cn } from "../../lib/utils";

export interface KanbanImplRow {
  impl: any;
  cliente: any;
  progresso: { percent: number };
}
export interface KanbanWaitingRow {
  cliente: any;
  lead: any;
}
export interface KanbanColumnDef {
  id: string;
  label: string;
  /** Cor da bolinha/faixa da coluna — hex (etapa de funil) ou uma classe Tailwind já pronta (status legado). */
  dot: string;
  isHex?: boolean;
}

interface Props {
  linhas: KanbanImplRow[];
  aguardando: KanbanWaitingRow[];
  /** Colunas depois de "Aguardando início" — ou as etapas do funil de Implementação espelhado do
   * Pipeline (quando o tenant tem um configurado), ou os 4 status manuais de sempre (fallback). */
  columns: KanbanColumnDef[];
  /** Em qual coluna (de `columns`) uma implementação está hoje. */
  getColumnId: (impl: any) => string;
  iniciandoId: string | null;
  onOpen: (implId: string) => void;
  onStart: (cliente: any, lead?: any) => void;
  onMove: (impl: any, cliente: any, nextColumnId: string) => void;
}

const WAITING_ID = "__aguardando__";
const WAITING_COLUMN: KanbanColumnDef = { id: WAITING_ID, label: "Aguardando início", dot: "bg-slate-400" };

const initials = (name?: string) =>
  (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

const fmtDate = (d?: string | null) => (d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : null);

/** Visão Kanban das implementações: uma coluna por etapa/status (+ "Aguardando início" para
 * clientes que já fecharam). Arrastar um cartão para outra coluna move pra lá (etapa do funil
 * espelhado do Pipeline, ou status manual, dependendo do que o chamador configurou); arrastar um
 * cliente "aguardando início" para a 1ª coluna inicia a implementação. */
export function ImplementacoesKanban({ linhas, aguardando, columns, getColumnId, iniciandoId, onOpen, onStart, onMove }: Props) {
  const [drag, setDrag] = useState<{ kind: "impl" | "wait"; id: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const allColumns: KanbanColumnDef[] = [WAITING_COLUMN, ...columns];

  const canDrop = (colId: string) => {
    if (!drag) return false;
    if (colId === WAITING_ID) return false;
    if (drag.kind === "wait") return colId === columns[0]?.id;
    const row = linhas.find((l) => l.impl.id === drag.id);
    return !!row && getColumnId(row.impl) !== colId;
  };

  const handleDrop = (colId: string) => {
    const d = drag;
    setDrag(null); setOver(null);
    if (!d || !canDrop(colId)) return;
    if (d.kind === "wait") {
      const w = aguardando.find((x) => x.cliente.id === d.id);
      if (w) onStart(w.cliente, w.lead);
      return;
    }
    const row = linhas.find((l) => l.impl.id === d.id);
    if (row) onMove(row.impl, row.cliente, colId);
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1">
      {allColumns.map((col) => {
        const rows = col.id === WAITING_ID ? [] : linhas.filter((l) => getColumnId(l.impl) === col.id);
        const waiting = col.id === WAITING_ID ? aguardando : [];
        const count = col.id === WAITING_ID ? waiting.length : rows.length;
        const avg = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.progresso.percent, 0) / rows.length) : null;
        const highlight = over === col.id && canDrop(col.id);
        return (
          <div
            key={col.id}
            onDragOver={(e) => { if (canDrop(col.id)) { e.preventDefault(); setOver(col.id); } }}
            onDragLeave={() => setOver((o) => (o === col.id ? null : o))}
            onDrop={(e) => { e.preventDefault(); handleDrop(col.id); }}
            className={cn(
              "w-[300px] shrink-0 rounded-2xl border bg-[var(--color-surface-sunken)] p-2.5 flex flex-col gap-2.5 transition-colors",
              highlight ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/5" : "border-[var(--color-border-subtle)]",
            )}
          >
            <div className="flex items-center justify-between px-1.5 pt-1">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn("w-2.5 h-2.5 rounded-full shrink-0", !col.isHex && col.dot)}
                  style={col.isHex ? { backgroundColor: col.dot } : undefined}
                />
                <h3 className="text-[11px] font-black uppercase tracking-widest text-[var(--color-text-primary)] truncate">{col.label}</h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {avg !== null && <span className="text-[10px] font-semibold text-[var(--color-text-faint)] tabular-nums">{avg}%</span>}
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] tabular-nums">{count}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 min-h-[80px] max-h-[68vh] overflow-y-auto pr-0.5">
              {/* Clientes que fecharam e ainda não começaram */}
              {waiting.map(({ cliente, lead }) => (
                <div
                  key={cliente.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag({ kind: "wait", id: cliente.id }); }}
                  onDragEnd={() => { setDrag(null); setOver(null); }}
                  className={cn("relative rounded-2xl border border-dashed border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-3 pl-4 cursor-grab active:cursor-grabbing", drag?.id === cliente.id && "opacity-50")}
                >
                  <span className="absolute left-0 top-3 bottom-3 w-1 rounded-r-full bg-slate-400" />
                  <div className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-full bg-slate-500/10 text-slate-500 flex items-center justify-center text-[10px] font-black shrink-0">{initials(cliente.name)}</span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{cliente.name}</p>
                      <p className="text-[10px] text-[var(--color-text-faint)] truncate">{[lead?.name, lead?.value ? `Venda ${lead.value}` : null].filter(Boolean).join(" · ") || "Fechou — aguardando início"}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={iniciandoId === cliente.id}
                    onClick={() => onStart(cliente, lead)}
                    className="mt-2.5 w-full h-8 rounded-[var(--radius-control)] bg-[var(--color-primary-blue)] !text-white text-[11px] font-bold flex items-center justify-center gap-1.5 hover:brightness-110 disabled:opacity-60 cursor-pointer"
                  >
                    {iniciandoId === cliente.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />} Iniciar implementação
                  </button>
                </div>
              ))}

              {/* Implementações */}
              {rows.map(({ impl, cliente, progresso }) => {
                const late = impl.status !== "Concluída" && impl.go_live_date && impl.go_live_date < today;
                return (
                  <div
                    key={impl.id}
                    draggable
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDrag({ kind: "impl", id: impl.id }); }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}
                    onClick={() => onOpen(impl.id)}
                    className={cn(
                      "relative rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] shadow-[var(--shadow-control)] p-3 pl-4 cursor-grab active:cursor-grabbing hover:shadow-[var(--shadow-panel)] transition-shadow",
                      drag?.id === impl.id && "opacity-50",
                    )}
                  >
                    <span
                      className={cn("absolute left-0 top-3 bottom-3 w-1 rounded-r-full", !col.isHex && col.dot)}
                      style={col.isHex ? { backgroundColor: col.dot } : undefined}
                    />
                    <div className="flex items-center gap-2.5">
                      <span className="w-8 h-8 rounded-full bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center text-[10px] font-black shrink-0">{initials(cliente?.name)}</span>
                      <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{cliente?.name || "Cliente removido"}</p>
                    </div>
                    <div className="flex items-center gap-2.5 mt-3">
                      <ImplementationProgressBar percent={progresso.percent} />
                      <span className="text-[11px] font-semibold tabular-nums text-[var(--color-text-primary)] w-9 text-right">{progresso.percent}%</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2.5 text-[10px] text-[var(--color-text-muted)]">
                      <span className="flex items-center gap-1 truncate"><User className="w-3 h-3 shrink-0" /> {impl.responsavel || "Sem responsável"}</span>
                      {impl.go_live_date ? (
                        <span className={cn("flex items-center gap-1 shrink-0 font-mono", late && "text-rose-500 font-bold")}>
                          <CalendarClock className="w-3 h-3" /> {fmtDate(impl.go_live_date)}{late ? " · atrasada" : ""}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 shrink-0 text-[var(--color-text-faint)]"><Clock className="w-3 h-3" /> sem go-live</span>
                      )}
                    </div>
                  </div>
                );
              })}

              {count === 0 && (
                <div className="rounded-2xl border border-dashed border-[var(--color-border-default)] py-6 text-center text-[11px] text-[var(--color-text-faint)]">
                  {col.id === WAITING_ID ? "Nenhum cliente aguardando" : "Arraste um cartão para cá"}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
