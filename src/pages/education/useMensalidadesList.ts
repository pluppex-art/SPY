import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../contexts/AuthContext";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;

export type Mensalidade = {
  id: string;
  student_id: string;
  competencia: string;
  parcela: number;
  valor: number;
  vencimento: string;
  status: "Pendente" | "Pago" | "Atrasado" | "Cancelado";
  data_pagamento: string | null;
  forma_pagamento: string | null;
};

/**
 * Paginação/busca real (server-side) para src/pages/education/Mensalidades.tsx
 * — antes buscava `mensalidades` e `students` inteiros do tenant (sem
 * `.range()` nenhum) a cada render. Mensalidades não tem nome de aluno na
 * própria linha (só `student_id`), então a busca por nome primeiro resolve
 * os IDs em `students` (mesmo tenant) e só depois filtra `mensalidades` por
 * `student_id.in.(...)` — não dá pra fazer isso num filtro simples do
 * PostgREST sem depender de embed de FK.
 */
export function useMensalidadesList() {
  const { activeTenantId: tenantId } = useAuth();

  const [page, setPage] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");

  const [rows, setRows] = useState<Mensalidade[]>([]);
  const [studentsById, setStudentsById] = useState<Record<string, string>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearchQuery(searchInput);
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(0); }, [statusFilter]);

  const requestIdRef = useRef(0);

  const fetchPage = async () => {
    if (!supabase || !tenantId) { setLoading(false); return; }
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      let matchingStudentIds: string[] | null = null;
      const q = searchQuery.trim();
      if (q) {
        const { data: studentRows } = await supabase
          .from("students")
          .select("id")
          .eq("tenant_id", tenantId)
          .ilike("nome", `%${q.replace(/[%,]/g, "")}%`);
        matchingStudentIds = (studentRows || []).map((s: any) => s.id);
        // Nenhum aluno bate com a busca — não tem por que nem consultar
        // mensalidades, a página é vazia.
        if (matchingStudentIds.length === 0) {
          if (requestId === requestIdRef.current) { setRows([]); setTotal(0); setLoading(false); }
          return;
        }
      }

      let query = supabase.from("mensalidades").select("*", { count: "exact" }).eq("tenant_id", tenantId);
      if (matchingStudentIds) query = query.in("student_id", matchingStudentIds);
      if (statusFilter !== "Todos") query = query.eq("status", statusFilter);

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await query
        .order("vencimento", { ascending: true })
        .range(from, to);

      if (requestId !== requestIdRef.current) return;

      if (!error && data) {
        setRows(data as Mensalidade[]);
        setTotal(count ?? 0);

        const ids = [...new Set(data.map((m: any) => m.student_id).filter(Boolean))];
        if (ids.length > 0) {
          const { data: studentRows } = await supabase.from("students").select("id, nome").in("id", ids);
          if (requestId !== requestIdRef.current) return;
          const map: Record<string, string> = {};
          (studentRows || []).forEach((s: any) => { map[s.id] = s.nome; });
          setStudentsById((prev) => ({ ...prev, ...map }));
        }
      }
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, page, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Só usado pelo botão "Exportar CSV" — busca TODAS as linhas que batem
  // com o filtro atual (sem paginar), sob demanda no clique, em vez de
  // manter o array inteiro carregado o tempo todo (era o próprio problema
  // que esta tela tinha antes).
  const exportAll = async (): Promise<{ mensalidades: Mensalidade[]; studentsById: Record<string, string> }> => {
    if (!supabase || !tenantId) return { mensalidades: [], studentsById: {} };

    let matchingStudentIds: string[] | null = null;
    const q = searchQuery.trim();
    if (q) {
      const { data: studentRows } = await supabase
        .from("students").select("id").eq("tenant_id", tenantId)
        .ilike("nome", `%${q.replace(/[%,]/g, "")}%`);
      matchingStudentIds = (studentRows || []).map((s: any) => s.id);
      if (matchingStudentIds.length === 0) return { mensalidades: [], studentsById: {} };
    }

    let query = supabase.from("mensalidades").select("*").eq("tenant_id", tenantId);
    if (matchingStudentIds) query = query.in("student_id", matchingStudentIds);
    if (statusFilter !== "Todos") query = query.eq("status", statusFilter);
    const { data } = await query.order("vencimento", { ascending: true });

    const all = (data || []) as Mensalidade[];
    const ids = [...new Set(all.map((m) => m.student_id).filter(Boolean))];
    let map: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: studentRows } = await supabase.from("students").select("id, nome").in("id", ids);
      (studentRows || []).forEach((s: any) => { map[s.id] = s.nome; });
    }
    return { mensalidades: all, studentsById: map };
  };

  // Base dos indicadores quando há período escolhido: o resumo do servidor soma tudo
  // e não aceita datas, então buscamos só os campos dos cartões, sem os filtros da tela.
  const fetchBaseResumo = async (): Promise<Pick<Mensalidade, "status" | "valor" | "vencimento">[]> => {
    if (!supabase || !tenantId) return [];
    const all: Pick<Mensalidade, "status" | "valor" | "vencimento">[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from("mensalidades").select("status, valor, vencimento").eq("tenant_id", tenantId)
        .order("id").range(from, from + 999);
      if (error) throw error;
      all.push(...((data || []) as typeof all));
      if (!data || data.length < 1000) return all;
    }
  };

  return {
    mensalidades: rows,
    studentsById,
    total,
    page,
    setPage,
    totalPages,
    pageSize: PAGE_SIZE,
    searchQuery: searchInput,
    setSearchQuery: setSearchInput,
    statusFilter,
    setStatusFilter,
    loading,
    refetch: fetchPage,
    exportAll,
    fetchBaseResumo,
  };
}
