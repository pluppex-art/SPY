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

/** Matiz (0-360) de um "#RRGGBB". */
function hueOf(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** Matiz da cor laranja da logo oficial (arquivos em /public). */
const LOGO_SOURCE_HUE = 25;

/**
 * Logo oficial da S.P.Y. (espião + mira, e "SPY CRM"): é a mesma arte para todas as empresas; só a cor muda,
 * girando o matiz da imagem laranja até a cor da empresa. Duas versões do texto "SPY": branco (fundo escuro)
 * e cinza-escuro (fundo claro); o CSS (.spy-logo--*) escolhe pela classe `dark` do <html>.
 */
export function Logo({ variant = "full", color, size = 32, className }: LogoProps) {
  const hex = resolveColor(color);
  const hue = Math.round(hueOf(/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : LOGO_COLORS.purple) - LOGO_SOURCE_HUE);
  const style: React.CSSProperties = { filter: `hue-rotate(${hue}deg)` };
  if (variant === "icon") {
    return (
      <span className={className}>
        <img src="/logo-icon-t.webp" alt="S.P.Y." width={size} height={size}
          style={{ ...style, width: size, height: size, display: "block" }} draggable={false} />
      </span>
    );
  }
  const h = Math.round(size * 1.7);
  const w = Math.round((h * 720) / 320);
  const dims = { width: w, height: h, display: "block" as const };
  return (
    <span className={`inline-flex items-center ${className ?? ""}`} role="img" aria-label="SPY CRM">
      <img className="spy-logo--on-dark" src="/logo-topbar.webp" alt="" width={w} height={h} style={{ ...style, ...dims }} draggable={false} />
      <img className="spy-logo--on-light" src="/logo-topbar-light.webp" alt="" width={w} height={h} style={{ ...style, ...dims }} draggable={false} />
    </span>
  );
}
