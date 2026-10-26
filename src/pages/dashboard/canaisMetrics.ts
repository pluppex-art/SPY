import { parseCurrencyBR } from "../../lib/utils";
import { getProposalItemMonthlyValue, getProposalItemRealValue, getProposalDiscountRatio } from "../../lib/saleCalculator";
import { dentro, faixaAnterior, leadCriadoEm, type Faixa } from "./vendedoresMetrics";

/** Números por canal de origem da Central de Receita › Mapa da Receita › Canais.
 *  A receita é atribuída pelo CONTRATO assinado no período: contrato → proposta →
 *  lead → origem (lead.source). Assim o total dos canais fecha com o "Receita" do
 *  Fluxo da Receita (antes somava o valor dos leads fechados e não batia).
 *
 *  - Receita: recorrente conta só a mensalidade; pontual (à vista/parcelado) o valor
 *    todo, com o desconto negociado da proposta.
 *  - Vendas: contratos assinados no período vindos do canal.
 *  - Leads / Conversão: leads CRIADOS no período no canal; conversão = desses, os
 *    que já estão Fechados ÷ total.
 *  - Ticket médio = receita ÷ vendas · Participação = receita ÷ receita de todos.
 *  - Tendência: receita vs período anterior de mesmo tamanho. */

export const COR_CANAL = ["#f97316", "#3b82f6", "#a855f7", "#eab308", "#14b8a6", "#ec4899", "#64748b", "#22c55e"];

export type MetricaCanal = "receita" | "mrr" | "total" | "vendas" | "leads";
export const METRICA_CANAL_LABEL: Record<MetricaCanal, string> = {
  receita: "Receita (mensalidade + pontual)",
  mrr: "Recorrente (MRR)",
  total: "Total do contrato",
  vendas: "Vendas",
  leads: "Leads",
};

export const SEM_ORIGEM = "Sem origem informada";

const contratoParaIso = (d?: string | null) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

export interface CanalLinha {
  key: string;
  nome: string;
  cor: string;
  receita: number;
  mrr: number;
  total: number;
  vendas: number;
  leads: number;
  fechados: number;
  conversao: number | null; // %
  ticket: number;
  participacao: number; // %
  tendencia: number | null; // %
  receitaAnterior: number;
  contratos: any[];
  leadsDoCanal: any[];
}

export interface DadosCanais {
  leads: any[];
  contracts: any[];
  proposals: any[];
  proposalItems: any[];
}

export function computeCanais(dados: DadosCanais, periodo: Faixa, hoje = new Date()) {
  const faixas = faixaAnterior(periodo, hoje);

  const leadPorId = new Map<string, any>((dados.leads || []).map((l: any) => [l.id, l]));
  const propostaPorId = new Map<string, any>((dados.proposals || []).map((p: any) => [p.id, p]));
  const itensPorProposta = new Map<string, any[]>();
  (dados.proposalItems || []).forEach((i: any) => {
    const arr = itensPorProposta.get(i.proposal_id) ?? [];
    arr.push(i);
    itensPorProposta.set(i.proposal_id, arr);
  });

  // Mesmo canal com caixas diferentes ("Manual"/"manual") vira um só; mantém a 1ª grafia.
  const grafia = new Map<string, string>();
  const chaveDe = (origem: unknown) => {
    const t = String(origem ?? "").trim();
    if (!t) return SEM_ORIGEM;
    const k = t.toLowerCase();
    if (!grafia.has(k)) grafia.set(k, t);
    return k;
  };
  const nomeDe = (key: string) => (key === SEM_ORIGEM ? SEM_ORIGEM : grafia.get(key) ?? key);

  const base = new Map<string, CanalLinha>();
  const garantir = (key: string) => {
    let r = base.get(key);
    if (!r) {
      r = {
        key, nome: nomeDe(key), cor: "", receita: 0, mrr: 0, total: 0, vendas: 0, leads: 0, fechados: 0, conversao: null,
        ticket: 0, participacao: 0, tendencia: null, receitaAnterior: 0, contratos: [], leadsDoCanal: [],
      };
      base.set(key, r);
    }
    return r;
  };

  // Coorte de leads criados no período.
  for (const l of dados.leads || []) {
    if (!dentro(leadCriadoEm(l), faixas.atual)) continue;
    const r = garantir(chaveDe(l.source));
    r.leads += 1;
    r.leadsDoCanal.push(l);
    if (l.status === "Fechado") r.fechados += 1;
  }

  // Vendas: contratos assinados no período, atribuídos ao canal do lead da proposta.
  for (const c of dados.contracts || []) {
    if (c.status === "Cancelado" || c.status === "Perdido") continue;
    const iso = contratoParaIso(c.date);
    if (!iso) continue;
    const proposta = c.proposalId ? propostaPorId.get(c.proposalId) : undefined;
    const lead = leadPorId.get(proposta?.lead_id ?? c.leadId ?? c.lead_id);
    const r = garantir(chaveDe(lead?.source));

    const itens = c.proposalId ? itensPorProposta.get(c.proposalId) ?? [] : [];
    let valor = 0, mrr = 0, total = 0;
    if (proposta && itens.length > 0) {
      const ratio = getProposalDiscountRatio(proposta.valor, itens);
      for (const i of itens) {
        const mensal = getProposalItemMonthlyValue(i);
        valor += (mensal ?? getProposalItemRealValue(i)) * ratio;
        mrr += (mensal ?? 0) * ratio;
        total += getProposalItemRealValue(i) * ratio;
      }
    } else {
      mrr = parseCurrencyBR(c.mrr);
      total = Math.max(c.totalValue !== undefined && c.totalValue !== null ? Number(c.totalValue) : mrr, mrr);
      valor = mrr > 0 ? mrr : total;
    }
    if (dentro(iso, faixas.atual)) {
      r.receita += valor; r.mrr += mrr; r.total += total; r.vendas += 1; r.contratos.push(c);
    } else if (dentro(iso, faixas.anterior)) {
      r.receitaAnterior += valor;
    }
  }

  const totalReceita = [...base.values()].reduce((s, r) => s + r.receita, 0);
  const totalAnterior = [...base.values()].reduce((s, r) => s + r.receitaAnterior, 0);
  const linhas: CanalLinha[] = [...base.values()]
    .map((r) => ({
      ...r,
      conversao: r.leads > 0 ? Math.round((r.fechados / r.leads) * 1000) / 10 : null,
      ticket: r.vendas > 0 ? r.receita / r.vendas : 0,
      participacao: totalReceita > 0 ? Math.round((r.receita / totalReceita) * 1000) / 10 : 0,
      tendencia: r.receitaAnterior > 0 ? Math.round(((r.receita - r.receitaAnterior) / r.receitaAnterior) * 100) : null,
    }))
    .sort((a, b) => b.receita - a.receita || b.vendas - a.vendas || b.leads - a.leads)
    .map((r, i) => ({ ...r, cor: COR_CANAL[i % COR_CANAL.length] }));

  const semOrigem = linhas.find((l) => l.key === SEM_ORIGEM);
  return {
    linhas,
    totalReceita,
    variacaoTotal: totalAnterior > 0 ? Math.round(((totalReceita - totalAnterior) / totalAnterior) * 100) : null,
    vendasSemOrigem: semOrigem?.vendas ?? 0,
    faixas,
  };
}
