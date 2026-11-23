import { useEffect, useRef, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";

export interface AbaPagina<T extends string = string> {
  id: T;
  label: ReactNode;
  icon?: LucideIcon;
  /** Número ou texto pequeno ao lado do nome (ex.: contagem). */
  badge?: ReactNode;
  disabled?: boolean;
}

/**
 * Abas de uma página (troca de conteúdo dentro da mesma tela): texto com sublinhado na aba ativa, igual às
 * abas do Financeiro. Rola na horizontal em telas estreitas e traz a aba ativa para a vista.
 */
export function AbasPagina<T extends string>({ abas, value, onChange, className, ariaLabel }: {
  abas: readonly AbaPagina<T>[];
  value: T;
  onChange: (id: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  const barRef = useRef<HTMLDivElement | null>(null);
  const ativaRef = useRef<HTMLButtonElement | null>(null);
  // Rola SÓ a barra (scrollIntoView rolaria também os ancestrais e deslocaria a página).
  useEffect(() => {
    const bar = barRef.current, el = ativaRef.current;
    if (!bar || !el || bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollTo({ left: Math.max(0, el.offsetLeft - (bar.clientWidth - el.offsetWidth) / 2), behavior: "smooth" });
  }, [value]);
  return (
    <div ref={barRef} role="tablist" aria-label={ariaLabel} className={cn("flex gap-1 overflow-x-auto scrollbar-none border-b border-[var(--color-border-subtle)] print:hidden", className)}>
      {abas.map((a) => {
        const ativa = a.id === value;
        const Icone = a.icon;
        return (
          <button
            key={a.id}
            ref={ativa ? ativaRef : undefined}
            type="button"
            role="tab"
            aria-selected={ativa}
            disabled={a.disabled}
            onClick={() => onChange(a.id)}
            className={cn(
              "inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-bold whitespace-nowrap shrink-0 border-0 border-b-2 -mb-px bg-transparent cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
              ativa
                ? "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]",
            )}
          >
            {Icone && <Icone className="w-3.5 h-3.5 shrink-0" />}
            {a.label}
            {a.badge !== undefined && a.badge !== null && <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)]">{a.badge}</span>}
          </button>
        );
      })}
    </div>
  );
}
