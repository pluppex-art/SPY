// Venda direta = negócio ganho SEM contrato e SEM proposta (o cliente vende rápido, não usa proposta/contrato).
// Para os painéis que somam "vendas" a partir de contratos (canais, produtos, segmentos, vendedores), cada venda direta vira um
// "contrato virtual" só em memória (id `venda-<lead>`): nunca é gravado nem aparece na tela de Contratos.
// Só vale para empresa SEM nenhum contrato de verdade (o chamador confere): senão o MRR recorrente seria inflado por venda avulsa.
import { lerValorPositivo } from "./dinheiro.js";
import { isLeadWon } from "./leadStatus.js";

export interface LeadVenda {
  id: string; status?: string | null; source?: string | null; value?: unknown; valor?: unknown;
  date?: string | null; closed_at?: string | null; created_at?: string | null; updated_at?: string | null;
  /** O status "Fechado" veio da ETAPA (o Agente Secreto moveu o card e o status gravado ficou "Novo"): a data do ganho é a da última atualização. */
  ganhoPelaEtapa?: boolean;
  clientName?: string | null; name?: string | null; seller?: string | null;
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
/**
 * Dia em que o negócio FOI GANHO (AAAA-MM-DD): data do fechamento; se o Agente Secreto levou o card para Ganho sem marcar o fechamento,
 * a data da última atualização; senão, a do cadastro. Os painéis por período usam este dia para negócio ganho (e o cadastro só para o resto):
 * negócio criado em outubro e ganho em novembro é venda de novembro.
 */
export function diaDoGanhoISO(l: LeadVenda): string {
  const candidatos = [l.closed_at, l.ganhoPelaEtapa ? l.updated_at : null, l.date, l.created_at];
  for (const bruto of candidatos) {
    const m = typeof bruto === "string" ? ISO.exec(bruto) : null;
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return "";
}

/** Dia da venda no formato dos contratos (DD/MM/AAAA). */
export function diaDaVenda(l: LeadVenda): string {
  const iso = diaDoGanhoISO(l);
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "";
}

export function vendasDiretasComoContratos(leads: readonly LeadVenda[] | null | undefined, proposals: ReadonlyArray<{ lead_id?: string | null }> | null | undefined) {
  const comProposta = new Set((proposals || []).map((p) => p.lead_id).filter((x): x is string => !!x));
  const out: any[] = [];
  for (const l of leads || []) {
    if (!isLeadWon(l.status)) continue;
    // Venda importada do Max Data entra sempre (já era assim); as demais só sem proposta (com proposta, o contrato nasce dela).
    if (l.source !== "Max Data" && comProposta.has(l.id)) continue;
    const v = lerValorPositivo(l.value ?? l.valor);
    out.push({
      id: `venda-${l.id}`, leadId: l.id, client: l.clientName || l.name || "Consumidor final", plan: "Venda",
      mrr: v, totalValue: v, status: "Ativo", date: diaDaVenda(l), progress: 100, proposalId: null, cancelledAt: null, seller: l.seller,
    });
  }
  return out;
}
