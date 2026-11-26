import { useState } from "react";
import { Clock, Plus } from "lucide-react";
import { KANBAN_COR_DOT } from "../../../hooks/useKanbanConfig";
import { useFillViewportHeight } from "../../../hooks/useFillViewportHeight";
import { iniciais } from "../../marketing/components/TrafegoColumn";
import { useLocalization } from "../../../contexts/LocalizationContext";
import { osCode, isOsLocked } from "../../../lib/ordemServico";
import { cn } from "../../../lib/utils";
import { OS_PRIORIDADES, osEmAberto, type OrdemServico, type OsPrioridade } from "../osTypes";

export interface OsBoardColuna {
  id: string;
  nome: string;
  cor: string;
}

interface Props {
  colunas: OsBoardColuna[];
  ordens: OrdemServico[];
  /** Em que coluna cada OS aparece (etapa do funil ou status). */
  colunaDe: (o: OrdemServico) => string | null;
  departamentoNome?: (o: OrdemServico) => string | undefined;
  onOpen: (o: OrdemServico) => void;
  onMover: (o: OrdemServico, colunaId: string) => void;
  onNova: () => void;
}

export function PrioridadeBadge({ p }: { p: OsPrioridade }) {
  const cfg = OS_PRIORIDADES.find(x => x.id === p) ?? OS_PRIORIDADES[1];
  return (
    <span className={cn("shrink-0 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-md border", cfg.style)}>
      {cfg.label}
    </span>
  );
}

export function prazoInfo(o: OrdemServico) {
  if (!o.prazo) return null;
  const hoje = new Date().toISOString().slice(0, 10);
  return {
    texto: new Date(o.prazo + "T12:00:00").toLocaleDateString("pt-BR"),
    atrasada: osEmAberto(o) && o.prazo < hoje,
  };
}

