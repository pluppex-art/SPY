import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

const DEFAULT_PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

export interface FinanceEntriesFilters {
  type: "Pagar" | "Receber";
  statusFilter?: "Pago";
  search: string;
  categoriaId: string;
  status: "" | "Pago" | "A Vencer" | "Atrasado" | "Pendente";
  contaBancariaId: string;
  centroCustoId: string;
  dataInicio: string;
  dataFim: string;
  pageSize?: number;
  /** true = vencimento mais antigo primeiro (padrão: mais recente primeiro). */
  ascending?: boolean;
}

/**
 * Paginação real (server-side) para as listas de Financeiro
 * (`src/pages/finance/GenericFinanceiroList.tsx`) — busca 50 lançamentos
 * por vez direto do Supabase, ordenados/filtrados por `date_normalized`
 * (coluna gerada pelo Postgres a partir do texto livre de `date`, que vem
 * em dois formatos diferentes — ver a migration
 * 20260920_finance_entries_date_normalized.sql), em vez de carregar todo o
 * array `financeEntries` do DataContext e filtrar no navegador.
 *
 * `totalValue` (soma pro rodapé/total) vem de uma projeção estreita
 * (só `value`) sobre TODO o conjunto que bate o filtro, não só a página
 * atual — soma somada no cliente sobre um payload pequeno, sem depender de
 * função de agregação do PostgREST (evita risco de incompatibilidade de
 * versão do to_date/aggregate syntax).
 */
export function useFinanceEntriesList(filters: FinanceEntriesFilters) {
  const { activeTenantId: tenantId, activeFilialId } = useAuth();
  const { type, statusFilter, search, categoriaId, status, contaBancariaId, centroCustoId, dataInicio, dataFim, pageSize: PAGE_SIZE = DEFAULT_PAGE_SIZE, ascending = false } = filters;

  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalValue, setTotalValue] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setPage(0); }, [type, statusFilter, search, categoriaId, status, contaBancariaId, centroCustoId, dataInicio, dataFim, PAGE_SIZE, ascending]);

  const requestIdRef = useRef(0);

  const applyFilters = (query: any) => {
    let q = query.eq("type", type);
    if (statusFilter) q = q.eq("status", statusFilter);
    else if (status) q = q.eq("status", status);
    if (activeFilialId) q = q.or(`filial_id.is.null,filial_id.eq.${activeFilialId}`);
    if (search.trim()) {
      const term = search.trim().replace(/[%,]/g, "");
      q = q.or(`description.ilike.%${term}%,category.ilike.%${term}%,counterparty.ilike.%${term}%`);
    }
    if (categoriaId) q = q.eq("category_id", categoriaId);
    if (contaBancariaId) q = q.eq("conta_bancaria_id", contaBancariaId);
    if (centroCustoId) q = q.eq("centro_custo_id", centroCustoId);
    if (dataInicio) q = q.gte("date_normalized", dataInicio);
    if (dataFim) q = q.lte("date_normalized", dataFim);
    return q;
  };

  const fetchPage = async () => {
    if (!supabase || !tenantId) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      let query = applyFilters(supabase.from("finance_entries").select("*", { count: "exact" }).eq("tenant_id", tenantId));
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await query
        .order("date_normalized", { ascending, nullsFirst: false })
        .range(from, to);

      if (requestId !== requestIdRef.current) return;
      if (!error && data) {
        setRows(data);
        setTotal(count ?? 0);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  const fetchTotalValue = async () => {
    if (!supabase || !tenantId) return;
    let query = applyFilters(supabase.from("finance_entries").select("value").eq("tenant_id", tenantId));
    const { data } = await query;
    if (data) setTotalValue((data as any[]).reduce((acc, r) => acc + (Number(r.value) || 0), 0));
  };

  useEffect(() => {
    fetchPage();
    fetchTotalValue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, activeFilialId, type, statusFilter, search, categoriaId, status, contaBancariaId, centroCustoId, dataInicio, dataFim, page, PAGE_SIZE, ascending]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Uso pontual (clique em "Exportar") — busca TODOS os lançamentos que
  // batem o filtro atual, sem paginação, só pra montar o CSV completo.
  const fetchAllForExport = async (): Promise<any[]> => {
    if (!supabase || !tenantId) return [];
    const { data } = await applyFilters(supabase.from("finance_entries").select("*").eq("tenant_id", tenantId))
      .order("date_normalized", { ascending: false, nullsFirst: false });
    return data || [];
  };

  return {
    entries: rows,
    total,
    totalValue,
    page,
    setPage,
    totalPages,
    pageSize: PAGE_SIZE,
    loading,
    refetch: () => { fetchPage(); fetchTotalValue(); },
    fetchAllForExport,
  };
}
