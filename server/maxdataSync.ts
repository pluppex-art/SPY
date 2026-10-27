/**
 * Sincronização completa da Max Data → S.P.Y. (SOMENTE LEITURA na Max Data:
 * só GET). Cada chamada processa um pedaço (até `budgetMs`) e grava o cursor em
 * integracao_sync_state, então dá para retomar de onde parou — a função
 * serverless tem teto de 60 s e a base tem centenas de milhares de registros.
 * Os dados ficam em tabelas próprias (maxdata_*), fora do Realtime e do carregamento
 * integral de clientes/products do app, que não escala para dezenas de milhares de linhas.
 * Tudo é upsert por (tenant, externo_sistema, externo_id): rodar de novo não duplica.
 */
import { maxdataGet, type MaxDataConn } from "./maxdataClient.js";

export type SyncEntity = "clientes" | "produtos" | "vendas";
export const SYNC_ENTITIES: SyncEntity[] = ["clientes", "produtos", "vendas"];
const PAGE = 500;
const SALE_CONCURRENCY = 10;

export interface SyncState {
  entidade: SyncEntity; status: "pendente" | "rodando" | "concluida" | "erro";
  total: number | null; sincronizados: number; erro: string | null; cursor: { page?: number };
}

const num = (v: any) => (typeof v === "number" && isFinite(v) ? v : Number(v) || 0);
const digits = (v: any) => String(v ?? "").replace(/\D/g, "");
const txt = (v: any) => { const s = String(v ?? "").trim(); return s || null; };
const iso = (v: any) => (typeof v === "string" && v && !v.startsWith("0001") ? v : null);
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export function mapCliente(c: any, tenantId: string, fonte: string) {
  const end = Array.isArray(c.enderecos) ? c.enderecos[0] : null;
  const doc = digits(c.cpfCnpj);
  const fornecedor = /fornecedor/i.test(c.tipoCadastro || "");
  const tipos = /cliente_fornecedor/i.test(c.tipoCadastro || "") ? ["CLIENTE", "FORNECEDOR"] : fornecedor ? ["FORNECEDOR"] : ["CLIENTE"];
  return {
    tenant_id: tenantId, externo_sistema: fonte, externo_id: String(c.id),
    name: txt(c.nome) || txt(c.fantasia) || `Cliente ${c.id}`,
    documento: doc || null, tipo_pessoa: c.tipo === "juridica" ? "PJ" : c.tipo === "fisica" ? "PF" : null, tipos,
    phone: txt(c.celular) || txt(c.telefone), email: txt(c.email),
    city: txt(end?.cidade), state: txt(end?.uf), cep: digits(end?.cep) || null, logradouro: txt(end?.endereco),
    numero: txt(end?.numeroEndereco), bairro: txt(end?.bairro), complemento: txt(end?.referencia),
    cidade_ibge: end?.ibge ? String(end.ibge) : null, last_contact_at: iso(c.ultimaCompra),
    externo_dados: { tipoCadastro: c.tipoCadastro ?? null, fantasia: c.fantasia ?? null, limiteCredito: c.limiteCredito ?? null, dataNasc: iso(c.dataNasc) },
  };
}

export function mapProduto(p: any, tenantId: string, fonte: string) {
  const custo = num(p.valorCusto), venda = num(p.valorVenda);
  return {
    tenant_id: tenantId, externo_sistema: fonte, externo_id: String(p.id),
    name: txt(p.descricao) || `Produto ${p.id}`, sku: txt(p.codigoFab), price: venda, cost: custo,
    margin: venda > 0 ? Math.round(((venda - custo) / venda) * 10000) / 100 : null,
    category: txt(p.grupo), provider: txt(p.fabricante), active: !p.desativado, type: txt(p.tipo) || "produto",
    stock: Math.round(num(p.estoque)), stock_min: Math.round(num(p.estoqueMinimo)), weight: num(p.peso) || null,
    dimensions: p.altura || p.largura || p.comprimento ? `${num(p.altura)}x${num(p.largura)}x${num(p.comprimento)}` : null,
    externo_dados: { un: p.un ?? null, subGrupo: p.subGrupo ?? null, valorAtacado: p.valorAtacado ?? null, localizador: p.localizador ?? null, ncm_cest: p.cestId ?? null, fracionado: !!p.fracionado },
  };
}

const statusVenda = (s: string) => (/cancel/i.test(s) ? "cancelada" : /espera/i.test(s) ? "em_espera" : /finaliz|pag|conclu/i.test(s) ? "paga" : "aberta");

