import { parseCurrencyBR } from "../../lib/utils";
import { getProposalItemMonthlyValue, getProposalItemRealValue, getProposalDiscountRatio } from "../../lib/saleCalculator";
import { dentro, faixaAnterior, type Faixa } from "./vendedoresMetrics";

/** Números por segmento da Central de Receita › Mapa da Receita › Segmentos.
 *  O segmento é o que a EMPRESA vende: a categoria do produto no catálogo
 *  (ex.: Tráfego Pago, Desenvolvimento, Mentoria) — definida pelo próprio cliente
 *  do sistema, em Catálogo › Produtos. Cada contrato é repartido entre os
 *  segmentos pelos itens da proposta que o originou.
 *
 *  - Receita: valor dos itens vendidos (contratos assinados no período), já com o
 *    desconto negociado da proposta.
 *  - MRR: a parte recorrente (mensalidade) desses itens.
 *  - Negócios: contratos assinados no período que têm item do segmento.
 *  - Ticket médio = receita ÷ negócios.
 *  - Conversão = propostas aceitas ÷ propostas criadas no período com item do segmento.
 *  - Participação = receita do segmento ÷ receita de todos.
 *  - Tendência = receita vs período anterior de mesmo tamanho.
 *  - Meta: definida por segmento (app_settings.metas_segmento); realizado = receita. */

export const COR_SEGMENTO = ["#f97316", "#14b8a6", "#a855f7", "#3b82f6", "#eab308", "#ec4899", "#64748b", "#22c55e"];

export type MetricaSegmento = "receita" | "mrr" | "negocios";
export const METRICA_LABEL: Record<MetricaSegmento, string> = {
  receita: "Receita",
  mrr: "Recorrente (MRR)",
  negocios: "Negócios",
};

export const SEM_CATEGORIA = "Sem categoria";

/** Nome do segmento = categoria do produto, como o cliente cadastrou. */
export function nomeSegmento(categoria: unknown): string {
  const c = String(categoria ?? "").trim();
  return c || SEM_CATEGORIA;
}

const contratoParaIso = (d?: string | null) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

export interface SegmentoLinha {
  key: string;
  nome: string;
  cor: string;
  receita: number;
  mrr: number;
  negocios: number;
  ticket: number;
  conversao: number | null; // %
  participacao: number; // %
  tendencia: number | null; // %
  receitaAnterior: number;
  meta: number;
  metaPct: number | null;
  contratos: any[];
}

export interface EventoSegmento { vendedorKey: string; iso: string; valor: number; mrr: number; negocios: number }

export interface DadosSegmentos {
  contracts: any[];
  proposals: any[];
  proposalItems: any[];
  /** Catálogo: de onde vem a categoria (segmento) de cada item vendido. */
  products: any[];
  /** { [nome do segmento]: meta em R$ } */
  metas: Record<string, number>;
}

