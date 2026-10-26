import { parseCurrencyBR } from "../../lib/utils";
import { nomeConfere, normNome } from "../../lib/sellerScope";
import { getProposalItemMonthlyValue, getProposalItemRealValue, getProposalDiscountRatio } from "../../lib/saleCalculator";

/** Números por vendedor da Central de Receita › Mapa da Receita › Vendedores.
 *  Tudo sai dos dados reais já carregados (leads, propostas, contratos,
 *  colaboradores) — nada inventado.
 *
 *  Critérios:
 *  - Leads / Oportunidades / Propostas: coorte dos leads CRIADOS no período
 *    (mesmo critério do filtro de período do dashboard).
 *  - Vendas / Receita / Tendência / Evolução: vendas CONCLUÍDAS no período
 *    (data da assinatura do contrato; sem contrato, a última atualização do
 *    lead fechado). Receita = valor do lead (o mesmo do pódio da Visão
 *    Comercial: recorrente conta a mensalidade).
 *  - Conversão = vendas ÷ leads. */

export type PeriodoOpcao = "pagina" | "mes" | "mesPassado" | "90d" | "ano" | "tudo";

export const PERIODO_LABEL: Record<PeriodoOpcao, string> = {
  pagina: "Período da página",
  mes: "Este mês",
  mesPassado: "Mês passado",
  "90d": "Últimos 90 dias",
  ano: "Este ano",
  tudo: "Tudo",
};

export interface Faixa { from: string | null; to: string | null }

const pad = (n: number) => String(n).padStart(2, "0");
export const isoLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDias = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return isoLocal(d);
};
const diasEntre = (a: string, b: string) => Math.round((new Date(b + "T12:00:00").getTime() - new Date(a + "T12:00:00").getTime()) / 86400000);

export function resolverPeriodo(op: PeriodoOpcao, paginaFrom: string | null, paginaTo: string | null, hoje = new Date()): Faixa {
  if (op === "pagina") return { from: paginaFrom, to: paginaTo };
  if (op === "tudo") return { from: null, to: null };
  const y = hoje.getFullYear();
  const m = hoje.getMonth();
  if (op === "mes") return { from: isoLocal(new Date(y, m, 1)), to: isoLocal(new Date(y, m + 1, 0)) };
  if (op === "mesPassado") return { from: isoLocal(new Date(y, m - 1, 1)), to: isoLocal(new Date(y, m, 0)) };
  if (op === "90d") return { from: addDias(isoLocal(hoje), -89), to: isoLocal(hoje) };
  return { from: `${y}-01-01`, to: `${y}-12-31` };
}

/** Faixa imediatamente anterior, do mesmo tamanho. Sem período (tudo) compara
 *  os últimos 30 dias com os 30 anteriores. */
export function faixaAnterior(f: Faixa, hoje = new Date()): { atual: Faixa; anterior: Faixa } {
  if (f.from) {
    const to = f.to ?? isoLocal(hoje);
    const dias = diasEntre(f.from, to) + 1;
    const prevTo = addDias(f.from, -1);
    return { atual: { from: f.from, to }, anterior: { from: addDias(prevTo, -(dias - 1)), to: prevTo } };
  }
  const to = isoLocal(hoje);
  const from = addDias(to, -29);
  const prevTo = addDias(from, -1);
  return { atual: { from, to }, anterior: { from: addDias(prevTo, -29), to: prevTo } };
}

export const dentro = (iso: string, f: Faixa) => !!iso && (!f.from || iso >= f.from) && (!f.to || iso <= f.to);

const ISO_RE = /^\d{4}-\d{2}-\d{2}/;
export function leadCriadoEm(l: any): string {
  const d = typeof l?.date === "string" && ISO_RE.test(l.date) ? l.date : typeof l?.created_at === "string" ? l.created_at : "";
  return d.slice(0, 10);
}

const contratoParaIso = (d?: string | null) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || "");
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

export interface DadosVendedores {
  leads: any[]; // já com escopo de vendedor, se houver
  proposals: any[];
  contracts: any[];
  colaboradores: any[];
  cargos: any[];
  /** Itens das propostas — de onde saem os produtos vendidos. */
  proposalItems?: any[];
  /** Catálogo de produtos (nome limpo, pelo id do item). */
  products?: any[];
}

