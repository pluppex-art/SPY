import { parseCurrencyBR } from "../../lib/utils";
import { getProposalItemMonthlyValue, getProposalItemRealValue, getProposalDiscountRatio } from "../../lib/saleCalculator";
import { dentro, faixaAnterior, type Faixa } from "./vendedoresMetrics";

/** Números por produto/serviço da Central de Receita › Mapa da Receita › Produtos.
 *  Cada contrato assinado no período é repartido pelos itens da proposta que o
 *  originou (mesma regra de Segmentos):
 *  - Receita: item RECORRENTE conta só a mensalidade; item pontual (à vista ou
 *    parcelado) conta o valor todo; já com o desconto negociado da proposta.
 *  - MRR: só a mensalidade dos itens recorrentes.
 *  - Total do contrato: mensalidade × meses + pontuais (projeção).
 *  - Vendas: contratos assinados no período que têm o produto.
 *  - Ticket médio = receita ÷ vendas · Participação = receita ÷ receita de todos.
 *  - Margem: a do cadastro do produto (margem informada, ou (preço − custo) ÷ preço).
 *  - Tendência: receita vs período anterior de mesmo tamanho. */

export const COR_PRODUTO = ["#f97316", "#14b8a6", "#a855f7", "#3b82f6", "#eab308", "#ec4899", "#64748b", "#22c55e"];

export type MetricaProduto = "receita" | "mrr" | "total" | "vendas";
export const METRICA_PRODUTO_LABEL: Record<MetricaProduto, string> = {
  receita: "Receita (mensalidade + pontual)",
  mrr: "Recorrente (MRR)",
  total: "Total do contrato",
  vendas: "Vendas",
};

const SEM_ITENS = "__sem_itens__";

const contratoParaIso = (d?: string | null) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

/** Tira sufixos que o fluxo de venda anexa ao nome ("… (Assinatura Mensal — 1 ciclo)"). */
export function nomeLimpoProduto(n: unknown): string {
  return String(n || "Produto")
    .replace(/\s*\((Assinatura|Taxa)[^)]*\)\s*$/i, "")
    .replace(/^Taxa de Implanta[^—]*—\s*/i, "Implantação — ")
    .trim();
}

export interface ProdutoLinha {
  key: string;
  nome: string;
  cor: string;
  receita: number;
  mrr: number;
  total: number;
  vendas: number;
  ticket: number;
  participacao: number; // %
  margem: number | null; // %
  tendencia: number | null; // %
  receitaAnterior: number;
  contratos: any[];
}

export interface EventoProduto { vendedorKey: string; iso: string; valor: number; mrr: number; total: number; vendas: number }

export interface DadosProdutos {
  contracts: any[];
  proposals: any[];
  proposalItems: any[];
  products: any[];
}

function margemDoProduto(p: any): number | null {
  const m = p?.margin;
  if (m !== undefined && m !== null && m !== "" && Number.isFinite(Number(m))) return Number(m);
  const preco = Number(p?.price) || 0;
  const custo = Number(p?.cost) || 0;
  return preco > 0 && custo > 0 ? Math.round(((preco - custo) / preco) * 1000) / 10 : null;
}

