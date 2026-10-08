import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

export type TransacoesTab = "todos" | "entradas" | "saidas" | "pendentes";
export type TransacoesOrdem = "data_desc" | "data_asc" | "valor_desc" | "valor_asc";

export interface TransacoesParams {
  search: string;
  tab: TransacoesTab;
  dateFrom: string | null;
  dateTo: string | null;
  categoria: string;
  contraparte: string;
  ordem: TransacoesOrdem;
  pageSize: number;
}

export interface TransacaoLeve { value: number; type: "Receber" | "Pagar"; status: string; date_normalized: string | null }

const CHUNK = 1000;

/**
 * Paginação real (server-side) pro extrato consolidado
 * (`src/pages/finance/FinanceiroTransacoes.tsx`, só-leitura). Ordena por
 * `date_normalized` (coluna gerada — ver
 * supabase/migrations/20260920_finance_entries_date_normalized.sql).
 *
 * Além da página visível, busca (paginando de 1000 em 1000, pra não esbarrar no
 * limite padrão do PostgREST) as linhas leves de TODO o conjunto filtrado —
 * sem a aba — pra montar totais, contagem das abas e gráficos sem precisar
 * carregar o array completo; e, quando há período, as do período anterior de
 * mesma duração, pra variação.
 */
export function useFinanceTransacoesList(params: TransacoesParams) {
  const { activeTenantId: tenantId, activeFilialId } = useAuth();
  const { search, tab, dateFrom, dateTo, categoria, contraparte, ordem, pageSize } = params;

  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [base, setBase] = useState<TransacaoLeve[]>([]);
  const [prev, setPrev] = useState<TransacaoLeve[] | null>(null);
  const [loading, setLoading] = useState(false);

  const filtersKey = `${search}|${tab}|${dateFrom}|${dateTo}|${categoria}|${contraparte}|${ordem}|${pageSize}`;
  useEffect(() => { setPage(0); }, [filtersKey]);

  const requestIdRef = useRef(0);

  const applyBase = (query: any, range?: { from: string | null; to: string | null }) => {
    let q = query;
    if (activeFilialId) q = q.or(`filial_id.is.null,filial_id.eq.${activeFilialId}`);
    if (search.trim()) {
      const term = search.trim().replace(/[%,]/g, "");
      q = q.or(`description.ilike.%${term}%,category.ilike.%${term}%,counterparty.ilike.%${term}%`);
    }
    if (categoria) q = q.eq("category", categoria);
    if (contraparte) q = q.eq("counterparty", contraparte);
    const r = range ?? { from: dateFrom, to: dateTo };
    if (r.from) q = q.gte("date_normalized", r.from);
    if (r.to) q = q.lte("date_normalized", r.to);
    return q;
  };

  const applyTab = (query: any) => {
    let q = query;
    if (tab === "entradas") q = q.eq("type", "Receber");
    else if (tab === "saidas") q = q.eq("type", "Pagar");
    else if (tab === "pendentes") q = q.in("status", ["A Vencer", "Atrasado"]);
    return q;
  };

  const fetchPaged = async (build: () => any): Promise<any[]> => {
    const out: any[] = [];
    for (let from = 0; ; from += CHUNK) {
      const { data, error } = await build().range(from, from + CHUNK - 1);
      if (error || !data) break;
      out.push(...data);
      if (data.length < CHUNK) break;
    }
    return out;
  };

  const shiftIso = (iso: string, days: number) => {
    const d = new Date(iso + "T12:00:00");
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  const fetchPage = async () => {
    if (!supabase || !tenantId) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      let query = applyTab(applyBase(supabase.from("finance_entries").select("*", { count: "exact" }).eq("tenant_id", tenantId)));
      if (ordem === "valor_desc") query = query.order("value", { ascending: false });
      else if (ordem === "valor_asc") query = query.order("value", { ascending: true });
      else query = query.order("date_normalized", { ascending: ordem === "data_asc", nullsFirst: false });
      const from = page * pageSize;
      const { data, count, error } = await query.range(from, from + pageSize - 1);
      if (requestId !== requestIdRef.current) return;
      if (!error && data) { setRows(data); setTotal(count ?? 0); }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  const fetchBase = async () => {
    if (!supabase || !tenantId) return;
    const requestId = requestIdRef.current;
    const leve = (r?: { from: string | null; to: string | null }) =>
      fetchPaged(() => applyBase(supabase!.from("finance_entries").select("value,type,status,date_normalized").eq("tenant_id", tenantId).order("id"), r)) as Promise<TransacaoLeve[]>;
    const cur = await leve();
    let ant: TransacaoLeve[] | null = null;
    if (dateFrom && dateTo) {
      const dias = Math.round((new Date(dateTo + "T12:00:00").getTime() - new Date(dateFrom + "T12:00:00").getTime()) / 86400000) + 1;
      ant = await leve({ from: shiftIso(dateFrom, -dias), to: shiftIso(dateFrom, -1) });
    }
    if (requestId !== requestIdRef.current) return;
    setBase(cur.map((r) => ({ ...r, value: Number(r.value) || 0 })));
    setPrev(ant ? ant.map((r) => ({ ...r, value: Number(r.value) || 0 })) : null);
  };

  useEffect(() => {
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, activeFilialId, filtersKey, page]);

  useEffect(() => {
    fetchBase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, activeFilialId, search, dateFrom, dateTo, categoria, contraparte]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchAllForExport = async (): Promise<any[]> => {
    if (!supabase || !tenantId) return [];
    return fetchPaged(() => applyTab(applyBase(supabase!.from("finance_entries").select("*").eq("tenant_id", tenantId))).order("date_normalized", { ascending: false, nullsFirst: false }).order("id"));
  };

  const refetch = () => { fetchPage(); fetchBase(); };
  return { entries: rows, total, base, prev, page, setPage, totalPages, loading, fetchAllForExport, refetch };
}
