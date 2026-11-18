import { useEffect } from "react";

const FINE_HOVER = "(hover: hover) and (pointer: fine)";
const REDUCED = "(prefers-reduced-motion: reduce)";

/** Cartões que ganham o "holofote" que segue o cursor (a luz é desenhada no CSS com --mx/--my). */
const SPOT = ".sp-plan, .sp-prob__col, .sp-seg__col, .sp-sim__in, .sp-sim__out, .sp-credits, .sp-agents li, .sp-trust li, .sp-mod__list button, .sp-niche";

/**
 * Efeitos de ponteiro da landing, só em mouse/trackpad e sem reduced-motion:
 * - holofote nos cartões (--mx/--my em px, relativos ao cartão);
 * - paralaxe do hero (--px/--py em -1..1, relativos ao centro da seção).
 * Um único listener delegado na raiz; atualizações agrupadas por requestAnimationFrame.
 */
export function useLandingFx(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el || typeof window.matchMedia !== "function") return;
    if (!window.matchMedia(FINE_HOVER).matches || window.matchMedia(REDUCED).matches) return;

    let raf = 0;
    let last: PointerEvent | null = null;

    const apply = () => {
      raf = 0;
      const e = last;
      if (!e) return;
      const target = e.target as Element | null;
      const card = target?.closest<HTMLElement>(SPOT);
      if (card) {
        const r = card.getBoundingClientRect();
        card.style.setProperty("--mx", `${e.clientX - r.left}px`);
        card.style.setProperty("--my", `${e.clientY - r.top}px`);
      }
      const hero = el.querySelector<HTMLElement>(".sp-hero");
      if (hero) {
        const r = hero.getBoundingClientRect();
        if (e.clientY >= r.top && e.clientY <= r.bottom) {
          const x = ((e.clientX - r.left) / r.width) * 2 - 1;
          const y = ((e.clientY - r.top) / r.height) * 2 - 1;
          hero.style.setProperty("--px", x.toFixed(3));
          hero.style.setProperty("--py", y.toFixed(3));
        }
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      last = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      const hero = el.querySelector<HTMLElement>(".sp-hero");
      hero?.style.setProperty("--px", "0");
      hero?.style.setProperty("--py", "0");
    };

    el.addEventListener("pointermove", onMove, { passive: true });
    el.addEventListener("pointerleave", onLeave, { passive: true });
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [root]);
}
