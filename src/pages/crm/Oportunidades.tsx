import { useState, useMemo, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  DollarSign, Plus, Users, Filter, TrendingUp,
  Columns3, Calendar, CheckCircle2, Clock, AlertCircle, ArrowUpRight
} from "lucide-react";
import { Pagination } from "../../components/ui/Pagination";
import { Link } from "react-router-dom";
import { useData } from "../../contexts/DataContext";
import { useLocalization } from "../../contexts/LocalizationContext";
import { NewLeadModal } from "../../components/ui/modals/crm/NewLeadModal";
import { LeadDetailsModal } from "../../components/ui/LeadDetailsModal";
import { isLeadOpen } from "../../lib/leadStatus";
import { normalizeText } from "../../lib/utils";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";

const PAGE_SIZE = 50;

export default function Oportunidades() {
  const { leads } = useData();
  const { formatCurrency } = useLocalization();
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("Todos");
  const [sellerFilter, setSellerFilter] = useState("");
  const [tempFilter, setTempFilter] = useState("");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const oportunidades = useMemo(() => {
    return (leads as any[]).map(l => {
      const valNum = parseFloat(String(l.value || "").replace(/[^\d,]/g, "").replace(",", ".")) || 0;
      return {
        ...l,
        numericValue: valNum,
      };
    });
  }, [leads]);

  const filtered = useMemo(() => {
    const q = normalizeText(search);
    return oportunidades.filter(op => {
      const matchSearch =
        normalizeText(op.name).includes(q) ||
        normalizeText(op.company).includes(q) ||
        normalizeText(op.seller).includes(q) ||
        normalizeText(op.nicho).includes(q);
      const matchStage = stageFilter === "Todos" || op.status === stageFilter;
      const matchSeller = !sellerFilter || op.seller === sellerFilter;
      const matchTemp = !tempFilter || (op.temperature || "normal") === tempFilter;
      return matchSearch && matchStage && matchSeller && matchTemp;
    });
  }, [oportunidades, search, stageFilter, sellerFilter, tempFilter]);

  const stagesList = useMemo(() => Array.from(new Set(oportunidades.map(o => o.status).filter(Boolean))).sort() as string[], [oportunidades]);
  const sellersList = useMemo(() => Array.from(new Set(oportunidades.map(o => o.seller).filter(Boolean))).sort() as string[], [oportunidades]);
  const activeCount = (search ? 1 : 0) + (stageFilter !== "Todos" ? 1 : 0) + (sellerFilter ? 1 : 0) + (tempFilter ? 1 : 0);
  const clearFilters = () => { setSearch(""); setStageFilter("Todos"); setSellerFilter(""); setTempFilter(""); };

  // Renderizava TODAS as oportunidades filtradas de uma vez — pagina só a
  // exibição (os dados já estão em memória).
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [search, stageFilter, sellerFilter, tempFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const totalPipeline = useMemo(() => {
    return filtered.reduce((acc, curr) => acc + curr.numericValue, 0);
  }, [filtered]);

  const closedWon = useMemo(() => {
    return filtered.filter(op => op.status === "Fechado");
  }, [filtered]);

  const totalWon = useMemo(() => {
    return closedWon.reduce((acc, curr) => acc + curr.numericValue, 0);
  }, [closedWon]);

  return (
    <PageContainer
      title="Oportunidades Comerciais"
      description="Visão analítica de negociações, valores em jogo e projeções de fechamento."
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/app/crm/pipeline"
            className="h-9 px-3.5 text-xs font-bold gap-1.5 inline-flex items-center rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)] text-[var(--color-text-primary)] transition-all"
          >
            <Columns3 className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Ver no Pipeline Kanban
          </Link>
          <Button onClick={() => setShowNewModal(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
            <Plus className="w-3.5 h-3.5" /> Nova Oportunidade
          </Button>
        </div>
      }
    >
      <KpiFilterCard className="mb-4"
        id="crmOportunidades"
        activeCount={activeCount}
        onClear={clearFilters}
        kpis={[
          { label: "Pipeline Total", value: formatCurrency(totalPipeline), icon: DollarSign, tone: "primary" },
          { label: "Ganhos / Fechados", value: formatCurrency(totalWon), icon: TrendingUp, tone: "success" },
          { label: "Oportunidades Abertas", value: filtered.filter(o => isLeadOpen(o.status)).length, icon: Clock, tone: "warning" },
          { label: "Taxa de Sucesso", value: filtered.length > 0 ? `${Math.round((closedWon.length / filtered.length) * 100)}%` : "0%", icon: CheckCircle2, tone: "accent" },
        ]}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por oportunidade, cliente, responsável ou nicho..." />
          <FilterSelect icon={Filter} value={stageFilter} onChange={setStageFilter} options={stagesList} allLabel="Todos os status" allValue="Todos" />
          <FilterSelect icon={Users} value={sellerFilter} onChange={setSellerFilter} options={sellersList} allLabel="Todos os responsáveis" />
          <FilterChips value={tempFilter} onChange={setTempFilter} allLabel="Todas" options={[{ value: "quente", label: "Quente" }, { value: "morno", label: "Morno" }, { value: "frio", label: "Frio" }]} />
        </FilterBar>
      </KpiFilterCard>

      {/* Opportunities Table */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-2xl overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]/60 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                <th className="px-5 py-3">Oportunidade / Cliente</th>
                <th className="px-4 py-3">Valor Estimado</th>
                <th className="px-4 py-3">Temperatura / Score</th>
                <th className="px-4 py-3">Responsável</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {pageItems.map(op => (
                <tr key={op.id} className="hover:bg-[var(--color-surface-sunken)]/40 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="font-bold text-[var(--color-text-primary)]">{op.name}</div>
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">{op.company || "Pessoa Física / Direta"}</div>
                  </td>
                  <td className="px-4 py-3.5 font-bold text-[var(--color-text-primary)]">
                    {op.numericValue > 0 ? (
                      formatCurrency(op.numericValue)
                    ) : (
                      <span className="text-[var(--color-text-muted)]">A definir</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      op.temperature === 'quente' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                      op.temperature === 'morno' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                      'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                    }`}>
                      {op.temperature || "Normal"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-[var(--color-text-muted)]">
                    {op.seller || "Não atribuído"}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      op.status === 'Fechado' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                      op.status === 'Perdido' ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20' :
                      'bg-cyan-500/10 text-cyan-500 border border-cyan-500/20'
                    }`}>
                      {op.status || "Em Andamento"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    <button
                      onClick={() => setSelectedLead(op)}
                      className="px-3 py-1 rounded-lg bg-[var(--color-surface-sunken)] hover:bg-[var(--color-primary-blue)] hover:text-white border border-[var(--color-border-default)] text-xs font-bold transition-all"
                    >
                      Detalhes
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-[var(--color-text-muted)]">
                    <DollarSign className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    <p className="font-bold">Nenhuma oportunidade encontrada.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="oportunidade" />

      <NewLeadModal isOpen={showNewModal} onClose={() => setShowNewModal(false)} />
      <LeadDetailsModal isOpen={!!selectedLead} onClose={() => setSelectedLead(null)} lead={selectedLead} />
    </PageContainer>
  );
}
