import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../../contexts/DataContext";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { NovaReuniaoModal } from "../../components/ui/modals/reunioes/NovaReuniaoModal";
import { ConfirmModal } from "../../components/ui/modals/shared/ConfirmModal";
import {
  Video, Calendar, Clock, User, ExternalLink, Copy,
  LayoutList, CalendarDays, ChevronLeft, ChevronRight,
  CheckCircle2, PlayCircle, Zap, AlertCircle, Plus, Trash2,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { toast } from "sonner";
import { Reuniao } from "../../contexts/DataContextTypes";
import { Pagination } from "../../components/ui/Pagination";
import { KpiFilterCard, FilterBar, FilterSearch, FilterSelect, FilterChips } from "../../components/ui/kpi-filter-card";

const PAGE_SIZE = 30;

type ViewMode = "lista" | "calendario";

const STATUS_TABS = ["Todas", "Agendada", "Em Andamento", "Concluída", "Cancelada"] as const;
type StatusTab = typeof STATUS_TABS[number];

const STATUS_COLORS: Record<string, string> = {
  Agendada:       "bg-blue-500/10 border-blue-500/20 text-blue-400",
  "Em Andamento": "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  Concluída:      "bg-slate-700/40 border-white/10 text-slate-400",
  Cancelada:      "bg-rose-500/10 border-rose-500/20 text-rose-400",
};

const STATUS_DOT: Record<string, string> = {
  Agendada:       "bg-blue-400",
  "Em Andamento": "bg-emerald-400",
  Concluída:      "bg-slate-500",
  Cancelada:      "bg-rose-400",
};

const MONTH_NAMES = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const DOW = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export default function ReunioesList() {
  const { reunioes, deleteReuniao } = useData();
  const navigate = useNavigate();
  const [view, setView] = useState<ViewMode>("lista");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<StatusTab>("Todas");
  const [closer, setCloser] = useState("");
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showNovaReuniao, setShowNovaReuniao] = useState(false);
  const [reuniaoToDelete, setReuniaoToDelete] = useState<string | null>(null);

  const all = reunioes as Reuniao[];

  const filtered = useMemo(() => all.filter((r) => {
    const matchesTab = tab === "Todas" || r.status === tab;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      (r.leadName || "").toLowerCase().includes(q) ||
      (r.companyName || "").toLowerCase().includes(q) ||
      (r.closerName || "").toLowerCase().includes(q);
    const matchesCloser = !closer || r.closerName === closer;
    return matchesTab && matchesSearch && matchesCloser;
  }), [all, tab, search, closer]);

  const closerOptions = useMemo(
    () => Array.from(new Set(all.map(r => r.closerName).filter(Boolean))).sort() as string[],
    [all],
  );

  // A visão de lista renderizava TODAS as reuniões filtradas como <Card> de
  // uma vez — com milhares de reuniões, isso trava o navegador (DOM
  // gigante), independente de quão rápido os dados chegam. Pagina só a
  // renderização aqui — os dados já estão todos em memória.
  const [page, setPage] = useState(0);
  useEffect(() => { setPage(0); }, [tab, search, closer]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const kpis = useMemo(() => ({
    total:       all.length,
    agendadas:   all.filter(r => r.status === "Agendada").length,
    emAndamento: all.filter(r => r.status === "Em Andamento").length,
    concluidas:  all.filter(r => r.status === "Concluída").length,
  }), [all]);

  const nextReuniao = useMemo(() => {
    const now = new Date();
    return all
      .filter(r => r.status === "Agendada" && new Date(r.scheduledAt) > now)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0] ?? null;
  }, [all]);

  // Calendar
  const firstDayOfWeek = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth    = new Date(calYear, calMonth + 1, 0).getDate();
  const calCells       = Array.from({ length: firstDayOfWeek + daysInMonth }, (_, i) =>
    i < firstDayOfWeek ? null : i - firstDayOfWeek + 1
  );
  while (calCells.length % 7 !== 0) calCells.push(null);

  const reunioesByDay = useMemo(() => {
    const map: Record<number, Reuniao[]> = {};
    all.forEach(r => {
      const d = new Date(r.scheduledAt);
      if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
        const day = d.getDate();
        if (!map[day]) map[day] = [];
        map[day].push(r);
      }
    });
    return map;
  }, [all, calYear, calMonth]);

  const dayReunions = selectedDay ? (reunioesByDay[selectedDay] ?? []) : [];

  const prevMonth = () => {
    if (calMonth === 0) { setCalYear(y => y - 1); setCalMonth(11); }
    else setCalMonth(m => m - 1);
    setSelectedDay(null);
  };
  const nextMonth = () => {
    if (calMonth === 11) { setCalYear(y => y + 1); setCalMonth(0); }
    else setCalMonth(m => m + 1);
    setSelectedDay(null);
  };

  const today = new Date();

  return (
    <PageContainer
      title="Reuniões"
      description={`${all.length} reuniões registradas · Gerencie e acompanhe em lista ou calendário.`}
      actions={
        <div className="flex items-center gap-3">
          <Button
            onClick={() => setShowNovaReuniao(true)}
            className="bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] uppercase tracking-widest h-9 px-4 gap-2 rounded-xl shadow-sm shadow-blue-500/20"
          >
            <Plus className="w-3.5 h-3.5" /> Nova Reunião
          </Button>
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1 gap-0.5">
            <button
              onClick={() => setView("lista")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                view === "lista" ? "bg-blue-500/20 text-blue-300" : "text-slate-500 hover:text-slate-300"
              )}
            >
              <LayoutList className="w-3.5 h-3.5" /> Lista
            </button>
            <button
              onClick={() => setView("calendario")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                view === "calendario" ? "bg-blue-500/20 text-blue-300" : "text-slate-500 hover:text-slate-300"
              )}
            >
              <CalendarDays className="w-3.5 h-3.5" /> Calendário
            </button>
          </div>
        </div>
      }
    >
      <KpiFilterCard
        id="reunioes"
        className="mb-6"
        kpis={[
          { label: "Reuniões", value: filtered.length, icon: Video, tone: "primary" },
          { label: "Agendadas", value: filtered.filter(r => r.status === "Agendada").length, icon: AlertCircle, tone: "info" },
          { label: "Ao Vivo", value: filtered.filter(r => r.status === "Em Andamento").length, icon: PlayCircle, tone: "success" },
          { label: "Concluídas", value: filtered.filter(r => r.status === "Concluída").length, icon: CheckCircle2, tone: "neutral" },
        ]}
        activeCount={view === "lista" ? (search.trim() ? 1 : 0) + (tab !== "Todas" ? 1 : 0) + (closer ? 1 : 0) : 0}
        onClear={() => { setSearch(""); setTab("Todas"); setCloser(""); }}
      >
        {view === "lista" && (
          <FilterBar>
            <FilterSearch value={search} onChange={setSearch} placeholder="Buscar lead, empresa ou closer..." />
            <FilterSelect icon={User} value={closer} onChange={setCloser} options={closerOptions} allLabel="Todos os closers" />
            <FilterChips value={tab === "Todas" ? "" : tab} onChange={v => setTab((v || "Todas") as StatusTab)} options={STATUS_TABS.filter(t => t !== "Todas")} />
          </FilterBar>
        )}
      </KpiFilterCard>

      <div className="grid lg:grid-cols-4 gap-6 pb-10">

        {/* ── Main content (3 cols) ── */}
        <div className="lg:col-span-3 space-y-5">

          {/* ── LISTA VIEW ── */}
          {view === "lista" && (
            <>
              {filtered.length === 0 ? (
                <Card className="py-24 bg-[var(--color-surface-elevated)]/80 border-white/5">
                  <div className="flex flex-col items-center justify-center text-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                      <Video className="w-8 h-8 text-slate-600" />
                    </div>
                    <p className="text-slate-500 font-bold">Nenhuma reunião encontrada</p>
                    <p className="text-slate-600 text-sm">Reuniões agendadas pelo CRM aparecem aqui automaticamente.</p>
                  </div>
                </Card>
              ) : (
                <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {pageItems.map((r) => (
                    <Card key={r.id} className="p-5 bg-[var(--color-surface-elevated)]/80 border-white/5 hover:border-white/[0.12] transition-all space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0 text-sm font-black text-blue-300 select-none">
                            {((r.companyName || r.leadName || "R").slice(0, 2)).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-black text-white text-sm truncate">{r.companyName || r.leadName}</p>
                            {r.companyName && r.leadName && r.companyName !== r.leadName && (
                              <p className="text-[10px] text-slate-500 truncate">{r.leadName}</p>
                            )}
                          </div>
                        </div>
                        <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full border shrink-0", STATUS_COLORS[r.status] ?? STATUS_COLORS.Agendada)}>
                          {r.status}
                        </span>
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-400">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3 h-3 text-slate-500 shrink-0" />
                          {formatDateTime(r.scheduledAt)}
                        </div>
                        <div className="flex items-center gap-2">
                          <Clock className="w-3 h-3 text-slate-500 shrink-0" />
                          {r.durationMinutes} minutos
                        </div>
                        <div className="flex items-center gap-2">
                          <User className="w-3 h-3 text-slate-500 shrink-0" />
                          {r.closerName || "Não definido"}
                        </div>
                      </div>

                      {r.pauta && (
                        <p className="text-[11px] text-slate-500 line-clamp-2 border-t border-white/[0.05] pt-3">
                          {r.pauta}
                        </p>
                      )}

                      <div className="flex items-center gap-2 pt-1">
                        <Button
                          onClick={() => navigate(`/app/reunioes/${r.id}`)}
                          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white border border-blue-600 h-8 text-[10px] font-black uppercase tracking-widest rounded-xl"
                        >
                          <Video className="w-3 h-3 mr-1.5" /> Entrar
                        </Button>
                        <div className="flex items-center gap-0.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl p-0.5 shrink-0">
                          <button
                            onClick={() => { navigator.clipboard.writeText(r.meetLink); toast.success("Link copiado!"); }}
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition-all"
                            title="Copiar link"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <a href={r.meetLink} target="_blank" rel="noopener noreferrer">
                            <button
                              className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] transition-all"
                              title="Abrir no Meet"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          </a>
                          <button
                            onClick={() => setReuniaoToDelete(r.id)}
                            className="h-7 w-7 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all"
                            title="Excluir reunião"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              <Pagination page={page} totalPages={totalPages} total={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} itemLabel="reunião" />
            </>
          )}

          {/* ── CALENDÁRIO VIEW ── */}
          {view === "calendario" && (
            <div className="space-y-5">
              <Card className="p-6 bg-[var(--color-surface-elevated)]/80 border-white/5">
                <div className="flex items-center justify-between mb-6">
                  <button onClick={prevMonth} className="p-2 bg-white/[0.03] hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <h3 className="text-sm font-black text-white uppercase tracking-widest">
                    {MONTH_NAMES[calMonth]} {calYear}
                  </h3>
                  <button onClick={nextMonth} className="p-2 bg-white/[0.03] hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-7 mb-2">
                  {DOW.map((d) => (
                    <div key={d} className="text-center text-[9px] font-black text-slate-600 uppercase py-1">{d}</div>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {calCells.map((day, idx) => {
                    if (!day) return <div key={idx} />;
                    const isToday =
                      day === today.getDate() &&
                      calMonth === today.getMonth() &&
                      calYear === today.getFullYear();
                    const isSelected = day === selectedDay;
                    const dayMeetings = reunioesByDay[day] ?? [];
                    return (
                      <button
                        key={idx}
                        onClick={() => setSelectedDay(day === selectedDay ? null : day)}
                        className={cn(
                          "relative flex flex-col items-center p-2 rounded-xl transition-all min-h-[52px]",
                          isSelected
                            ? "bg-blue-500/20 border border-blue-500/30"
                            : isToday
                            ? "bg-white/[0.06] border border-white/10"
                            : "hover:bg-white/[0.04] border border-transparent"
                        )}
                      >
                        <span className={cn(
                          "text-xs font-bold leading-none",
                          isSelected ? "text-blue-300" : isToday ? "text-white" : "text-slate-400"
                        )}>
                          {day}
                        </span>
                        {dayMeetings.length > 0 && (
                          <div className="flex gap-0.5 mt-1.5 flex-wrap justify-center">
                            {dayMeetings.slice(0, 3).map((r, i) => (
                              <div key={i} className={cn("w-1.5 h-1.5 rounded-full", STATUS_DOT[r.status] ?? "bg-slate-500")} />
                            ))}
                            {dayMeetings.length > 3 && (
                              <span className="text-[8px] text-slate-500 font-bold">+{dayMeetings.length - 3}</span>
                            )}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </Card>

              {selectedDay && (
                <div>
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">
                    {selectedDay} de {MONTH_NAMES[calMonth]} — {dayReunions.length} reuniã{dayReunions.length !== 1 ? "ões" : "o"}
                  </h4>
                  {dayReunions.length === 0 ? (
                    <Card className="py-12 bg-[var(--color-surface-elevated)]/80 border-white/5">
                      <p className="text-slate-600 text-sm text-center">Nenhuma reunião neste dia.</p>
                    </Card>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                      {dayReunions.map((r) => (
                        <Card key={r.id} className="p-4 bg-[var(--color-surface-elevated)]/80 border-white/5 hover:border-white/[0.12] transition-all space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div className="w-8 h-8 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0 text-xs font-black text-blue-300 select-none">
                                {((r.companyName || r.leadName || "R").slice(0, 2)).toUpperCase()}
                              </div>
                              <p className="font-black text-white text-sm truncate">{r.companyName || r.leadName}</p>
                            </div>
                            <span className={cn("text-[9px] font-black px-2 py-0.5 rounded-full border shrink-0", STATUS_COLORS[r.status])}>
                              {r.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-400">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{formatTime(r.scheduledAt)}</span>
                            <span className="text-slate-600">·</span>
                            <span>{r.durationMinutes}min</span>
                            <span className="text-slate-600">·</span>
                            <span className="flex items-center gap-1 truncate"><User className="w-3 h-3 shrink-0" />{r.closerName || "—"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => navigate(`/app/reunioes/${r.id}`)}
                              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white border border-blue-600 h-8 text-[10px] font-black uppercase tracking-widest rounded-xl"
                            >
                              <Video className="w-3 h-3 mr-1.5" /> Entrar na Reunião
                            </Button>
                            <button
                              onClick={() => setReuniaoToDelete(r.id)}
                              className="h-8 w-8 flex items-center justify-center rounded-xl border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-all shrink-0"
                              title="Excluir reunião"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Right panel (1 col) ── */}
        <div className="space-y-5">

          {/* Next meeting */}
          <Card className="p-6 bg-[var(--color-surface-elevated)]/80 border-white/5">
            <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-5">Próxima Reunião</h4>
            {nextReuniao ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0 text-sm font-black text-blue-300 select-none">
                    {((nextReuniao.companyName || nextReuniao.leadName || "R").slice(0, 2)).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-black text-white text-sm truncate">{nextReuniao.companyName || nextReuniao.leadName}</p>
                    <p className="text-[10px] text-slate-500 truncate">{nextReuniao.closerName || "—"}</p>
                  </div>
                </div>
                <div className="p-3 bg-blue-500/[0.07] rounded-xl border border-blue-500/15 space-y-1">
                  <p className="text-xs text-blue-300 font-bold">{formatDateTime(nextReuniao.scheduledAt)}</p>
                  <p className="text-[10px] text-slate-500">{nextReuniao.durationMinutes} minutos</p>
                </div>
                <Button
                  onClick={() => navigate(`/app/reunioes/${nextReuniao.id}`)}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black text-[10px] uppercase tracking-widest h-9 rounded-xl gap-2"
                >
                  <Video className="w-3.5 h-3.5" /> Entrar
                </Button>
              </div>
            ) : (
              <div className="flex flex-col items-center py-6 text-center gap-2">
                <CalendarDays className="w-8 h-8 text-slate-700" />
                <p className="text-slate-600 text-xs">Nenhuma reunião agendada</p>
              </div>
            )}
          </Card>

          {/* S.P.Y. Insights — matching Telemedicina Aurora card style */}
          <Card className="p-6 bg-gradient-to-br from-violet-600/10 to-transparent border-violet-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-[0.05]">
              <Zap className="w-20 h-20 text-violet-400" />
            </div>
            <h4 className="text-[10px] font-black text-violet-400 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4" /> S.P.Y. Insights
            </h4>
            <p className="text-xs text-slate-400 italic leading-relaxed mb-4">
              {kpis.emAndamento > 0
                ? `${kpis.emAndamento} reunião${kpis.emAndamento > 1 ? "ões" : ""} em andamento agora.`
                : kpis.agendadas > 0
                ? `${kpis.agendadas} reuniões próximas aguardando confirmação.`
                : "Nenhuma reunião ativa no momento."}
            </p>
            {kpis.emAndamento > 0 && (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[9px] font-black text-emerald-400 uppercase">Ao Vivo</span>
              </div>
            )}
          </Card>

        </div>
      </div>

      <NovaReuniaoModal
        isOpen={showNovaReuniao}
        onClose={() => setShowNovaReuniao(false)}
      />

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
