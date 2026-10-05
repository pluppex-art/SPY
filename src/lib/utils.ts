import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Normaliza texto pra comparação/busca: minúsculo + sem acento. Toda busca
// de usuário (campo de pesquisa de clientes/leads/propostas/etc.) precisa
// comparar com isso dos dois lados — vendedor digitando sem acento ou em
// maiúsculo tem que achar "José"/"JOSÉ" normalmente, senão a busca "falha"
// silenciosamente pro usuário (pedido explícito: interfere no dia a dia de
// vendedores e clientes).
export function normalizeText(str: string | null | undefined): string {
  return (str ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export function formatCNPJ(value: string) {
  return value
    .replace(/\D/g, '')
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
    .slice(0, 18);
}

export function formatPhone(value: string) {
  const cleaned = value.replace(/\D/g, '');
  let formatted = cleaned;
  if (cleaned.length > 2) formatted = `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`;
  if (cleaned.length > 6) formatted = `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7, 11)}`;
  return formatted.slice(0, 15);
}

export function validatePhone(phone: string): boolean {
  if (!phone) return true;
  const stripped = phone.replace(/\D/g, '');
  return stripped.length >= 10 && stripped.length <= 11;
}
export function validateCNPJ(cnpj: string): boolean {
  if (!cnpj) return true; // Allows empty unless required
  const stripped = cnpj.replace(/[^\d]+/g, '');
  if (stripped.length !== 14) return false;
  
  if (/^(\d)\1+$/.test(stripped)) return false; // same chars

  // Validation algo (simplified for demo or actual full check can be complex, let's do real check)
  let size = stripped.length - 2;
  let numbers = stripped.substring(0, size);
  const digits = stripped.substring(size);
  let sum = 0;
  let pos = size - 7;
  
  for (let i = size; i >= 1; i--) {
    sum += Number(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  let result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== Number(digits.charAt(0))) return false;
  
  size = size + 1;
  numbers = stripped.substring(0, size);
  sum = 0;
  pos = size - 7;
  for (let i = size; i >= 1; i--) {
    sum += Number(numbers.charAt(size - i)) * pos--;
    if (pos < 2) pos = 9;
  }
  
  result = sum % 11 < 2 ? 0 : 11 - (sum % 11);
  if (result !== Number(digits.charAt(1))) return false;
  
  return true;
}

export function parseCurrencyBR(val: any): number {
  if (typeof val === "number") return isNaN(val) ? 0 : val;
  if (!val) return 0;
  const str = String(val).trim();
  if (!str) return 0;

  // Handles both dot and comma e.g. "1.500,50" vs "1,500.50"
  if (str.includes(".") && str.includes(",")) {
    if (str.lastIndexOf(",") > str.lastIndexOf(".")) {
      // Brazilian format (1.500,50) -> remove non-digits except comma -> replace comma with dot
      const clean = str.replace(/[^\d,]/g, "").replace(",", ".");
      return parseFloat(clean) || 0;
    } else {
      // US format (1,500.50) -> remove non-digits except dot
      const clean = str.replace(/[^\d.]/g, "");
      return parseFloat(clean) || 0;
    }
  }

  // Only comma: "1500,50" or "50,00"
  if (str.includes(",")) {
    const clean = str.replace(/[^\d,]/g, "").replace(",", ".");
    return parseFloat(clean) || 0;
  }

  // Only dot: "1.500" (thousands) vs "1500.50" (decimal)
  if (str.includes(".")) {
    const parts = str.split(".");
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {
      // Thousands separator: "15.000" or "1.500"
      const clean = str.replace(/\D/g, "");
      return parseFloat(clean) || 0;
    }
    const clean = str.replace(/[^\d.]/g, "");
    return parseFloat(clean) || 0;
  }

  const clean = str.replace(/\D/g, "");
  return parseFloat(clean) || 0;
}

export function formatCurrencyBR(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
}

/**
 * Formata percentual em pt-BR (vírgula decimal, 1 casa). Todas as funções de
 * métrica do sistema (getConversionRate/getChurnRate em revenueMetrics.ts,
 * os endpoints /api/*-summary em server.ts) já devolvem o número na escala
 * 0–100 (ex.: 6.8 = "6,8%", nunca 0.068) — este utilitário assume essa mesma
 * escala. Não multiplicar de novo por 100 antes de chamar.
 */
export function formatPercentage(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

/** "há 12 min" / "há 3 h" / "há 5 dias" — feeds de atividade recente (Dashboard, etc.). */
export function timeAgo(iso: string | number | Date): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diffMs) || diffMs < 0) return "agora";
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} ${d === 1 ? "dia" : "dias"}`;
  const mo = Math.floor(d / 30);
  return `há ${mo} ${mo === 1 ? "mês" : "meses"}`;
}

