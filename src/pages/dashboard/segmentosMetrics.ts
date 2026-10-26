import { parseCurrencyBR } from "../../lib/utils";
import { dentro, faixaAnterior, type Faixa } from "./vendedoresMetrics";

/** Números por segmento da Central de Receita › Mapa da Receita › Segmentos.
 *  O segmento de um negócio é o ramo (clientes.industry) do cliente do contrato.
 *
 *  - Receita: valor total dos contratos assinados no período (o mesmo "Receita"
 *    do Fluxo da Receita: o maior entre total e MRR de cada contrato).
 *  - MRR: soma da mensalidade desses contratos.
 *  - Negócios: quantidade de contratos assinados no período.
 *  - Ticket médio = receita ÷ negócios.
 *  - Conversão = propostas aceitas ÷ propostas criadas no período (clientes do segmento).
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

/** Nome curto e legível do ramo: o cadastro traz descrições de CNAE enormes
 *  ("Corretores e agentes de seguros, de planos de previdência complementar…"). */
export function nomeSegmento(industry: unknown): string {
  const bruto = String(industry ?? "").trim();
  if (!bruto) return "Outros";
  const primeiro = bruto.split(",")[0].trim();
  return primeiro.length > 34 ? `${primeiro.slice(0, 32).trim()}…` : primeiro;
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
  clienteBase: any[];
  proposals: any[];
  /** { [nome do segmento]: meta em R$ } */
  metas: Record<string, number>;
}

export function computeSegmentos(dados: DadosSegmentos, periodo: Faixa, hoje = new Date()) {
  const faixas = faixaAnterior(periodo, hoje);
  const industriaPorCliente = new Map<string, string>();
  (dados.clienteBase || []).forEach((c: any) => { if (c.name) industriaPorCliente.set(String(c.name).trim().toLowerCase(), c.industry); });
  const segDe = (cliente: unknown) => nomeSegmento(industriaPorCliente.get(String(cliente ?? "").trim().toLowerCase()));

  const base = new Map<string, SegmentoLinha & { propostas: number; aceitas: number }>();
  const garantir = (nome: string) => {
    let r = base.get(nome);
    if (!r) {
      r = {
        key: nome, nome, cor: "", receita: 0, mrr: 0, negocios: 0, ticket: 0, conversao: null, participacao: 0,
        tendencia: null, receitaAnterior: 0, meta: Number(dados.metas?.[nome]) || 0, metaPct: null, contratos: [],
        propostas: 0, aceitas: 0,
      };
      base.set(nome, r);
    }
    return r;
  };
  // Todo ramo cadastrado e todo segmento com meta aparecem, mesmo sem venda no período
  // (senão não haveria onde definir a meta de um segmento que ainda não vendeu).
  Object.keys(dados.metas || {}).forEach(garantir);
  (dados.clienteBase || []).forEach((c: any) => garantir(nomeSegmento(c.industry)));

  const eventos: EventoSegmento[] = [];
  for (const c of dados.contracts || []) {
    if (c.status === "Cancelado" || c.status === "Perdido") continue;
    const iso = contratoParaIso(c.date);
    const mrr = parseCurrencyBR(c.mrr);
    const total = Math.max(c.totalValue !== undefined && c.totalValue !== null ? Number(c.totalValue) : mrr, mrr);
    const nome = segDe(c.client);
    const r = garantir(nome);
    if (dentro(iso, faixas.atual)) {
      r.receita += total;
      r.mrr += mrr;
      r.negocios += 1;
      r.contratos.push(c);
      eventos.push({ vendedorKey: nome, iso, valor: total, mrr, negocios: 1 });
    } else if (dentro(iso, faixas.anterior)) {
      r.receitaAnterior += total;
    }
  }

  for (const p of dados.proposals || []) {
    const iso = String(p.created_at || "").slice(0, 10);
    if (!dentro(iso, faixas.atual)) continue;
    const r = garantir(segDe(p.cliente));
    r.propostas += 1;
    if (p.status === "Aceita") r.aceitas += 1;
  }

  const totalReceita = [...base.values()].reduce((s, r) => s + r.receita, 0);
  const linhas: SegmentoLinha[] = [...base.values()]
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
