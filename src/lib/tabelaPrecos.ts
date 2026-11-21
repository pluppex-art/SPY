/**
 * Tabela de preços ÚNICA do SPY = public.products ("Catálogo & Produtos").
 * Toda tela que precisa de preço, custo, margem ou código de barras de um item deve usar estas regras, e não repetir a conta.
 * (Antes a margem era calculada em 5 telas diferentes e a nota de entrada mudava o custo sem recalcular a margem.)
 */

const arredonda1 = (n: number) => Math.round((n + Number.EPSILON) * 10) / 10;
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

/** Margem sobre o preço de venda, em %, com 1 casa: (preço − custo) / preço. Sem preço, 0. Pode ser negativa (venda abaixo do custo). */
export function margemPct(preco: unknown, custo: unknown): number {
  const p = num(preco), c = num(custo);
  return p > 0 ? arredonda1(((p - c) / p) * 100) : 0;
}

/** Custo para gravar no item da venda (foto do custo no dia). `null` quando o produto não tem custo cadastrado: melhor "não sei" que um zero que parece verdade. */
export function custoParaVenda(produto: { cost?: unknown } | null | undefined): number | null {
  const c = num(produto?.cost);
  return c > 0 ? c : null;
}

/** Código de barras do produto: a coluna `ean` e, para produtos antigos, os campos `barcode`/`ean` dentro de `type_attributes`. Só dígitos e letras, em minúsculas. */
export function eanDoProduto(p: any): string {
  const bruto = p?.ean ?? p?.typeAttributes?.ean ?? p?.typeAttributes?.barcode ?? p?.type_attributes?.ean ?? p?.type_attributes?.barcode ?? "";
  return String(bruto).replace(/[^0-9a-z]/gi, "").toLowerCase();
}

/** O produto responde a este código digitado/lido no caixa? (SKU ou código de barras, sem diferenciar maiúscula nem pontuação.) */
export function produtoTemCodigo(p: any, codigo: string): boolean {
  const c = String(codigo ?? "").replace(/[^0-9a-z]/gi, "").toLowerCase();
  if (!c) return false;
  return String(p?.sku ?? "").replace(/[^0-9a-z]/gi, "").toLowerCase() === c || eanDoProduto(p) === c;
}

/** Tipos que vivem em products só para guardar um preço interno (ex.: hora de reserva do agendamento) e não são vendidos no balcão nem em proposta. */
export const TIPOS_INTERNOS = ["Reserva"];
export function produtoVendavel(p: { type?: unknown; active?: unknown } | null | undefined): boolean {
  return !!p && p.active !== false && !TIPOS_INTERNOS.includes(String(p.type ?? ""));
}
