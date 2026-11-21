// Dinheiro num lugar só: arredondar, formatar em reais e ler valor. Sem imports (o servidor também usa, em Node ESM).
// Regra: arredonda em centavos com round2; mostra sempre "R$ 1.234,56" (pt-BR). Valores em CENTAVOS (planos, checkout) usam formatBRLCentavos.

/** Arredonda para 2 casas evitando o erro do ponto flutuante (0.1 + 0.2). */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Reais -> "R$ 1.234,56". Vazio, texto ou NaN viram R$ 0,00. */
export function formatBRL(v: unknown): string {
  const n = Number(v);
  return (Number.isFinite(n) ? n : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** Centavos inteiros -> "R$ 12,34" (planos de assinatura, checkout). */
export function formatBRLCentavos(c: unknown): string {
  const n = Number(c);
  return formatBRL((Number.isFinite(n) ? n : 0) / 100);
}

/** Valor numérico seguro: texto, null, undefined e NaN viram 0. */
export function valorNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Soma de valores em reais, fechada em centavos. `pegar` escolhe o campo de cada item (padrão: o próprio item). */
export function somar<T>(lista: readonly T[] | null | undefined, pegar: (item: T) => unknown = (x) => x): number {
  let total = 0;
  for (const item of lista || []) total += valorNum(pegar(item));
  return round2(total);
}

/** Valor grande em forma curta: "R$ 1,2M", "R$ 850k"; abaixo de mil mostra o valor inteiro em reais. Para cards e listas de VGV. */
export function formatBRLCompacto(v: unknown): string {
  const n = valorNum(v);
  const abs = Math.abs(n);
  if (abs >= 1e6) return `R$ ${(n / 1e6).toFixed(1).replace(".", ",")}M`;
  if (abs >= 1e3) return `R$ ${(n / 1e3).toFixed(0)}k`;
  return formatBRL(n);
}