export function OsBoard({ colunas, ordens, colunaDe, departamentoNome, onOpen, onMover, onNova }: Props) {
  const { formatCurrency } = useLocalization();
  const { ref: fillRef, height: fillHeight } = useFillViewportHeight<HTMLDivElement>(320);
  const [arrastando, setArrastando] = useState<OrdemServico | null>(null);
  const [alvo, setAlvo] = useState<string | null>(null);

  const soltar = (colId: string) => {
    const o = arrastando;
    setArrastando(null);
    setAlvo(null);
    if (o) onMover(o, colId);
  };

  // Coluna "órfã": a OS tem uma etapa que não existe mais nesse funil (ex.: outra aba
  // excluiu a etapa entre o carregamento e o drag, ver useOS.updateFunil) — sem isso
  // o cartão simplesmente sumia do board, igual ao bug já corrigido no Pipeline do CRM
  // (ver PipelineKanbanBoard "unmatchedLeads"). Cai na 1ª coluna em vez de desaparecer.
  const colunaIds = new Set(colunas.map(c => c.id));

  const totalGeral = ordens.reduce((s, o) => s + o.valorTotal, 0);

  return (
    <div ref={fillRef} style={{ height: fillHeight }} className="flex gap-3 max-sm:min-h-[72dvh] min-h-[320px] overflow-x-auto overscroll-x-contain snap-x snap-mandatory sm:snap-none scrollbar-none items-stretch">
      {colunas.map((col, colIdx) => {
        const cards = ordens.filter(o => {
          const alvo = colunaDe(o);
          if (alvo === col.id) return true;
          return colIdx === 0 && (alvo === null || !colunaIds.has(alvo));
        });
        const total = cards.reduce((s, o) => s + o.valorTotal, 0);
        const pct = totalGeral > 0 ? Math.round((total / totalGeral) * 100) : 0;
        const hex = KANBAN_COR_DOT[col.cor] ?? "#64748b";
        return (
          <div
            key={col.id}
            onDragOver={e => { e.preventDefault(); setAlvo(col.id); }}
            onDragLeave={() => setAlvo(a => (a === col.id ? null : a))}
            onDrop={() => soltar(col.id)}
            style={{ borderTopColor: alvo === col.id ? undefined : hex }}
            className={cn(
              "shrink-0 snap-start w-[84vw] max-w-[320px] sm:w-[280px] h-full flex flex-col rounded-3xl rounded-b-none border-2 border-t-4 border-b-0 p-3 transition-all duration-300",
              alvo === col.id
                ? "border-[var(--color-primary-blue)]/60 bg-[var(--color-primary-blue)]/10"
                : "border-[var(--color-border-default)] bg-[var(--color-surface)]/40 hover:bg-[var(--color-surface-elevated)]/60",
            )}
          >
            <div className="mb-3 shrink-0 pb-2.5 border-b border-[var(--color-border-default)]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: hex }} />
                  <h3 className="text-xs font-bold text-[var(--color-text-primary)] uppercase tracking-wider truncate">{col.nome}</h3>
                </div>
                <span className="text-[10px] font-bold text-[var(--color-text-primary)] bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] px-2 py-0.5 rounded-full shrink-0">{cards.length}</span>
              </div>
              <div className="flex items-center justify-between gap-2 mt-1.5">
                <span className="text-[10px] font-mono font-bold text-[var(--color-text-muted)] truncate">{formatCurrency(total)}</span>
                <span className="text-[10px] font-bold tabular-nums shrink-0" style={{ color: hex }} title={`${pct}% do valor do quadro`}>{pct}%</span>
              </div>
              <div className="h-1 mt-1.5 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: hex }} />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pb-3 scrollbar-none">
              {cards.map(o => {
                const prazo = prazoInfo(o);
                const travada = isOsLocked(o.status);
                const dep = departamentoNome?.(o);
                const resp = o.responsavelNome;
                return (
                  <div
                    key={o.id}
                    draggable={!travada}
                    onDragStart={e => { e.dataTransfer.setData("text/plain", o.id); e.dataTransfer.effectAllowed = "move"; setArrastando(o); }}
                    onDragEnd={() => { setArrastando(null); setAlvo(null); }}
                    onClick={() => onOpen(o)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === "Enter") onOpen(o); }}
                    className={cn(
                      "rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-3 space-y-2.5 transition-all hover:border-[var(--color-primary-blue)]/50 hover:shadow-md select-none",
                      travada ? "cursor-pointer" : "cursor-pointer active:cursor-grabbing",
                      arrastando?.id === o.id && "opacity-40 scale-95",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs font-bold leading-snug text-[var(--color-text-primary)] line-clamp-2 break-words">{o.titulo || "Sem título"}</p>
                        <p className="text-[10px] font-semibold text-[var(--color-text-faint)] truncate">
                          <span className="font-mono">{osCode(o.numero)}</span>{o.clienteNome ? ` · ${o.clienteNome}` : ""}
                        </p>
                      </div>
                      <PrioridadeBadge p={o.prioridade} />
                    </div>
                    {dep && <span className="inline-block max-w-full truncate text-[10px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]">{dep}</span>}
                    {o.valorTotal > 0 && <div className="text-sm font-black font-mono text-[var(--color-primary-blue)] leading-tight">{formatCurrency(o.valorTotal)}</div>}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--color-border-subtle)] text-[10px] font-semibold">
                      <span className="flex items-center gap-1.5 min-w-0" title={resp ? `Responsável: ${resp}` : "Sem responsável"}>
                        <span className={cn("w-5 h-5 rounded-full grid place-items-center text-[8px] font-black shrink-0", resp ? "bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)]" : "bg-[var(--color-surface-sunken)] text-[var(--color-text-faint)]")}>{iniciais(resp || "")}</span>
                        <span className="truncate text-[var(--color-text-muted)]">{resp ? resp.split(" ")[0] : "Sem responsável"}</span>
                      </span>
                      {prazo && (
                        <span className={cn("flex items-center gap-1 shrink-0", prazo.atrasada ? "text-rose-500" : "text-[var(--color-text-faint)]")}>
                          <Clock className="w-3 h-3" /> {prazo.texto}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
              <button
                type="button"
                onClick={onNova}
                className={cn(
                  "w-full py-2 border border-dashed border-[var(--color-border-default)] rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] transition-all flex items-center justify-center gap-1.5 text-xs font-bold cursor-pointer bg-transparent",
                  cards.length === 0 && "min-h-[96px]",
                )}
              >
                <Plus className="w-3.5 h-3.5" /> Nova OS
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
