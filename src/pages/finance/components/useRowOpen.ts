import { useCallback, useEffect, useRef, type MouseEvent } from "react";

const INTERACTIVE = "button, a, input, select, textarea, label, [role='menuitem'], [role='switch'], [data-no-row-open]";

/**
 * Clique na linha/card abre a visualização; duplo clique abre direto a edição.
 * O clique simples espera ~230 ms para não abrir a visualização antes do duplo clique.
 * Cliques em botões, links e campos dentro da linha são ignorados.
 */
export function useRowOpen<T>(onView: (item: T) => void, onEdit?: (item: T) => void) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return useCallback(
    (item: T) => ({
      onClick: (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
        if (!onEdit) { onView(item); return; }
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => { timer.current = null; onView(item); }, 230);
      },
      onDoubleClick: (e: MouseEvent) => {
        if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        (onEdit ?? onView)(item);
      },
    }),
    [onView, onEdit],
  );
}