async function upsert(svc: any, table: string, rows: any[], onConflict: string) {
  for (const part of chunk(rows, 500)) {
    const { error } = await svc.from(table).upsert(part, { onConflict, ignoreDuplicates: false });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function syncVendasPage(svc: any, conn: MaxDataConn, tenantId: string, fonte: string, docs: any[]) {
  const vendaRows: any[] = [];
  const extras = new Map<string, { items: any[]; pays: any[] }>();
  for (const part of chunk(docs, SALE_CONCURRENCY)) {
    await Promise.all(part.map(async (s) => {
      const [it, pg] = await Promise.all([
        maxdataGet<any>(conn, `/sale/${s.id}/items?limit=${PAGE}`).catch(() => ({ docs: [] })),
        maxdataGet<any>(conn, `/sale/${s.id}/payment`).catch(() => ({ docs: [] })),
      ]);
      extras.set(String(s.id), { items: it?.docs ?? [], pays: pg?.docs ?? [] });
    }));
  }
  for (const s of docs) {
    const e = extras.get(String(s.id))!;
    const formas = [...new Set(e.pays.map((p: any) => txt(p.formaPgto)).filter(Boolean))].join(" + ");
    vendaRows.push({
      tenant_id: tenantId, externo_sistema: fonte, externo_id: String(s.id), cliente_nome: txt(s.clienteNome),
      cliente_externo_id: s.clienteId ? String(s.clienteId) : null, status: statusVenda(s.status || ""),
      forma_pagamento: formas || "", valor_total: num(s.totalNf) || num(s.vlrPago), valor_desconto: num(s.valorTotalDesconto), valor_frete: num(s.frete),
      data_venda: iso(s.fechamento) || iso(s.abertura), created_at: iso(s.abertura) || undefined, paid_at: s.status === "finalizada" ? iso(s.fechamento) : null,
      externo_dados: { cpfCnpj: s.cpfCnpj ?? null, atendenteId: s.atendenteId ?? null, cfop: s.cfop ?? null, statusEntrega: s.statusEntrega ?? null, status: s.status ?? null, pagamentos: e.pays.map((p: any) => ({ forma: p.formaPgto, valor: p.valor, parcela: p.parcela })) },
    });
  }
  await upsert(svc, "maxdata_vendas", vendaRows, "tenant_id,externo_sistema,externo_id");

  const ids = docs.map((d) => String(d.id));
  const { data: vendas } = await svc.from("maxdata_vendas").select("id, externo_id").eq("tenant_id", tenantId).eq("externo_sistema", fonte).in("externo_id", ids);
  const vendaUuid = new Map<string, string>((vendas ?? []).map((v: any) => [v.externo_id, v.id]));
  const prodIds = [...new Set([...extras.values()].flatMap((x) => x.items.map((i: any) => String(i.produtoId))))];
  const prodUuid = new Map<string, string>();
  for (const part of chunk(prodIds, 200)) {
    const { data } = await svc.from("maxdata_produtos").select("id, externo_id").eq("tenant_id", tenantId).eq("externo_sistema", fonte).in("externo_id", part);
    for (const p of data ?? []) prodUuid.set(p.externo_id, p.id);
  }
  const itemRows: any[] = [];
  for (const s of docs) {
    const vid = vendaUuid.get(String(s.id)); if (!vid) continue;
    for (const i of extras.get(String(s.id))!.items) {
      const q = num(i.qtde);
      itemRows.push({
        tenant_id: tenantId, venda_id: vid, externo_id: String(i.id), product_id: prodUuid.get(String(i.produtoId)) ?? null,
        product_name: txt(i.descricaoProduto), quantidade: Math.max(1, Math.round(q)), quantidade_decimal: q,
        preco_unitario: num(i.valor), custo_unitario: num(i.custoFinalProduto) || null, valor_desconto: num(i.valorDesconto), codigo: txt(i.codigoFab),
      });
    }
  }
  await upsert(svc, "maxdata_venda_itens", itemRows, "venda_id,externo_id");
}

/** Processa páginas da entidade até estourar o orçamento de tempo; devolve o estado gravado. */
export async function runSyncChunk(opts: { svc: any; conn: MaxDataConn; tenantId: string; fonte: string; entity: SyncEntity; budgetMs?: number }): Promise<SyncState> {
  const { svc, conn, tenantId, fonte, entity } = opts;
  const deadline = Date.now() + (opts.budgetMs ?? 40_000);
  const key = { tenant_id: tenantId, fonte, entidade: entity };
  const { data: cur } = await svc.from("integracao_sync_state").select("*").match(key).maybeSingle();
  let page = cur?.status === "concluida" ? 1 : Number(cur?.cursor?.page) || 1;
  let sincronizados = cur?.status === "concluida" ? 0 : cur?.sincronizados ?? 0;
  let total: number | null = cur?.total ?? null;
  const path = entity === "clientes" ? "/client" : entity === "produtos" ? "/product" : "/sale";
  const save = (patch: any) => svc.from("integracao_sync_state").upsert({ ...key, ...patch, atualizado_em: new Date().toISOString() }, { onConflict: "tenant_id,fonte,entidade" });
  let status: SyncState["status"] = "rodando", erro: string | null = null;
  try {
    while (Date.now() < deadline) {
      const body = await maxdataGet<any>(conn, `${path}?limit=${PAGE}&page=${page}`);
      const docs: any[] = body?.docs ?? [];
      total = num(body?.total) || total;
      if (docs.length) {
        if (entity === "clientes") await upsert(svc, "maxdata_clientes", docs.map((d) => mapCliente(d, tenantId, fonte)), "tenant_id,externo_sistema,externo_id");
        else if (entity === "produtos") await upsert(svc, "maxdata_produtos", docs.map((d) => mapProduto(d, tenantId, fonte)), "tenant_id,externo_sistema,externo_id");
        else await syncVendasPage(svc, conn, tenantId, fonte, docs);
        sincronizados += docs.length;
      }
      const pages = num(body?.pages);
      if (!docs.length || page >= pages) { status = "concluida"; page = 1; break; }
      page += 1;
      await save({ status: "rodando", cursor: { page }, total, sincronizados, erro: null, iniciado_em: cur?.iniciado_em ?? new Date().toISOString() });
    }
  } catch (e: any) { status = "erro"; erro = String(e?.message || e).slice(0, 500); }
  await save({ status, cursor: { page }, total, sincronizados, erro, iniciado_em: cur?.iniciado_em ?? new Date().toISOString() });
  return { entidade: entity, status, total, sincronizados, erro, cursor: { page } };
}
