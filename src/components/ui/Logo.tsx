import * as React from "react";

export type LogoColorId = "blue" | "purple" | "orange" | "green";

export const LOGO_COLORS: Record<LogoColorId, string> = {
  blue: "#2563EB",
  purple: "#7C3AED",
  orange: "#F97316",
  green: "#4ADE80",
};

export interface LogoProps {
  /** "icon" = só o símbolo (chapéu + mira). "full" = símbolo + wordmark "SPY CRM" */
  variant?: "icon" | "full";
  /** Uma das 4 cores de marca, ou qualquer hex customizado (ex.: tenant.primary_color). */
  color?: LogoColorId | (string & {});
  size?: number;
  className?: string;
}

function resolveColor(color: LogoProps["color"]): string {
  if (!color) return LOGO_COLORS.purple;
  if (color in LOGO_COLORS) return LOGO_COLORS[color as LogoColorId];
  return color;
}

const MASK_BASE = { maskSize: "100% 100%", WebkitMaskSize: "100% 100%", maskRepeat: "no-repeat", WebkitMaskRepeat: "no-repeat" } as const;

/**
 * Logo oficial da S.P.Y. (espião + mira, e "SPY CRM"), a mesma arte para todas as empresas. Está dividida em
 * camadas: a parte colorida (mira, chapéu, "CRM") é uma máscara pintada com a cor EXATA da empresa — a mesma
 * dos botões —, e a parte neutra (texto "SPY" e olhos) fica branca no tema escuro e grafite no claro; o CSS
 * (.spy-logo--*) escolhe pela classe `dark` do <html>.
 */
export function Logo({ variant = "full", color, size = 32, className }: LogoProps) {
  const hex = resolveColor(color);
  const fill = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex : LOGO_COLORS.purple;
  const isIcon = variant === "icon";
  const h = isIcon ? size : Math.round(size * 1.7);
  const w = isIcon ? size : Math.round((h * 720) / 320);
  const base = isIcon ? "/logo-icon" : "/logo-full";
  const maskUrl = `url(${base}-color.webp)`;
  const layer: React.CSSProperties = { position: "absolute", inset: 0, width: w, height: h, display: "block" };
  return (
    <span className={`relative inline-block shrink-0 ${className ?? ""}`} style={{ width: w, height: h }} role="img" aria-label={isIcon ? "S.P.Y." : "SPY CRM"}>
      <img className="spy-logo--on-dark" src={`${base}-white.webp`} alt="" width={w} height={h} style={layer} draggable={false} />
      <img className="spy-logo--on-light" src={`${base}-dark.webp`} alt="" width={w} height={h} style={layer} draggable={false} />
      <span aria-hidden="true" style={{ ...layer, ...MASK_BASE, backgroundColor: fill, maskImage: maskUrl, WebkitMaskImage: maskUrl }} />
    </span>
  );
}
