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
import { Sparkline } from "../../components/ui/sparkline";
import { NovaReuniaoModal, TIPO_COMPROMISSO_OPTIONS, type TipoCompromisso } from "../../components/ui/modals/reunioes/NovaReuniaoModal";
import { ConfirmModal } from "../../components/ui/modals/shared/ConfirmModal";
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
  RefreshCw,
  Building2,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { Reuniao } from "../../contexts/DataContextTypes";
import { googleSignIn, getAccessToken, logout as googleLogout, initAuth, SCOPES_CALENDAR } from "../../lib/firebase";
import { supabase } from "../../lib/supabase";
import { normalizeText } from "../../lib/utils";

type TipoFiltro = "Todos" | TipoCompromisso;

/** Mesmas 5 categorias do modal "+ Novo Agendamento" (coluna real `tipo`) —
 * cor usada nos chips do calendário, nos "Filtros rápidos" da sidebar e na
 * legenda do rodapé. Histórico migrado sem pauta identificável cai em
 * "Outros" (ver migration 20261006_reunioes_tipo_convidados.sql). */
const TIPO_COLORS: Record<TipoCompromisso, { bg: string; text: string; dot: string; border: string }> = {
  "Reunião":      { bg: "bg-blue-500/10",    text: "text-blue-600 dark:text-blue-400",    dot: "bg-blue-500",    border: "border-blue-500/20" },
  "Demonstração": { bg: "bg-purple-500/10",  text: "text-purple-600 dark:text-purple-400", dot: "bg-purple-500",  border: "border-purple-500/20" },
  "Follow-up":    { bg: "bg-amber-500/10",   text: "text-amber-600 dark:text-amber-400",  dot: "bg-amber-500",   border: "border-amber-500/20" },
  "Fechamento":   { bg: "bg-emerald-500/10", text: "text-emerald-600 dark:text-emerald-400", dot: "bg-emerald-500", border: "border-emerald-500/20" },
  "Outros":       { bg: "bg-slate-500/10",   text: "text-slate-600 dark:text-slate-400",  dot: "bg-slate-400",   border: "border-slate-500/20" },
};
const getTipoColor = (tipo?: string | null) => TIPO_COLORS[(tipo as TipoCompromisso) || "Outros"] || TIPO_COLORS["Outros"];

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
  const [tipoFilter, setTipoFilter] = useState<TipoFiltro>("Todos");
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

  // Status/Responsável/busca — aplicados antes do tipo, pra servir de base
  // às contagens por tipo da sidebar (que precisam mostrar a distribuição
  // completa, não só a fatia já restrita ao tipo selecionado).
  const baseFiltered = useMemo(() => {
    return all.filter((r) => {
      const matchesStatus = statusFilter === "Todos" || r.status === statusFilter;
      const matchesCloser = selectedCloser === "Todos" || r.closerName === selectedCloser;
      const q = normalizeText(search);
      const matchesSearch =
        !q ||
        normalizeText(r.leadName).includes(q) ||
        normalizeText(r.companyName).includes(q) ||
        normalizeText(r.closerName).includes(q) ||
        normalizeText(r.pauta).includes(q);

      return matchesStatus && matchesCloser && matchesSearch;
    });
  }, [all, statusFilter, selectedCloser, search]);

  const filteredReunioes = useMemo(() => {
    if (tipoFilter === "Todos") return baseFiltered;
    return baseFiltered.filter((r) => (r.tipo || "Outros") === tipoFilter);
  }, [baseFiltered, tipoFilter]);

  useEffect(() => {
    setListVisibleCount(LIST_PAGE_SIZE);
  }, [statusFilter, selectedCloser, tipoFilter, search]);

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

  // Base (status/responsável/busca, sem o tipo) restrita ao mês em exibição —
  // alimenta tanto as contagens do "Filtros rápidos" quanto o rodapé.
  const monthBaseFiltered = useMemo(() => {
    return baseFiltered.filter((r) => {
      const d = new Date(r.scheduledAt);
      return d.getFullYear() === year && d.getMonth() === month;
    });
  }, [baseFiltered, year, month]);

  const tipoCounts = useMemo(() => {
    const counts: Record<TipoFiltro, number> = { Todos: monthBaseFiltered.length, "Reunião": 0, "Demonstração": 0, "Follow-up": 0, "Fechamento": 0, "Outros": 0 };
    for (const r of monthBaseFiltered) {
      const t = (r.tipo || "Outros") as TipoCompromisso;
      counts[t] = (counts[t] || 0) + 1;
    }
    return counts;
  }, [monthBaseFiltered]);

  // Semana (domingo→sábado) em torno de `currentDate` — visão própria,
  // diferente da Lista (antes "Semana" caía no mesmo bloco da Lista, sem
  // nenhum agrupamento por dia real).
  const weekDays = useMemo(() => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [currentDate]);

  // Tendência real dos últimos 6 meses (scheduledAt é imutável — não sofre o
  // problema de status mutante que impede reconstrução histórica em outras
  // telas desta sessão, ex.: Radar). "Mês atual" aqui é o mês de calendário
  // vigente (hoje), não o mês navegado na grade — KPI de topo é visão geral,
  // independente de navegação.
  const kpiTrend = useMemo(() => {
    const nowD = new Date();
    const buckets = Array.from({ length: 6 }, (_, i) => {
      const d = new Date(nowD.getFullYear(), nowD.getMonth() - (5 - i), 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
    const inBucket = (r: Reuniao, b: { year: number; month: number }) => {
      const d = new Date(r.scheduledAt);
      return d.getFullYear() === b.year && d.getMonth() === b.month;
    };
    const totalAgendado = buckets.map((b) => all.filter((r) => inBucket(r, b)).length);
    const realizadas = buckets.map((b) => all.filter((r) => inBucket(r, b) && r.status === "Concluída").length);
    const totalAtual = totalAgendado[5];
    const totalAnterior = totalAgendado[4];
    const totalDeltaPct = totalAnterior > 0 ? Math.round(((totalAtual - totalAnterior) / totalAnterior) * 100) : null;
    return { totalAgendado, realizadas, totalAtual, totalDeltaPct };
  }, [all]);

  const realizadasComNotas = useMemo(
    () => all.filter((r) => r.status === "Concluída" && (r.relatorio || r.transcricao)).length,
    [all]
  );

  const handlePrev = () => {
    if (view === "mes") setCurrentDate(new Date(year, month - 1, 1));
    else if (view === "semana") {
      const d = new Date(currentDate);
      d.setDate(d.getDate() - 7);
      setCurrentDate(d);
    } else {
      const d = new Date(selectedDayDate);
      d.setDate(d.getDate() - 1);
      setCurrentDate(d);
      setSelectedDayDate(d);
    }
  };

  const handleNext = () => {
    if (view === "mes") setCurrentDate(new Date(year, month + 1, 1));
    else if (view === "semana") {
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 7);
      setCurrentDate(d);
    } else {
      const d = new Date(selectedDayDate);
      d.setDate(d.getDate() + 1);
      setCurrentDate(d);
      setSelectedDayDate(d);
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
    setSelectedDayDate(new Date());
  };

  // Navegação do mini-calendário da sidebar — sempre por mês, independente
  // da view principal (que na "Semana"/"Dia" navega por dia/semana).
  const goToMonth = (delta: number) => setCurrentDate(new Date(year, month + delta, 1));

  const openDay = (d: Date) => {
    setSelectedDayDate(d);
    setView("dia");
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

  // Mesma heurística de palavra-chave usada no backfill histórico
  // (migration 20261006_reunioes_tipo_convidados.sql) — aplicada aqui pra
  // eventos novos importados do Google já nascerem com uma categoria real
  // em vez de cair sempre em "Outros" por omissão.
  const classifyTipo = (text: string): TipoCompromisso => {
    const t = text.toLowerCase();
    if (/(fechamento|contrato|assinatura|closing|renova)/.test(t)) return "Fechamento";
    if (/(demonstra|demo)/.test(t)) return "Demonstração";
    if (/(follow[- ]?up|retorno|acompanhamento|check[- ]?in)/.test(t)) return "Follow-up";
    if (/(reuni|meeting|alinha|kickoff|kick-off|sync|daily|negocia|proposta|onboarding|apresenta)/.test(t)) return "Reunião";
    return "Outros";
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
      tipo: classifyTipo(`${event.summary || ""} ${event.description || ""}`),
    } as Omit<Reuniao, "id" | "createdAt">;
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

  const isGoogleSourced = (r: Reuniao) => !!r.googleEventId || r.companyName === "Google Calendar";

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
          <Card
            onClick={() => openDay(new Date())}
            className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm cursor-pointer hover:border-[var(--color-primary-blue)]/30 transition-colors"
          >
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
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="text-2xl font-black text-[var(--color-text-primary)] font-mono">
                  {kpiTrend.totalAtual}
                </div>
                {kpiTrend.totalDeltaPct !== null ? (
                  <p className={`text-[11px] font-bold mt-1 flex items-center gap-0.5 ${kpiTrend.totalDeltaPct >= 0 ? "text-purple-600 dark:text-purple-400" : "text-rose-500"}`}>
                    {kpiTrend.totalDeltaPct >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                    {Math.abs(kpiTrend.totalDeltaPct)}% vs mês anterior
                  </p>
                ) : (
                  <p className="text-[11px] text-purple-600 dark:text-purple-400 font-bold mt-1">Pipeline ativo de conversão</p>
                )}
              </div>
              <div className="text-purple-500/70 dark:text-purple-400/70 pb-1">
                <Sparkline data={kpiTrend.totalAgendado} className="w-16 h-6" />
              </div>
            </div>
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
            <div className="flex items-end justify-between gap-2">
              <div>
                <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                  {all.filter((r) => r.status === "Concluída").length}
                </div>
                <p className="text-[11px] text-[var(--color-text-faint)] mt-1">
                  {realizadasComNotas} com ata/notas salvas
                </p>
              </div>
              <div className="text-emerald-500/70 dark:text-emerald-400/70 pb-1">
                <Sparkline data={kpiTrend.realizadas} className="w-16 h-6" />
              </div>
            </div>
          </Card>

          <Card
            onClick={() => nextMeeting && openDay(new Date(nextMeeting.scheduledAt))}
            className={`p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm ${nextMeeting ? "cursor-pointer hover:border-amber-400/40 transition-colors" : ""}`}
          >
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
                  {new Date(nextMeeting.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} • {isGoogleSourced(nextMeeting) ? "Google Calendar" : nextMeeting.closerName}
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
                {view === "semana"
                  ? `${weekDays[0].getDate()} – ${weekDays[6].getDate()} ${MONTH_NAMES[weekDays[6].getMonth()]} ${weekDays[6].getFullYear()}`
                  : view === "dia"
                  ? selectedDayDate.toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })
                  : `${MONTH_NAMES[month]} ${year}`}
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

        <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] gap-6 items-start">
        {/* Sidebar: mini-calendário + filtros rápidos por tipo */}
        <div className="space-y-4">
          <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-black text-[var(--color-text-primary)]">
                {MONTH_NAMES[month]} {year}
              </span>
              <div className="flex items-center gap-0.5">
                <Button variant="ghost" size="xs" onClick={() => goToMonth(-1)} className="h-6 w-6 p-0">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="xs" onClick={() => goToMonth(1)} className="h-6 w-6 p-0">
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center mb-1">
              {DOW.map((d) => (
                <span key={d} className="text-[9px] font-bold text-[var(--color-text-faint)] py-1">{d[0]}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {Array.from({ length: firstDayOfWeek }).map((_, i) => <div key={`m-empty-${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, idx) => {
                const dayNum = idx + 1;
                const dayStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                const isToday = dayStr === todayStr;
                const isSelected = view === "dia" && selectedDayDate.getFullYear() === year && selectedDayDate.getMonth() === month && selectedDayDate.getDate() === dayNum;
                const tipos = Array.from(new Set(
                  monthBaseFiltered.filter((r) => r.scheduledAt?.startsWith(dayStr)).map((r) => r.tipo || "Outros")
                )).slice(0, 3);
                return (
                  <button
                    key={dayNum}
                    type="button"
                    onClick={() => openDay(new Date(year, month, dayNum))}
                    className={`aspect-square rounded-md text-[11px] flex flex-col items-center justify-center gap-0.5 cursor-pointer border-none transition-colors ${
                      isSelected
                        ? "bg-[var(--color-primary-blue)] text-white font-bold"
                        : isToday
                        ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] font-bold"
                        : "bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)]"
                    }`}
                  >
                    <span>{dayNum}</span>
                    {tipos.length > 0 && (
                      <span className="flex gap-0.5">
                        {tipos.map((t) => <span key={t} className={`w-1 h-1 rounded-full ${getTipoColor(t).dot}`} />)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Filtros rápidos</h4>
            <div className="space-y-1">
              {(["Todos", ...TIPO_COMPROMISSO_OPTIONS.map((o) => o.id)] as TipoFiltro[]).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTipoFilter(id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-bold cursor-pointer border-none transition-colors ${
                    tipoFilter === id
                      ? "bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)]"
                      : "bg-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)]"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${id === "Todos" ? "bg-[var(--color-text-faint)]" : getTipoColor(id).dot}`} />
                    {id}
                  </span>
                  <span className="font-mono text-[11px]">{tipoCounts[id]}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6 min-w-0">
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
                        const isGoogle = isGoogleSourced(r);
                        const c = getTipoColor(r.tipo);
                        return (
                          <div
                            key={r.id}
                            className={`px-1.5 py-0.5 rounded border text-[10px] font-bold truncate flex items-center gap-1 ${c.bg} ${c.text} ${c.border}`}
                            title={`${r.tipo || "Outros"} — ${r.leadName || r.companyName} (${new Date(r.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})`}
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

        {view === "semana" && (
          <Card className="p-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm overflow-hidden">
            <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-3 mb-4">
              <h3 className="text-xs font-black uppercase tracking-wider text-[var(--color-text-primary)] flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-[var(--color-primary-blue)]" />
                Semana de {weekDays[0].toLocaleDateString("pt-BR", { day: "numeric", month: "short" })} a {weekDays[6].toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}
              </h3>
            </div>
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((d) => {
                const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                const isToday = dStr === todayStr;
                const dayEvents = filteredReunioes
                  .filter((r) => r.scheduledAt?.startsWith(dStr))
                  .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
                return (
                  <div
                    key={dStr}
                    className={`rounded-lg border p-2 min-h-[220px] flex flex-col gap-1.5 ${
                      isToday ? "border-[var(--color-primary-blue)]/40 bg-[var(--color-primary-blue)]/5" : "border-[var(--color-border-subtle)]"
                    }`}
                  >
                    <button type="button" onClick={() => openDay(d)} className="text-left bg-transparent border-none cursor-pointer p-0">
                      <div className="text-[10px] font-black uppercase text-[var(--color-text-faint)]">{DOW[d.getDay()]}</div>
                      <div className={`text-sm font-black ${isToday ? "text-[var(--color-primary-blue)]" : "text-[var(--color-text-primary)]"}`}>{d.getDate()}</div>
                    </button>
                    <div className="space-y-1 flex-1 overflow-y-auto">
                      {dayEvents.length === 0 && <span className="text-[10px] text-[var(--color-text-faint)]">—</span>}
                      {dayEvents.map((r) => {
                        const c = getTipoColor(r.tipo);
                        const hora = new Date(r.scheduledAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                        return (
                          <div
                            key={r.id}
                            onClick={() => openDay(d)}
                            title={`${r.tipo || "Outros"} — ${r.leadName || r.companyName} (${hora})`}
                            className={`px-1.5 py-1 rounded border text-[10px] font-bold truncate cursor-pointer ${c.bg} ${c.text} ${c.border}`}
                          >
                            {isGoogleSourced(r) && <span className="text-[9px]">📅 </span>}
                            {hora} • {r.leadName || r.companyName}
                          </div>
                        );
                      })}
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

        {view === "lista" && (
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

        {view !== "lista" && (
          <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs font-bold text-[var(--color-text-muted)]">
              {monthBaseFiltered.length} {monthBaseFiltered.length === 1 ? "compromisso" : "compromissos"} no mês de {MONTH_NAMES[month].toLowerCase()}
            </p>
            <div className="flex items-center gap-3 flex-wrap text-[10px] font-bold text-[var(--color-text-faint)]">
              {TIPO_COMPROMISSO_OPTIONS.map((o) => (
                <span key={o.id} className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${getTipoColor(o.id).dot}`} />
                  {o.label}
                </span>
              ))}
            </div>
          </Card>
        )}
        </div>
        </div>
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

    </PageContainer>
  );
}
