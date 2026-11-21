// Negócio ganho SEM proposta (venda rápida, o cliente não usa proposta/contrato): o ganho já entra no financeiro como
// venda recebida (Pago). Id fixo por negócio (`ganho_<leadId>`) = uma vez só, mesmo que o status mude e volte.
// Com proposta, quem lança o financeiro é a própria proposta aceita: aqui não duplica.

export interface LeadGanho {
  id: string; name?: string | null; title?: string | null; clientName?: string | null; clientId?: string | null;
  value?: unknown; status?: string | null;
  customFields?: Record<string, unknown> | null;
}

export const idLancamentoDoGanho = (leadId: string) => `ganho_${leadId}`;

/** Deve lançar? Tem valor, não tem proposta, e o lançamento ainda não existe. */
export function deveLancarGanho(valor: number, temProposta: boolean, jaExiste: boolean): boolean {
  return valor > 0 && !temProposta && !jaExiste;
}

/** Forma de pagamento que o negócio já traz (campos do lead); vazio quando não há — nunca inventa uma. */
export function formaDePagamentoDoLead(lead: Pick<LeadGanho, "customFields">): string | null {
  const cf = lead.customFields || {};
  for (const k of ["forma_pagamento", "formaPagamento", "metodo_pagamento", "metodoPagamento", "payment_method", "paymentMethod"]) {
    const v = cf[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function montarLancamentoDoGanho(lead: LeadGanho, valor: number, hojeISO: string, categorias: Array<{ id: string; nome: string; tipo?: string; codigo?: string | null }> = []) {
  const cat = categorias.find((c) => c.codigo === "1.01") ?? categorias.find((c) => c.tipo === "Receita" && /^vendas?$/i.test(c.nome.trim()));
  // O cliente é a PESSOA do negócio (ex.: Cícero Divino). `clientName` pode ser a empresa dela (ex.: a loja), que não é quem comprou.
  const quem = lead.name || lead.clientName || "Cliente";
  return {
    id: idLancamentoDoGanho(lead.id),
    description: `Venda - ${lead.title || quem}`,
    value: valor,
    type: "Receber" as const,
    // Negócio ganho = venda feita e recebida (o Agente Secreto só leva para Ganho depois de confirmar o pagamento).
    status: "Pago" as const,
    date: hojeISO,
    competencia_date: hojeISO,
    category: cat?.nome ?? "Vendas",
    category_id: cat?.id ?? null,
    counterparty: quem,
    contato_id: lead.clientId ?? null,
    tags: ["Venda", "Ganho"],
    payment_method: formaDePagamentoDoLead(lead),
  };
}

/**
 * Ganho que veio do Agente Secreto (ou outra integração que move o card sem passar pela tela): o status não muda na tela,
 * então a conta a receber precisa ser lançada na reconciliação. Limitado ao Agente Secreto e aos últimos 90 dias de propósito:
 * o histórico importado (milhares de ganhos antigos) e as reservas do agendamento (que já têm o próprio lançamento) ficam de fora.
 */
export function ehGanhoDoAgente(lead: { source?: string | null; updated_at?: string | null; date?: string | null }, agora: number): boolean {
  if (!/agente\s*secreto/i.test(lead.source || "")) return false;
  const t = new Date(lead.updated_at || lead.date || "").getTime();
  return Number.isFinite(t) && agora - t <= 90 * 86400000;
}
