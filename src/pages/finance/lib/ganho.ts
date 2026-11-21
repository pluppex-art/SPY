// Negócio ganho SEM proposta (venda rápida, o cliente não usa proposta/contrato): o ganho já entra no financeiro como
// conta a receber. Id fixo por negócio (`ganho_<leadId>`) = uma vez só, mesmo que o status mude e volte.
// Com proposta, quem lança o financeiro é a própria proposta aceita: aqui não duplica.

export interface LeadGanho {
  id: string; name?: string | null; title?: string | null; clientName?: string | null; clientId?: string | null;
  value?: unknown; status?: string | null;
}

export const idLancamentoDoGanho = (leadId: string) => `ganho_${leadId}`;

/** Deve lançar? Tem valor, não tem proposta, e o lançamento ainda não existe. */
export function deveLancarGanho(valor: number, temProposta: boolean, jaExiste: boolean): boolean {
  return valor > 0 && !temProposta && !jaExiste;
}

export function montarLancamentoDoGanho(lead: LeadGanho, valor: number, hojeISO: string, categorias: Array<{ id: string; nome: string; tipo?: string; codigo?: string | null }> = []) {
  const cat = categorias.find((c) => c.codigo === "1.01") ?? categorias.find((c) => c.tipo === "Receita" && /^vendas?$/i.test(c.nome.trim()));
  const quem = lead.clientName || lead.name || "Cliente";
  return {
    id: idLancamentoDoGanho(lead.id),
    description: `Venda - ${lead.title || quem}`,
    value: valor,
    type: "Receber" as const,
    status: "A Vencer" as const,
    date: hojeISO,
    competencia_date: hojeISO,
    category: cat?.nome ?? "Vendas",
    category_id: cat?.id ?? null,
    counterparty: quem,
    contato_id: lead.clientId ?? null,
    tags: ["Venda", "Ganho"],
  };
}
