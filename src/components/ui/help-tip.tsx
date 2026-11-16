import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "../../lib/utils";

interface HelpTipProps {
  /** Texto explicativo que aparece no balão. */
  children: ReactNode;
  /** Nome curto do assunto, lido por leitores de tela (ex.: "Sobre esta página"). */
  label?: string;
  className?: string;
}

/**
 * Ícone "?" que guarda uma explicação: o texto não ocupa espaço na tela, o cliente toca (ou passa o
 * mouse, no computador) para ler. Fecha ao tocar fora, ao apertar Esc ou ao tocar de novo.
 * Use no lugar de parágrafos de orientação sempre visíveis.
 */
export function HelpTip({ children, label = "Ajuda", className }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const [alignRight, setAlignRight] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const rect = wrap.current?.getBoundingClientRect();
    if (rect) setAlignRight(rect.left + 300 > window.innerWidth);
    const onDown = (e: Event) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span
      ref={wrap}
      className={cn("relative inline-flex align-middle", className)}
      // Passar o mouse abre só no computador (o toque cuida do celular).
      onMouseEnter={(e) => { if ((e.nativeEvent as PointerEvent).pointerType !== "touch") setOpen(true); }}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="grid place-items-center w-6 h-6 rounded-full bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)] hover:text-white focus-visible:bg-[var(--color-primary-blue)] focus-visible:text-white transition-colors"
      >
        <HelpCircle className="w-4 h-4" strokeWidth={2.5} />
      </button>
      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            "absolute top-full mt-1.5 z-50 w-72 max-w-[80vw] rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface)] p-3 text-left text-xs font-medium normal-case tracking-normal leading-relaxed text-[var(--color-text-secondary,var(--color-text-muted))] shadow-xl",
            alignRight ? "right-0" : "left-0",
          )}
        >
          {children}
        </span>
      )}
    </span>
  );
}
