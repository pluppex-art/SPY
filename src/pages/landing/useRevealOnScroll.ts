import { useLayoutEffect } from "react";
import { useReducedMotion } from "motion/react";

/**
 * Liga o sistema de revelação ao rolar: marca a raiz com `sp-js` (CSS esconde [data-reveal]) e
 * adiciona `data-in` quando o elemento entra na viewport (uma vez). Sem JS ou com reduced-motion tudo fica visível.
 */
export function useRevealOnScroll(root: React.RefObject<HTMLElement | null>) {
  const reduce = useReducedMotion();
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || reduce || typeof IntersectionObserver === "undefined") return;
    el.classList.add("sp-js");
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            (e.target as HTMLElement).setAttribute("data-in", "");
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    );
    el.querySelectorAll("[data-reveal]").forEach((n) => io.observe(n));
    return () => {
      io.disconnect();
      el.classList.remove("sp-js");
    };
  }, [root, reduce]);
}
