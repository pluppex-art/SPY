import { useEffect, useRef, useState } from "react";
import { supabase } from "../../../lib/supabase";
import { limpaBusca } from "../../../lib/pgrst";
import { useAuth } from "../../../contexts/AuthContext";
import { Task } from "../../../types";
import { friendlyError } from "../../../lib/friendlyError";
import { toast } from "sonner";

const PAGE_SIZE = 50;

/**
 * Paginação real (server-side) só pro modo Lista de Tarefas
 * (`src/pages/operative/Tarefas.tsx`, `TasksListMode`). O modo Kanban
 * continua usando `filteredTasks` de `useTarefas.ts` (array completo do
 * DataContext) porque precisa mostrar todas as colunas/status ao mesmo
 * tempo — pagina por offset não faz sentido pra uma visão agrupada.
 *
 * Busca por título/descrição no servidor (não inclui mais o nome do lead
 * relacionado na busca — isso exigiria um join, fora do escopo desta
 * passagem; o modo Kanban, que continua sem paginação, ainda busca por lead).
 */
export function useTarefasList(params: {
  searchQuery: string; selectedPriorities: string[]; deadlineFilter: string; active: boolean;
  statusFilter?: string; assigneeFilter?: string; clienteLeadIds?: string[]; clienteFilter?: string;
  departamentoFilter?: string; escopoFilter?: string;
}) {
  const { activeTenantId: tenantId, activeFilialId } = useAuth();
  const { searchQuery, selectedPriorities, deadlineFilter, active, statusFilter = "", assigneeFilter = "", clienteLeadIds = [], clienteFilter = "", departamentoFilter = "", escopoFilter = "" } = params;
  const filtersKey = `${statusFilter}|${assigneeFilter}|${clienteFilter}|${departamentoFilter}|${escopoFilter}`;

  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<Task[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => { setPage(0); }, [searchQuery, selectedPriorities.join(","), deadlineFilter, filtersKey]);

  const requestIdRef = useRef(0);

  const fetchPage = async () => {
    if (!supabase || !tenantId || !active) return;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      let query = supabase.from("tasks").select("*", { count: "exact" }).eq("tenant_id", tenantId);
      if (activeFilialId) query = query.or(`filial_id.is.null,filial_id.eq.${activeFilialId}`);
      if (searchQuery.trim()) {
        const q = limpaBusca(searchQuery);
        query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`);
      }
      if (selectedPriorities.length > 0) query = query.in("priority", selectedPriorities);
      if (deadlineFilter) query = query.lte("due_date", `${deadlineFilter}T23:59:59`);
      if (statusFilter) query = query.eq("status", statusFilter);
      if (assigneeFilter) query = assigneeFilter === "__none__" ? query.is("assigned_to", null) : query.eq("assigned_to", assigneeFilter);
      if (departamentoFilter) {
        query = departamentoFilter === "__none__" ? query.is("departamento", null) : query.ilike("departamento", departamentoFilter.replace(/[%_,]/g, ""));
      }
      if (escopoFilter === "cliente") query = query.not("lead_id", "is", null);
      if (escopoFilter === "interna") query = query.is("lead_id", null);
      if (clienteFilter) {
        // cliente sem lead correspondente = nenhuma linha (id impossível evita .in([]) inválido)
        query = query.in("lead_id", clienteLeadIds.length > 0 ? clienteLeadIds : ["00000000-0000-0000-0000-000000000000"]);
      }

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await query.order("created_at", { ascending: false }).range(from, to);

      if (requestId !== requestIdRef.current) return;
      if (error) {
        // Mantém a lista anterior (não finge "nenhum resultado") e avisa o usuário.
        toast.error(friendlyError(error));
      } else if (data) {
        setRows(data as Task[]);
        setTotal(count ?? 0);
      }
    } catch (err) {
      if (requestId === requestIdRef.current) toast.error(friendlyError(err));
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    fetchPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, activeFilialId, active, page, searchQuery, selectedPriorities.join(","), deadlineFilter, filtersKey]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return {
    tasks: rows,
    total,
    page,
    setPage,
    totalPages,
    pageSize: PAGE_SIZE,
    loading,
    refetch: fetchPage,
  };
}