export interface VendedorLinha {
  key: string;
  nome: string;
  avatar: string | null;
  cor: string;
  leads: number;
  oportunidades: number;
  propostas: number;
  vendas: number;
  receita: number;
  ticket: number;
  conversao: number; // %
  meta: number;
  metaPct: number | null;
  tendencia: number | null; // % receita vs período anterior
  receitaAnterior: number;
  leadsDoVendedor: any[]; // coorte do período (pra "Ver detalhes")
  /** Produtos vendidos no período (receita = mensalidade nos recorrentes). */
  produtos: ProdutoVendido[];
}

export interface ProdutoVendido { id: string; nome: string; vendas: number; receita: number }

export const COR_VENDEDOR = ["#f97316", "#3b82f6", "#a855f7", "#10b981", "#ec4899", "#14b8a6", "#f59e0b", "#6366f1"];

function valorDoLead(l: any, propostasPorLead: Map<string, any[]>): number {
  const v = parseCurrencyBR(l.value ?? l.valor);
  if (v > 0) return v;
  const p = propostasPorLead.get(l.id)?.[0];
  return p?.valor ? Number(p.valor) || 0 : 0;
}

/** Agrupa as variações de nome do vendedor ("GUSTAVO OLIVEIRA DA SILVA" /
 *  "Gustavo Oliveira") num vendedor só. Devolve nome canônico por texto original. */
export function agruparVendedores(leads: any[], colaboradoresVendedores: any[]) {
  const freq = new Map<string, number>();
  for (const l of leads) {
    const s = String(l.seller ?? "").trim();
    if (s) freq.set(s, (freq.get(s) ?? 0) + 1);
  }
  for (const c of colaboradoresVendedores) {
    const s = String(c.nome ?? "").trim();
    if (s && !freq.has(s)) freq.set(s, 0);
  }
  const clusters: { key: string; nome: string; variantes: string[] }[] = [];
  [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).forEach(([nome]) => {
    const existente = clusters.find((c) => c.variantes.some((v) => nomeConfere(v, nome)));
    if (existente) existente.variantes.push(nome);
    else clusters.push({ key: normNome(nome) || nome, nome, variantes: [nome] });
  });
  const porTexto = new Map<string, string>();
  clusters.forEach((c) => c.variantes.forEach((v) => porTexto.set(v, c.key)));
  return { clusters, porTexto };
}

const NAO_ATRIBUIDO = "__sem_atribuicao__";

