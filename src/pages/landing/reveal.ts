import type { CSSProperties } from "react";

/** Props para revelar um elemento ao entrar na viewport (ver useRevealOnScroll). `i` define o atraso do stagger (60ms por passo). */
export function rv(i = 0): { "data-reveal": string; style: CSSProperties } {
  return { "data-reveal": "", style: { ["--i" as string]: Math.min(i, 8) } as CSSProperties };
}
