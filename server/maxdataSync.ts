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

export type SyncEntity = "clientes" | "produtos" | "vendas" | "itens_vendas";
export const SYNC_ENTITIES: SyncEntity[] = ["clientes", "produtos", "vendas", "itens_vendas"];
const PAGE = 500;
const ITEM_CONCURRENCY = 8; // a Max Data aceita ~9 consultas/s; acima disso responde 429

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

/** Vendas: só o cabeçalho (poucas consultas). Forma de pagamento vem do cadastro de condições de pagamento. */
async function syncVendasPage(svc: any, conn: MaxDataConn, tenantId: string, fonte: string, docs: any[], condicoes: Map<string, string>) {
  const vendaRows = docs.map((s) => ({
    tenant_id: tenantId, externo_sistema: fonte, externo_id: String(s.id), cliente_nome: txt(s.clienteNome),
    cliente_externo_id: s.clienteId ? String(s.clienteId) : null, status: statusVenda(s.status || ""),
    forma_pagamento: condicoes.get(String(s.condicaoPgtoId)) || "", valor_total: num(s.totalNf) || num(s.vlrPago), valor_desconto: num(s.valorTotalDesconto), valor_frete: num(s.frete),
    data_venda: iso(s.fechamento) || iso(s.abertura), created_at: iso(s.abertura) || undefined, paid_at: s.status === "finalizada" ? iso(s.fechamento) : null,
    externo_dados: { cpfCnpj: s.cpfCnpj ?? null, atendenteId: s.atendenteId ?? null, cfop: s.cfop ?? null, statusEntrega: s.statusEntrega ?? null, status: s.status ?? null, condicaoPgtoId: s.condicaoPgtoId ?? null, vlrPago: s.vlrPago ?? null },
  }));
  await upsert(svc, "maxdata_vendas", vendaRows, "tenant_id,externo_sistema,externo_id");
}

async function carregarCondicoes(conn: MaxDataConn): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  try {
    const body = await maxdataGet<any>(conn, `/paymentcondition?limit=${PAGE}`);
    for (const c of body?.docs ?? []) if (c?.id != null && c?.nome) out.set(String(c.id), String(c.nome));
  } catch { /* sem o cadastro, a forma de pagamento fica em branco (não bloqueia as vendas) */ }
  return out;
}

/** Busca com limite de simultaneidade; qualquer falha (depois dos retries do cliente) PROPAGA — nunca vira "sem itens". */
async function pool<T, R>(list: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (next < list.length) { const i = next++; out[i] = await fn(list[i]); }
  }));
  return out;
}

/** Itens das vendas já gravadas: as mais recentes primeiro; marca cada venda só depois de gravar os itens. */
async function syncItensLote(svc: any, conn: MaxDataConn, tenantId: string, fonte: string, vendas: { id: string; externo_id: string }[]) {
  const respostas = await pool(vendas, ITEM_CONCURRENCY, async (v) => {
    const docs: any[] = [];
    const first = await maxdataGet<any>(conn, `/sale/${v.externo_id}/items?limit=${PAGE}`);
    docs.push(...(first?.docs ?? []));
    for (let pg = 2; pg <= Math.min(num(first?.pages), 20); pg++) docs.push(...((await maxdataGet<any>(conn, `/sale/${v.externo_id}/items?limit=${PAGE}&page=${pg}`))?.docs ?? []));
    return docs;
  });
  const prodIds = [...new Set(respostas.flatMap((d) => d.map((i: any) => String(i.produtoId))))];
  const prodUuid = new Map<string, string>();
  for (const part of chunk(prodIds, 200)) {
    const { data } = await svc.from("maxdata_produtos").select("id, externo_id").eq("tenant_id", tenantId).eq("externo_sistema", fonte).in("externo_id", part);
    for (const p of data ?? []) prodUuid.set(p.externo_id, p.id);
  }
  const itemRows: any[] = [];
  vendas.forEach((v, idx) => {
    for (const i of respostas[idx]) {
      const q = num(i.qtde);
      itemRows.push({
        tenant_id: tenantId, venda_id: v.id, externo_id: String(i.id), product_id: prodUuid.get(String(i.produtoId)) ?? null,
        product_name: txt(i.descricaoProduto), quantidade: Math.max(1, Math.round(q)), quantidade_decimal: q,
        preco_unitario: num(i.valor), custo_unitario: num(i.custoFinalProduto) || null, valor_desconto: num(i.valorDesconto), codigo: txt(i.codigoFab),
      });
    }
  });
  await upsert(svc, "maxdata_venda_itens", itemRows, "venda_id,externo_id");
  const { error } = await svc.from("maxdata_vendas").update({ itens_sincronizados: true }).in("id", vendas.map((v) => v.id));
  if (error) throw new Error(`maxdata_vendas: ${error.message}`);
}

