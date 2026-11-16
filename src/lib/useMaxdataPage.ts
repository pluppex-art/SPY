import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Cache em memória (vale enquanto a aba estiver aberta): voltar para uma tela já aberta mostra na hora o que já
 * foi carregado em vez de buscar tudo de novo. 5 min de validade; qualquer gravação muda `refresh` e passa por cima.
 */
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { ts: number; val: any }>();
const cacheGet = <T,>(k: string): T | undefined => { const e = cache.get(k); return e && Date.now() - e.ts < TTL_MS ? (e.val as T) : undefined; };
const cacheSet = (k: string, val: any) => { cache.set(k, { ts: Date.now(), val }); if (cache.size > 300) cache.delete(cache.keys().next().value as string); };

/** Origem dos registros nas telas existentes: "" = catálogo normal do sistema; senão, a conexão da Max Data. */
export const MAXDATA_TODAS = "__maxdata_todas__";
export const MAXDATA_ORIGENS = [
  { value: "", label: "Catálogo do sistema" },
  { value: "maxdata:estoque", label: "Casa São Paulo (principal)" },
  { value: "maxdata:notas", label: "SR (filial)" },
];

type Opts = { table: "maxdata_clientes" | "maxdata_produtos"; origem: string; tenantId: string | null | undefined; term: string; page: number; pageSize: number; from?: number; count?: number; searchCols: string[]; orderBy: string; refresh?: number };

/**
 * Lê UMA página dos dados da Max Data direto do servidor (busca e paginação no banco).
 * As telas carregam clientes/produtos inteiros no navegador, o que não escala para dezenas de
 * milhares de linhas — por isso a Max Data fica em tabelas próprias e entra aqui, página a página.
 */
