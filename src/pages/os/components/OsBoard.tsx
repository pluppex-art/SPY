import { useState } from "react";
import { Clock } from "lucide-react";
import { KANBAN_COR_CLASS } from "../../../hooks/useKanbanConfig";
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

export function OsBoard({ colunas, ordens, colunaDe, departamentoNome, onOpen, onMover }: Props) {
  const { formatCurrency } = useLocalization();
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

  return (
    <div className="flex gap-3 overflow-x-auto pb-3 -mx-1 px-1">
      {colunas.map((col, colIdx) => {
        const cards = ordens.filter(o => {
          const alvo = colunaDe(o);
          if (alvo === col.id) return true;
          return colIdx === 0 && (alvo === null || !colunaIds.has(alvo));
        });
        const total = cards.reduce((s, o) => s + o.valorTotal, 0);
        return (
          <div
            key={col.id}
            onDragOver={e => { e.preventDefault(); setAlvo(col.id); }}
            onDragLeave={() => setAlvo(a => (a === col.id ? null : a))}
            onDrop={() => soltar(col.id)}
            className={cn(
              "flex-shrink-0 w-[272px] flex flex-col rounded-[var(--radius-panel)] border transition-colors",
              alvo === col.id
                ? "border-[var(--color-primary-blue)]/50 bg-[var(--color-primary-blue)]/[0.04]"
                : "border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/50",
            )}
          >
            <div className="px-3.5 py-3 border-b border-[var(--color-border-subtle)] flex items-center gap-2">
              <span className={cn("w-2 h-2 rounded-full shrink-0", KANBAN_COR_CLASS[col.cor] ?? "bg-slate-500")} />
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-primary)] truncate">{col.nome}</span>
              <span className="text-[10px] font-semibold text-[var(--color-text-muted)]">{cards.length}</span>
              {total > 0 && <span className="ml-auto text-[10px] font-medium tabular-nums text-[var(--color-text-faint)]">{formatCurrency(total)}</span>}
            </div>

            <div className="flex-1 p-2.5 space-y-2.5 min-h-[140px]">
              {cards.map(o => {
                const prazo = prazoInfo(o);
                const travada = isOsLocked(o.status);
                const dep = departamentoNome?.(o);
                return (
                  <div
                    key={o.id}
                    draggable={!travada}
                    onDragStart={e => { e.dataTransfer.setData("text/plain", o.id); e.dataTransfer.effectAllowed = "move"; setArrastando(o); }}
                    onDragEnd={() => { setArrastando(null); setAlvo(null); }}
                    onClick={() => onOpen(o)}
                    className={cn(
                      "p-3 rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] hover:border-[var(--color-primary-blue)]/40 transition-all select-none",
                      travada ? "cursor-pointer" : "cursor-grab active:cursor-grabbing",
                      arrastando?.id === o.id && "opacity-40 scale-95",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-[10px] font-semibold text-[var(--color-text-muted)]">{osCode(o.numero)}</span>
                      <PrioridadeBadge p={o.prioridade} />
                    </div>
                    <p className="mt-1.5 text-xs font-semibold leading-snug text-[var(--color-text-primary)] line-clamp-2">{o.titulo || "Sem título"}</p>
                    {o.clienteNome && <p className="mt-1 text-[11px] text-[var(--color-text-muted)] truncate">{o.clienteNome}</p>}
                    <div className="mt-2.5 flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-[var(--color-text-muted)] truncate">{o.responsavelNome || "Sem responsável"}</span>
                      {o.valorTotal > 0 && <span className="font-semibold tabular-nums text-[var(--color-text-primary)]">{formatCurrency(o.valorTotal)}</span>}
                    </div>
                    {(prazo || dep) && (
                      <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                        {prazo ? (
                          <span className={cn("flex items-center gap-1 font-medium", prazo.atrasada ? "text-rose-500" : "text-[var(--color-text-faint)]")}>
                            <Clock className="w-3 h-3" /> {prazo.texto}
                          </span>
                        ) : <span />}
                        {dep && <span className="truncate px-1.5 py-0.5 rounded border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">{dep}</span>}
                      </div>
                    )}
                  </div>
                );
              })}
              {cards.length === 0 && (
                <p className="text-[11px] text-[var(--color-text-faint)] text-center py-6">Solte uma OS aqui</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
