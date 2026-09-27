import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string | React.ReactNode;
  description?: string | React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
  className?: string;
  position?: "center" | "right";
  noPadding?: boolean;
  /** "dark" (padrão, inalterado) = fundo escuro tradicional de modal central.
   * "light" = painel lateral que deixa a tela de fundo (ex.: Pipeline) visível
   * e reconhecível atrás — pra telas onde o conteúdo por trás continua sendo
   * o contexto principal (ver LeadDetailsModal.tsx). Puramente visual, não
   * muda nenhum comportamento (ESC/clique-fora ainda fecham do mesmo jeito). */
  overlay?: "dark" | "light";
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = "max-w-md",
  className,
  position = "center",
  noPadding = false,
  overlay = "dark",
}: ModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    // Evita dependência em `onClose` para reduzir recriações/limpezas em StrictMode.
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("axis-modal-open");

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      // Guard contra corrida onde o DOM/estado muda e o cleanup roda em momentos inesperados.
      // Garante que só tentamos restaurar o que ainda faz sentido.
      try {
        document.body.style.overflow = prevOverflow;
        document.body.classList.remove("axis-modal-open");
      } finally {
        document.removeEventListener("keydown", handleKeyDown);
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const titleId = typeof title === "string" ? "axis-modal-title" : undefined;

  return createPortal(
    <div
      className={`fixed inset-0 z-[100] flex ${
        position === "right"
          ? "justify-end"
          : "items-center justify-center p-4 sm:p-6"
      }`}
      role="presentation"
    >
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 animate-in fade-in duration-200",
          overlay === "light" ? "bg-black/20" : "bg-black/60 backdrop-blur-sm"
        )}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      />

      {/* Dialog */}
      <div
        className={cn(
          "relative w-[95vw] sm:w-full bg-[var(--color-surface-elevated)] overflow-hidden flex flex-col animate-in fade-in duration-200",
          overlay === "light" ? "shadow-2xl shadow-black/20 ring-1 ring-black/5" : "shadow-2xl shadow-black/30 ring-1 ring-black/5",
          maxWidth,
          position === "right"
            ? "h-full border-l border-[var(--color-border-default)] rounded-l-[var(--radius-panel-lg)] max-h-screen slide-in-from-right-10"
            : "border border-[var(--color-border-default)] rounded-[var(--radius-panel-lg)] max-h-[90vh] zoom-in-95 slide-in-from-bottom-2",
          className
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        {title !== undefined && title !== null && (
          <div className="flex items-center justify-between gap-4 px-6 py-5 border-b border-[var(--color-border-default)] shrink-0">
            {typeof title === "string" ? (
              <div>
                <h3
                  id={titleId}
                  className="text-base font-black text-[var(--color-text-primary)] tracking-tight"
                >
                  {title}
                </h3>
                {description && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-medium">
                    {description}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                {title}
                {description && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-medium">
                    {description}
                  </p>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-elevated)] hover:border-[var(--color-border-default)] rounded-xl text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors shrink-0"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Content */}
        <div
          className={`flex-1 min-h-0 w-full ${
            // noPadding indica que o conteúdo gerencia seu próprio layout interno
            // (cabeçalho/barra fixos com shrink-0 + área rolável com flex-1 overflow-y-auto),
            // então este container precisa ser flex-col — sem isso os filhos viram
            // fluxo normal de bloco e o overflow-hidden aqui corta o conteúdo em vez
            // de deixar a área interna rolar (era o caso do editor de contrato).
            noPadding ? "overflow-hidden flex flex-col" : "p-6 overflow-y-auto"
          }`}
        >
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]/60 shrink-0 flex items-center justify-end gap-3 w-full">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