async function runItensVendas(opts: { svc: any; conn: MaxDataConn; tenantId: string; fonte: string; deadline: number }): Promise<SyncState> {
  const { svc, conn, tenantId, fonte, deadline } = opts;
  const key = { tenant_id: tenantId, fonte, entidade: "itens_vendas" };
  const save = (patch: any) => svc.from("integracao_sync_state").upsert({ ...key, ...patch, atualizado_em: new Date().toISOString() }, { onConflict: "tenant_id,fonte,entidade" });
  const contar = async (feitas: boolean) => {
    const { count } = await svc.from("maxdata_vendas").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("externo_sistema", fonte).eq("itens_sincronizados", feitas);
    return count ?? 0;
  };
  let status: SyncState["status"] = "rodando", erro: string | null = null;
  try {
    while (Date.now() < deadline) {
      const { data: lote, error } = await svc.from("maxdata_vendas").select("id, externo_id").eq("tenant_id", tenantId).eq("externo_sistema", fonte)
        .eq("itens_sincronizados", false).order("data_venda", { ascending: false }).limit(60);
      if (error) throw new Error(`maxdata_vendas: ${error.message}`);
      if (!lote?.length) { status = "concluida"; break; }
      await syncItensLote(svc, conn, tenantId, fonte, lote);
    }
  } catch (e: any) { status = "erro"; erro = String(e?.message || e).slice(0, 500); }
  const feitas = await contar(true), pendentes = await contar(false);
  await save({ status: status === "concluida" && pendentes > 0 ? "rodando" : status, cursor: {}, total: feitas + pendentes, sincronizados: feitas, erro });
  return { entidade: "itens_vendas", status: pendentes === 0 && status !== "erro" ? "concluida" : status, total: feitas + pendentes, sincronizados: feitas, erro, cursor: {} };
}

