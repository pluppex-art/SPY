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
