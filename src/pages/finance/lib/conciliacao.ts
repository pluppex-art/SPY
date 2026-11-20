/**
 * Conciliação bancária — regras puras (sem tela, sem banco): casar uma linha do extrato com um lançamento do
 * financeiro e montar o lançamento quando não existe nenhum.
 */

export interface LinhaExtrato {
  id: string;
  /** dd/mm/aaaa (formato do extrato importado). */
  data: string;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
  banco: string;
  contaId?: string | null;
}

export interface LancamentoLike {
  id: string;
  value: number | string;
  type: "Pagar" | "Receber" | string;
  /** aaaa-mm-dd ou dd/mm/aaaa (o campo legado aceita os dois). */
  date?: string | null;
  conta_bancaria_id?: string | null;
  description?: string;
}

/** "dd/mm/aaaa" ou "aaaa-mm-dd[...]" → "aaaa-mm-dd" (ou null se não der para entender). */
export function paraISO(data?: string | null): string | null {
  const t = String(data ?? "").trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(t);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Diferença em dias inteiros entre duas datas aaaa-mm-dd (sempre positiva). */
export function diasEntre(a: string, b: string): number {
  return Math.abs(Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000));
}

/**
 * Acha o lançamento que corresponde à linha do extrato: mesmo tipo (crédito = Receber, débito = Pagar), mesmo valor (±1 centavo),
 * data a até `janelaDias` dias da data do extrato e ainda não usado. Entre vários, vale o mais próximo da data; empatando, o da mesma conta.
 */
export function acharLancamento(item: LinhaExtrato, lancamentos: LancamentoLike[], usados: Set<string>, janelaDias = 7): LancamentoLike | null {
  const dataItem = paraISO(item.data);
  if (!dataItem) return null;
  let melhor: { l: LancamentoLike; dist: number; mesmaConta: boolean } | null = null;
  for (const l of lancamentos) {
    if (usados.has(l.id)) continue;
    if (Math.abs(Number(l.value) - item.valor) >= 0.01) continue;
    if ((item.tipo === "credito" ? "Receber" : "Pagar") !== l.type) continue;
    const dl = paraISO(l.date);
    if (!dl) continue;
    const dist = diasEntre(dataItem, dl);
    if (dist > janelaDias) continue;
    const mesmaConta = !!item.contaId && l.conta_bancaria_id === item.contaId;
    if (!melhor || dist < melhor.dist || (dist === melhor.dist && mesmaConta && !melhor.mesmaConta)) melhor = { l, dist, mesmaConta };
  }
  return melhor?.l ?? null;
}

/** Lançamento (já pago, na data do banco) que representa a linha do extrato. */
export function lancamentoDoExtrato(item: LinhaExtrato, o: { contaId?: string | null; categoria?: string | null; categoriaId?: string | null; descricao?: string }) {
  return {
    description: (o.descricao ?? item.descricao).trim().slice(0, 200) || "Movimentação bancária",
    category: o.categoria || "A classificar",
    ...(o.categoriaId ? { category_id: o.categoriaId } : {}),
    status: "Pago",
    value: item.valor,
    type: item.tipo === "credito" ? "Receber" : "Pagar",
    date: paraISO(item.data) as string,
    payment_method: "Conciliação bancária",
    ...(o.contaId ?? item.contaId ? { conta_bancaria_id: (o.contaId ?? item.contaId) as string } : {}),
  };
}
