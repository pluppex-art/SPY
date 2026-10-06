import { useState, useMemo } from "react";
import { PageContainer } from "../../components/PageContainer";
import { Button } from "../../components/ui/button";
import {
  Calendar, Clock, Video, MapPin, Users, Plus,
  CheckCircle2, ArrowRight, Flag
} from "lucide-react";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";
import { Link } from "react-router-dom";
import { useData } from "../../contexts/DataContext";
import { NovaReuniaoModal } from "../../components/ui/modals/reunioes/NovaReuniaoModal";

export default function Eventos() {
  const { reunioes } = useData();
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState("Todos");
  const [statusFilter, setStatusFilter] = useState("");
  const [showModal, setShowModal] = useState(false);

  const eventos = useMemo(() => {
    return (reunioes as any[]).map(r => ({
      id: r.id,
      titulo: r.titulo,
      data: r.data_agendada,
      duracao: r.duracao_minutos || 45,
      formato: r.formato || (r.local_endereco ? "presencial" : "virtual"),
      local: r.local_endereco,
      lead: r.leads?.nome || r.leads?.name || "Cliente Agendado",
      closer: r.closer_nome || "Responsável",
      status: r.status,
    }));
  }, [reunioes]);

  const statusOptions = useMemo(() => Array.from(new Set(eventos.map(e => e.status).filter(Boolean))).sort() as string[], [eventos]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return eventos.filter(e => {
      const matchSearch =
        e.titulo.toLowerCase().includes(q) ||
        e.lead.toLowerCase().includes(q) ||
        e.closer.toLowerCase().includes(q);
      const matchTipo =
        tipoFilter === "Todos" ||
        (tipoFilter === "Presencial" && e.formato === "presencial") ||
        (tipoFilter === "Virtual" && e.formato !== "presencial");
      const matchStatus = !statusFilter || e.status === statusFilter;
      return matchSearch && matchTipo && matchStatus;
    });
  }, [eventos, search, tipoFilter, statusFilter]);

  const activeCount = (search.trim() ? 1 : 0) + (tipoFilter !== "Todos" ? 1 : 0) + (statusFilter ? 1 : 0);

  return (
    <PageContainer
      title="Eventos & Compromissos"
      description="Visão consolidada de reuniões, visitas a imóveis, vistorias solares e test-drives agendados."
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/app/agenda/calendario"
            className="h-9 px-3.5 text-xs font-bold gap-1.5 inline-flex items-center rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)] text-[var(--color-text-primary)] transition-all"
          >
            <Calendar className="w-3.5 h-3.5 text-[var(--color-primary-blue)]" /> Ver no Calendário
          </Link>
          <Button onClick={() => setShowModal(true)} className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs">
            <Plus className="w-3.5 h-3.5" /> Novo Evento
          </Button>
        </div>
      }
    >
      <KpiFilterCard
        id="agendaEventos"
        className="mb-6"
        kpis={[
          { label: "Compromissos", value: filtered.length, icon: Calendar, tone: "primary" },
          { label: "Reuniões Virtuais", value: filtered.filter(e => e.formato !== "presencial").length, icon: Video, tone: "accent" },
          { label: "Visitas Presenciais", value: filtered.filter(e => e.formato === "presencial").length, icon: MapPin, tone: "warning" },
          { label: "Realizados", value: filtered.filter(e => e.status === "realizada").length, icon: CheckCircle2, tone: "success" },
        ]}
        activeCount={activeCount}
        onClear={() => { setSearch(""); setTipoFilter("Todos"); setStatusFilter(""); }}
      >
        <FilterBar>
          <FilterSearch value={search} onChange={setSearch} placeholder="Buscar por título, lead ou responsável..." />
          <FilterChips value={tipoFilter === "Todos" ? "" : tipoFilter} onChange={v => setTipoFilter(v || "Todos")} options={["Presencial", "Virtual"]} />
          <FilterSelect icon={Flag} value={statusFilter} onChange={setStatusFilter} options={statusOptions} allLabel="Todos os status" />
        </FilterBar>
      </KpiFilterCard>

      {/* Events List */}
      <div className="space-y-3">
        {filtered.map(ev => (
          <div
            key={ev.id}
            className="p-4 rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                ev.formato === "presencial"
                  ? "bg-amber-500/10 text-amber-500 border border-amber-500/20"
                  : "bg-purple-500/10 text-purple-500 border border-purple-500/20"
              }`}>
                {ev.formato === "presencial" ? <MapPin className="w-5 h-5" /> : <Video className="w-5 h-5" />}
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-[var(--color-text-primary)]">{ev.titulo}</h4>
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">
                    {ev.formato === "presencial" ? "Presencial" : "Virtual"}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                  Lead: <strong className="text-[var(--color-text-primary)]">{ev.lead}</strong> • Responsável: {ev.closer}
                  {ev.local && ` • Local: ${ev.local}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 self-end sm:self-center">
              <span className="text-xs font-mono font-bold text-[var(--color-primary-blue)]">
                {new Date(ev.data).toLocaleDateString("pt-BR")} às {new Date(ev.data).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </span>
              <Link
                to={`/app/reunioes/${ev.id}`}
                className="px-3 py-1.5 rounded-xl bg-[var(--color-surface-sunken)] hover:bg-[var(--color-primary-blue)] hover:text-white border border-[var(--color-border-default)] text-xs font-bold transition-all flex items-center gap-1"
              >
                Acessar <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="py-16 text-center text-[var(--color-text-muted)]">
            <Calendar className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="font-bold">Nenhum evento agendado.</p>
          </div>
        )}
      </div>

      <NovaReuniaoModal isOpen={showModal} onClose={() => setShowModal(false)} />
    </PageContainer>
  );
}
