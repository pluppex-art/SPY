// Baixa (pagar/receber) com conta bancária e data de pagamento — Fase 1 (M2 + M4).
// Lançamento ABERTO que vira Pago leva data_pagamento = hoje (dia da baixa); lançamento já criado como Pago deixa o banco preencher.
// Regra: lançamento que nasce ou passa a "Pago" leva a conta escolhida; sem escolha, vai para a conta principal
// (ou a única conta ativa). Sem nenhuma conta possível, devolve null e quem chamou deixa o banco responder.

type Conta = { id: string; is_principal?: boolean; arquivada?: boolean };

export function contaParaBaixa(contas: Conta[] | null | undefined): string | null {
  const ativas = (contas || []).filter((c) => !c.arquivada);
  return ativas.find((c) => c.is_principal)?.id ?? (ativas.length === 1 ? ativas[0].id : null);
}

/** Completa a conta quando o resultado é "Pago". Não mexe no que já veio preenchido nem em lançamentos que não são Pago. */
export function completarBaixa<T extends { status?: string; conta_bancaria_id?: string | null; data_pagamento?: string | null }>(
  dados: T, contas: Conta[] | null | undefined, statusAnterior?: string, hojeISO?: string,
): T {
  if (dados.status !== "Pago" || (statusAnterior === "Pago")) return dados;
  const out = { ...dados };
  if (statusAnterior !== undefined && hojeISO && !out.data_pagamento) out.data_pagamento = hojeISO;
  if (!out.conta_bancaria_id) { const c = contaParaBaixa(contas); if (c) out.conta_bancaria_id = c; }
  return out;
}
