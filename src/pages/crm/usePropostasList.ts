import { uniqueSellers, sellerKey } from "../../lib/sellerNames";
import { useEffect, useMemo, useRef, useState } from "react";
import { somar } from "../../lib/dinheiro";
import { supabase } from "../../lib/supabase";
import { limpaBusca, fetchAllRows } from "../../lib/pgrst";
import { friendlyError } from "../../lib/friendlyError";
import { toast } from "sonner";
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
 * data — não a página atual — pra "Propostas Ativas" ficar correto
 * independente de paginação. Os indicadores mensais ("Convertidas (Mês)",
 * "Taxa de Conversão" etc.) usam uma segunda busca sem filtro de data nenhum
 * (são fixos por mês corrente, não pelo filtro da tela).
 */
export function usePropostasList({ dateFrom, dateTo }: { dateFrom: string | null; dateTo: string | null }) {
  const { activeTenantId: tenantId } = useAuth();

  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFiltro, setStatusFiltro] = useState("todos");
  const [vendedorFiltro, setVendedorFiltro] = useState("todos");

  const [rows, setRows] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [proposalItems, setProposalItems] = useState<PropostaItem[]>([]);
  const [loading, setLoading] = useState(false);

  const [kpiFilteredRows, setKpiFilteredRows] = useState<any[]>([]);
  const [kpiAllRows, setKpiAllRows] = useState<any[]>([]);
  // Grafias do mesmo vendedor (acento/espaço/maiúscula) para o filtro do servidor pegar todas.
  const kpiRowsRef = useRef<any[]>([]);
  kpiRowsRef.current = kpiAllRows;
  const variantesDe = (nome: string): string[] => {
    const k = sellerKey(nome);
    const out = new Set<string>([nome]);
    kpiRowsRef.current.forEach((p) => { if (p.vendedor && sellerKey(p.vendedor) === k) out.add(p.vendedor); });
    return [...out];
  };

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(0); }, [dateFrom, dateTo, statusFiltro, vendedorFiltro]);

  const requestIdRef = useRef(0);

  const fetchPage = async () => {
    if (!supabase || !tenantId) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      let query = supabase.from("proposals").select("*", { count: "exact" }).eq("tenant_id", tenantId);
      if (searchQuery.trim()) {
        const q = limpaBusca(searchQuery);
        query = query.or(`cliente.ilike.%${q}%,titulo.ilike.%${q}%,vendedor.ilike.%${q}%`);
      }
      if (dateFrom) query = query.gte("created_at", dateFrom);
      if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59`);
      if (statusFiltro !== "todos") query = query.eq("status", statusFiltro);
      if (vendedorFiltro !== "todos") query = query.in("vendedor", variantesDe(vendedorFiltro));

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);

      if (requestId !== requestIdRef.current) return;
      if (error) {
        // Mantém a lista anterior (não finge "nenhum resultado") e avisa o usuário.
        toast.error(friendlyError(error));
      } else if (data) {
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
    } catch (err) {
      if (requestId === requestIdRef.current) toast.error(friendlyError(err));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  const kpiRequestIdRef = useRef(0);

  const fetchKpis = async () => {
    if (!supabase || !tenantId) return;
    const requestId = ++kpiRequestIdRef.current;
    const projection = "id,valor,status,created_at,cliente,titulo,vendedor,first_viewed_at";
    try {
      const [filteredRows, allRows] = await Promise.all([
        fetchAllRows(() => {
          let q = supabase!.from("proposals").select(projection).eq("tenant_id", tenantId);
          if (dateFrom) q = q.gte("created_at", dateFrom);
          if (dateTo) q = q.lte("created_at", `${dateTo}T23:59:59`);
          return q.order("id", { ascending: true });
        }),
        fetchAllRows(() => supabase!.from("proposals").select(projection).eq("tenant_id", tenantId).order("id", { ascending: true })),
      ]);
      if (requestId !== kpiRequestIdRef.current) return; // período já mudou: resposta antiga não vale
      setKpiFilteredRows(filteredRows);
      setKpiAllRows(allRows);
    } catch (err) {
      toast.error(friendlyError(err));
    }
  };

  useEffect(() => {
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, page, searchQuery, dateFrom, dateTo, statusFiltro, vendedorFiltro]);

  useEffect(() => {
    fetchKpis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, dateFrom, dateTo]);

  // Buckets reais dos últimos 6 meses (sempre sobre kpiAllRows — TODO
  // proposta do tenant, nunca o `dateFrom`/`dateTo` da lista paginada, pra
  // "este mês"/"mês passado" nunca mudar de significado conforme o filtro da
  // tela) — fonte do valor/sparkline/delta de cada card, sem precisar de
  // nenhum histórico sintético: created_at já é um timestamp real e imutável.
  const monthlyBuckets = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
      const y = d.getFullYear(), m = d.getMonth();
      const doMes = kpiAllRows.filter((p) => {
        const pd = p.created_at ? new Date(p.created_at) : null;
        return pd && !isNaN(pd.getTime()) && pd.getFullYear() === y && pd.getMonth() === m;
      });
      const aceitas = doMes.filter((p) => p.status === "Aceita");
      const valorTotal = somar(doMes, (p) => p.valor);
      const valorConvertido = somar(aceitas, (p) => p.valor);
      return {
        label: d.toLocaleDateString("pt-BR", { month: "short" }),
        count: doMes.length,
        valorTotal,
        valorConvertido,
        taxaConversao: doMes.length > 0 ? Math.round((aceitas.length / doMes.length) * 1000) / 10 : 0,
        rows: doMes,
        rowsConvertidas: aceitas,
      };
    });
  }, [kpiAllRows]);

  const kpis = useMemo(() => {
    const mesAtual = monthlyBuckets[monthlyBuckets.length - 1];
    const mesAnterior = monthlyBuckets[monthlyBuckets.length - 2];
    const pctDelta = (atual: number, anterior: number): number | null => (anterior > 0 ? Math.round(((atual - anterior) / anterior) * 1000) / 10 : null);
    // Único cartão sem janela fixa: respeita o período escolhido (sem período, é o conjunto inteiro).
    const ativasRows = kpiFilteredRows.filter((p) => p.status !== "Aceita" && p.status !== "Recusada");
    return {
      valorEmPropostas: mesAtual.valorTotal,
      valorEmPropostasDelta: pctDelta(mesAtual.valorTotal, mesAnterior.valorTotal),
      valorEmPropostasRows: mesAtual.rows,
      convertidasMes: mesAtual.valorConvertido,
      convertidasMesDelta: pctDelta(mesAtual.valorConvertido, mesAnterior.valorConvertido),
      convertidasMesRows: mesAtual.rowsConvertidas,
      taxaConversao: mesAtual.taxaConversao,
      taxaConversaoDeltaPP: mesAnterior.count > 0 ? Math.round((mesAtual.taxaConversao - mesAnterior.taxaConversao) * 10) / 10 : null,
      propostasAtivas: ativasRows.length,
      propostasAtivasRows: ativasRows,
      propostasTotal: kpiFilteredRows.length,
      volumeSparkline: monthlyBuckets.map((b) => b.count),
      valorSparkline: monthlyBuckets.map((b) => b.valorTotal),
      convertidasSparkline: monthlyBuckets.map((b) => b.valorConvertido),
      taxaConversaoSparkline: monthlyBuckets.map((b) => b.taxaConversao),
      // Mantido pro filtro da lista (aba Propostas Comerciais usa o
      // dateFrom/dateTo aplicado na tela).
      aguardandoAceite: somar(kpiFilteredRows.filter((p) => p.status === "Enviada"), (p) => p.valor),
    };
  }, [monthlyBuckets, kpiAllRows, kpiFilteredRows]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const vendedores = useMemo(() => uniqueSellers(kpiAllRows.map((p) => p.vendedor)), [kpiAllRows]);

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
    statusFiltro,
    setStatusFiltro,
    vendedorFiltro,
    setVendedorFiltro,
    vendedores,
    kpiAllRows,
    loading,
    refetch: () => { fetchPage(); fetchKpis(); },
  };
}
