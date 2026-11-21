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

/** Valor digitado em texto -> número POSITIVO (sinal ignorado). Entende "1.500,50", "1,500.50", "1500,50", "15.000" (milhar) e "1500.5". */
function magnitudeBR(val: unknown): number {
  const str = String(val ?? "").trim();
  if (!str) return 0;

  if (str.includes(".") && str.includes(",")) {
    if (str.lastIndexOf(",") > str.lastIndexOf(".")) {
      const clean = str.replace(/[^\d,]/g, "").replace(",", ".");   // 1.500,50 (Brasil)
      return parseFloat(clean) || 0;
    }
    const clean = str.replace(/[^\d.]/g, "");                        // 1,500.50 (EUA)
    return parseFloat(clean) || 0;
  }
  if (str.includes(",")) {                                            // 1500,50
    const clean = str.replace(/[^\d,]/g, "").replace(",", ".");
    return parseFloat(clean) || 0;
  }
  if (str.includes(".")) {
    const parts = str.split(".");
    if (parts.length > 1 && parts[parts.length - 1].length === 3) {   // 15.000 = milhar
      return parseFloat(str.replace(/\D/g, "")) || 0;
    }
    return parseFloat(str.replace(/[^\d.]/g, "")) || 0;              // 1500.50
  }
  return parseFloat(str.replace(/\D/g, "")) || 0;
}

/** Leitura única de valor digitado/importado. Número passa direto; texto vira número (0 se não der para ler); "-50" e "(50)" ficam negativos. */
export function lerValor(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const str = String(v ?? "").trim();
  if (!str) return 0;
  const negativo = /^(R\$\s*)?-/.test(str) || /^\(.*\)$/.test(str);
  const m = magnitudeBR(str);
  return negativo ? -m : m;
}

/** Igual a lerValor, mas texto sempre positivo (campos que nunca aceitam negativo: preço, meta, quantia). */
export function lerValorPositivo(v: unknown): number {
  return typeof v === "number" ? (Number.isFinite(v) ? v : 0) : magnitudeBR(v);
}