export function useMaxdataPage({ table, origem, tenantId, term, page, pageSize, from, count: limit, searchCols, orderBy, refresh }: Opts) {
  const vazio = limit !== undefined && limit <= 0; // lista mista: esta página inteira cai na parte do CRM
  const ativo = !!origem && !!tenantId && !!supabase;
  const chave = `page|${table}|${tenantId}|${origem}|${term}|${page}|${pageSize}|${from ?? ""}|${limit ?? ""}|${orderBy}|${refresh ?? 0}|${searchCols.join(",")}`;
  const guardado = ativo ? cacheGet<{ rows: any[]; total: number }>(chave) : undefined;
  const [rows, setRows] = useState<any[]>(guardado?.rows ?? []);
  const [total, setTotal] = useState(guardado?.total ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ativo) return;
    const hit = cacheGet<{ rows: any[]; total: number }>(chave);
    if (hit) { setRows(hit.rows); setTotal(hit.total); setError(null); setLoading(false); return; } // já carregado: não busca de novo
    let cancelled = false;
    const inicio = from ?? page * pageSize;
    const fim = inicio + (limit ?? pageSize) - 1;
    const t = setTimeout(async () => {
      setLoading(true); setError(null);
      let q: any = supabase!.from(table).select("*", { count: "exact" }).eq("tenant_id", tenantId!);
      q = origem === MAXDATA_TODAS ? q.in("externo_sistema", ["maxdata:estoque", "maxdata:notas"]) : q.eq("externo_sistema", origem);
      const s = term.replace(/[%_,()\\]/g, " ").trim();
      if (s) q = q.or(searchCols.map((c) => `${c}.ilike.%${s}%`).join(","));
      const { data, count, error: err } = await q.order(orderBy, { ascending: true }).range(inicio, Math.max(inicio, fim));
      if (cancelled) return;
      if (vazio) { setRows([]); if (!err && count !== null) { setTotal(count); cacheSet(chave, { rows: [], total: count }); } setLoading(false); return; }
      if (err) { setError(err.message); setRows([]); setTotal(0); } else { setRows(data ?? []); setTotal(count ?? 0); cacheSet(chave, { rows: data ?? [], total: count ?? 0 }); }
      setLoading(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [chave]);

  return { ativo, rows, total, loading, error };
}

/**
 * Este tenant tem dados da Max Data? Decide se o filtro "Origem" aparece (sem depender de flag de módulo,
 * que varia conforme quem está logado) e expõe o erro de leitura, para não ficar "sem nada" sem explicação.
 */
export function useMaxdataDisponivel(tenantId: string | null | undefined) {
  const chaveD = `disp|${tenantId}`;
  const [estado, setEstado] = useState<{ disponivel: boolean; erro: string | null; pronto: boolean }>(() => (tenantId ? cacheGet<any>(chaveD) : undefined) ?? { disponivel: false, erro: null, pronto: false });
  useEffect(() => {
    if (!tenantId || !supabase) return;
    const hit = cacheGet<any>(chaveD);
    if (hit) { setEstado(hit); return; }
    let cancelled = false;
    (async () => {
      const [c, p] = await Promise.all([
        supabase!.from("maxdata_clientes").select("id").eq("tenant_id", tenantId).limit(1),
        supabase!.from("maxdata_produtos").select("id").eq("tenant_id", tenantId).limit(1),
      ]);
      if (cancelled) return;
      const erro = c.error?.message || p.error?.message || null;
      const novo = { disponivel: (c.data?.length ?? 0) + (p.data?.length ?? 0) > 0, erro, pronto: true };
      if (!erro) cacheSet(chaveD, novo);
      setEstado(novo);
    })();
    return () => { cancelled = true; };
  }, [tenantId]);
  return estado;
}

export type MaxdataStats = { total: number; [k: string]: number };

/**
 * Totais (contagens exatas no servidor) sobre TODA a Max Data do tenant — os cards de indicadores das telas
 * não podem depender da página aberta nem do que está em memória. Uma contagem leve por indicador.
 */
export function useMaxdataStats(table: "maxdata_clientes" | "maxdata_produtos", origem: string, tenantId: string | null | undefined, refresh = 0) {
  const chaveS = `stats|${table}|${tenantId}|${origem}|${refresh}`;
  const [stats, setStats] = useState<MaxdataStats | null>(() => cacheGet<MaxdataStats>(chaveS) ?? null);
  const [loading, setLoading] = useState(false);
  const ativo = !!origem && !!tenantId && !!supabase;

  useEffect(() => {
    if (!ativo) { setStats(null); return; }
    const hit = cacheGet<MaxdataStats>(chaveS);
    if (hit) { setStats(hit); setLoading(false); return; } // já calculado: não conta tudo de novo
    let cancelled = false;
    setLoading(true);
    const base = () => {
      let q: any = supabase!.from(table).select("id", { count: "exact", head: true }).eq("tenant_id", tenantId!);
      return origem === MAXDATA_TODAS ? q.in("externo_sistema", ["maxdata:estoque", "maxdata:notas"]) : q.eq("externo_sistema", origem);
    };
    const filtros: Record<string, (q: any) => any> = table === "maxdata_clientes"
      ? {
          total: (q) => q,
          ativos: (q) => q.eq("status", "Ativo"),
          inativos: (q) => q.eq("status", "Inativo"),
          comContato: (q) => q.or("email.not.is.null,phone.not.is.null"),
        }
      : {
          total: (q) => q,
          ativos: (q) => q.eq("active", true),
          inativos: (q) => q.eq("active", false),
          comEstoque: (q) => q.gt("stock", 0),
        };
    (async () => {
      const chaves = Object.keys(filtros);
      const res = await Promise.all(chaves.map((k) => filtros[k](base())));
      if (cancelled) return;
      const out: MaxdataStats = { total: 0 };
      chaves.forEach((k, i) => { out[k] = res[i].count ?? 0; });
      cacheSet(chaveS, out);
      setStats(out);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [ativo, chaveS]);

  return { stats, loading };
}