export function computeVendedores(
  dados: DadosVendedores,
  periodo: Faixa,
  opts: { produtoId?: string | null; hoje?: Date } = {},
): { linhas: VendedorLinha[]; vendasNoPeriodo: { vendedorKey: string; iso: string; valor: number }[]; faixas: ReturnType<typeof faixaAnterior> } {
  const hoje = opts.hoje ?? new Date();
  const produtoId = opts.produtoId ?? null;
  const faixas = faixaAnterior(periodo, hoje);

  // Propostas/itens por lead (a mais recente primeiro) e produtos de cada lead.
  const itensPorProposta = new Map<string, any[]>();
  (dados.proposalItems || []).forEach((i) => {
    const arr = itensPorProposta.get(i.proposal_id) ?? [];
    arr.push(i);
    itensPorProposta.set(i.proposal_id, arr);
  });
  const nomeDoProduto = new Map<string, string>((dados.products || []).map((pr: any) => [pr.id, pr.name]));
  const limpaNome = (n: string) => String(n || "Produto").replace(/\s*\((Assinatura|Taxa)[^)]*\)\s*$/i, "").replace(/^Taxa de Implanta[^—]*—\s*/i, "Implantação — ").trim();

  const cargosVendedor = new Set((dados.cargos || []).filter((c) => c.restringir_aos_proprios_dados).map((c) => c.nome));
  const colabVend = (dados.colaboradores || []).filter((c) => cargosVendedor.has(c.cargo) && (c.status || "Ativo") === "Ativo");
  const { clusters, porTexto } = agruparVendedores(dados.leads, colabVend);

  const propostasPorLead = new Map<string, any[]>();
  [...(dados.proposals || [])]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .forEach((p) => {
      if (!p.lead_id) return;
      const arr = propostasPorLead.get(p.lead_id) ?? [];
      arr.push(p);
      propostasPorLead.set(p.lead_id, arr);
    });

  // Propostas que contam como venda de um lead: as aceitas; sem nenhuma aceita, a mais recente.
  const propostasVendidas = (l: any): any[] => {
    const todas = propostasPorLead.get(l.id) ?? [];
    const aceitas = todas.filter((p) => p.status === "Aceita");
    return aceitas.length > 0 ? aceitas : todas.slice(0, 1);
  };
  // Valor de UM item como o resto do sistema mostra: mensalidade nos recorrentes, total nos pontuais,
  // já com o desconto negociado da proposta.
  const valorItem = (p: any, itens: any[], i: any) =>
    (getProposalItemMonthlyValue(i) ?? getProposalItemRealValue(i)) * getProposalDiscountRatio(p.valor, itens);
  const produtosDoLead = (l: any): Set<string> => {
    const ids = new Set<string>();
    (propostasPorLead.get(l.id) ?? []).forEach((p) => (itensPorProposta.get(p.id) ?? []).forEach((i) => i.product_id && ids.add(i.product_id)));
    (l.productIds ?? []).forEach((id: string) => ids.add(id));
    return ids;
  };
  // Com filtro de produto, só entram os leads que envolvem aquele produto.
  const leadsBase = produtoId ? dados.leads.filter((l) => produtosDoLead(l).has(produtoId)) : dados.leads;
  // Venda de um lead: o valor do lead; com filtro de produto, só o que aquele produto vale na venda.
  const valorVenda = (l: any): number => {
    if (!produtoId) return valorDoLead(l, propostasPorLead);
    let soma = 0;
    let achou = false;
    for (const p of propostasVendidas(l)) {
      const itens = itensPorProposta.get(p.id) ?? [];
      for (const i of itens) if (i.product_id === produtoId) { soma += valorItem(p, itens, i); achou = true; }
    }
    return achou ? soma : valorDoLead(l, propostasPorLead);
  };
  // Produtos vendidos por vendedor (chave do vendedor → chave do produto → acumulado).
  const prodAcc = new Map<string, Map<string, { id: string; nome: string; leads: Set<string>; receita: number }>>();
  const registrarProdutos = (key: string, l: any) => {
    for (const p of propostasVendidas(l)) {
      const itens = itensPorProposta.get(p.id) ?? [];
      for (const i of itens) {
        if (produtoId && i.product_id !== produtoId) continue;
        const pk = i.product_id || limpaNome(i.product_name);
        const mapa = prodAcc.get(key) ?? new Map();
        prodAcc.set(key, mapa);
        const cur = mapa.get(pk) ?? { id: i.product_id || pk, nome: (i.product_id && nomeDoProduto.get(i.product_id)) || limpaNome(i.product_name), leads: new Set<string>(), receita: 0 };
        cur.leads.add(l.id);
        cur.receita += valorItem(p, itens, i);
        mapa.set(pk, cur);
      }
    }
  };

  const contratoPorProposta = new Map<string, string>();
  (dados.contracts || []).forEach((c) => {
    const iso = contratoParaIso(c.date);
    if (c.proposalId && iso) {
      const atual = contratoPorProposta.get(c.proposalId);
      if (!atual || iso < atual) contratoPorProposta.set(c.proposalId, iso);
    }
  });
  const dataDaVenda = (l: any): string => {
    for (const p of propostasPorLead.get(l.id) ?? []) {
      const iso = contratoPorProposta.get(p.id);
      if (iso) return iso;
    }
    const u = typeof l.updated_at === "string" ? l.updated_at.slice(0, 10) : "";
    return u || leadCriadoEm(l);
  };

  const chaveDe = (l: any) => {
    const s = String(l.seller ?? "").trim();
    return s ? porTexto.get(s) ?? (normNome(s) || s) : NAO_ATRIBUIDO;
  };

  const base = new Map<string, VendedorLinha>();
  const garantir = (key: string, nome: string): VendedorLinha => {
    let r = base.get(key);
    if (!r) {
      r = {
        key, nome, avatar: null, cor: "", leads: 0, oportunidades: 0, propostas: 0, vendas: 0, receita: 0, ticket: 0,
        conversao: 0, meta: 0, metaPct: null, tendencia: null, receitaAnterior: 0, leadsDoVendedor: [], produtos: [],
      };
      base.set(key, r);
    }
    return r;
  };
  clusters.forEach((c) => garantir(c.key, c.nome));

  const vendas: { vendedorKey: string; iso: string; valor: number }[] = [];

  for (const l of leadsBase) {
    const key = chaveDe(l);
    const r = garantir(key, key === NAO_ATRIBUIDO ? "Sem atribuição" : (clusters.find((c) => c.key === key)?.nome ?? String(l.seller)));

    if (dentro(leadCriadoEm(l), faixas.atual)) {
      r.leads += 1;
      r.leadsDoVendedor.push(l);
      if (parseCurrencyBR(l.value ?? l.valor) > 0 || propostasPorLead.has(l.id)) r.oportunidades += 1;
      if (propostasPorLead.has(l.id)) r.propostas += 1;
    }
    if (l.status === "Fechado") {
      const iso = dataDaVenda(l);
      const valor = valorVenda(l);
      if (dentro(iso, faixas.atual)) {
        r.vendas += 1;
        r.receita += valor;
        vendas.push({ vendedorKey: key, iso, valor });
        registrarProdutos(key, l);
      } else if (dentro(iso, faixas.anterior)) {
        r.receitaAnterior += valor;
      }
    }
  }

  const colabPorChave = (r: VendedorLinha) => (dados.colaboradores || []).find((c) => nomeConfere(c.nome, r.nome));

  const linhas = [...base.values()]
    .filter((r) => r.key !== NAO_ATRIBUIDO || r.leads > 0 || r.vendas > 0)
    .map((r) => {
      const colab = r.key === NAO_ATRIBUIDO ? undefined : colabPorChave(r);
      const meta = Number(colab?.meta_mensal) || 0;
      return {
        ...r,
        nome: colab?.nome || r.nome,
        avatar: colab?.avatar || null,
        produtos: [...(prodAcc.get(r.key)?.values() ?? [])]
          .map((p) => ({ id: p.id, nome: p.nome, vendas: p.leads.size, receita: p.receita }))
          .sort((a, b) => b.receita - a.receita || b.vendas - a.vendas),
        ticket: r.vendas > 0 ? r.receita / r.vendas : 0,
        conversao: r.leads > 0 ? Math.round((r.vendas / r.leads) * 1000) / 10 : 0,
        meta,
        metaPct: meta > 0 ? Math.round((r.receita / meta) * 100) : null,
        tendencia: r.receitaAnterior > 0 ? Math.round(((r.receita - r.receitaAnterior) / r.receitaAnterior) * 100) : null,
      };
    })
    .sort((a, b) => b.receita - a.receita || b.vendas - a.vendas || b.leads - a.leads)
    .map((r, i) => ({ ...r, cor: r.key === NAO_ATRIBUIDO ? "#94a3b8" : COR_VENDEDOR[i % COR_VENDEDOR.length] }));

  return { linhas, vendasNoPeriodo: vendas, faixas };
}

