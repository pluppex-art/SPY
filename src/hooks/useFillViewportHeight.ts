import { useLayoutEffect, useRef, useState } from "react";

function scrollParent(el: HTMLElement): HTMLElement | null {
  let p = el.parentElement;
  while (p) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === "auto" || oy === "scroll") && p.scrollHeight >= p.clientHeight) return p;
    p = p.parentElement;
  }
  return null;
}

/**
 * Faz o elemento ocupar exatamente o espaço que sobra até o fim da área de
 * conteúdo (o container com scroll do Layout), pra a PÁGINA não rolar — só o
 * conteúdo interno do elemento (colunas do Kanban, tabela da Lista) rola.
 * Recalcula ao redimensionar a janela e quando o que está acima muda de altura
 * (painel de filtros abre/fecha, gráficos aparecem) — observando o pai.
 */
export function useFillViewportHeight<T extends HTMLElement>(minHeight = 320) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const container = scrollParent(el);
    const calc = () => {
      const rect = el.getBoundingClientRect();
      if (container) {
        const cRect = container.getBoundingClientRect();
        const topInContent = rect.top - cRect.top + container.scrollTop;
        const padBottom = parseFloat(getComputedStyle(container).paddingBottom) || 0;
        setHeight(Math.max(minHeight, Math.floor(container.clientHeight - topInContent - padBottom)));
      } else {
        setHeight(Math.max(minHeight, Math.floor(window.innerHeight - rect.top - 24)));
      }
    };
    calc();
    window.addEventListener("resize", calc);
    const ro = new ResizeObserver(calc);
    if (el.parentElement) ro.observe(el.parentElement);
    if (container) ro.observe(container);
    return () => { window.removeEventListener("resize", calc); ro.disconnect(); };
  }, [minHeight]);

  return { ref, height };
}
