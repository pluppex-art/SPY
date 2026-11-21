// Estorno de pagamento confirmado (Fase 1, M2/M5): um pagamento confirmado da regra nova não se edita nem se apaga —
// a correção é um lançamento de estorno ligado ao original (estorno_de), de tipo oposto e mesmo valor.

export interface LancamentoEstornavel {
  id: string; type: "Pagar" | "Receber"; status: string; value: number | string; description?: string | null;
  counterparty?: string | null; contato_id?: string | null; payment_method?: string | null; conta_bancaria_id?: string | null;
  origem_registro?: string | null; estorno_de?: string | null;
}

export const CATEGORIA_ESTORNO = "Devoluções e estornos de vendas";

/** Pagamento confirmado da regra nova, que ainda não é um estorno e ainda não foi estornado. */
export function podeEstornar(e: LancamentoEstornavel, todos: Array<{ estorno_de?: string | null }>): { ok: true } | { ok: false; motivo: string } {
  if (e.status !== "Pago") return { ok: false, motivo: "Só dá para estornar um pagamento confirmado." };
  if (!e.origem_registro) return { ok: false, motivo: "Este lançamento é anterior à regra nova: edite ou exclua normalmente." };
  if (e.estorno_de) return { ok: false, motivo: "Este lançamento já é um estorno." };
  if (todos.some((x) => x.estorno_de === e.id)) return { ok: false, motivo: "Este pagamento já foi estornado." };
  return { ok: true };
}

/** O pagamento que trava edição e exclusão: regra nova e já pago. */
export const pagamentoTravado = (e: { status?: string; origem_registro?: string | null }): boolean => e.status === "Pago" && !!e.origem_registro;

export function montarEstorno(orig: LancamentoEstornavel, hojeISO: string, categorias: Array<{ id: string; nome: string; codigo?: string | null }> = []) {
  const cat = categorias.find((c) => c.codigo === "2.02");
  return {
    id: `estorno_${orig.id}`,
    description: `Estorno - ${orig.description || "lançamento"}`,
    value: Number(orig.value) || 0,
    type: orig.type === "Pagar" ? ("Receber" as const) : ("Pagar" as const),
    status: "Pago" as const,
    date: hojeISO,
    competencia_date: hojeISO,
    category: cat?.nome ?? CATEGORIA_ESTORNO,
    category_id: cat?.id ?? null,
    counterparty: orig.counterparty ?? null,
    contato_id: orig.contato_id ?? null,
    payment_method: orig.payment_method ?? null,
    conta_bancaria_id: orig.conta_bancaria_id ?? null,
    estorno_de: orig.id,
    tags: ["Estorno"],
  };
}
