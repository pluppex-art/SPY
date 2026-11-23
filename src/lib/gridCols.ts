/**
 * Quantas colunas usar numa grade de cards para a última linha não ficar com um card sozinho:
 * divide os `n` cards no menor número de linhas possível e distribui por igual (6 → 3+3, 8 → 4+4, 9 → 3+3+3).
 * Até `max` cards cabem numa linha só.
 */
export function colunasBalanceadas(n: number, max: number): number {
  if (n <= max) return Math.max(1, n);
  const linhas = Math.ceil(n / max);
  return Math.ceil(n / linhas);
}

/** Classe de colunas (telas largas) das grades de cards do Financeiro: até 4 por linha, sem card sozinho na última. */
export function classeColunasFinanceiro(n: number): string {
  if (n === 5) return "xl:grid-cols-5"; // 5 cabem numa linha só
  const c = n <= 4 ? 4 : colunasBalanceadas(n, 4);
  return c === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4";
}

/** Classe estática (o Tailwind precisa ler o texto inteiro) de colunas em telas `lg`, até 4 por linha e sem card sozinho. */
export function gradeLg(n: number): string {
  if (n === 5) return "lg:grid-cols-5";
  return colunasBalanceadas(n, 4) === 3 ? "lg:grid-cols-3" : colunasBalanceadas(n, 4) === 2 ? "lg:grid-cols-2" : "lg:grid-cols-4";
}
/** Igual a gradeLg, para grades que abrem a partir de `md`. */
export function gradeMd(n: number): string {
  if (n === 5) return "md:grid-cols-5";
  return colunasBalanceadas(n, 4) === 3 ? "md:grid-cols-3" : colunasBalanceadas(n, 4) === 2 ? "md:grid-cols-2" : "md:grid-cols-4";
}
