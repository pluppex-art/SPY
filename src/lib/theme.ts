export interface BrandColorOption {
  id: "blue" | "purple" | "orange" | "green";
  label: string;
  hex: string;
}

/** As 4 cores de marca do S.P.Y. — mesmas do mockup do logo. Usadas como tema
 * por tenant (tenants.primary_color) e como paleta do componente <Logo>. */
export const BRAND_COLORS: BrandColorOption[] = [
  { id: "green", label: "Verde", hex: "#4ADE80" },
  { id: "blue", label: "Azul", hex: "#2563EB" },
  { id: "purple", label: "Roxo", hex: "#7C3AED" },
  { id: "orange", label: "Laranja", hex: "#F97316" },
];

export const DEFAULT_BRAND_COLOR = BRAND_COLORS[0].hex;

/** Cor da tela de login quando a empresa ainda não foi identificada: o laranja oficial do S.P.Y. */
export const LOGIN_DEFAULT_COLOR = BRAND_COLORS.find((c) => c.id === "orange")!.hex;

/** Aceita só "#RRGGBB" (é o que vai para a variável CSS e para o banco). */
export function isValidBrandHex(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex.trim());
}

/** "abc"/"#abc"/"#AABBCC" → "#aabbcc"; devolve null se não for uma cor válida. */
export function normalizeBrandHex(input: string): string | null {
  let v = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(v)) v = v.split("").map((c) => c + c).join("");
  return /^[0-9a-fA-F]{6}$/.test(v) ? `#${v.toLowerCase()}` : null;
}

/** Luminância relativa (WCAG) de 0 (preto) a 1 (branco). */
export function relativeLuminance(hex: string): number {
  const n = normalizeBrandHex(hex);
  if (!n) return 0;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste do texto branco sobre a cor (botões e itens ativos usam texto branco). */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (relativeLuminance(hex) + 0.05);
}

/** Cores muito claras deixam botões/menu ativo (texto branco) ilegíveis. */
export const MIN_BRAND_CONTRAST = 2.2;

/**
 * Gera o SVG do Favicon oficial do S.P.Y. (mira, chapéu e óculos de espião)
 * customizado dinamicamente com a cor primária escolhida.
 */
export function generateFaviconSvg(hex: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
  <circle cx="50" cy="50" r="50" fill="#0B1120"/>
  <circle cx="50" cy="50" r="38" stroke="${hex}" stroke-width="5" fill="none"/>
  <line x1="50" y1="6"  x2="50" y2="18" stroke="${hex}" stroke-width="5" stroke-linecap="round"/>
  <line x1="50" y1="82" x2="50" y2="94" stroke="${hex}" stroke-width="5" stroke-linecap="round"/>
  <line x1="6"  y1="50" x2="18" y2="50" stroke="${hex}" stroke-width="5" stroke-linecap="round"/>
  <line x1="82" y1="50" x2="94" y2="50" stroke="${hex}" stroke-width="5" stroke-linecap="round"/>
  <path d="M27 47c0-13 10-23 23-23s23 10 23 23c8 1 13 5 13 9H14c0-4 5-8 13-9Z" fill="${hex}"/>
  <rect x="17" y="53" width="66" height="8" rx="4" fill="${hex}"/>
  <rect x="29" y="58" width="17" height="10" rx="5" fill="#0B1120"/>
  <rect x="54" y="58" width="17" height="10" rx="5" fill="#0B1120"/>
  <rect x="46" y="61" width="8" height="3" rx="1.5" fill="#0B1120"/>
</svg>`;
}

/**
 * Atualiza dinamicamente o favicon na aba do navegador com a cor informada.
 */
export function updateFaviconColor(hex: string) {
  if (typeof document === "undefined" || !hex) return;
  const svg = generateFaviconSvg(hex);
  const dataUri = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  const selectors = ["link[rel~='icon']", "link[rel='apple-touch-icon']"];
  let updated = false;

  selectors.forEach((sel) => {
    document.querySelectorAll<HTMLLinkElement>(sel).forEach((link) => {
      link.href = dataUri;
      updated = true;
    });
  });

  if (!updated) {
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = dataUri;
    document.head.appendChild(link);
  }
}

/**
 * Aplica a cor do tema nas variáveis CSS globais e no favicon.
 */
export function applyThemeColor(hex: string, _tenantName?: string) {
  if (typeof document === "undefined" || !hex || !/^#[0-9a-fA-F]{3,8}$/.test(hex)) return;
  document.documentElement.style.setProperty("--color-primary-blue", hex);
  document.documentElement.style.setProperty("--primary", hex);
  updateFaviconColor(hex);
}
