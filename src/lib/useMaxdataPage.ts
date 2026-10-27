import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/** Origem dos registros nas telas existentes: "" = catálogo normal do sistema; senão, a conexão da Max Data. */
export const MAXDATA_ORIGENS = [
  { value: "", label: "Catálogo do sistema" },
  { value: "maxdata:estoque", label: "Max Data · Estoque" },
  { value: "maxdata:notas", label: "Max Data · Notas fiscais" },
];

type Opts = { table: "maxdata_clientes" | "maxdata_produtos"; origem: string; tenantId: string | null | undefined; term: string; page: number; pageSize: number; searchCols: string[]; orderBy: string };

/**
 * Lê UMA página dos dados da Max Data direto do servidor (busca e paginação no banco).
 * As telas carregam clientes/produtos inteiros no navegador, o que não escala para dezenas de
 * milhares de linhas — por isso a Max Data fica em tabelas próprias e entra aqui, página a página.
 */
export function useMaxdataPage({ table, origem, tenantId, term, page, pageSize, searchCols, orderBy }: Opts) {
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ativo = !!origem && !!tenantId && !!supabase;

  useEffect(() => {
    if (!ativo) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true); setError(null);
      let q: any = supabase!.from(table).select("*", { count: "exact" }).eq("tenant_id", tenantId!).eq("externo_sistema", origem);
      const s = term.replace(/[%_,()\\]/g, " ").trim();
      if (s) q = q.or(searchCols.map((c) => `${c}.ilike.%${s}%`).join(","));
      const { data, count, error: err } = await q.order(orderBy, { ascending: true }).range(page * pageSize, page * pageSize + pageSize - 1);
      if (cancelled) return;
      if (err) { setError(err.message); setRows([]); setTotal(0); } else { setRows(data ?? []); setTotal(count ?? 0); }
      setLoading(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [ativo, table, origem, tenantId, term, page, pageSize, orderBy, searchCols.join(",")]);

  return { ativo, rows, total, loading, error };
}
