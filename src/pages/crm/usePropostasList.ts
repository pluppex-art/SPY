import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

interface PropostaItem {
  proposal_id: string;
  product_id: string | null;
  product_name: string;
  quantidade: number;
  preco_unitario: number;
  billing_type?: string | null;
  contract_months?: number | null;
}

function isThisMonth(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/**
 * Paginação real (server-side) para a lista de propostas
 * (`src/pages/crm/Propostas.tsx` / `components/Propostas/PropostasTable.tsx`).
 * Busca 50 por vez no Supabase (com busca por cliente/título) em vez de
 * depender do array `proposals` inteiro do DataContext.
 *
 * `proposalItems` da página atual são buscados à parte, escopados pelos ids
 * das propostas visíveis (`.in('proposal_id', ids)`) — não o join inteiro.
 *
 * Os KPIs (`kpis`) usam uma projeção estreita (só valor/status/created_at,
 * não a proposta inteira) sobre TODO o conjunto que bate com o filtro de
 * data — não a página atual — pra "Propostas Ativas"/"Taxa de Conversão"
 * ficarem corretos independente de paginação. "Convertidas (Mês)" usa uma
 * segunda busca sem filtro de data nenhum (mesmo comportamento de antes,
 * onde o indicador é fixo por mês corrente, não pelo filtro da tela).
 */
export function usePropostasList({ dateFrom, dateTo }: { dateFrom: string | null; dateTo: string | null }) {
  const { activeTenantId: tenantId } = useAuth();

  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [proposalItems, setProposalItems] = useState<PropostaItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [kpiFilteredRows, setKpiFilteredRows] = useState<any[]>([]);
  const [kpiAllRows, setKpiAllRows] = useState<any[]>([]);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(0); }, [dateFrom, dateTo]);

  const requestIdRef = useRef(0);

  const fetchPage = async () => {
    if (!supabase || !tenantId) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      let query = supabase.from("proposals").select("*", { count: "exact" }).eq("tenant_id", tenantId);
      if (searchQuery.trim()) {
        const q = searchQuery.trim().replace(/[%,]/g, "");
        query = query.or(`cliente.ilike.%${q}%,titulo.ilike.%${q}%`);
      }
      if (dateFrom) query = query.gte("created_at", dateFrom);
      if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59`);

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);

      if (requestId !== requestIdRef.current) return;
      if (!error && data) {
        setRows(data);
        setTotal(count ?? 0);

        const ids = data.map((p: any) => p.id).filter(Boolean);
        if (ids.length > 0) {
          const { data: items } = await supabase.from("proposal_items").select("*").in("proposal_id", ids);
          if (requestId === requestIdRef.current) setProposalItems((items as PropostaItem[]) || []);
        } else {
          setProposalItems([]);
        }
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  const fetchKpis = async () => {
    if (!supabase || !tenantId) return;
    const projection = "id,valor,status,created_at,cliente,titulo";
    let filteredQuery = supabase.from("proposals").select(projection).eq("tenant_id", tenantId);
    if (dateFrom) filteredQuery = filteredQuery.gte("created_at", dateFrom);
    if (dateTo) filteredQuery = filteredQuery.lte("created_at", `${dateTo}T23:59:59`);

    const [filteredRes, allRes] = await Promise.all([
      filteredQuery,
      supabase.from("proposals").select(projection).eq("tenant_id", tenantId),
    ]);
    if (filteredRes.data) setKpiFilteredRows(filteredRes.data);
    if (allRes.data) setKpiAllRows(allRes.data);
  };

  useEffect(() => {
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, page, searchQuery, dateFrom, dateTo]);

  useEffect(() => {
    fetchKpis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, dateFrom, dateTo]);

  const kpis = useMemo(() => {
    const convertidasMesBase = kpiAllRows.filter((p) => p.status === "Aceita" && isThisMonth(p.created_at));
    const aceitasFiltered = kpiFilteredRows.filter((p) => p.status === "Aceita");
    const aguardandoAceiteRows = kpiFilteredRows.filter((p) => p.status === "Enviada");
    return {
      aguardandoAceite: aguardandoAceiteRows.reduce((acc, c) => acc + (Number(c.valor) || 0), 0),
      aguardandoAceiteRows,
      convertidasMes: convertidasMesBase.reduce((acc, c) => acc + (Number(c.valor) || 0), 0),
      convertidasMesRows: convertidasMesBase,
      taxaConversao: kpiFilteredRows.length > 0 ? Math.round((aceitasFiltered.length / kpiFilteredRows.length) * 100) : 0,
      propostasAtivas: kpiFilteredRows.length,
      propostasAtivasRows: kpiFilteredRows,
    };
  }, [kpiFilteredRows, kpiAllRows]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return {
    propostas: rows,
    proposalItems,
    total,
    kpis,
    page,
    setPage,
    totalPages,
    pageSize: PAGE_SIZE,
    searchQuery: searchInput,
    setSearchQuery: setSearchInput,
    loading,
    refetch: () => { fetchPage(); fetchKpis(); },
  };
}