/** Série diária (ou acumulada) de receita pra cada vendedor informado. */
export function serieDiaria(
  vendas: { vendedorKey: string; iso: string; valor: number }[],
  vendedores: { key: string; nome: string }[],
  faixa: Faixa,
  acumulada: boolean,
  hoje = new Date(),
) {
  const fim = faixa.to ?? isoLocal(hoje);
  let ini = faixa.from;
  if (!ini) {
    const menor = vendas.map((v) => v.iso).sort()[0];
    ini = menor && diasEntre(menor, fim) <= 365 ? menor : addDias(fim, -29);
  }
  const total = Math.min(366, Math.max(1, diasEntre(ini, fim) + 1));
  const pontos: Record<string, number | string>[] = [];
  const acc: Record<string, number> = {};
  vendedores.forEach((v) => (acc[v.key] = 0));
  for (let i = 0; i < total; i++) {
    const iso = addDias(ini, i);
    const ponto: Record<string, number | string> = { dia: `${iso.slice(8, 10)}/${iso.slice(5, 7)}` };
    for (const v of vendedores) {
      const doDia = vendas.filter((x) => x.vendedorKey === v.key && x.iso === iso).reduce((s, x) => s + x.valor, 0);
      acc[v.key] += doDia;
      ponto[v.key] = acumulada ? acc[v.key] : doDia;
    }
    pontos.push(ponto);
  }
  return pontos;
}