export function computeProdutos(dados: DadosProdutos, periodo: Faixa, hoje = new Date()) {
  const faixas = faixaAnterior(periodo, hoje);

  const catalogo = new Map<string, any>((dados.products || []).filter((p: any) => p.active !== false).map((p: any) => [String(p.id), p]));
  const itensPorProposta = new Map<string, any[]>();
  (dados.proposalItems || []).forEach((i: any) => {
    const arr = itensPorProposta.get(i.proposal_id) ?? [];
    arr.push(i);
    itensPorProposta.set(i.proposal_id, arr);
  });
  const propostaPorId = new Map<string, any>((dados.proposals || []).map((p: any) => [p.id, p]));

  // Chave do produto: id do catálogo. Item sem id (venda antiga/solta) junta com o produto do
  // catálogo de mesmo nome (sem sufixo de assinatura, sem diferença de caixa/espaços); sem
  // correspondência, vira uma linha pelo nome limpo.
  const normNome = (n: unknown) => String(n ?? "").trim().replace(/\s+/g, " ").toLowerCase();
  const idPorNome = new Map<string, string>();
  catalogo.forEach((p, id) => idPorNome.set(normNome(p.name), id));
  const chaveDoItem = (i: any) => {
    if (i.product_id) return String(i.product_id);
    const limpo = nomeLimpoProduto(i.product_name);
    return idPorNome.get(normNome(limpo)) ?? `nome:${limpo}`;
  };
  const nomeDe = (key: string, i?: any) => catalogo.get(key)?.name ?? (key.startsWith("nome:") ? key.slice(5) : nomeLimpoProduto(i?.product_name));

  const base = new Map<string, ProdutoLinha & { ids: Set<string> }>();
  const garantir = (key: string, nome: string) => {
    let r = base.get(key);
    if (!r) {
      r = {
        key, nome, cor: "", receita: 0, mrr: 0, total: 0, vendas: 0, ticket: 0, participacao: 0,
        margem: margemDoProduto(catalogo.get(key)), tendencia: null, receitaAnterior: 0, contratos: [], ids: new Set(),
      };
      base.set(key, r);
    }
    return r;
  };
  // Todo produto do catálogo aparece, mesmo sem venda no período.
  catalogo.forEach((p, id) => garantir(id, p.name));

  const eventos: EventoProduto[] = [];
  const somar = (key: string, nome: string, iso: string, valor: number, mrr: number, total: number, contrato: any) => {
    const r = garantir(key, nome);
    if (dentro(iso, faixas.atual)) {
      r.receita += valor;
      r.mrr += mrr;
      r.total += total;
      if (!r.ids.has(contrato.id)) {
        r.ids.add(contrato.id);
        r.vendas += 1;
        r.contratos.push(contrato);
        eventos.push({ vendedorKey: key, iso, valor: 0, mrr: 0, total: 0, vendas: 1 });
      }
      eventos.push({ vendedorKey: key, iso, valor, mrr, total, vendas: 0 });
    } else if (dentro(iso, faixas.anterior)) {
      r.receitaAnterior += valor;
    }
  };

  for (const c of dados.contracts || []) {
    if (c.status === "Cancelado" || c.status === "Perdido") continue;
    const iso = contratoParaIso(c.date);
    if (!iso) continue;
    const proposta = c.proposalId ? propostaPorId.get(c.proposalId) : undefined;
    const itens = c.proposalId ? itensPorProposta.get(c.proposalId) ?? [] : [];
    if (proposta && itens.length > 0) {
      const ratio = getProposalDiscountRatio(proposta.valor, itens);
      for (const i of itens) {
        const mensal = getProposalItemMonthlyValue(i);
        const total = getProposalItemRealValue(i) * ratio;
        const key = chaveDoItem(i);
        somar(key, nomeDe(key, i), iso, (mensal ?? getProposalItemRealValue(i)) * ratio, (mensal ?? 0) * ratio, total, c);
      }
    } else {
      // Contrato sem itens de proposta (manual/legado): não dá pra saber qual produto foi vendido.
      const mrr = parseCurrencyBR(c.mrr);
      const total = Math.max(c.totalValue !== undefined && c.totalValue !== null ? Number(c.totalValue) : mrr, mrr);
      somar(SEM_ITENS, "Sem produto vinculado", iso, mrr > 0 ? mrr : total, mrr, total, c);
    }
  }

  const totalReceita = [...base.values()].reduce((s, r) => s + r.receita, 0);
  const totalAnterior = [...base.values()].reduce((s, r) => s + r.receitaAnterior, 0);
  const linhas: ProdutoLinha[] = [...base.values()]
    .filter((r) => r.key !== SEM_ITENS || r.receita > 0 || r.vendas > 0)
    .map(({ ids: _ids, ...r }) => ({
      ...r,
      ticket: r.vendas > 0 ? r.receita / r.vendas : 0,
      participacao: totalReceita > 0 ? Math.round((r.receita / totalReceita) * 1000) / 10 : 0,
      tendencia: r.receitaAnterior > 0 ? Math.round(((r.receita - r.receitaAnterior) / r.receitaAnterior) * 100) : null,
    }))
    .sort((a, b) => b.receita - a.receita || b.vendas - a.vendas || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((r, i) => ({ ...r, cor: COR_PRODUTO[i % COR_PRODUTO.length] }));

  return {
    linhas,
    eventos,
    totalReceita,
    totalMrr: linhas.reduce((s, l) => s + l.mrr, 0),
    variacaoTotal: totalAnterior > 0 ? Math.round(((totalReceita - totalAnterior) / totalAnterior) * 100) : null,
    cadastrados: catalogo.size,
    faixas,
  };
}
