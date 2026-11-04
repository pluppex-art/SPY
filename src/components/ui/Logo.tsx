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
  if (!color) return LOGO_COLORS.blue;
  if (color in LOGO_COLORS) return LOGO_COLORS[color as LogoColorId];
  return color;
}

/** Ícone de marca: chapéu de espião + óculos escuros dentro de uma mira circular. */
function LogoMark({ color, size = 32 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" role="img" aria-label="S.P.Y.">
      <circle cx="50" cy="50" r="42" stroke={color} strokeWidth="6" />
      <line x1="50" y1="1" x2="50" y2="16" stroke={color} strokeWidth="6" strokeLinecap="round" />
      <line x1="50" y1="84" x2="50" y2="99" stroke={color} strokeWidth="6" strokeLinecap="round" />
      <line x1="1" y1="50" x2="16" y2="50" stroke={color} strokeWidth="6" strokeLinecap="round" />
      <line x1="84" y1="50" x2="99" y2="50" stroke={color} strokeWidth="6" strokeLinecap="round" />
      <path
        d="M27 47c0-13 10-23 23-23s23 10 23 23c8 1 13 5 13 9H14c0-4 5-8 13-9Z"
        fill={color}
      />
      <rect x="17" y="53" width="66" height="8" rx="4" fill={color} />
      {/* Óculos escuros — lentes em pílula, não elipses genéricas, pra reforçar a leitura "espião" mesmo em tamanhos pequenos */}
      <rect x="29" y="58" width="17" height="10" rx="5" fill="#0B1120" />
      <rect x="54" y="58" width="17" height="10" rx="5" fill="#0B1120" />
      <rect x="46" y="61" width="8" height="3" rx="1.5" fill="#0B1120" />
    </svg>
  );
}

/** Logo da S.P.Y. — ícone sozinho ou com o wordmark, na cor de marca do tenant (4 opções ou hex custom). */
export function Logo({ variant = "full", color, size = 32, className }: LogoProps) {
  const hex = resolveColor(color);
  if (variant === "icon") {
    return (
      <span className={className}>
        <LogoMark color={hex} size={size} />
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark color={hex} size={size} />
      {/* Wordmark "SPY" (cor do texto do tema) sobre "CRM" (cor de marca), como na logo oficial. */}
      <span className="inline-flex flex-col leading-[0.95] font-black" role="img" aria-label="SPY CRM">
        <span className="tracking-[0.04em] text-[var(--color-text-primary)]" style={{ fontSize: size * 0.62 }}>SPY</span>
        <span className="tracking-[0.08em]" style={{ fontSize: size * 0.42, color: hex }}>CRM</span>
      </span>
    </span>
  );
}
