import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { limpaBusca } from "../../lib/pgrst";
import { useAuth } from "../../contexts/AuthContext";
import { useData } from "../../contexts/DataContext";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

// Temperatura (quente/morno/frio) não é uma ordem natural de coluna no
// Postgres — em vez de um ORDER BY no servidor, o sort por temperatura é
// aplicado só sobre a página já carregada (compromisso assumido; a ordenação
// "de verdade" entre páginas continua sendo por created_at).
const TEMP_ORDER: Record<string, number> = { quente: 3, morno: 2, frio: 1 };

// Mesma normalização que DataContext.tsx aplica em mapLeadRow (função local,
// não exportada lá) — duplicada aqui de propósito, pequena e estável, pra
// esta tela não depender de importar/alterar o DataContext (em reescrita
// concorrente por outra frente de trabalho no momento em que este hook foi
// criado).
const mapLeadRow = (r: any) => ({
  ...r,
  productIds: (r.customFields?.productIds?.length ? r.customFields.productIds : r.productIds) || [],
  scoreIA: r.scoreIA ?? r.score_ia ?? 50,
  tags: Array.isArray(r.tags) ? r.tags : (r.customFields?.tags || []),
});

/**
 * Paginação/busca real (server-side) para a tela de Leads (`src/pages/crm/Leads.tsx`).
 * Busca paginada contra o Supabase, cobrindo o histórico completo do tenant —
 * em vez de depender do array `leads` do DataContext (que só é usado aqui pra
 * popular o dropdown de vendedores, ver `sellers` abaixo).
 *
 * `total`/`hot`/`closed` vêm de queries `count: 'exact', head: true` dedicadas,
 * nunca derivadas de `leads.length` da página atual.
 */
export function useLeadsList() {
  const { activeTenantId: tenantId, activeFilialId } = useAuth();
  // `sellers` (opções do filtro) continua vindo do DataContext — não precisa
  // do histórico completo, só de uma amostra representativa pra popular o dropdown.
  const { leads: recentLeadsForSellers } = useData();

  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [temperatureFilter, setTemperatureFilter] = useState("Todas");
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc");

  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [hot, setHot] = useState(0);
  const [closed, setClosed] = useState(0);
  const [loading, setLoading] = useState(false);

  // Debounce da busca — evita disparar uma query por tecla digitada.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(0); }, [temperatureFilter]);

  const requestIdRef = useRef(0);

  const fetchPage = async () => {
    if (!supabase || !tenantId) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      let query = supabase
        .from("leads")
        .select("*", { count: "exact" })
        .eq("tenant_id", tenantId);

      if (activeFilialId) {
        // Mesmo critério do DataContext (filterByFilial): linhas sem filial_id
        // (legado) continuam visíveis em qualquer filial ativa.
        query = query.or(`filial_id.is.null,filial_id.eq.${activeFilialId}`);
      }
      if (searchQuery.trim()) {
        const q = limpaBusca(searchQuery);
        query = query.or(`name.ilike.%${q}%,company.ilike.%${q}%,email.ilike.%${q}%`);
      }
      if (temperatureFilter !== "Todas") {
        query = query.eq("temperature", temperatureFilter);
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await query
        .order("created_at", { ascending: false })
        .range(from, to);

      // Resposta de uma busca/página antiga chegando depois de uma mais nova
      // (corrida de rede) — descarta, não sobrescreve o estado atual.
      if (requestId !== requestIdRef.current) return;

      if (!error && data) {
        setRows(data.map(mapLeadRow));
        setTotal(count ?? 0);
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  const fetchCounts = async () => {
    if (!supabase || !tenantId) return;
    const base = () => {
      let q = supabase!.from("leads").select("*", { count: "exact", head: true }).eq("tenant_id", tenantId);
      if (activeFilialId) q = q.or(`filial_id.is.null,filial_id.eq.${activeFilialId}`);
      return q;
    };
    const [hotRes, closedRes] = await Promise.all([
      base().eq("priority", "Alta"),
      base().eq("status", "Fechado"),
    ]);
    if (hotRes.count != null) setHot(hotRes.count);
    if (closedRes.count != null) setClosed(closedRes.count);
  };

  useEffect(() => {
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, activeFilialId, page, searchQuery, temperatureFilter]);

  useEffect(() => {
    fetchCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, activeFilialId]);

  const sortedRows = useMemo(() => {
    const withTempOrder = [...rows];
    withTempOrder.sort((a, b) => {
      const va = TEMP_ORDER[a.temperature || ""] || 0;
      const vb = TEMP_ORDER[b.temperature || ""] || 0;
      return sortOrder === "desc" ? vb - va : va - vb;
    });
    return withTempOrder;
  }, [rows, sortOrder]);

  const sellers = useMemo(
    () => [...new Set((recentLeadsForSellers as any[]).map((l: any) => l.seller).filter(Boolean))] as string[],
    [recentLeadsForSellers]
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return {
    leads: sortedRows,
    total,
    stats: { total, hot, closed },
    page,
    setPage,
    totalPages,
    pageSize: PAGE_SIZE,
    searchQuery: searchInput,
    setSearchQuery: setSearchInput,
    temperatureFilter,
    setTemperatureFilter,
    sortOrder,
    setSortOrder,
    sellers,
    loading,
    refetch: () => { fetchPage(); fetchCounts(); },
  };
}
