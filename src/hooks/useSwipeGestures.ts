import { useEffect, useRef, type RefObject } from "react";

const EDGE_PX = 24;       // faixa da borda esquerda onde o gesto de "voltar" pode começar
const MIN_DIST = 72;      // distância mínima do arrasto
const MAX_OFF_AXIS = 56;  // desvio máximo no outro eixo (senão é rolagem, não gesto)
const MAX_MS = 700;

/**
 * Arrastar da borda esquerda para a direita (celular/tablet) = voltar, como nos apps nativos.
 * Só começa nos 24px da borda, então não briga com a rolagem lateral nem com o arrastar do kanban.
 * Só reage ao touchend: se o navegador assumir o gesto (voltar nativo do iOS), vem touchcancel e nada dispara.
 */
export function useEdgeSwipeBack(onSwipe: () => void) {
  const cb = useRef(onSwipe);
  cb.current = onSwipe;
  useEffect(() => {
    let sx = 0, sy = 0, st = 0, tracking = false;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      tracking = e.touches.length === 1 && t.clientX <= EDGE_PX;
      if (tracking) { sx = t.clientX; sy = t.clientY; st = Date.now(); }
    };
    const end = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      if (t.clientX - sx >= MIN_DIST && Math.abs(t.clientY - sy) <= MAX_OFF_AXIS && Date.now() - st <= MAX_MS) cb.current();
    };
    const cancel = () => { tracking = false; };
    document.addEventListener("touchstart", start, { passive: true });
    document.addEventListener("touchend", end, { passive: true });
    document.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      document.removeEventListener("touchstart", start);
      document.removeEventListener("touchend", end);
      document.removeEventListener("touchcancel", cancel);
    };
  }, []);
}

/**
 * Arrastar o próprio elemento para fora o dispensa: folhas de baixo ("down") e gavetas laterais ("left").
 * Em folha com rolagem, "down" só vale com o conteúdo no topo (senão é a pessoa rolando de volta).
 */
export function useSwipeToDismiss(ref: RefObject<HTMLElement | null>, direction: "down" | "left", onDismiss: () => void, enabled = true) {
  const cb = useRef(onDismiss);
  cb.current = onDismiss;
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    let sx = 0, sy = 0, st = 0, tracking = false;
    const start = (e: TouchEvent) => {
      const t = e.touches[0];
      tracking = e.touches.length === 1 && (direction !== "down" || el.scrollTop <= 0);
      if (tracking) { sx = t.clientX; sy = t.clientY; st = Date.now(); }
    };
    const end = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Date.now() - st > MAX_MS) return;
      const ok = direction === "down"
        ? dy >= 80 && Math.abs(dx) <= MAX_OFF_AXIS
        : dx <= -MIN_DIST && Math.abs(dy) <= MAX_OFF_AXIS;
      if (ok) cb.current();
    };
    const cancel = () => { tracking = false; };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchend", end, { passive: true });
    el.addEventListener("touchcancel", cancel, { passive: true });
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", cancel);
    };
  }, [ref, direction, enabled]);
}
