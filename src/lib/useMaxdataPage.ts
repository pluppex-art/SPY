import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/** Origem dos registros nas telas existentes: "" = catálogo normal do sistema; senão, a conexão da Max Data. */
export const MAXDATA_TODAS = "__maxdata_todas__";
export const MAXDATA_ORIGENS = [
  { value: "", label: "Catálogo do sistema" },
  { value: "maxdata:estoque", label: "Max Data · Estoque" },
  { value: "maxdata:notas", label: "Max Data · Notas fiscais" },
];

type Opts = { table: "maxdata_clientes" | "maxdata_produtos"; origem: string; tenantId: string | null | undefined; term: string; page: number; pageSize: number; from?: number; count?: number; searchCols: string[]; orderBy: string };

/**
 * Lê UMA página dos dados da Max Data direto do servidor (busca e paginação no banco).
 * As telas carregam clientes/produtos inteiros no navegador, o que não escala para dezenas de
 * milhares de linhas — por isso a Max Data fica em tabelas próprias e entra aqui, página a página.
 */
export function useMaxdataPage({ table, origem, tenantId, term, page, pageSize, from, count: limit, searchCols, orderBy }: Opts) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const vazio = limit !== undefined && limit <= 0; // lista mista: esta página inteira cai na parte do CRM
  const ativo = !!origem && !!tenantId && !!supabase;

  useEffect(() => {
    if (!ativo) return;
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
      if (vazio) { setRows([]); setTotal(count ?? 0); setLoading(false); return; }
      if (err) { setError(err.message); setRows([]); setTotal(0); } else { setRows(data ?? []); setTotal(count ?? 0); }
      setLoading(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [ativo, table, origem, tenantId, term, page, pageSize, from, limit, orderBy, searchCols.join(",")]);

  return { ativo, rows, total, loading, error };
}

/**
 * Este tenant tem dados da Max Data? Decide se o filtro "Origem" aparece (sem depender de flag de módulo,
 * que varia conforme quem está logado) e expõe o erro de leitura, para não ficar "sem nada" sem explicação.
 */
export function useMaxdataDisponivel(tenantId: string | null | undefined) {
  const [estado, setEstado] = useState<{ disponivel: boolean; erro: string | null; pronto: boolean }>({ disponivel: false, erro: null, pronto: false });
  useEffect(() => {
    if (!tenantId || !supabase) return;
    let cancelled = false;
    (async () => {
      const [c, p] = await Promise.all([
        supabase!.from("maxdata_clientes").select("id").eq("tenant_id", tenantId).limit(1),
        supabase!.from("maxdata_produtos").select("id").eq("tenant_id", tenantId).limit(1),
      ]);
      if (cancelled) return;
      const erro = c.error?.message || p.error?.message || null;
      setEstado({ disponivel: (c.data?.length ?? 0) + (p.data?.length ?? 0) > 0, erro, pronto: true });
    })();
    return () => { cancelled = true; };
  }, [tenantId]);
  return estado;
}