/** Processa páginas da entidade até estourar o orçamento de tempo; devolve o estado gravado. */
export async function runSyncChunk(opts: { svc: any; conn: MaxDataConn; tenantId: string; fonte: string; entity: SyncEntity; budgetMs?: number; restart?: boolean }): Promise<SyncState> {
  const { svc, conn, tenantId, fonte, entity } = opts;
  const deadline = Date.now() + (opts.budgetMs ?? 15_000);
  if (entity === "itens_vendas") return runItensVendas({ svc, conn, tenantId, fonte, deadline });
  const key = { tenant_id: tenantId, fonte, entidade: entity };
  const { data: cur } = await svc.from("integracao_sync_state").select("*").match(key).maybeSingle();
  // Etapa já concluída: não refaz (nem zera o contador) a menos que peçam explicitamente `restart`.
  if (cur?.status === "concluida" && !opts.restart) {
    return { entidade: entity, status: "concluida", total: cur.total ?? null, sincronizados: cur.sincronizados ?? 0, erro: null, cursor: cur.cursor ?? {} };
  }
  const fresh = !cur || cur.status === "concluida";
  let page = fresh ? 1 : Number(cur?.cursor?.page) || 1;
  let sincronizados = fresh ? 0 : cur?.sincronizados ?? 0;
  let total: number | null = cur?.total ?? null;
  const path = entity === "clientes" ? "/client" : entity === "produtos" ? "/product" : "/sale";
  const save = (patch: any) => svc.from("integracao_sync_state").upsert({ ...key, ...patch, atualizado_em: new Date().toISOString() }, { onConflict: "tenant_id,fonte,entidade" });
  let status: SyncState["status"] = "rodando", erro: string | null = null;
  const condicoes = entity === "vendas" ? await carregarCondicoes(conn) : new Map<string, string>();
  try {
    while (Date.now() < deadline) {
      const body = await maxdataGet<any>(conn, `${path}?limit=${PAGE}&page=${page}`);
      const docs: any[] = body?.docs ?? [];
      total = num(body?.total) || total;
      if (docs.length) {
        if (entity === "clientes") await upsert(svc, "maxdata_clientes", docs.map((d) => mapCliente(d, tenantId, fonte)), "tenant_id,externo_sistema,externo_id");
        else if (entity === "produtos") await upsert(svc, "maxdata_produtos", docs.map((d) => mapProduto(d, tenantId, fonte)), "tenant_id,externo_sistema,externo_id");
        else await syncVendasPage(svc, conn, tenantId, fonte, docs, condicoes);
        sincronizados += docs.length;
      }
      const pages = num(body?.pages);
      if (!docs.length || page >= pages) { status = "concluida"; page = 1; break; }
      page += 1;
      await save({ status: "rodando", cursor: { page }, total, sincronizados, erro: null, iniciado_em: (fresh ? null : cur?.iniciado_em) ?? new Date().toISOString() });
    }
  } catch (e: any) { status = "erro"; erro = String(e?.message || e).slice(0, 500); }
  await save({ status, cursor: { page }, total, sincronizados, erro, iniciado_em: (fresh ? null : cur?.iniciado_em) ?? new Date().toISOString() });
  return { entidade: entity, status, total, sincronizados, erro, cursor: { page } };
}

/**
 * Liga as notas/estoque ao catálogo de produtos do sistema: os produtos da Max Data ficam em
 * maxdata_produtos (150 mil linhas não cabem no carregamento do app), então, quando uma nota
 * referencia um deles, ele é "promovido" para `products` — só os que realmente aparecem em notas.
 * Assim a entrada no estoque, as movimentações e o resto do sistema usam um produto de verdade.
 * Devolve código da Max Data → produto do sistema.
 */
export async function promoteMaxdataProducts(db: any, tenantId: string, fonte: string, codigos: string[]) {
  const out = new Map<string, { id: string; name: string; sku: string | null; active: boolean; type_attributes: any }>();
  const ids = [...new Set(codigos.map((c) => String(c ?? "").trim()).filter(Boolean))];
  for (const part of chunk(ids, 200)) {
    const { data: origem, error } = await db.from("maxdata_produtos").select("*").eq("tenant_id", tenantId).eq("externo_sistema", fonte).in("externo_id", part);
    if (error || !origem?.length) continue;
    const rows = origem.map((r: any) => ({
      tenant_id: tenantId, externo_sistema: fonte, externo_id: r.externo_id, name: r.name, sku: r.sku, price: r.price, cost: r.cost, margin: r.margin,
      category: r.category, provider: r.provider, active: r.active, type: r.type, stock: r.stock, stock_min: r.stock_min, weight: r.weight,
      dimensions: r.dimensions, externo_dados: r.externo_dados,
    }));
    const { data: prom, error: upErr } = await db.from("products").upsert(rows, { onConflict: "tenant_id,externo_sistema,externo_id" }).select("id, name, sku, active, type_attributes, externo_id");
    if (upErr) throw new Error(`products: ${upErr.message}`);
    for (const p of prom ?? []) out.set(String(p.externo_id), p);
  }
  return out;
}
