import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";

// Botão flutuante ARRASTÁVEL (mouse e toque). Sem arrastar, o botão fica onde o CSS dele manda (pos = null). Ao arrastar, a
// posição vira left/top em pixels, limitada à tela, e fica salva neste aparelho (localStorage). Arrastar nunca dispara o clique.

interface Pos { left: number; top: number }
const MOVE_THRESHOLD = 6; // px: abaixo disso é um clique/toque, não um arraste

function readStored(key: string): Pos | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) || "null");
    return v && Number.isFinite(v.left) && Number.isFinite(v.top) ? { left: v.left, top: v.top } : null;
  } catch { return null; }
}

export function useDraggableFab(storageKey: string, margin = 8) {
  const [pos, setPos] = useState<Pos | null>(() => (typeof window === "undefined" ? null : readStored(storageKey)));
  const [dragging, setDragging] = useState(false);
  const [vp, setVp] = useState(() => ({ w: typeof window === "undefined" ? 1200 : window.innerWidth, h: typeof window === "undefined" ? 800 : window.innerHeight }));
  const posRef = useRef<Pos | null>(pos);
  const sizeRef = useRef({ w: 56, h: 56 });
  const drag = useRef<{ id: number; sx: number; sy: number; l: number; t: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const clamp = useCallback((p: Pos, w = vp.w, h = vp.h): Pos => ({
    left: Math.min(Math.max(p.left, margin), Math.max(margin, w - sizeRef.current.w - margin)),
    top: Math.min(Math.max(p.top, margin), Math.max(margin, h - sizeRef.current.h - margin)),
  }), [vp.w, vp.h, margin]);

  const apply = useCallback((p: Pos | null) => { posRef.current = p; setPos(p); }, []);
  const persist = useCallback(() => {
    try { posRef.current ? localStorage.setItem(storageKey, JSON.stringify(posRef.current)) : localStorage.removeItem(storageKey); } catch { /* sem storage: só não lembra */ }
  }, [storageKey]);

  // Girar o celular / redimensionar a janela: mantém o botão dentro da tela.
  useEffect(() => {
    const onResize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      setVp({ w, h });
      if (posRef.current) apply(clamp(posRef.current, w, h));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [apply, clamp]);

  const handlers = {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const el = e.currentTarget;
      const r = el.getBoundingClientRect();
      sizeRef.current = { w: r.width, h: r.height };
      drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, l: r.left, t: r.top, moved: false };
      try { el.setPointerCapture(e.pointerId); } catch { /* alguns navegadores */ }
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d || d.id !== e.pointerId) return;
      const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
      if (!d.moved && Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
      if (!d.moved) { d.moved = true; setDragging(true); }
      apply(clamp({ left: d.l + dx, top: d.t + dy }));
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* já solto */ }
      if (d.moved) {
        setDragging(false);
        persist();
        suppressClick.current = true; // o "click" que o navegador dispara ao soltar não pode abrir/fechar nada
        setTimeout(() => { suppressClick.current = false; }, 60);
      }
    },
    onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => {
      const d = drag.current;
      drag.current = null;
      if (d?.moved) { setDragging(false); persist(); }
    },
    onClickCapture: (e: React.MouseEvent<HTMLElement>) => {
      if (suppressClick.current) { suppressClick.current = false; e.preventDefault(); e.stopPropagation(); }
    },
  };

  /** Estilo do botão: vazio enquanto não foi movido (vale o CSS original). */
  const style: CSSProperties = {
    touchAction: "none", // senão o dedo rola a página em vez de arrastar o botão
    userSelect: "none",
    ...(pos ? { left: pos.left, top: pos.top, right: "auto", bottom: "auto" } : {}),
    ...(dragging ? { transition: "none", cursor: "grabbing" } : {}),
  };

  /** Painel que abre junto do botão: acima se o botão está na metade de baixo, abaixo se está na de cima; alinhado ao lado dele. */
  const panelStyle = (panelWidth: number, gap = 12): CSSProperties | undefined => {
    if (!pos) return undefined;
    const { w, h } = vp;
    const { w: bw, h: bh } = sizeRef.current;
    const pw = Math.min(panelWidth, w - 32);
    const left = Math.min(Math.max(pos.left + bw / 2 > w / 2 ? pos.left + bw - pw : pos.left, 16), Math.max(16, w - pw - 16));
    const emBaixo = pos.top + bh / 2 > h / 2;
    return emBaixo
      ? { left, right: "auto", top: "auto", bottom: h - pos.top + gap, maxHeight: Math.max(220, pos.top - gap - 16) }
      : { left, right: "auto", bottom: "auto", top: pos.top + bh + gap, maxHeight: Math.max(220, h - (pos.top + bh + gap) - 16) };
  };

  return { pos, dragging, handlers, style, panelStyle, reset: () => { apply(null); persist(); } };
}
