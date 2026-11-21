// Regras para quem grava lançamento SEM usuário na tela (integrações por API, agendamento): pagamento confirmado de lançamento novo
// (origem_registro preenchida, status Pago) não se edita (M2) — a devolução vira um lançamento de ESTORNO ligado ao original.

export type LancamentoExistente = {
  id: string; description?: string | null; status?: string | null; value?: number | string | null; type?: string | null;
  origem_registro?: string | null; conta_bancaria_id?: string | null;
} | null | undefined;

export type DecisaoEscrita =
  | { acao: "livre" }                      // não existe, ou é lançamento antigo / ainda aberto: grava como sempre
  | { acao: "so_permitidos" }              // pago e igual: pode mudar só campos que o banco aceita (descrição, tags, contato...)
  | { acao: "estornar" }                   // pago e a nova versão é valor 0: gera o estorno
  | { acao: "conflito"; motivo: string };  // pago e a nova versão mudaria valor/status/tipo: não dá

/** Campos que o banco não deixa mudar num pagamento confirmado de lançamento novo (ver M2). */
export const CAMPOS_TRAVADOS_NO_PAGO = ["value", "type", "status", "data_pagamento", "conta_bancaria_id", "competencia_date", "category_id", "venda_id"] as const;

export function decidirEscritaExterna(existente: LancamentoExistente, nova: { value: number; status: string; type: string }): DecisaoEscrita {
  if (!existente || !existente.origem_registro || existente.status !== "Pago") return { acao: "livre" };
  if (nova.status !== "Pago") return { acao: "conflito", motivo: "O lançamento já está pago e não pode voltar a aberto. Para devolver o pagamento, envie valor 0 (gera um estorno)." };
  if (existente.type && nova.type !== existente.type) return { acao: "conflito", motivo: "O lançamento já está pago e o tipo (Receber/Pagar) não pode mudar." };
  const antigo = Number(existente.value) || 0;
  if (Math.abs(antigo - nova.value) < 0.005) return { acao: "so_permitidos" };
  if (nova.value === 0) return { acao: "estornar" };
  return { acao: "conflito", motivo: "O lançamento já está pago com outro valor e não pode ser editado. Para devolver, envie valor 0 (gera um estorno) e depois lance o novo valor com outro externalId." };
}

/** Mantém só os campos que um pagamento confirmado aceita editar. */
export function soCamposPermitidos<T extends Record<string, any>>(payload: T): Partial<T> {
  const out: Record<string, any> = { ...payload };
  for (const c of CAMPOS_TRAVADOS_NO_PAGO) delete out[c];
  delete out.category; // o nome acompanha o category_id, que também fica como está
  return out as Partial<T>;
}

/** Cria (uma única vez) o lançamento de estorno do pagamento `existente`. Devolve o erro, se houver. */
export async function criarEstorno(db: any, tenantId: string, existente: NonNullable<LancamentoExistente>, extra: { counterparty?: string | null; numero_documento?: string | null; tags?: string[] } = {}): Promise<{ error?: string }> {
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const { data: cat } = await db.from("finance_categories").select("id").eq("tenant_id", tenantId).eq("codigo", "2.02").maybeSingle();
  const { error } = await db.from("finance_entries").upsert({
    id: `estorno_${existente.id}`, tenant_id: tenantId, description: `Estorno - ${existente.description ?? existente.id}`, value: Number(existente.value) || 0,
    type: existente.type === "Pagar" ? "Receber" : "Pagar", status: "Pago", date: hoje, competencia_date: hoje,
    category: "Devoluções e estornos de vendas", ...(cat?.id ? { category_id: cat.id } : {}),
    ...(extra.counterparty ? { counterparty: extra.counterparty } : {}), ...(extra.numero_documento ? { numero_documento: extra.numero_documento } : {}),
    tags: [...(extra.tags ?? []), "Estorno"], estorno_de: existente.id,
    ...(existente.conta_bancaria_id ? { conta_bancaria_id: existente.conta_bancaria_id } : {}),
  }, { onConflict: "id" });
  return error ? { error: error.message } : {};
}
