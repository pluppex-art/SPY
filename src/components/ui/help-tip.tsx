import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HelpCircle } from "lucide-react";
import { cn } from "../../lib/utils";

interface HelpTipProps {
  /** Texto explicativo que aparece no balão. */
  children: ReactNode;
  /** Nome curto do assunto, lido por leitores de tela (ex.: "Sobre esta página"). */
  label?: string;
  className?: string;
}

const LARGURA = 288; // w-72
const MARGEM = 8;

/**
 * Ícone "?" que guarda uma explicação: o texto não ocupa espaço na tela, o cliente toca (ou passa o
 * mouse, no computador) para ler. Fecha ao tocar fora, ao apertar Esc ou ao tocar de novo.
 * O balão é desenhado por cima de tudo (portal) e posicionado pela tela, então não é cortado por
 * tabelas com rolagem nem por janelas. Use no lugar de parágrafos de orientação sempre visíveis.
 */
export function HelpTip({ children, label = "Ajuda", className }: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);
  const balao = useRef<HTMLSpanElement>(null);
  const id = useId();

  const posicionar = () => {
    const r = wrap.current?.getBoundingClientRect();
    if (!r) return;
    const largura = Math.min(LARGURA, window.innerWidth * 0.8);
    // Alinha à esquerda do ícone; se não couber, encosta na borda direita da tela.
    const left = Math.max(MARGEM, Math.min(r.left, window.innerWidth - largura - MARGEM));
    const alturaBalao = balao.current?.offsetHeight ?? 0;
    // Abre embaixo; se não couber, abre em cima.
    const cabeEmbaixo = r.bottom + 6 + alturaBalao <= window.innerHeight - MARGEM;
    const top = cabeEmbaixo || r.top - 6 - alturaBalao < MARGEM ? r.bottom + 6 : r.top - 6 - alturaBalao;
    setPos({ top, left });
  };

  useLayoutEffect(() => {
    if (!open) { setPos(null); return; }
    posicionar();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: Event) => {
      const alvo = e.target as Node;
      if (!wrap.current?.contains(alvo) && !balao.current?.contains(alvo)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const fechar = () => setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", fechar);
    window.addEventListener("scroll", fechar, true); // rolar a página/tabela fecha: o ícone saiu do lugar
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", fechar);
      window.removeEventListener("scroll", fechar, true);
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
      {open && createPortal(
        <span
          ref={balao}
          id={id}
          role="tooltip"
          style={{ position: "fixed", top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: Math.min(LARGURA, window.innerWidth * 0.8), visibility: pos ? "visible" : "hidden" }}
          className="z-[200] block whitespace-normal rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface)] p-3 text-left text-xs font-medium normal-case tracking-normal leading-relaxed text-[var(--color-text-secondary,var(--color-text-muted))] shadow-xl"
        >
          {children}
        </span>,
        document.body,
      )}
    </span>
  );
}
