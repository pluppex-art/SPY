import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../../contexts/DataContext";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Sparkline } from "../../components/ui/sparkline";
import { Pagination } from "../../components/ui/Pagination";
import { NovaReuniaoModal, TIPO_COMPROMISSO_OPTIONS } from "../../components/ui/modals/reunioes/NovaReuniaoModal";
import { ConfirmModal } from "../../components/ui/modals/shared/ConfirmModal";
import {
  Video, Calendar, Clock, User, ExternalLink, Copy, LayoutList, CalendarDays,
  ChevronLeft, ChevronRight, CheckCircle2, PlayCircle, Zap, Plus, Trash2, Search,
  Filter, X, ArrowUpRight, ArrowDownRight, AlertTriangle, Pencil,
} from "lucide-react";
import { cn, normalizeText } from "../../lib/utils";
import { toast } from "sonner";
import { Reuniao } from "../../contexts/DataContextTypes";

const PAGE_SIZE = 30;

type ViewMode = "lista" | "calendario";
const STATUS_TABS = ["Todas", "Agendada", "Em Andamento", "Concluída", "Cancelada"] as const;
type StatusTab = typeof STATUS_TABS[number];
const TAB_LABEL: Record<StatusTab, string> = {
  Todas: "Todos", Agendada: "Agendadas", "Em Andamento": "Em Andamento", Concluída: "Concluídas", Cancelada: "Canceladas",
};

type Periodo = "todos" | "mes" | "mes_anterior" | "proximos7" | "ultimos30";
const PERIODO_OPTIONS: { id: Periodo; label: string }[] = [
  { id: "todos", label: "Todo o período" },
  { id: "mes", label: "Este mês" },
  { id: "mes_anterior", label: "Mês anterior" },
  { id: "proximos7", label: "Próximos 7 dias" },
  { id: "ultimos30", label: "Últimos 30 dias" },
];

const STATUS_BADGE: Record<string, string> = {
  Agendada:       "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "Em Andamento": "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Concluída:      "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  Cancelada:      "bg-rose-500/10 text-rose-600 dark:text-rose-400",
};
const STATUS_DOT: Record<string, string> = {
  Agendada: "bg-blue-500", "Em Andamento": "bg-orange-500", Concluída: "bg-emerald-500", Cancelada: "bg-rose-500",
};

const MONTH_NAMES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const DOW = ["D","S","T","Q","Q","S","S"];
const DOW_LONG = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

const selectCls =
  "h-10 px-3 rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40";

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return iso; }
}
function formatTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; }
}
const initials = (name: string) =>
  (name || "R").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase() || "R";

function sourceLabel(r: Reuniao): string {
  if (r.googleEventId) return "Google Calendar";
  const l = r.meetLink || "";
  if (l.startsWith("Presencial")) return "Presencial";
  if (l.includes("meet.google.com")) return "Google Meet";
  if (l.includes("meet.jit.si")) return "Sala S.P.Y.";
  return l ? "Link externo" : "Sem link";
}
const isHttps = (l?: string) => !!l && /^https:\/\//i.test(l);

function relativeDays(iso: string): string {
  const d = new Date(iso); d.setHours(0, 0, 0, 0);
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  return `Em ${diff} dias`;
}