export function computeSegmentos(dados: DadosSegmentos, periodo: Faixa, hoje = new Date()) {
  const faixas = faixaAnterior(periodo, hoje);

  const categoriaDoProduto = new Map<string, string>();
  (dados.products || []).forEach((p: any) => categoriaDoProduto.set(String(p.id), nomeSegmento(p.category)));

  const itensPorProposta = new Map<string, any[]>();
  (dados.proposalItems || []).forEach((i: any) => {
    const arr = itensPorProposta.get(i.proposal_id) ?? [];
    arr.push(i);
    itensPorProposta.set(i.proposal_id, arr);
  });
  const propostaPorId = new Map<string, any>((dados.proposals || []).map((p: any) => [p.id, p]));
  const segDoItem = (i: any) => (i.product_id ? categoriaDoProduto.get(String(i.product_id)) : undefined) ?? SEM_CATEGORIA;

  const base = new Map<string, SegmentoLinha & { propostas: number; aceitas: number; idsContratos: Set<string> }>();
  const garantir = (nome: string) => {
    let r = base.get(nome);
    if (!r) {
      r = {
        key: nome, nome, cor: "", receita: 0, mrr: 0, negocios: 0, ticket: 0, conversao: null, participacao: 0,
        tendencia: null, receitaAnterior: 0, meta: Number(dados.metas?.[nome]) || 0, metaPct: null, contratos: [],
        propostas: 0, aceitas: 0, idsContratos: new Set(),
      };
      base.set(nome, r);
    }
    return r;
  };
  // Todo segmento do catálogo e todo segmento com meta aparecem, mesmo sem venda no período
  // (senão não haveria onde definir a meta de um segmento que ainda não vendeu).
  Object.keys(dados.metas || {}).forEach(garantir);
  categoriaDoProduto.forEach((nome) => garantir(nome));

  const eventos: EventoSegmento[] = [];
  const somar = (nome: string, iso: string, total: number, mrr: number, contrato: any) => {
    const r = garantir(nome);
    if (dentro(iso, faixas.atual)) {
      r.receita += total;
      r.mrr += mrr;
      if (!r.idsContratos.has(contrato.id)) { r.idsContratos.add(contrato.id); r.negocios += 1; r.contratos.push(contrato); }
      eventos.push({ vendedorKey: nome, iso, valor: total, mrr, negocios: 0 });
    } else if (dentro(iso, faixas.anterior)) {
      r.receitaAnterior += total;
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
      const vistos = new Set<string>();
      for (const i of itens) {
        const nome = segDoItem(i);
        const total = getProposalItemRealValue(i) * ratio;
        const mrr = (getProposalItemMonthlyValue(i) ?? 0) * ratio;
        somar(nome, iso, total, mrr, c);
        if (!vistos.has(nome) && dentro(iso, faixas.atual)) {
          vistos.add(nome);
          // uma ocorrência de "negócio" por segmento no gráfico de Negócios
          eventos.push({ vendedorKey: nome, iso, valor: 0, mrr: 0, negocios: 1 });
        }
      }
    } else {
      // Contrato sem itens de proposta (manual/legado): não dá pra saber o que foi vendido.
      const mrr = parseCurrencyBR(c.mrr);
      const total = Math.max(c.totalValue !== undefined && c.totalValue !== null ? Number(c.totalValue) : mrr, mrr);
      somar(SEM_CATEGORIA, iso, total, mrr, c);
      if (dentro(iso, faixas.atual)) eventos.push({ vendedorKey: SEM_CATEGORIA, iso, valor: 0, mrr: 0, negocios: 1 });
    }
  }

  for (const p of dados.proposals || []) {
    const iso = String(p.created_at || "").slice(0, 10);
    if (!dentro(iso, faixas.atual)) continue;
    const segs = new Set((itensPorProposta.get(p.id) ?? []).map(segDoItem));
    segs.forEach((nome) => {
      const r = garantir(nome);
      r.propostas += 1;
      if (p.status === "Aceita") r.aceitas += 1;
    });
  }

  const totalReceita = [...base.values()].reduce((s, r) => s + r.receita, 0);
  const linhas: SegmentoLinha[] = [...base.values()]
    .filter((r) => r.nome !== SEM_CATEGORIA || r.receita > 0 || r.negocios > 0 || r.meta > 0)
    .map((r) => ({
      key: r.key, nome: r.nome, cor: "", receita: r.receita, mrr: r.mrr, negocios: r.negocios,
      ticket: r.negocios > 0 ? r.receita / r.negocios : 0,
      conversao: r.propostas > 0 ? Math.round((r.aceitas / r.propostas) * 1000) / 10 : null,
      participacao: totalReceita > 0 ? Math.round((r.receita / totalReceita) * 1000) / 10 : 0,
      tendencia: r.receitaAnterior > 0 ? Math.round(((r.receita - r.receitaAnterior) / r.receitaAnterior) * 100) : null,
      receitaAnterior: r.receitaAnterior, meta: r.meta,
      metaPct: r.meta > 0 ? Math.round((r.receita / r.meta) * 100) : null,
      contratos: r.contratos,
    }))
    .sort((a, b) => b.receita - a.receita || b.negocios - a.negocios || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((r, i) => ({ ...r, cor: COR_SEGMENTO[i % COR_SEGMENTO.length] }));

  return { linhas, eventos, totalReceita, faixas };
}
