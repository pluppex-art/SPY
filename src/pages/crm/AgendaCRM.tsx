import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { PageContainer } from "../../components/PageContainer";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Badge } from "../../components/ui/badge";
import { Input } from "../../components/ui/input";
import { EmptyState } from "../../components/ui/empty-state";
import { NovaReuniaoModal } from "../../components/ui/modals/reunioes/NovaReuniaoModal";
import { ConfirmModal } from "../../components/ui/modals/shared/ConfirmModal";
import { LeadDetailsModal } from "../../components/ui/LeadDetailsModal";
import {
  CalendarDays,
  Calendar as CalendarIcon,
  Clock,
  User,
  Search,
  ExternalLink,
  Copy,
  LayoutList,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Video,
  Plus,
  Trash2,
  Phone,
  MessageSquare,
  RefreshCw,
  Building2,
  Filter,
  Sparkles,
  ArrowUpRight,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { Reuniao } from "../../contexts/DataContextTypes";
import { googleSignIn, getAccessToken, logout as googleLogout, initAuth, SCOPES_CALENDAR } from "../../lib/firebase";
import { supabase } from "../../lib/supabase";

// Só https e hosts do Google Meet chegam ao window.open (meetLink vem de eventos do Google Calendar,
// que convidados externos podem escrever). Evita esquemas como javascript:.
const isSafeMeetLink = (link?: string | null): boolean => {
  if (!link) return false;
  try {
    const u = new URL(link);
    return u.protocol === "https:" && u.hostname === "meet.google.com";
  } catch {
    return false;
  }
};


type ViewMode = "mes" | "semana" | "dia" | "lista";
type StatusFilter = "Todos" | "Agendada" | "Em Andamento" | "Concluída" | "Cancelada";

const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const DOW = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function AgendaCRM() {
  const { reunioes, deleteReuniao, updateReuniao, addReuniao, leads, colaboradores } = useData();
  const { activeTenantId } = useAuth();
  const navigate = useNavigate();

  const [view, setView] = useState<ViewMode>("mes");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Todos");
  const [selectedCloser, setSelectedCloser] = useState<string>("Todos");
  // "Lista Geral de Agendamentos" renderizava TODOS os agendamentos filtrados
  // de uma vez (base tem +4 mil, histórico migrado do to na pista) — muito
  // pesado. Só limita o que é desenhado; contadores continuam usando a lista
  // filtrada completa.
  const LIST_PAGE_SIZE = 50;
  const [listVisibleCount, setListVisibleCount] = useState(LIST_PAGE_SIZE);

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDayDate, setSelectedDayDate] = useState<Date>(() => new Date());
  const [showNovaReuniao, setShowNovaReuniao] = useState(false);
  const [reuniaoToDelete, setReuniaoToDelete] = useState<string | null>(null);
  const [selectedLeadForDetails, setSelectedLeadForDetails] = useState<any | null>(null);
  
  // Google Calendar Integration State
  const [isSyncing, setIsSyncing] = useState(false);
  const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);

  const all = reunioes as Reuniao[];

  const closerList = useMemo(() => {
    const fromColab = (colaboradores || [])
      .filter((c: any) => c.nome && c.status !== "Desligado")
      .map((c: any) => c.nome as string);
    const fromReunioes = all.map((r) => r.closerName).filter(Boolean);
    return Array.from(new Set([...fromColab, ...fromReunioes]));
  }, [colaboradores, all]);

  const filteredReunioes = useMemo(() => {
    return all.filter((r) => {
      const matchesStatus = statusFilter === "Todos" || r.status === statusFilter;
      const matchesCloser = selectedCloser === "Todos" || r.closerName === selectedCloser;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        (r.leadName || "").toLowerCase().includes(q) ||
        (r.companyName || "").toLowerCase().includes(q) ||
        (r.closerName || "").toLowerCase().includes(q) ||
        (r.pauta || "").toLowerCase().includes(q);

      return matchesStatus && matchesCloser && matchesSearch;
    });
  }, [all, statusFilter, selectedCloser, search]);

  useEffect(() => {
    setListVisibleCount(LIST_PAGE_SIZE);
  }, [statusFilter, selectedCloser, search]);

  const visibleReunioes = useMemo(
    () => filteredReunioes.slice(0, listVisibleCount),
    [filteredReunioes, listVisibleCount]
  );

  // Today metrics
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayMeetings = all.filter((r) => r.scheduledAt?.startsWith(todayStr));
  const todayConfirmed = todayMeetings.filter((r) => r.status === "Agendada" || r.status === "Em Andamento");

  const nextMeeting = useMemo(() => {
    const now = new Date();
    return all
      .filter((r) => r.status === "Agendada" && new Date(r.scheduledAt) > now)
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0] ?? null;
  }, [all]);

  // Calendar Helpers
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDayOfWeek = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const handlePrev = () => {
    if (view === "mes") setCurrentDate(new Date(year, month - 1, 1));
    else if (view === "semana") {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 1);
      setCurrentDate(d);
    }
  };

  const handleNext = () => {
    if (view === "mes") setCurrentDate(new Date(year, month + 1, 1));
    else if (view === "semana") {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    } else {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 1);
      setCurrentDate(d);
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
    setSelectedDayDate(new Date());
  };

  // Mesmo mecanismo já usado (e funcionando) por Google Tasks
  // (src/lib/firebase.ts): popup do Google Identity Services, token de acesso
  // fica só na memória desta aba, sem passar pelo backend. Trocado a partir
  // do fluxo server-side (server/googleCalendar.ts) porque cada ambiente novo
  // (redirect_uri, client secret, app não verificado) virava um ponto de
  // falha diferente — este caminho evita tudo isso.

  // Nem todo evento do Google Calendar é uma reunião comercial (almoço,
  // aniversário, compromisso pessoal também aparecem na agenda) — só vira
  // Reunião no CRM quem tem cara de reunião de verdade: link de
  // videochamada, mais de um convidado, ou palavra-chave de reunião/trabalho
  // no título. Compromissos claramente pessoais ficam de fora mesmo que
  // batam num dos critérios acima.
  const MEETING_KEYWORDS = [
    "reunião", "reuniao", "meeting", "call", "daily", "sync", "alinhamento",
    "alinhar", "kickoff", "kick-off", "apresentação", "apresentacao",
    "proposta", "negociação", "negociacao", "onboarding", "treinamento",
    "planejamento", "follow-up", "followup", "demo", "demonstração",
    "demonstracao", "fechamento", "closer", "venda", "cliente", "1:1",
    "one on one", "standup", "stand-up", "retro", "review",
  ];
  const PERSONAL_KEYWORDS = [
    "almoço", "almoco", "jantar", "café", "cafe", "aniversário", "aniversario",
    "dentista", "médico", "medico", "consulta", "academia", "gym", "pessoal",
    "folga", "férias", "ferias", "viagem", "escola", "filho", "filha",
    "casamento", "festa", "lazer",
  ];
  const isRealMeeting = (event: any): boolean => {
    const text = `${event.summary || ""} ${event.description || ""}`.toLowerCase();
    if (PERSONAL_KEYWORDS.some((k) => text.includes(k))) return false;
    const hasMeetLink = !!(event.hangoutLink || event.conferenceData?.entryPoints?.length);
    const attendees = event.attendees || [];
    const hasOtherAttendees = attendees.filter((a: any) => !a.self).length > 0;
    const hasMeetingKeyword = MEETING_KEYWORDS.some((k) => text.includes(k));
    return hasMeetLink || hasOtherAttendees || hasMeetingKeyword;
  };

  const mapGoogleEventToReuniao = (event: any): Omit<Reuniao, "id" | "createdAt"> => {
    const startISO = event.start?.dateTime
      ? new Date(event.start.dateTime).toISOString()
      : event.start?.date
      ? new Date(`${event.start.date}T09:00:00`).toISOString()
      : new Date().toISOString();
    const endISO = event.end?.dateTime
      ? new Date(event.end.dateTime).toISOString()
      : event.end?.date
      ? new Date(`${event.end.date}T10:00:00`).toISOString()
      : new Date(Date.now() + 3600000).toISOString();
    const durationMinutes = Math.max(15, Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60000)) || 60;
    const attendees = event.attendees || [];
    const otherAttendee = attendees.find((a: any) => !a.self) || attendees[0];
    return {
      leadId: `gcal-${event.id}`,
      leadName: otherAttendee?.displayName || otherAttendee?.email || event.summary || "Compromisso Google Calendar",
      companyName: event.summary || "Google Calendar",
      leadEmail: otherAttendee?.email || "",
      closerName: googleUserEmail || "Google Calendar",
      closerEmail: event.organizer?.email || "",
      scheduledAt: startISO,
      durationMinutes,
      meetLink: event.hangoutLink || event.conferenceData?.entryPoints?.find((e: any) => e.uri)?.uri || event.htmlLink || "",
      googleEventId: event.id,
      status: event.status === "cancelled" ? "Cancelada" : "Agendada",
      pauta: event.description || (event.summary ? `Evento: ${event.summary}` : "Sincronizado da agenda do Google"),
    };
  };

  const handleSyncGoogle = async () => {
    if (!activeTenantId || isSyncing) return;
    setIsSyncing(true);
    try {
      let token = await getAccessToken(activeTenantId, SCOPES_CALENDAR);
      if (!token) {
        const result = await googleSignIn(activeTenantId, SCOPES_CALENDAR);
        token = result.accessToken;
        setGoogleUserEmail(result.user.email || "Conectado");
      }

      const timeMin = new Date(year, month - 1, 1).toISOString();
      const timeMax = new Date(year, month + 4, 0).toISOString();
      const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
      url.searchParams.set("timeMin", timeMin);
      url.searchParams.set("timeMax", timeMax);
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", "250");

      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        if (res.status === 401) { setGoogleUserEmail(null); throw new Error("Sua conexão com o Google expirou — conecte de novo."); }
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || "Falha ao buscar eventos do Google Calendar.");
      }
      const data = await res.json();
      const events: any[] = data.items || [];

      // Checa direto no banco quais googleEventId já existem — o array `all`
      // vem do estado local (reunioes do DataContext), que pode ainda não ter
      // terminado de carregar quando esta sincronização dispara logo ao
      // montar a página (ex: token do Google já em cache). Confiar só nele
      // fazia tentar inserir de novo reuniões que já existiam, batendo na
      // constraint idx_reunioes_tenant_google_event e falhando em lote.
      const existingGoogleIds = new Map<string, { id: string; scheduledAt: string; status: string }>();
      if (supabase) {
        const { data: existingRows } = await supabase
          .from("reunioes")
          .select('id, "googleEventId", "scheduledAt", status')
          .eq("tenant_id", activeTenantId)
          .not("googleEventId", "is", null);
        (existingRows || []).forEach((r: any) => {
          if (r.googleEventId) existingGoogleIds.set(r.googleEventId, r);
        });
      }

      let imported = 0;
      let updated = 0;
      for (const ev of events) {
        if (ev.status === "cancelled") continue;
        if (!isRealMeeting(ev)) continue;
        const mapped = mapGoogleEventToReuniao(ev);
        const existing = all.find((r) => r.googleEventId === ev.id) || existingGoogleIds.get(ev.id);
        if (existing) {
          if (existing.scheduledAt !== mapped.scheduledAt || existing.status !== mapped.status) {
            updateReuniao(existing.id, mapped);
            updated++;
          }
        } else {
          addReuniao(mapped);
          imported++;
        }
      }

      if (imported === 0 && updated === 0) {
        toast.success("Agenda Google já sincronizada com o sistema!");
      } else {
        toast.success(`Google Calendar sincronizado! ${imported} eventos importados, ${updated} atualizados.`);
      }
    } catch (err: any) {
      console.error("Erro na sincronização com Google Calendar:", err);
      toast.error(err?.message || "Erro ao sincronizar com Google Calendar.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleConnectGoogle = async () => {
    if (!activeTenantId) return;
    try {
      const result = await googleSignIn(activeTenantId, SCOPES_CALENDAR);
      setGoogleUserEmail(result.user.email || "Conectado");
      toast.success("Conta Google conectada com sucesso!");
      handleSyncGoogle();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao conectar ao Google.");
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!activeTenantId) return;
    await googleLogout(activeTenantId, SCOPES_CALENDAR);
    setGoogleUserEmail(null);
    // Ao desconectar, remove do CRM tudo que veio sincronizado do Google —
    // senão os compromissos importados continuam aparecendo mesmo sem a
    // conexão ativa, dando a impressão de que ainda está tudo sincronizado.
    const googleSynced = all.filter((r) => !!r.googleEventId);
    for (const r of googleSynced) {
      deleteReuniao(r.id);
    }
    toast.success(
      googleSynced.length > 0
        ? `Conta Google desconectada. ${googleSynced.length} compromisso(s) importado(s) removido(s) da agenda.`
        : "Conta Google desconectada."
    );
  };

  // Reflete se já existe um token válido nesta aba pra este tenant (não
  // persiste entre reloads — GIS implicit flow nunca dá refresh_token).
  useEffect(() => {
    if (!activeTenantId) return;
    setGoogleUserEmail(null);
    const unsubscribe = initAuth(
      activeTenantId,
      (user) => { setGoogleUserEmail(user.email || "Conectado"); handleSyncGoogle(); },
      () => setGoogleUserEmail(null),
      SCOPES_CALENDAR
    );
    return () => unsubscribe();
  }, [activeTenantId]);

  const handleCopyLink = (link?: string) => {
    if (!link) return;
    navigator.clipboard.writeText(link);
    toast.success("Link da videoconferência copiado!");
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Em Andamento":
        return <Badge variant="success" dot dotPulse>Ao Vivo</Badge>;
      case "Agendada":
        return <Badge variant="info" dot>Agendada</Badge>;
      case "Concluída":
        return <Badge variant="secondary">Concluída</Badge>;
      case "Cancelada":
        return <Badge variant="destructive">Cancelada</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <PageContainer
      title="Agenda Comercial CRM"
      description="Controle de compromissos, reuniões de fechamento, follow-ups e demonstrações de vendas."
      actions={
        <div className="flex items-center gap-3 flex-wrap">
          {/* Botão de Conexão / Sincronização do Google */}
          {googleUserEmail ? (
            <div className="flex items-center gap-2 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] p-1 rounded-xl shadow-xs">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <span className="truncate max-w-[140px] text-[11px]">{googleUserEmail}</span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleSyncGoogle()}
                disabled={isSyncing}
                className="text-xs font-bold gap-1.5 h-8 px-2.5 hover:bg-[var(--color-surface-sunken)]"
                title="Sincronizar eventos do Google Calendar agora"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-[var(--color-primary-blue)]" : ""}`} />
                <span>{isSyncing ? "Sincronizando..." : "Sincronizar"}</span>
              </Button>

              <button
                type="button"
                onClick={handleDisconnectGoogle}
                className="text-[var(--color-text-muted)] hover:text-rose-500 p-1.5 rounded-md hover:bg-rose-500/10 transition-colors border-none bg-transparent cursor-pointer"
                title="Desconectar conta Google"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={handleConnectGoogle}
              className="text-xs font-bold gap-2 h-9 bg-white dark:bg-slate-900 border-slate-200 shadow-xs hover:border-blue-400 hover:bg-blue-50/50"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Conectar Google Calendar</span>
            </Button>
          )}

          <Button
            onClick={() => setShowNovaReuniao(true)}
            className="gap-2 font-bold px-4 h-9 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Novo Agendamento
          </Button>
        </div>
      }
    >
      <div className="space-y-6 max-w-[1600px] mx-auto pb-12">
        {/* Top KPIs Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
                Compromissos Hoje
              </span>
              <div className="w-7 h-7 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center">
                <CalendarDays className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-black text-[var(--color-text-primary)] font-mono">
              {todayMeetings.length}
            </div>
            <p className="text-[11px] text-[var(--color-text-faint)] mt-1">
              {todayConfirmed.length} confirmados no dia
            </p>
          </Card>

          <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
                Total Agendado (Mês)
              </span>
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <Clock className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-black text-[var(--color-text-primary)] font-mono">
              {all.filter((r) => r.status === "Agendada").length}
            </div>
            <p className="text-[11px] text-purple-600 dark:text-purple-400 font-bold mt-1">
              Pipeline ativo de conversão
            </p>
          </Card>

          <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
                Reuniões Realizadas
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
              {all.filter((r) => r.status === "Concluída").length}
            </div>
            <p className="text-[11px] text-[var(--color-text-faint)] mt-1">
              Histórico com ata e notas salvas
            </p>
          </Card>

          <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
                Próximo Alinhamento
              </span>
              <div className="w-7 h-7 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
            </div>
            {nextMeeting ? (
              <div>
                <div className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                  {nextMeeting.leadName || nextMeeting.companyName}
                </div>
                <p className="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-bold mt-0.5">
                  {new Date(nextMeeting.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} • {nextMeeting.closerName}
                </p>
              </div>
            ) : (
              <p className="text-xs text-[var(--color-text-faint)] mt-1">Nenhum compromisso pendente</p>
            )}
          </Card>
        </div>

        {/* Controls Bar: Views, Date Navigation & Filters */}
        <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* View switcher & Date Nav */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex bg-[var(--color-surface-sunken)] p-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
                {[
                  { id: "mes" as const, label: "Mês" },
                  { id: "semana" as const, label: "Semana" },
                  { id: "dia" as const, label: "Dia" },
                  { id: "lista" as const, label: "Lista" },
                ].map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setView(t.id)}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer border-none ${
                      view === t.id
                        ? "bg-[var(--color-primary-blue)] text-white shadow-xs"
                        : "bg-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5 bg-[var(--color-surface-sunken)] px-2 py-1 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)]">
                <Button variant="ghost" size="xs" onClick={handlePrev} className="h-7 w-7 p-0">
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <button
                  type="button"
                  onClick={handleToday}
                  className="px-2.5 py-1 text-xs font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-elevated)] rounded-md transition-colors cursor-pointer border-none bg-transparent"
                >
                  Hoje
                </button>
                <Button variant="ghost" size="xs" onClick={handleNext} className="h-7 w-7 p-0">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              <span className="text-sm font-black text-[var(--color-text-primary)] ml-2">
                {MONTH_NAMES[month]} {year}
              </span>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
                <Input
                  type="text"
                  placeholder="Buscar compromisso ou lead..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-9 text-xs"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                className="h-9 px-3 rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              >
                <option value="Todos">Status: Todos</option>
                <option value="Agendada">Agendada</option>
                <option value="Em Andamento">Em Andamento</option>
                <option value="Concluída">Concluída</option>
                <option value="Cancelada">Cancelada</option>
              </select>

              <select
                value={selectedCloser}
                onChange={(e) => setSelectedCloser(e.target.value)}
                className="h-9 px-3 rounded-[var(--radius-control)] bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
              >
                <option value="Todos">Responsável: Todos</option>
                {closerList.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* View Renderings */}
        {view === "mes" && (
          <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm overflow-hidden">
            {/* Days of week header */}
            <div className="grid grid-cols-7 gap-1 text-center mb-2">
              {DOW.map((d) => (
                <div key={d} className="py-2 text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
                  {d}
                </div>
              ))}
            </div>

            {/* Month grid */}
            <div className="grid grid-cols-7 gap-1.5">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-[100px] p-2 bg-[var(--color-surface-sunken)]/30 rounded-[var(--radius-control)] opacity-30 border border-transparent" />
              ))}

              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNum = idx + 1;
                const dayDateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                const isToday = dayDateStr === todayStr;
                const dayMeetings = filteredReunioes.filter((r) => r.scheduledAt?.startsWith(dayDateStr));

                return (
                  <div
                    key={dayNum}
                    onClick={() => {
                      setSelectedDayDate(new Date(year, month, dayNum));
                      setView("dia");
                    }}
                    className={`min-h-[110px] p-2 rounded-[var(--radius-control)] border transition-all cursor-pointer flex flex-col justify-between ${
                      isToday
                        ? "bg-[var(--color-primary-blue)]/5 border-[var(--color-primary-blue)]/40 shadow-xs"
                        : "bg-[var(--color-surface-elevated)] border-[var(--color-border-subtle)] hover:border-[var(--color-primary-blue)]/30 hover:bg-[var(--color-surface-sunken)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-black ${isToday ? "text-[var(--color-primary-blue)] font-bold px-1.5 py-0.5 rounded-full bg-[var(--color-primary-blue)]/10" : "text-[var(--color-text-primary)]"}`}>
                        {dayNum}
                      </span>
                      {dayMeetings.length > 0 && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)]">
                          {dayMeetings.length}
                        </span>
                      )}
                    </div>

                    <div className="space-y-1 mt-1 flex-1 overflow-hidden">
                      {dayMeetings.slice(0, 2).map((r) => {
                        const isGoogle = !!r.googleEventId || r.companyName === "Google Calendar";
                        return (
                          <div
                            key={r.id}
                            className={`px-1.5 py-0.5 rounded border text-[10px] font-bold truncate flex items-center gap-1 ${
                              isGoogle
                                ? "bg-emerald-600 text-white border-emerald-700 shadow-2xs"
                                : "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/20"
                            }`}
                            title={`${r.leadName || r.companyName} (${new Date(r.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})`}
                          >
                            {isGoogle && <span className="text-[9px]">📅</span>}
                            <span>
                              {new Date(r.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} • {r.leadName || r.companyName}
                            </span>
                          </div>
                        );
                      })}
                      {dayMeetings.length > 2 && (
                        <span className="text-[9px] text-[var(--color-text-faint)] font-bold block pl-1">
                          +{dayMeetings.length - 2} mais
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}

        {view === "dia" && (
          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-3">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-[var(--color-text-primary)] flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-[var(--color-primary-blue)]" />
                    Compromissos de {selectedDayDate.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })}
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    Linha do tempo diária de negociações e videochamadas
                  </p>
                </div>
                <Button size="sm" onClick={() => setShowNovaReuniao(true)} className="gap-1 font-bold text-xs">
                  <Plus className="w-3.5 h-3.5" /> Agendar
                </Button>
              </div>

              {/* Day slots list */}
              {(() => {
                const dayDateStr = selectedDayDate.toISOString().slice(0, 10);
                const dayMeetings = filteredReunioes.filter((r) => r.scheduledAt?.startsWith(dayDateStr));

                if (dayMeetings.length === 0) {
                  return (
                    <EmptyState
                      icon={CalendarDays}
                      title="Nenhum compromisso neste dia"
                      description="Clique em 'Novo Agendamento' ou sincronize com o Google Calendar para carregar seus eventos."
                      className="py-12"
                    />
                  );
                }

                return (
                  <div className="space-y-3">
                    {dayMeetings.map((r) => {
                      const isGoogle = !!r.googleEventId || r.companyName === "Google Calendar";
                      const isMeet = isSafeMeetLink(r.meetLink);

                      return (
                        <div
                          key={r.id}
                          className="p-4 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-panel)] flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-[var(--color-primary-blue)]/40 transition-all shadow-xs"
                        >
                          <div className="flex items-start gap-3.5 min-w-0">
                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                              isGoogle
                                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                                : "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/20 text-[var(--color-primary-blue)]"
                            }`}>
                              <Video className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                                  {r.leadName || r.companyName || "Reunião Comercial"}
                                </h4>
                                {getStatusBadge(r.status)}
                                {isGoogle && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white shadow-xs">
                                    Google Calendar
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                                {r.companyName && <span>{r.companyName} • </span>}
                                Responsável: <strong className="text-[var(--color-text-primary)]">{r.closerName || "Não atribuído"}</strong>
                              </p>
                              {r.pauta && (
                                <p className="text-[11px] text-[var(--color-text-faint)] italic mt-1 line-clamp-1">
                                  Pauta: {r.pauta}
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                            <span className="font-mono text-xs font-bold text-[var(--color-text-primary)] bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] px-2.5 py-1 rounded-md">
                              {new Date(r.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>

                            {r.meetLink && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleCopyLink(r.meetLink)}
                                title="Copiar Link da Reunião"
                                className="h-8 w-8 p-0"
                              >
                                <Copy className="w-3.5 h-3.5" />
                              </Button>
                            )}

                            {isMeet && r.meetLink ? (
                              <Button
                                size="sm"
                                onClick={() => { if (isSafeMeetLink(r.meetLink)) window.open(r.meetLink, "_blank", "noopener,noreferrer"); }}
                                className="gap-1.5 h-8 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> Google Meet
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => navigate(`/app/reuniao/${r.id}`)}
                                className="gap-1.5 h-8 text-xs font-bold"
                              >
                                <Video className="w-3.5 h-3.5" /> Entrar
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </Card>

            {/* Quick lead info / Sidebar */}
            <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] flex items-center gap-2 border-b border-[var(--color-border-subtle)] pb-2">
                <Building2 className="w-4 h-4 text-emerald-500" /> Próximos Passos Comerciais
              </h3>

              <div className="space-y-3 text-xs text-[var(--color-text-muted)] leading-relaxed">
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-[var(--radius-control)]">
                  <p className="font-bold text-emerald-600 dark:text-emerald-400 text-xs mb-1">Sincronização Ativa</p>
                  <p className="text-[11px]">
                    Os eventos marcados no Google Calendar refletem diretamente na agenda e vice-versa. Links do Google Meet são preservados automaticamente.
                  </p>
                </div>

                <div className="space-y-2 pt-2">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-faint)]">Vendedores em Atividade</p>
                  <div className="flex flex-wrap gap-1.5">
                    {closerList.map((c) => (
                      <span key={c} className="px-2.5 py-1 rounded-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[10px] font-bold text-[var(--color-text-primary)]">
                        👤 {c}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {(view === "lista" || view === "semana") && (
          <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-3 mb-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] flex items-center gap-2">
                <LayoutList className="w-4 h-4 text-[var(--color-primary-blue)]" /> Lista Geral de Agendamentos ({filteredReunioes.length})
              </h3>
            </div>

            {filteredReunioes.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title="Nenhum agendamento encontrado"
                description="Ajuste os filtros de pesquisa, crie um novo agendamento ou sincronize com o Google Calendar."
                className="py-12"
              />
            ) : (
              <div className="space-y-2.5">
                {visibleReunioes.map((r) => {
                  const isGoogle = !!r.googleEventId || r.companyName === "Google Calendar";
                  const isMeet = isSafeMeetLink(r.meetLink);

                  return (
                    <div
                      key={r.id}
                      className="p-3.5 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] hover:border-[var(--color-primary-blue)]/40 rounded-[var(--radius-control)] flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all shadow-xs"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                          isGoogle
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]"
                        }`}>
                          <Video className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-[var(--color-text-primary)] truncate">
                              {r.leadName || r.companyName}
                            </span>
                            {getStatusBadge(r.status)}
                            {isGoogle && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-600 text-white shadow-xs">
                                Google Calendar
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                            {r.companyName && <span>{r.companyName} • </span>}
                            Responsável: <strong className="text-[var(--color-text-primary)]">{r.closerName || "Não atribuído"}</strong>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 self-end md:self-center shrink-0">
                        <span className="font-mono text-xs font-bold text-[var(--color-text-muted)]">
                          {new Date(r.scheduledAt).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} às {new Date(r.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>

                        {r.meetLink && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleCopyLink(r.meetLink)}
                            className="h-8 text-xs font-bold gap-1"
                          >
                            <Copy className="w-3 h-3" /> Link
                          </Button>
                        )}

                        {isMeet && r.meetLink ? (
                          <Button
                            size="sm"
                            onClick={() => { if (isSafeMeetLink(r.meetLink)) window.open(r.meetLink, "_blank", "noopener,noreferrer"); }}
                            className="h-8 text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> Meet
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => navigate(`/app/reuniao/${r.id}`)}
                            className="h-8 text-xs font-bold gap-1"
                          >
                            <Video className="w-3.5 h-3.5" /> Abrir Sala
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setReuniaoToDelete(r.id)}
                          className="h-8 w-8 p-0 text-[var(--color-text-faint)] hover:text-rose-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {listVisibleCount < filteredReunioes.length && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={() => setListVisibleCount((c) => c + LIST_PAGE_SIZE)}
                >
                  Carregar mais ({filteredReunioes.length - listVisibleCount} restantes)
                </Button>
              </div>
            )}
          </Card>
        )}
      </div>

      {/* Modais */}
      <NovaReuniaoModal
        isOpen={showNovaReuniao}
        onClose={() => setShowNovaReuniao(false)}
      />

      <ConfirmModal
        isOpen={!!reuniaoToDelete}
        onClose={() => setReuniaoToDelete(null)}
        onConfirm={() => {
          if (reuniaoToDelete) {
            deleteReuniao(reuniaoToDelete);
            toast.success("Agendamento removido!");
            setReuniaoToDelete(null);
          }
        }}
        title="Cancelar Agendamento"
        message="Tem certeza que deseja cancelar esta reunião comercial da agenda?"
      />

      {selectedLeadForDetails && (
        <LeadDetailsModal
          isOpen={!!selectedLeadForDetails}
          lead={selectedLeadForDetails}
          onClose={() => setSelectedLeadForDetails(null)}
        />
      )}
    </PageContainer>
  );
}
