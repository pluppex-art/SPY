// Ponte entre Implementações (public.implementations) e a Ordem de Serviço.
//
// Quando o tenant tem um departamento "Implementação" na OS, cada implementação
// ganha uma OS vinculada (origem_tipo = 'implementation', origem_id = id da
// implementação) e a ETAPA da implementação passa a ser a etapa dessa OS no funil
// configurado — a página de Implementações e o quadro da OS mostram o mesmo dado.
import type { SupabaseClient } from "@supabase/supabase-js";
import { rowToDepartamento, rowToFunil, rowToOrdem } from "./osMappers";
import { dadosDoCliente } from "./clienteOs";
import { statusDaEtapa, type OrdemServico, type OsDepartamento, type OsEtapa, type OsFunil } from "./osTypes";

export const ORIGEM_IMPLEMENTACAO = "implementation";
/** OS extra de uma venda para um cliente que já tem implementação (ex.: segundo produto). */
export const ORIGEM_NEGOCIO = "lead";

const normaliza = (s?: string | null) =>
  (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** O departamento da OS que hospeda o fluxo de implementação (por nome: "Implementação", "Implantação"...). */
export const ehDepartamentoImplementacao = (nome: string) => /^implementa|^implanta/.test(normaliza(nome));

export const funilPadrao = (funis: OsFunil[]): OsFunil | undefined => funis.find(f => f.padrao) ?? funis[0];

export const etapaInicial = (etapas: OsEtapa[]): OsEtapa | undefined => etapas.find(e => e.tipo === "aberta") ?? etapas[0];

export const etapaConclusao = (etapas: OsEtapa[]): OsEtapa | undefined =>
  etapas.find(e => e.tipo === "concluida") ?? etapas[etapas.length - 1];

export const etapaPorNome = (etapas: OsEtapa[], nome?: string | null): OsEtapa | undefined => {
  const n = normaliza(nome);
  return n ? etapas.find(e => normaliza(e.nome) === n) : undefined;
};

/** Em que etapa uma implementação entra no funil da OS: a que tem o mesmo nome da etapa
 * em que ela estava (ex.: no funil do CRM), a última se já concluída, ou a primeira. */
export function etapaParaImplementacao(etapas: OsEtapa[], impl: { status?: string }, nomeEtapaAnterior?: string | null): OsEtapa | undefined {
  if (impl.status === "Concluída") return etapaConclusao(etapas);
  return etapaPorNome(etapas, nomeEtapaAnterior) ?? etapaInicial(etapas);
}

export interface FonteOsImplementacao {
  departamento: OsDepartamento;
  funis: OsFunil[];
  ordens: OrdemServico[];
}

/** Lê departamento + funis + OS de implementações do tenant. null = o tenant não usa a OS para isso. */
export async function carregarFonteImplementacao(supabase: SupabaseClient, tenantId: string): Promise<FonteOsImplementacao | null> {
  const { data: deps, error } = await supabase
    .from("os_departamentos").select("*").eq("tenant_id", tenantId).eq("ativo", true).order("ordem");
  if (error) return null;
  const dep = (deps ?? []).map(rowToDepartamento).find(d => ehDepartamentoImplementacao(d.nome));
  if (!dep) return null;

  const { data: funisRows, error: errFunis } = await supabase
    .from("os_funis").select("*").eq("departamento_id", dep.id).eq("ativo", true)
    .order("padrao", { ascending: false }).order("created_at");
  const funis = (funisRows ?? []).map(rowToFunil).filter(f => f.etapas.length > 0);
  if (errFunis || funis.length === 0) return null;

  const { data: ordens } = await supabase
    .from("ordens_servico").select("*").eq("tenant_id", tenantId).eq("origem_tipo", ORIGEM_IMPLEMENTACAO);
  return { departamento: dep, funis, ordens: (ordens ?? []).map(rowToOrdem) };
}

const brl = (v: any) => (Number(v) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Produtos do negócio (lead.productIds) que existem no catálogo. */
export function produtosDoNegocio(lead: any, produtos: any[] = []): any[] {
  const ids: string[] = Array.isArray(lead?.productIds) ? lead.productIds : [];
  return ids.map(id => produtos.find(p => p.id === id)).filter(Boolean);
}

/** Itens da OS = o que implementar, um por produto vendido. Valor 0 de propósito: a venda já foi
 * faturada pelo comercial/financeiro, e a OS não pode gerar uma segunda cobrança do mesmo valor. */
export function itensDosProdutos(lead: any, produtos: any[] = []) {
  return produtosDoNegocio(lead, produtos).map(p => ({
    tipo: "Serviço",
    descricao: `Implementação — ${String(p.name || "produto").trim()}`,
    unidade: "un",
    quantidade: 1,
    valor_unitario: 0,
    valor_total: 0,
    product_id: p.id,
  }));
}

export function descricaoDoNegocio(lead: any, produtos: any[] = []): string | null {
  if (!lead) return null;
  const nomes = produtosDoNegocio(lead, produtos).map(p => String(p.name || "").trim()).filter(Boolean);
  const partes = [
    nomes.length ? `Implementar: ${nomes.join("; ")}.` : null,
    `Negócio ganho: ${[lead.name, lead.company].filter(Boolean).join(" — ")}${Number(lead.value) > 0 ? ` (venda ${brl(lead.value)})` : ""}.`,
  ];
  return partes.filter(Boolean).join("\n");
}

export interface OrigemOs {
  tipo: string;
  id: string;
}

/** Linha de ordens_servico no departamento/funil/etapa dados, já ligada ao cliente (dados + id em campos). */
export function montarOrdem(a: {
  tenantId: string;
  departamento: OsDepartamento;
  funil: OsFunil;
  etapa: OsEtapa;
  origem: OrigemOs;
  cliente?: any;
  clienteNome?: string | null;
  titulo?: string;
  descricao?: string | null;
  impl?: any;
  userId?: string | null;
}): Record<string, unknown> {
  const hoje = new Date().toISOString().slice(0, 10);
  const dc = dadosDoCliente(a.cliente);
  const nome = dc.cliente_nome || a.clienteNome || null;
  const impl = a.impl ?? {};
  return {
    tenant_id: a.tenantId,
    titulo: a.titulo || `Implementação — ${nome || "cliente"}`,
    descricao: a.descricao ?? null,
    status: statusDaEtapa(a.funil.etapas, a.etapa),
    prioridade: "Normal",
    ...dc,
    cliente_nome: nome,
    responsavel: impl.responsavel || null,
    data_abertura: (impl.started_at || new Date().toISOString()).slice(0, 10),
    data_prevista: impl.go_live_date || null,
    data_conclusao: a.etapa.tipo === "concluida" ? (impl.completed_at || "").slice(0, 10) || hoje : null,
    departamento_id: a.departamento.id,
    funil_id: a.funil.id,
    etapa_id: a.etapa.id,
    campos: a.cliente?.id ? { cliente_id: a.cliente.id } : {},
    origem_tipo: a.origem.tipo,
    origem_id: a.origem.id,
    created_by: a.userId ?? null,
  };
}

export type ItemOsRow = ReturnType<typeof itensDosProdutos>[number];

/** Insere a OS (e os itens, se houver). O índice único (tenant, origem) barra duplicata de outra aba/sessão
 * (23505) sem derrubar o resto. Devolve se criou de fato. */
export async function criarOrdem(supabase: SupabaseClient, row: Record<string, unknown>, itens: ItemOsRow[] = []): Promise<"criada" | "duplicada" | "erro"> {
  const { data, error } = await supabase.from("ordens_servico").insert(row).select("id").single();
  if (error) {
    if (error.code === "23505") return "duplicada";
    console.error("[OS] criar OS:", error.message);
    return "erro";
  }
  if (itens.length > 0 && data?.id) {
    const { error: errItens } = await supabase.from("ordem_servico_itens").insert(
      itens.map((i, idx) => ({ ...i, tenant_id: row.tenant_id, ordem_id: data.id, posicao: idx + 1 })),
    );
    if (errItens) console.error("[OS] itens da OS:", errItens.message);
  }
  return "criada";
}

export interface DadosDoNegocio {
  lead?: any;
  produtos?: any[];
  cliente?: any;
}

/** Cria as OS de várias linhas (usado pela página de Implementações para as que ainda não têm). */
export async function inserirOrdens(supabase: SupabaseClient, rows: { row: Record<string, unknown>; itens?: ItemOsRow[] }[]): Promise<boolean> {
  let ok = true;
  for (const { row, itens } of rows) if ((await criarOrdem(supabase, row, itens)) === "erro") ok = false;
  return ok;
}

/** Garante a OS de UMA implementação (usada ao iniciar/ganhar). Não faz nada se o tenant não usa a OS para isso. */
export async function garantirOrdemDaImplementacao(
  supabase: SupabaseClient, tenantId: string, impl: any, clienteNome?: string | null, userId?: string | null, negocio: DadosDoNegocio = {},
): Promise<"criada" | "existente" | "nenhuma"> {
  const fonte = await carregarFonteImplementacao(supabase, tenantId);
  if (!fonte) return "nenhuma";
  if (fonte.ordens.some(o => o.origemId === impl.id)) return "existente";
  const funil = funilPadrao(fonte.funis);
  const etapa = funil && etapaParaImplementacao(funil.etapas, impl);
  if (!funil || !etapa) return "nenhuma";
  const row = montarOrdem({
    tenantId, departamento: fonte.departamento, funil, etapa, impl, userId,
    origem: { tipo: ORIGEM_IMPLEMENTACAO, id: impl.id },
    cliente: negocio.cliente, clienteNome,
    descricao: descricaoDoNegocio(negocio.lead, negocio.produtos),
  });
  const r = await criarOrdem(supabase, row, itensDosProdutos(negocio.lead, negocio.produtos));
  return r === "criada" ? "criada" : r === "duplicada" ? "existente" : "nenhuma";
}

/** OS de um negócio ganho de cliente que JÁ tem implementação (ex.: comprou outro produto): uma OS por negócio. */
export async function garantirOrdemDoNegocio(
  supabase: SupabaseClient, tenantId: string, lead: any, cliente: any, produtos: any[], userId?: string | null,
): Promise<"criada" | "existente" | "nenhuma"> {
  const fonte = await carregarFonteImplementacao(supabase, tenantId);
  if (!fonte || !lead?.id) return "nenhuma";
  const { data: ja } = await supabase
    .from("ordens_servico").select("id").eq("tenant_id", tenantId).eq("origem_tipo", ORIGEM_NEGOCIO).eq("origem_id", lead.id).maybeSingle();
  if (ja?.id) return "existente";
  const funil = funilPadrao(fonte.funis);
  const etapa = funil && etapaInicial(funil.etapas);
  if (!funil || !etapa) return "nenhuma";
  const nomes = produtosDoNegocio(lead, produtos).map(p => String(p.name || "").trim()).filter(Boolean);
  const row = montarOrdem({
    tenantId, departamento: fonte.departamento, funil, etapa, userId, cliente,
    origem: { tipo: ORIGEM_NEGOCIO, id: lead.id },
    titulo: `Implementação — ${cliente?.name || "cliente"}${nomes.length ? ` · ${nomes.join(", ")}` : ""}`,
    descricao: descricaoDoNegocio(lead, produtos),
  });
  const r = await criarOrdem(supabase, row, itensDosProdutos(lead, produtos));
  return r === "criada" ? "criada" : r === "duplicada" ? "existente" : "nenhuma";
}
