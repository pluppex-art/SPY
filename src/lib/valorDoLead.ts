// Valor de um negócio (lead) num lugar só. Pipeline, cards, dashboards, painel do cliente e o resumo do servidor usam ESTA regra,
// para o mesmo negócio mostrar o mesmo valor em todas as telas.
//
// Prioridade (a primeira que existir):
//   1. interesse : sem proposta e com "produtos de interesse" marcados -> soma dos preços deles (valor vivo do card, como já era)
//   2. valor     : o valor do próprio negócio (lead.value) maior que zero
//   3. proposta  : valor da proposta mais recente ligada ao negócio
//   4. catalogo  : soma do preço dos produtos da venda (productIds) na tabela de preços — ESTIMADO (aparece com "~"),
//                  SÓ para negócio ainda em aberto. Negócio ganho ou perdido sem valor fica em 0: pode ser cortesia (R$ 0 de propósito)
//                  e somar o preço de tabela criaria receita fantasma (bug já corrigido no pódio de vendedores em 27/09).
//   5. nenhuma   : sem valor conhecido (0)
// Sem imports além de ./dinheiro.js (o servidor também usa, em Node ESM).
import { lerValorPositivo, round2, valorNum } from "./dinheiro.js";
import { isLeadOpen } from "./leadStatus.js";

export type OrigemValor = "interesse" | "valor" | "proposta" | "catalogo" | "nenhuma";

export interface LeadParaValor {
  id?: string | null; status?: string | null; value?: unknown; valor?: unknown; productIds?: unknown;
  customFields?: { produtosInteresseIds?: unknown } | null;
  /** Alternativa a customFields quando só esse campo foi buscado (servidor). */
  interesseIds?: unknown;
}
export interface ContextoValor {
  /** Última proposta de cada negócio (lead_id -> valor). */
  propostaDoLead: Map<string, number>;
  /** Negócios que têm QUALQUER proposta (mesmo valor 0): a regra de interesse só vale sem proposta. */
  leadsComProposta: Set<string>;
  precoDoProduto: Map<string, number>;
}
export interface ValorDoLead { valor: number; origem: OrigemValor; estimado: boolean }

/** Prepara os mapas uma vez (rápido para milhares de negócios). `proposals` pode vir em qualquer ordem. */
export function prepararValor(proposals: Array<{ lead_id?: string | null; valor?: unknown; created_at?: string | null }> | null | undefined,
                              products: Array<{ id?: string | null; price?: unknown }> | null | undefined): ContextoValor {
  const mais_recente = new Map<string, { t: number; valor: number }>();
  const leadsComProposta = new Set<string>();
  for (const p of proposals || []) {
    if (!p?.lead_id) continue;
    leadsComProposta.add(p.lead_id);
    const t = p.created_at ? new Date(p.created_at).getTime() || 0 : 0;
    const atual = mais_recente.get(p.lead_id);
    if (!atual || t >= atual.t) mais_recente.set(p.lead_id, { t, valor: valorNum(p.valor) });
  }
  const propostaDoLead = new Map<string, number>();
  for (const [k, v] of mais_recente) propostaDoLead.set(k, v.valor);
  const precoDoProduto = new Map<string, number>();
  for (const p of products || []) if (p?.id) precoDoProduto.set(p.id, valorNum(p.price));
  return { propostaDoLead, leadsComProposta, precoDoProduto };
}

const ids = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export function valorDoLead(lead: LeadParaValor | null | undefined, ctx: ContextoValor): ValorDoLead {
  if (!lead) return { valor: 0, origem: "nenhuma", estimado: false };
  const temProposta = !!lead.id && ctx.leadsComProposta.has(lead.id);

  const interesseBruto = lead.customFields?.produtosInteresseIds ?? lead.interesseIds;
  if (!temProposta && Array.isArray(interesseBruto)) {
    const valor = round2(ids(interesseBruto).reduce((s, id) => s + (ctx.precoDoProduto.get(id) || 0), 0));
    return { valor, origem: "interesse", estimado: false };
  }
  const proprio = lerValorPositivo(lead.value ?? lead.valor);
  if (proprio > 0) return { valor: proprio, origem: "valor", estimado: false };

  const proposta = lead.id ? ctx.propostaDoLead.get(lead.id) || 0 : 0;
  if (proposta > 0) return { valor: proposta, origem: "proposta", estimado: false };

  if (isLeadOpen(lead.status)) {
    const catalogo = round2([...new Set(ids(lead.productIds))].reduce((s, id) => s + (ctx.precoDoProduto.get(id) || 0), 0));
    if (catalogo > 0) return { valor: catalogo, origem: "catalogo", estimado: true };
  }

  return { valor: 0, origem: "nenhuma", estimado: false };
}

export interface SomaDeLeads { total: number; estimado: number; quantidade: number; quantidadeEstimados: number; semValor: number }

/** Soma o valor de vários negócios pela mesma regra. `estimado` é a parte do total que veio do preço de tabela. */
export function somarLeads(leads: readonly LeadParaValor[] | null | undefined, ctx: ContextoValor): SomaDeLeads {
  let total = 0, estimado = 0, qEst = 0, sem = 0, q = 0;
  for (const l of leads || []) {
    q++;
    const v = valorDoLead(l, ctx);
    total += v.valor;
    if (v.estimado) { estimado += v.valor; qEst++; }
    if (v.valor === 0) sem++;
  }
  return { total: round2(total), estimado: round2(estimado), quantidade: q, quantidadeEstimados: qEst, semValor: sem };
}
