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

/** Cor padrão do sistema: roxo. Empresas com cor própria (tenants.primary_color) continuam com a delas. */
export const DEFAULT_BRAND_COLOR = BRAND_COLORS.find((c) => c.id === "purple")!.hex;

/** Cor da tela de login quando a empresa ainda não foi identificada: o roxo padrão do S.P.Y. */
export const LOGIN_DEFAULT_COLOR = DEFAULT_BRAND_COLOR;

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
 * Atualiza dinamicamente o favicon na aba do navegador com a cor informada.
 */
let faviconSeq = 0;
const faviconImgs: Record<string, Promise<HTMLImageElement>> = {};
function loadImg(src: string): Promise<HTMLImageElement> {
  return (faviconImgs[src] ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  }));
}

/** Favicon = ícone oficial do espião, pintado com a cor da empresa (a mesma dos botões), sobre um disco escuro. */
export async function updateFaviconColor(hex: string) {
  if (typeof document === "undefined" || !isValidBrandHex(hex)) return;
  const seq = ++faviconSeq;
  try {
    const [white, mask] = await Promise.all([loadImg("/logo-icon-white.webp"), loadImg("/logo-icon-color.webp")]);
    if (seq !== faviconSeq) return; // uma troca de cor mais nova já está a caminho
    const N = 128;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = N;
    const g = canvas.getContext("2d");
    if (!g) return;
    g.fillStyle = "#0B1120";
    g.beginPath();
    g.arc(N / 2, N / 2, N / 2, 0, Math.PI * 2);
    g.fill();
    g.drawImage(white, 0, 0, N, N);
    const tint = document.createElement("canvas");
    tint.width = tint.height = N;
    const t = tint.getContext("2d")!;
    t.drawImage(mask, 0, 0, N, N);
    t.globalCompositeOperation = "source-in";
    t.fillStyle = hex;
    t.fillRect(0, 0, N, N);
    g.drawImage(tint, 0, 0);
    document.querySelectorAll('link[rel~="icon"]').forEach((el) => el.remove());
    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";
    link.href = canvas.toDataURL("image/png");
    document.head.appendChild(link);
  } catch {
    /* sem canvas/imagem: fica o favicon estático do index.html */
  }
}

function whiteContrast(hex: string): number {
  let h = hex.replace("#", "");
  if (h.length === 3 || h.length === 4) h = h.split("").map((c) => c + c).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const l = 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  return 1.05 / (l + 0.05);
}

/**
 * Aplica a cor do tema nas variáveis CSS globais e no favicon.
 */
export function applyThemeColor(hex: string, _tenantName?: string) {
  if (typeof document === "undefined" || !hex || !/^#[0-9a-fA-F]{3,8}$/.test(hex)) return;
  document.documentElement.style.setProperty("--color-primary-blue", hex);
  document.documentElement.style.setProperty("--primary", hex);
  // Acessibilidade: se a cor da empresa for tão clara que o branco fica ilegível (< 2,5:1),
  // o texto sobre fundos sólidos dessa cor passa a ser escuro. Cor da marca não muda.
  document.documentElement.classList.toggle("on-primary-dark", whiteContrast(hex) < 2.5);
  updateFaviconColor(hex);
}
