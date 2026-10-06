import { useState, useMemo, useEffect } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Clock, AlertCircle, CheckCircle2, MessageSquare, PhoneCall,
  Calendar, User, ArrowRight
} from "lucide-react";
import { Pagination } from "../../components/ui/Pagination";
import { useData } from "../../contexts/DataContext";
import { toast } from "sonner";
import { LeadDetailsModal } from "../../components/ui/LeadDetailsModal";
import { isLeadOpen } from "../../lib/leadStatus";
import { normalizeText } from "../../lib/utils";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";

const PAGE_SIZE = 50;

export default function FollowUps() {
  const { leads } = useData();
  const [search, setSearch] = useState("");
  const [sellerFilter, setSellerFilter] = useState("");
  const [urgenciaFilter, setUrgenciaFilter] = useState("");
  const [selectedLead, setSelectedLead] = useState<any>(null);

  // Computes leads needing follow-up (e.g. status open, sorted by last interaction or temperature)
  const followUpList = useMemo(() => {
    return (leads as any[])
      .filter(l => isLeadOpen(l.status))
      .map(l => {
        // Calculate days since last update or creation
        const lastDate = new Date(l.updated_at || l.created_at || new Date());
        const diffDays = Math.floor((new Date().getTime() - lastDate.getTime()) / (1000 * 3600 * 24));
        return {
          ...l,
          daysInactive: diffDays,
          isUrgent: diffDays >= 3 || l.temperature === "quente",
        };
      })
      .sort((a, b) => b.daysInactive - a.daysInactive);
  }, [leads]);

  const filtered = useMemo(() => {
    const q = normalizeText(search);
    return followUpList.filter(l =>
      (normalizeText(l.name).includes(q) ||
      normalizeText(l.company).includes(q) ||
      normalizeText(l.seller).includes(q)) &&
      (!sellerFilter || l.seller === sellerFilter) &&
      (!urgenciaFilter || (urgenciaFilter === "urgente" ? l.isUrgent : !l.isUrgent))
    );
  }, [followUpList, search, sellerFilter, urgenciaFilter]);

  const urgentCount = useMemo(() => filtered.filter(l => l.isUrgent).length, [filtered]);
  const sellersList = useMemo(() => Array.from(new Set(followUpList.map(l => l.seller).filter(Boolean))).sort() as string[], [followUpList]);
  const activeCount = (search ? 1 : 0) + (sellerFilter ? 1 : 0) + (urgenciaFilter ? 1 : 0);
  const clearFilters = () => { setSearch(""); setSellerFilter(""); setUrgenciaFilter(""); };

  // Renderizava TODOS os leads em follow-up de uma vez — pagina só a
  // exibição (os dados já estão em memória).
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [search, sellerFilter, urgenciaFilter]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  return (
    <PageContainer
      title="Central de Follow-ups"
      description="Identifique oportunidades paradas, agende retomadas e garanta que nenhum lead fique sem resposta."
    >
      <KpiFilterCard className="mb-4"
        id="crmFollowUps"
        activeCount={activeCount}
        onClear={clearFilters}
        kpis={[
          { label: "Total em Follow-up", value: filtered.length, icon: Clock, tone: "primary" },
          { label: "Atenção / Urgentes", value: urgentCount, icon: AlertCircle, tone: "danger" },
          { label: "Parados > 3 Dias", value: filtered.filter(l => l.daysInactive >= 3).length, icon: Calendar, tone: "warning" },
          { label: "Leads Quentes", value: filtered.filter(l => l.temperature === "quente").length, icon: CheckCircle2, tone: "success" },
        ]}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por lead, empresa ou vendedor..." />
          <FilterSelect icon={User} value={sellerFilter} onChange={setSellerFilter} options={sellersList} allLabel="Todos os vendedores" />
          <FilterChips value={urgenciaFilter} onChange={setUrgenciaFilter} allLabel="Todos" options={[{ value: "urgente", label: "Urgentes" }, { value: "normal", label: "Normais" }]} />
        </FilterBar>
      </KpiFilterCard>

      {/* Follow-up Cards */}
      <div className="space-y-3">
        {pageItems.map(item => (
          <div
            key={item.id}
            className={`p-4 rounded-2xl bg-[var(--color-surface)] border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs ${
              item.isUrgent
                ? "border-rose-500/30 hover:border-rose-500/50"
                : "border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/40"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                item.isUrgent
                  ? "bg-rose-500/10 text-rose-500 border border-rose-500/20"
                  : "bg-blue-500/10 text-blue-500 border border-blue-500/20"
              }`}>
                {item.daysInactive}d
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-[var(--color-text-primary)] truncate">{item.name}</h4>
                  {item.temperature === "quente" && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-rose-500/10 text-rose-500 border border-rose-500/20">
                      Quente
                    </span>
                  )}
                  {item.isUrgent && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/10 text-amber-500 border border-amber-500/20">
                      Requer Ação
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 truncate">
                  {item.company || "Contato Direto"} • Responsável: <strong className="text-[var(--color-text-primary)]">{item.seller || "Não atribuído"}</strong>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              {item.phone && (
                <a
                  href={`https://wa.me/55${item.phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/25 text-xs font-bold flex items-center gap-1.5 transition-all"
                >
                  <MessageSquare className="w-3.5 h-3.5" /> WhatsApp
                </a>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedLead(item)}
                className="h-8 text-xs font-bold gap-1 rounded-xl"
              >
                Abrir Lead <ArrowRight className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="py-16 text-center text-[var(--color-text-muted)]">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-60" />
            <p className="font-bold text-[var(--color-text-primary)]">Tudo em dia!</p>
            <p className="text-xs mt-0.5">Nenhum follow-up pendente para os filtros selecionados.</p>
          </div>
        )}
      </div>

      <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="follow-up" />

      <LeadDetailsModal isOpen={!!selectedLead} onClose={() => setSelectedLead(null)} lead={selectedLead} />
    </PageContainer>
  );
}