export default function ReunioesList() {
  const { reunioes, deleteReuniao } = useData();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewMode>("lista");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<StatusTab>("Todas");
  const [closer, setCloser] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("todos");
  const [showMais, setShowMais] = useState(false);
  const [categoria, setCategoria] = useState("");
  const [origem, setOrigem] = useState<"" | "google" | "crm">("");
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showNovaReuniao, setShowNovaReuniao] = useState(false);
  const [reuniaoToDelete, setReuniaoToDelete] = useState<string | null>(null);
  const [reuniaoToEdit, setReuniaoToEdit] = useState<Reuniao | null>(null);

  const all = reunioes as Reuniao[];

  const closerOptions = useMemo(
    () => Array.from(new Set(all.map((r) => r.closerName).filter(Boolean))).sort() as string[],
    [all],
  );

  // Tudo menos a aba de status e o dia do mini-calendário — base das
  // contagens das abas.
  const baseFiltered = useMemo(() => {
    const q = normalizeText(search);
    const now = new Date();
    const inPeriodo = (iso: string) => {
      if (periodo === "todos") return true;
      const d = new Date(iso);
      if (periodo === "mes") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      if (periodo === "mes_anterior") {
        const p = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return d.getFullYear() === p.getFullYear() && d.getMonth() === p.getMonth();
      }
      const dayMs = 86400000;
      if (periodo === "proximos7") return d.getTime() >= now.getTime() - dayMs && d.getTime() <= now.getTime() + 7 * dayMs;
      return d.getTime() >= now.getTime() - 30 * dayMs && d.getTime() <= now.getTime();
    };
    return all.filter((r) => {
      if (closer && r.closerName !== closer) return false;
      if (categoria && (r.tipo || "Outros") !== categoria) return false;
      if (origem === "google" && !r.googleEventId) return false;
      if (origem === "crm" && r.googleEventId) return false;
      if (!inPeriodo(r.scheduledAt)) return false;
      if (!q) return true;
      return (
        normalizeText(r.leadName).includes(q) ||
        normalizeText(r.companyName).includes(q) ||
        normalizeText(r.closerName).includes(q) ||
        normalizeText(r.pauta).includes(q)
      );
    });
  }, [all, search, closer, categoria, origem, periodo]);

  const tabCounts = useMemo(() => {
    const c: Record<StatusTab, number> = { Todas: baseFiltered.length, Agendada: 0, "Em Andamento": 0, Concluída: 0, Cancelada: 0 };
    for (const r of baseFiltered) if (r.status in c) c[r.status as StatusTab]++;
    return c;
  }, [baseFiltered]);

  const filtered = useMemo(() => baseFiltered.filter((r) => {
    if (tab !== "Todas" && r.status !== tab) return false;
    if (selectedDay !== null && view === "lista") {
      const d = new Date(r.scheduledAt);
      if (d.getFullYear() !== calYear || d.getMonth() !== calMonth || d.getDate() !== selectedDay) return false;
    }
    return true;
  }), [baseFiltered, tab, selectedDay, view, calYear, calMonth]);

  // Renderizar milhares de cards trava o navegador — pagina só a renderização.
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [tab, search, closer, periodo, categoria, origem, selectedDay]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  // Tendência real dos últimos 6 meses por data da reunião (scheduledAt é
  // imutável); o status considerado é o atual — convenção da casa.
  const kpis = useMemo(() => {
    const nowD = new Date();
    const buckets = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(nowD.getFullYear(), nowD.getMonth() - (5 - i), 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
    const build = (pred: (r: Reuniao) => boolean) => {
      const series = buckets.map((b) => all.filter((r) => {
        const d = new Date(r.scheduledAt);
        return pred(r) && d.getFullYear() === b.y && d.getMonth() === b.m;
      }).length);
      const prev = series[4], cur = series[5];
      return {
        total: all.filter(pred).length,
        series,
        deltaPct: prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null as number | null,
      };
    };
    return {
      total: build(() => true),
      agendadas: build((r) => r.status === "Agendada"),
      andamento: build((r) => r.status === "Em Andamento"),
      concluidas: build((r) => r.status === "Concluída"),
    };
  }, [all]);

  const proximas = useMemo(() => {
    const now = new Date();
    return all
      .filter((r) => r.status === "Agendada" && new Date(r.scheduledAt) > now)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  }, [all]);

  const atrasadas = useMemo(() => {
    const now = new Date();
    return all.filter((r) => r.status === "Agendada" && new Date(r.scheduledAt) < now).length;
  }, [all]);

  // Calendário
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const calCells = Array.from({ length: firstDayOfWeek + daysInMonth }, (_, i) => (i < firstDayOfWeek ? null : i - firstDayOfWeek + 1));
  while (calCells.length % 7 !== 0) calCells.push(null);

  const reunioesByDay = useMemo(() => {
    const map: Record<number, Reuniao[]> = {};
    baseFiltered.forEach((r) => {
      const d = new Date(r.scheduledAt);
      if (d.getFullYear() === calYear && d.getMonth() === calMonth) (map[d.getDate()] ||= []).push(r);
    });
    return map;
  }, [baseFiltered, calYear, calMonth]);
  const dayReunions = selectedDay ? (reunioesByDay[selectedDay] ?? []) : [];

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear((y) => y - 1); setCalMonth(11); } else setCalMonth((m) => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear((y) => y + 1); setCalMonth(0); } else setCalMonth((m) => m + 1);
    setSelectedDay(null);
  };
  const today = new Date();

  const activeFilters = (search.trim() ? 1 : 0) + (closer ? 1 : 0) + (periodo !== "todos" ? 1 : 0) + (categoria ? 1 : 0) + (origem ? 1 : 0) + (tab !== "Todas" ? 1 : 0) + (selectedDay !== null ? 1 : 0);
  const clearFilters = () => {
    setSearch(""); setCloser(""); setPeriodo("todos"); setCategoria(""); setOrigem(""); setTab("Todas"); setSelectedDay(null);
  };

  const kpiCards = [
    { label: "Total", data: kpis.total, icon: Calendar, color: "#7c3aed" },
    { label: "Agendadas", data: kpis.agendadas, icon: CheckCircle2, color: "#10b981" },
    { label: "Em andamento", data: kpis.andamento, icon: PlayCircle, color: "#f97316" },
    { label: "Concluídas", data: kpis.concluidas, icon: CheckCircle2, color: "#e11d48" },
  ];

  const openRoom = (id: string) => navigate(`/app/reunioes/${id}`);

  const renderCard = (r: Reuniao) => (
    <Card key={r.id} className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/30 transition-all space-y-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-blue)]/10 flex items-center justify-center shrink-0 text-sm font-black text-[var(--color-primary-blue)] select-none">
            {initials(r.leadName || r.companyName)}
          </div>
          <div className="min-w-0">
            <p className="font-black text-[var(--color-text-primary)] text-sm truncate">{r.companyName || r.leadName}</p>
            {r.leadName && r.companyName !== r.leadName && (
              <p className="text-[11px] text-[var(--color-text-muted)] truncate">{r.leadName}</p>
            )}
          </div>
        </div>
        <span className={cn("text-[10px] font-black px-2.5 py-0.5 rounded-full shrink-0", STATUS_BADGE[r.status] ?? STATUS_BADGE.Agendada)}>
          {r.status === "Agendada" ? "Agendada" : r.status}
        </span>
      </div>

      <div className="space-y-1.5 text-xs text-[var(--color-text-muted)]">
        <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 shrink-0" />{formatDate(r.scheduledAt)}</div>
        <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 shrink-0" />{formatTime(r.scheduledAt)} ({r.durationMinutes} minutos)</div>
        <div className="flex items-center gap-2"><Video className="w-3.5 h-3.5 shrink-0" />{sourceLabel(r)}</div>
        <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 shrink-0" />{r.closerName || "Não definido"}</div>
      </div>

      {r.pauta && (
        <p className="text-[11px] text-[var(--color-text-faint)] line-clamp-2 border-t border-[var(--color-border-subtle)] pt-2.5">{r.pauta}</p>
      )}

      <div className="flex items-center gap-2">
        <Button onClick={() => openRoom(r.id)} className="flex-1 h-9 text-xs font-black gap-1.5">
          <Video className="w-3.5 h-3.5" /> Entrar
        </Button>
        {r.meetLink && (
          <button
            onClick={() => { navigator.clipboard.writeText(r.meetLink); toast.success("Link copiado!"); }}
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] transition-all cursor-pointer bg-transparent"
            title="Copiar link"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        )}
        {isHttps(r.meetLink) && (
          <a
            href={r.meetLink}
            target="_blank"
            rel="noopener noreferrer"
            className="h-9 w-9 flex items-center justify-center rounded-xl border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] transition-all"
            title="Abrir link"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        <button
          onClick={() => setReuniaoToEdit(r)}
          className="h-9 w-9 flex items-center justify-center rounded-xl border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] transition-all cursor-pointer bg-transparent"
          title="Editar reunião"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => setReuniaoToDelete(r.id)}
          className="h-9 w-9 flex items-center justify-center rounded-xl border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all cursor-pointer bg-transparent"
          title="Excluir reunião"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </Card>
  );

  return (
    <PageContainer
      title="Reuniões"
      description="Gerencie, acompanhe e registre todas as suas reuniões comerciais."
      actions={
        <Button onClick={() => setShowNovaReuniao(true)} className="gap-2 font-bold h-9 px-4 shadow-sm">
          <Plus className="w-4 h-4" /> Nova Reunião
        </Button>
      }
    >
      <div className="space-y-5 pb-10">
        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map(({ label, data, icon: Icon, color }) => (
            <Card key={label} className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${color}1a`, color }}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">{label}</p>
                  <p className="text-2xl font-black text-[var(--color-text-primary)] font-mono leading-tight">{data.total}</p>
                </div>
                <div className="w-20 h-8 shrink-0" style={{ color }}>
                  <Sparkline data={data.series} className="w-full h-full" />
                </div>
              </div>
              <p
                className={cn(
                  "text-[11px] font-bold mt-2 flex items-center gap-1",
                  data.deltaPct === null ? "text-[var(--color-text-faint)]" : data.deltaPct >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-500"
                )}
                title="Reuniões marcadas para este mês comparadas às do mês anterior"
              >
                {data.deltaPct === null ? "—" : data.deltaPct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {data.deltaPct === null ? "sem base no mês anterior" : `${data.deltaPct >= 0 ? "+" : ""}${data.deltaPct}% vs. mês anterior`}
              </p>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <Card className="p-3 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-3">
          <div className="flex flex-col lg:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por lead, empresa, responsável ou assunto..."
                className={cn(selectCls, "w-full pl-9 font-normal")}
              />
            </div>
            <select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} className={selectCls}>
              {PERIODO_OPTIONS.map((p) => <option key={p.id} value={p.id}>Período: {p.label}</option>)}
            </select>
            <select value={closer} onChange={(e) => setCloser(e.target.value)} className={selectCls}>
              <option value="">Todos os responsáveis</option>
              {closerOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={tab} onChange={(e) => setTab(e.target.value as StatusTab)} className={selectCls}>
              {STATUS_TABS.map((s) => <option key={s} value={s}>{s === "Todas" ? "Todos os status" : s}</option>)}
            </select>
            <Button
              variant="outline"
              onClick={() => setShowMais((v) => !v)}
              className={cn("h-10 gap-2 text-xs font-bold", (showMais || categoria || origem) && "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]")}
            >
              <Filter className="w-4 h-4" /> Mais filtros
            </Button>
          </div>
          {showMais && (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--color-border-subtle)]">
              <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className={selectCls}>
                <option value="">Todas as categorias</option>
                {TIPO_COMPROMISSO_OPTIONS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <select value={origem} onChange={(e) => setOrigem(e.target.value as "" | "google" | "crm")} className={selectCls}>
                <option value="">Qualquer origem</option>
                <option value="google">Importadas do Google Calendar</option>
                <option value="crm">Criadas no CRM</option>
              </select>
            </div>
          )}
        </Card>

        <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-6 items-start">
          {/* Conteúdo principal */}
          <div className="space-y-4 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {STATUS_TABS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTab(s)}
                    className={cn(
                      "px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer",
                      tab === s
                        ? "bg-[var(--color-primary-blue)] text-white border-transparent shadow-sm"
                        : "bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] border-[var(--color-border-default)] hover:text-[var(--color-text-primary)]"
                    )}
                  >
                    {TAB_LABEL[s]} ({tabCounts[s]})
                  </button>
                ))}
                {activeFilters > 0 && (
                  <button type="button" onClick={clearFilters} className="px-2.5 py-2 text-xs font-bold text-[var(--color-text-muted)] hover:text-rose-500 bg-transparent border-none cursor-pointer flex items-center gap-1">
                    <X className="w-3 h-3" /> Limpar filtros
                  </button>
                )}
              </div>
              <div className="flex items-center bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl p-1 gap-0.5">
                {([
                  { id: "lista" as const, label: "Lista", icon: LayoutList },
                  { id: "calendario" as const, label: "Calendário", icon: CalendarDays },
                ]).map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setView(id)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer border-none",
                      view === id ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]" : "bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>
            </div>

            {selectedDay !== null && view === "lista" && (
              <p className="text-xs font-bold text-[var(--color-text-muted)]">
                Mostrando {selectedDay} de {MONTH_NAMES[calMonth]} de {calYear}
              </p>
            )}

            {view === "lista" && (
              <>
                {filtered.length === 0 ? (
                  <Card className="py-20 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
                    <div className="flex flex-col items-center justify-center text-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-[var(--color-surface-sunken)] flex items-center justify-center">
                        <Video className="w-7 h-7 text-[var(--color-text-faint)]" />
                      </div>
                      <p className="text-[var(--color-text-muted)] font-bold">Nenhuma reunião encontrada</p>
                      <p className="text-[var(--color-text-faint)] text-sm">Ajuste os filtros ou crie uma nova reunião.</p>
                    </div>
                  </Card>
                ) : (
                  <div className="grid md:grid-cols-2 2xl:grid-cols-3 gap-4">{pageItems.map(renderCard)}</div>
                )}
                <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="reunião" />
              </>
            )}

            {view === "calendario" && (
              <div className="space-y-5">
                <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <button onClick={prevMonth} className="p-2 rounded-xl text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)] cursor-pointer bg-transparent border-none"><ChevronLeft className="w-4 h-4" /></button>
                    <h3 className="text-sm font-black text-[var(--color-text-primary)] uppercase tracking-widest">{MONTH_NAMES[calMonth]} {calYear}</h3>
                    <button onClick={nextMonth} className="p-2 rounded-xl text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)] cursor-pointer bg-transparent border-none"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                  <div className="grid grid-cols-7 mb-2">
                    {DOW_LONG.map((d) => <div key={d} className="text-center text-[10px] font-black text-[var(--color-text-faint)] uppercase py-1">{d}</div>)}
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {calCells.map((day, idx) => {
                      if (!day) return <div key={idx} />;
                      const isToday = day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
                      const isSelected = day === selectedDay;
                      const dayMeetings = reunioesByDay[day] ?? [];
                      return (
                        <button
                          key={idx}
                          onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                          className={cn(
                            "flex flex-col items-center p-2 rounded-xl transition-all min-h-[56px] cursor-pointer border",
                            isSelected
                              ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/40"
                              : isToday
                              ? "bg-[var(--color-surface-sunken)] border-[var(--color-border-default)]"
                              : "bg-transparent border-transparent hover:bg-[var(--color-surface-sunken)]"
                          )}
                        >
                          <span className={cn("text-xs font-bold", isSelected ? "text-[var(--color-primary-blue)]" : "text-[var(--color-text-primary)]")}>{day}</span>
                          {dayMeetings.length > 0 && (
                            <div className="flex gap-0.5 mt-1.5 flex-wrap justify-center">
                              {dayMeetings.slice(0, 3).map((r, i) => <div key={i} className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[r.status] ?? "bg-slate-400")} />)}
                              {dayMeetings.length > 3 && <span className="text-[8px] text-[var(--color-text-faint)] font-bold">+{dayMeetings.length - 3}</span>}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </Card>

                {selectedDay && (
                  <div>
                    <h4 className="text-[11px] font-black text-[var(--color-text-muted)] uppercase tracking-widest mb-3">
                      {selectedDay} de {MONTH_NAMES[calMonth]} — {dayReunions.length} {dayReunions.length === 1 ? "reunião" : "reuniões"}
                    </h4>
                    {dayReunions.length === 0 ? (
                      <Card className="py-10 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]">
                        <p className="text-[var(--color-text-faint)] text-sm text-center">Nenhuma reunião neste dia.</p>
                      </Card>
                    ) : (
                      <div className="grid md:grid-cols-2 gap-4">{dayReunions.map(renderCard)}</div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Painel lateral */}
          <div className="space-y-5">
            <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-black text-[var(--color-text-primary)]">{MONTH_NAMES[calMonth]} {calYear}</span>
                <div className="flex items-center gap-0.5">
                  <button onClick={prevMonth} className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)] cursor-pointer bg-transparent border-none"><ChevronLeft className="w-4 h-4" /></button>
                  <button onClick={nextMonth} className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)] cursor-pointer bg-transparent border-none"><ChevronRight className="w-4 h-4" /></button>
                </div>
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
                {DOW.map((d, i) => <span key={i} className="text-[10px] font-bold text-[var(--color-text-faint)] py-1">{d}</span>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {calCells.map((day, idx) => {
                  if (!day) return <div key={idx} />;
                  const isToday = day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
                  const isSelected = day === selectedDay;
                  const dots = Array.from(new Set((reunioesByDay[day] ?? []).map((r) => r.status))).slice(0, 3);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                      className={cn(
                        "aspect-square rounded-lg text-xs flex flex-col items-center justify-center gap-0.5 cursor-pointer border-none transition-colors",
                        isSelected
                          ? "bg-[var(--color-primary-blue)] text-white font-bold"
                          : isToday
                          ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] font-bold"
                          : "bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)]"
                      )}
                    >
                      <span>{day}</span>
                      {dots.length > 0 && (
                        <span className="flex gap-0.5">{dots.map((s) => <span key={s} className={cn("w-1 h-1 rounded-full", STATUS_DOT[s] ?? "bg-slate-400")} />)}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </Card>

            <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-black text-[var(--color-text-primary)]">Próximas reuniões</h4>
                <button
                  type="button"
                  onClick={() => { setView("lista"); setTab("Agendada"); setSelectedDay(null); }}
                  className="text-xs font-bold text-[var(--color-primary-blue)] bg-transparent border-none cursor-pointer"
                >
                  Ver todas
                </button>
              </div>
              {proximas.length === 0 ? (
                <p className="text-xs text-[var(--color-text-faint)] py-3 text-center">Nenhuma reunião futura agendada.</p>
              ) : (
                <div className="space-y-2.5">
                  {proximas.slice(0, 4).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => openRoom(r.id)}
                      className="w-full flex items-center gap-3 text-left bg-transparent border-none cursor-pointer p-1 rounded-xl hover:bg-[var(--color-surface-sunken)] transition-colors"
                    >
                      <div className="w-9 h-9 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] text-xs font-black flex items-center justify-center shrink-0">
                        {initials(r.leadName || r.companyName)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-[var(--color-text-primary)] truncate">{r.leadName || r.companyName}</p>
                        <p className="text-[10px] text-[var(--color-text-muted)]">{formatDate(r.scheduledAt)} • {formatTime(r.scheduledAt)}</p>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
                        {relativeDays(r.scheduledAt)}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-4 bg-gradient-to-br from-violet-600/10 to-transparent border border-violet-500/20 relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-[0.06]"><Zap className="w-16 h-16 text-violet-500" /></div>
              <h4 className="text-[11px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4" /> S.P.Y. Insights
              </h4>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                {kpis.andamento.total > 0
                  ? `${kpis.andamento.total} ${kpis.andamento.total === 1 ? "reunião em andamento" : "reuniões em andamento"} agora.`
                  : proximas.length > 0
                  ? `${proximas.length} ${proximas.length === 1 ? "reunião agendada pela frente" : "reuniões agendadas pela frente"}.`
                  : "Nenhuma reunião futura agendada."}
              </p>
              {atrasadas > 0 && (
                <button
                  type="button"
                  onClick={() => { setView("lista"); setTab("Agendada"); setPeriodo("todos"); }}
                  className="mt-3 flex items-start gap-2 text-left text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-transparent border-none cursor-pointer p-0"
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  {atrasadas} {atrasadas === 1 ? "reunião está" : "reuniões estão"} como "Agendada" com a data já passada — vale atualizar o status.
                </button>
              )}
            </Card>
          </div>
        </div>
      </div>

      <NovaReuniaoModal isOpen={showNovaReuniao} onClose={() => setShowNovaReuniao(false)} />
      <NovaReuniaoModal isOpen={reuniaoToEdit !== null} reuniao={reuniaoToEdit} onClose={() => setReuniaoToEdit(null)} />

      <ConfirmModal
        isOpen={reuniaoToDelete !== null}
        onClose={() => setReuniaoToDelete(null)}
        onConfirm={() => {
          if (reuniaoToDelete) {
            deleteReuniao(reuniaoToDelete);
            toast.success("Reunião excluída com sucesso!");
          }
        }}
        title="Confirmar Exclusão de Reunião"
        message="Tem certeza de que deseja remover permanentemente esta reunião? Os dados associados não poderão ser recuperados."
      />
    </PageContainer>
  );
}
