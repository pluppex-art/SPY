import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { CalendarRange, ChevronDown, X, Check } from "lucide-react";
import { cn } from "../../lib/utils";

interface DateRangeFilterProps {
  dateFrom: string | null;
  setDateFrom: (v: string | null) => void;
  dateTo: string | null;
  setDateTo: (v: string | null) => void;
  /** Altura pra bater com os outros controles da barra de filtro onde for usado (ex.: Pipeline usa h-[38px]). */
  className?: string;
  /** Atalhos próprios (ex.: períodos futuros da Projeção). Sem isso, valem os atalhos padrão de período passado. */
  presets?: readonly { label: string; from: string | null; to: string | null }[];
  /** Texto do botão quando não há limite nenhum (padrão: "Período: Tudo"). */
  emptyLabel?: string;
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
export function buildPresets() {
  const now = new Date();
  const today = toISO(now);
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const days = (n: number) => toISO(startOfDay(new Date(now.getTime() - n * 86400000)));
  const startOfMonth = toISO(new Date(now.getFullYear(), now.getMonth(), 1));
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const startOfYear = toISO(new Date(now.getFullYear(), 0, 1));
  // "Últimos N meses" = do 1º dia do mês (N-1) meses atrás até hoje.
  const lastMonths = (n: number) => toISO(new Date(now.getFullYear(), now.getMonth() - (n - 1), 1));

  return [
    { label: "Hoje", from: today, to: today },
    { label: "Últimos 7 dias", from: days(6), to: today },
    { label: "Últimos 30 dias", from: days(29), to: today },
    { label: "Este mês", from: startOfMonth, to: today },
    { label: "Mês passado", from: toISO(lastMonthStart), to: toISO(lastMonthEnd) },
    { label: "Últimos 2 meses", from: lastMonths(2), to: today },
    { label: "Últimos 3 meses", from: lastMonths(3), to: today },
    { label: "Últimos 6 meses", from: lastMonths(6), to: today },
    { label: "Últimos 12 meses", from: lastMonths(12), to: today },
    { label: "Este ano", from: startOfYear, to: today },
    { label: "Tudo", from: null, to: null },
  ] as const;
}

/** Intervalo do preset "Este mês" (1º dia do mês até hoje) — usado como período padrão do Dashboard. */
export function thisMonthRange(): { from: string; to: string } {
  const now = new Date();
  return { from: toISO(new Date(now.getFullYear(), now.getMonth(), 1)), to: toISO(now) };
}

// Largura real do card do popover (w-[280px] abaixo) e altura aproximada com todos os atalhos.
const POPOVER_WIDTH = 280;
const POPOVER_HEIGHT = 480;

export function DateRangeFilter({ dateFrom, setDateFrom, dateTo, setDateTo, className, presets: presetsProp, emptyLabel = "Período: Tudo" }: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  // O popover é desenhado no <body> com posição fixa: dentro da barra de filtros ele era cortado
  // (a barra rola na horizontal). Escolhe o lado e a altura que cabem na janela.
  const [pos, setPos] = useState<CSSProperties>({});
  const buttonRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const left = rect.left + POPOVER_WIDTH <= window.innerWidth - 8 ? rect.left : Math.max(8, rect.right - POPOVER_WIDTH);
      const below = window.innerHeight - rect.bottom - 14;
      const above = rect.top - 14;
      setPos(below < POPOVER_HEIGHT && above > below
        ? { left, bottom: window.innerHeight - rect.top + 6, maxHeight: above }
        : { left, top: rect.bottom + 6, maxHeight: below });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const presets = useMemo(() => presetsProp ?? buildPresets(), [presetsProp]);
  const activePreset = presets.find((p) => p.from === dateFrom && p.to === dateTo);

  const summary = !dateFrom && !dateTo
    ? emptyLabel
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
          "flex items-center gap-1.5 bg-[var(--color-surface-elevated)] px-3 rounded-[var(--radius-control)] border transition-colors cursor-pointer text-xs font-bold h-[42px] sm:h-[38px] max-sm:w-full max-sm:justify-between",
          dateFrom || dateTo
            ? "border-[var(--color-primary-blue)]/40 text-[var(--color-primary-blue)]"
            : "border-[var(--color-border-default)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]",
          className
        )}
      >
        <CalendarRange className="w-3.5 h-3.5 shrink-0" />
        <span className="whitespace-nowrap max-sm:flex-1 max-sm:text-left">{summary}</span>
        <ChevronDown className={cn("w-3 h-3 shrink-0 transition-transform text-[var(--color-text-faint)]", open && "rotate-180")} />
      </button>

      {open && createPortal(
        <>
          <div className="fixed inset-0 z-[110] max-sm:bg-black/50" onClick={() => setOpen(false)} />
          <div
            role="dialog"
            aria-label="Escolher período"
            style={pos}
            className="fixed z-[111] w-[280px] overflow-y-auto max-sm:!inset-x-3 max-sm:!top-auto max-sm:!bottom-[calc(0.75rem+env(safe-area-inset-bottom))] max-sm:!w-auto max-sm:!max-h-[80dvh] bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-2xl shadow-2xl p-3 space-y-3"
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
                      "flex items-center justify-between w-full px-2.5 py-2.5 sm:py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer text-left",
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
        </>,
        document.body,
      )}
    </div>
  );
}
