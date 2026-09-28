import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, ChevronDown, X, Check } from "lucide-react";
import { cn } from "../../lib/utils";

interface DateRangeFilterProps {
  dateFrom: string | null;
  setDateFrom: (v: string | null) => void;
  dateTo: string | null;
  setDateTo: (v: string | null) => void;
  /** Altura pra bater com os outros controles da barra de filtro onde for usado (ex.: Pipeline usa h-[38px]). */
  className?: string;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// Atalhos mais comuns pra filtro comercial — evita o usuário ter que contar
// dias/meses manualmente toda vez que quer ver "esse mês" ou "mês passado".
function buildPresets() {
  const now = new Date();
  const today = toISO(now);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = (n: number) => toISO(startOfDay(new Date(now.getTime() - n * 86400000)));
  const startOfMonth = toISO(new Date(now.getFullYear(), now.getMonth(), 1));
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const startOfYear = toISO(new Date(now.getFullYear(), 0, 1));

  return [
    { label: "Hoje", from: today, to: today },
    { label: "Últimos 7 dias", from: days(6), to: today },
    { label: "Últimos 30 dias", from: days(29), to: today },
    { label: "Este mês", from: startOfMonth, to: today },
    { label: "Mês passado", from: toISO(lastMonthStart), to: toISO(lastMonthEnd) },
    { label: "Este ano", from: startOfYear, to: today },
    { label: "Tudo", from: null, to: null },
  ] as const;
}

// Largura real do card do popover (w-[280px] abaixo) — usada só pra decidir
// de que lado abrir, nunca pra estilizar.
const POPOVER_WIDTH = 280;

export function DateRangeFilter({ dateFrom, setDateFrom, dateTo, setDateTo, className }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  // Achado real: este componente é reaproveitado em telas onde o botão fica
  // perto da borda DIREITA da área de conteúdo (Propostas.tsx, Financeiro/BI —
  // ambos dentro de um `justify-between` no fim da barra) — o popover sempre
  // abria "colado à esquerda" do botão (`left-0`), então nesses casos ele
  // estourava a largura da tela e o navegador criava um scroll horizontal só
  // pra caber o pedaço cortado. Em vez de fixar um lado só (que quebraria o
  // outro uso, no Dashboard, onde o botão fica perto da borda ESQUERDA), mede
  // o espaço disponível à direita do botão na hora de abrir e escolhe o lado
  // que cabe — funciona em qualquer tela sem precisar configurar caso a caso.
  const [align, setAlign] = useState<"left" | "right">("left");
  const buttonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const fitsOnRight = rect.left + POPOVER_WIDTH <= window.innerWidth - 16;
    setAlign(fitsOnRight ? "left" : "right");
  }, [open]);

  const presets = useMemo(buildPresets, []);
  const activePreset = presets.find((p) => p.from === dateFrom && p.to === dateTo);

  const summary = !dateFrom && !dateTo
    ? "Período: Tudo"
    : activePreset
      ? activePreset.label
      : `${dateFrom ? fmtBR(dateFrom) : "…"} – ${dateTo ? fmtBR(dateTo) : "…"}`;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 bg-[var(--color-surface-elevated)] px-3 rounded-[var(--radius-control)] border transition-colors cursor-pointer text-xs font-bold h-[38px]",
          dateFrom || dateTo
            ? "border-[var(--color-primary-blue)]/40 text-[var(--color-primary-blue)]"
            : "border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]",
          className
        )}
      >
        <CalendarRange className="w-3.5 h-3.5 shrink-0" />
        <span className="whitespace-nowrap">{summary}</span>
        <ChevronDown className={cn("w-3 h-3 shrink-0 transition-transform text-[var(--color-text-faint)]", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className={cn(
              "absolute top-full mt-1.5 z-50 w-[280px] bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-2xl shadow-2xl p-3 space-y-3",
              align === "left" ? "left-0" : "right-0"
            )}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-0.5">
              {presets.map((p) => {
                const isActive = activePreset?.label === p.label;
                return (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => { setDateFrom(p.from); setDateTo(p.to); setOpen(false); }}
                    className={cn(
                      "flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-left",
                      isActive
                        ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]"
                        : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
                    )}
                  >
                    {p.label}
                    {isActive && <Check className="w-3.5 h-3.5" />}
                  </button>
                );
              })}
            </div>

            <div className="border-t border-[var(--color-border-subtle)] pt-3 space-y-2">
              <span className="text-[9px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">Período customizado</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dateFrom ?? ""}
                  onChange={(e) => setDateFrom(e.target.value || null)}
                  className="flex-1 min-w-0 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]/40 cursor-pointer"
                />
                <span className="text-[10px] text-[var(--color-text-faint)] font-bold uppercase shrink-0">até</span>
                <input
                  type="date"
                  value={dateTo ?? ""}
                  onChange={(e) => setDateTo(e.target.value || null)}
                  className="flex-1 min-w-0 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-lg px-2 py-1.5 text-[11px] text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-primary-blue)]/40 cursor-pointer"
                />
              </div>
            </div>

            {(dateFrom || dateTo) && (
              <button
                type="button"
                onClick={() => { setDateFrom(null); setDateTo(null); setOpen(false); }}
                className="flex items-center justify-center gap-1.5 w-full py-1.5 rounded-lg text-[11px] font-bold text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] transition-colors cursor-pointer"
              >
                <X className="w-3 h-3" /> Limpar filtro
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
