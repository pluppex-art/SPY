import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useData } from "../../contexts/DataContext";
import { useAuth } from "../../contexts/AuthContext";
import { JitsiEmbed, isJitsiLink, jitsiRoomName } from "../../components/ui/JitsiEmbed";
import { AuroraJitsiVoice } from "../../components/ui/AuroraJitsiVoice";
import { Button } from "../../components/ui/button";
import { NovaReuniaoModal } from "../../components/ui/modals/reunioes/NovaReuniaoModal";
import { ConfirmModal } from "../../components/ui/modals/shared/ConfirmModal";
import { generateJitsiLink } from "../../components/ui/JitsiEmbed";
import { AuroraCore } from "../../components/ui/auroraCore/AuroraCore";
import type { AuroraCoreMode } from "../../components/ui/auroraCore/auroraCoreStates";
import { useAuroraVoice } from "../../hooks/useAuroraVoice";
import { useAuroraMeetingPresence } from "../../hooks/useAuroraMeetingPresence";
import {
  Brain, ArrowLeft, Video, Clock, User, Copy, ExternalLink,
  FileText, Zap, X, CheckCircle2, Calendar, Flame, Snowflake,
  Thermometer, Target, TrendingUp, Loader2, ChevronDown, ChevronUp, Save,
  Download, Ear, Pencil, Trash2, CopyPlus, Users, Plus, Building2, ListChecks, Tag, Link2, Smile, Meh, Frown, Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "../../lib/utils";
import { Reuniao, ReuniaoInsights } from "../../contexts/DataContextTypes";
import type { Lead } from "../../types";
import { apiFetch } from "../../lib/apiClient";
import { supabase } from "../../lib/supabase";
import { handleDownloadDevProjectPdf, type DevProjectPdfData } from "../dev/utils/devProjectPdf";

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function useLiveTimer(startedAt: string | null) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  const m = Math.floor(elapsed / 60).toString().padStart(2, "0");
  const s = (elapsed % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const TEMP_CONFIG: Record<string, { label: string; icon: typeof Flame; color: string; bg: string }> = {
  quente: { label: "Quente", icon: Flame,       color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
  morno:  { label: "Morno",  icon: Thermometer, color: "text-amber-400",  bg: "bg-amber-500/10 border-amber-500/20"  },
  frio:   { label: "Frio",   icon: Snowflake,   color: "text-sky-400",    bg: "bg-sky-500/10 border-sky-500/20"     },
};

export default function ReuniaoRoom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { reunioes, leads, clienteBase, tasks, addTask, updateTask, addReuniao, deleteReuniao, updateReuniao, addLeadActivity } = useData();
  const { user } = useAuth();

  const [notes, setNotes] = useState("");
  const [transcript, setTranscript] = useState("");
  const [ending, setEnding] = useState(false);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportText, setReportText] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [startedAt] = useState<string | null>(new Date().toISOString());
  const [reportExpanded, setReportExpanded] = useState(false);
  const [sdrExpanded, setSdrExpanded] = useState(true);
  const noteSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gerarInsightsRef = useRef<(() => Promise<void>) | null>(null);
  const [tab, setTab] = useState<"notas" | "transcricao" | "resumo">("notas");
  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDate, setNewTaskDate] = useState("");
  const [insightsLocal, setInsightsLocal] = useState<ReuniaoInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [passosCriados, setPassosCriados] = useState<Set<string>>(new Set());

  // Análise da Aurora (botão manual, "resumo completo agora" — grava de verdade no CRM).
  const [auroraLoading, setAuroraLoading] = useState(false);
  const [auroraOutput, setAuroraOutput] = useState("");
  const [auroraError, setAuroraError] = useState<string | null>(null);
  const [auroraSpeaking, setAuroraSpeaking] = useState(false);
  const [auroraSaved, setAuroraSaved] = useState(false);
  const [devProjectForPdf, setDevProjectForPdf] = useState<DevProjectPdfData | null>(null);
  const auroraVoice = useAuroraVoice(() => {});
  const auroraCoreMode: AuroraCoreMode = auroraError ? "error" : auroraLoading ? "thinking" : auroraSpeaking ? "speaking" : "idle";

  const timer = useLiveTimer(startedAt);
  const reuniao = (reunioes as Reuniao[]).find((r) => r.id === id);
  const lead: Lead | undefined = reuniao
    ? (leads as Lead[]).find((l) => l.id === reuniao.leadId)
    : undefined;

  const leadContext = {
    name: reuniao?.leadName ?? lead?.name,
    company: reuniao?.companyName ?? lead?.company,
    iaSummary: lead?.iaSummary,
    scoreIA: lead?.scoreIA,
    temperature: lead?.temperature,
    lead_interesse: lead?.lead_interesse_cliente,
    pauta: reuniao?.pauta,
  };

  const meetingSessionId = reuniao?.id ? `aurora-reuniao-${reuniao.id}` : undefined;
  const meetingIsActive = !!reuniao && reuniao.status !== "Concluída" && reuniao.status !== "Cancelada";
  const meetingIsJitsi = !!reuniao && isJitsiLink(reuniao.meetLink);

  // Presença contínua da Aurora na reunião — substitui o antigo Copilot IA (Painel 3): ela
  // ouve sozinha (sem precisar de um clique), e só interrompe em voz alta quando decide que
  // vale a pena. `pendingSpeech` é o gatilho que a AuroraJitsiVoice usa pra realmente falar
  // dentro da call.
  const [pendingSpeech, setPendingSpeech] = useState<{ id: string; audioBase64: string } | null>(null);
  const [jitsiVoiceStatus, setJitsiVoiceStatus] = useState<"connecting" | "connected" | "speaking" | "error" | "idle">("idle");
  const meetingPresence = useAuroraMeetingPresence(
    reuniao?.id,
    leadContext,
    meetingIsActive,
    (audioBase64, _text) => setPendingSpeech({ id: crypto.randomUUID(), audioBase64 }),
    setTranscript
  );

  // Auto-save notes to Supabase with debounce
  const saveNotes = useCallback((value: string) => {
    if (!reuniao?.id) return;
    if (noteSaveRef.current) clearTimeout(noteSaveRef.current);
    noteSaveRef.current = setTimeout(() => {
      updateReuniao(reuniao.id, { notas_closer: value });
    }, 1500);
  }, [reuniao?.id, updateReuniao]);

  useEffect(() => {
    if (reuniao?.notas_closer) setNotes(reuniao.notas_closer);
    if (reuniao?.transcricao) setTranscript(reuniao.transcricao);
    if (reuniao?.relatorio_ia) { setReportText(reuniao.relatorio_ia); setShowReport(true); }
  }, [reuniao?.id]);

  if (!reuniao) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-[var(--color-surface)] text-slate-500 gap-4">
        <Video className="w-10 h-10 opacity-20" />
        <p className="font-semibold">Reunião não encontrada</p>
        <button onClick={() => navigate("/app/reunioes")} className="text-blue-400 hover:underline text-sm">
          ← Voltar para Reuniões
        </button>
      </div>
    );
  }

  const isActive = meetingIsActive;
  const initials = ((reuniao.companyName || reuniao.leadName || "R").slice(0, 2)).toUpperCase();
  const tempCfg = lead?.temperature ? TEMP_CONFIG[lead.temperature] : null;
  const scoreColor = !lead?.scoreIA ? "text-slate-400" :
    lead.scoreIA >= 70 ? "text-emerald-400" : lead.scoreIA >= 40 ? "text-amber-400" : "text-rose-400";

  const handleEnd = async () => {
    setEnding(true);
    setGeneratingReport(true);
    try {
      const res = await apiFetch("/api/ai/reuniao-relatorio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reuniaoId: reuniao.id,
          transcript,
          notes,
          leadContext,
          pauta: reuniao.pauta,
        }),
      });
      const data = await res.json();
      if (data.relatorio) {
        setReportText(data.relatorio);
        setShowReport(true);
        setReportExpanded(true);
        updateReuniao(reuniao.id, {
          status: "Concluída",
          relatorio_ia: data.relatorio,
          transcricao: transcript,
          notas_closer: notes,
        });
        toast.success("Reunião encerrada! Relatório IA gerado.");
        setTimeout(() => { void gerarInsightsRef.current?.(); }, 1500);
      }
    } catch {
      updateReuniao(reuniao.id, { status: "Concluída", transcricao: transcript, notas_closer: notes });
      toast.success("Reunião encerrada.");
    } finally {
      setGeneratingReport(false);
    }
  };

  const copyMeetLink = () => {
    navigator.clipboard.writeText(reuniao.meetLink ?? "");
    toast.success("Link copiado!");
  };

  const analyzeWithAurora = async () => {
    if (!transcript.trim() || auroraLoading) return;
    auroraVoice.primeAudio();
    setAuroraLoading(true);
    setAuroraError(null);
    setAuroraSaved(false);
    setDevProjectForPdf(null);

    // Marca o instante do pedido — depois, se a Aurora criar um projeto de dev, achamos ele
    // filtrando por created_at > startedAt (ela não devolve o id estruturado, só narra em texto).
    const startedAt = new Date().toISOString();

    const contextoLead = leadContext.name
      ? `Cliente/Lead: ${leadContext.name}${leadContext.company ? ` (${leadContext.company})` : ""}${lead?.id ? ` | lead_id: ${lead.id}` : ""}\n`
      : "";
    // Autorização explícita do Gustavo pra esta ação específica (clicar neste botão É a
    // confirmação) — por isso, diferente de uma conversa normal, aqui ela pode de fato criar/
    // atualizar o lead e as tarefas, não só sugerir em texto.
    const message = `Aurora, esta é uma reunião que acabei de ter — analise e já registre o que for relevante no S.P.Y..\n\n${contextoLead}${reuniao.pauta ? `Pauta: ${reuniao.pauta}\n` : ""}\nTranscrição da reunião:\n"""\n${transcript}\n"""\n\nMe dê um resumo objetivo, os problemas ou erros que você identificou, e as soluções que recomenda. Além disso, você está autorizada a agir diretamente a partir desta reunião — sem precisar de outra confirmação minha nesta conversa: se o lead ainda não existe, cadastre-o; se existir, atualize status/próxima ação; e crie as tarefas e atividades que fizerem sentido a partir do que foi discutido. Se você identificar que falta uma funcionalidade/ferramenta pra atender isso, registre um projeto real no módulo Dev do S.P.Y. (com uma estimativa de valor quando o escopo permitir) e as tarefas de sprint que fizerem sentido. Me diga no final exatamente o que você registrou de verdade.`;

    try {
      const res = await apiFetch("/api/ai/aurora-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, sessionId: meetingSessionId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Aurora está indisponível agora.");
      setAuroraOutput(data.output ?? "");
      if (data.audioBase64) {
        // Esse áudio narra a análise PRIVADA (pontuação do lead, problemas identificados, o
        // que foi registrado no S.P.Y.) — toca só localmente pra você, nunca dentro da call.
        auroraVoice.playAudioBase64(data.audioBase64, () => setAuroraSpeaking(true), () => setAuroraSpeaking(false));
      }

      // Se a sala estiver ativa e conectada via Jitsi, pede uma SEGUNDA resposta — curta, já
      // pensada pra ser dita em voz alta pra todo mundo (incluindo o cliente), sem pontuação de
      // lead nem detalhe interno do CRM. É esse áudio que a AuroraJitsiVoice publica na call.
      if (meetingIsJitsi && meetingIsActive && meetingSessionId) {
        try {
          const resFalar = await apiFetch("/api/ai/aurora-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: `Com base no que você acabou de analisar e registrar nesta mesma conversa, o Gustavo está te chamando pra participar da reunião agora, com o cliente presente na call. Diga em voz alta, agora, algo que agregue à conversa (um resumo rápido, uma sugestão, uma resposta a um ponto em aberto, ou uma mensagem apropriada pro momento). Sua resposta TEM que ser exatamente e somente o que você vai falar — nada de pontuação de lead, análises internas do CRM ou qualquer coisa que não deveria ser dita na frente do cliente.`,
              sessionId: meetingSessionId,
            }),
          });
          const dataFalar = await resFalar.json();
          if (resFalar.ok && !dataFalar.error && dataFalar.audioBase64) {
            setPendingSpeech({ id: crypto.randomUUID(), audioBase64: dataFalar.audioBase64 });
          }
        } catch {
          // Best-effort — a análise privada acima já foi salva e mostrada; não bloqueia o fluxo
          // principal se ela não conseguir falar na call desta vez.
        }
      }

      if (supabase) {
        const { data: novosProjetos } = await supabase
          .from("dev_projects")
          .select("*")
          .gt("created_at", startedAt)
          .order("created_at", { ascending: false })
          .limit(1);
        if (novosProjetos && novosProjetos[0]) {
          setDevProjectForPdf(novosProjetos[0] as DevProjectPdfData);
        }
      }
    } catch (err: any) {
      setAuroraError(err.message ?? "Falha ao falar com a Aurora.");
    } finally {
      setAuroraLoading(false);
    }
  };

  const saveAuroraAsActivity = () => {
    if (!lead?.id || !auroraOutput) return;
    addLeadActivity(lead.id, "Reunião", "Análise da Aurora", auroraOutput, user?.name || reuniao.closerName || "Aurora");
    setAuroraSaved(true);
    toast.success("Análise salva como atividade no lead.");
  };


  // ── Novas ações do layout ──
  const gerarInsights = async () => {
    if (insightsLoading) return;
    setInsightsLoading(true);
    try {
      const res = await apiFetch("/api/ai/reuniao-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reuniaoId: reuniao.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? "Falha ao gerar insights.");
      setInsightsLocal(data.insights as ReuniaoInsights);
    } catch (err: any) {
      toast.error(err?.message || "Falha ao gerar insights.");
    } finally {
      setInsightsLoading(false);
    }
  };
  gerarInsightsRef.current = gerarInsights;
  const insights: ReuniaoInsights | null = insightsLocal ?? reuniao.insights_ia ?? null;
  const podeGerarInsights = !!(reuniao.relatorio_ia || reuniao.transcricao || reuniao.notas_closer || reportText || transcript.trim() || notes.trim());

  const criarTarefaSugerida = async (titulo: string, prazoDias: number) => {
    if (!lead) return;
    await addTask({
      lead_id: lead.id,
      title: titulo,
      description: `Sugerida pela Aurora na reunião "${reuniao.companyName || reuniao.leadName}".`,
      status: "Em Aberto",
      priority: "Média",
      due_date: new Date(Date.now() + prazoDias * 86400000).toISOString(),
    });
    setPassosCriados((prev) => new Set(prev).add(titulo));
    toast.success("Tarefa criada.");
  };

  const notesDirty = notes !== (reuniao.notas_closer || "");
  const saveNotesNow = () => {
    if (noteSaveRef.current) clearTimeout(noteSaveRef.current);
    updateReuniao(reuniao.id, { notas_closer: notes });
    toast.success("Notas salvas.");
  };

  const handleStatusChange = (status: Reuniao["status"]) => {
    updateReuniao(reuniao.id, { status });
    toast.success(`Status alterado para ${status}.`);
  };

  const handleDuplicate = async () => {
    const novoId = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const quando = new Date(new Date(reuniao.scheduledAt).getTime() + 7 * 86400000);
    const jitsi = isJitsiLink(reuniao.meetLink);
    const copia = await addReuniao({
      id: novoId,
      leadId: reuniao.leadId,
      clienteId: reuniao.clienteId,
      leadName: reuniao.leadName,
      companyName: reuniao.companyName,
      leadEmail: reuniao.leadEmail,
      closerName: reuniao.closerName,
      closerEmail: reuniao.closerEmail,
      convidados: reuniao.convidados || [],
      scheduledAt: quando.toISOString(),
      durationMinutes: reuniao.durationMinutes,
      meetLink: jitsi ? generateJitsiLink(novoId) : reuniao.meetLink,
      status: "Agendada",
      pauta: reuniao.pauta,
      tipo: reuniao.tipo,
      escopo: reuniao.escopo,
    } as any);
    if (!copia) return;
    toast.success(`Reunião duplicada para ${quando.toLocaleDateString("pt-BR")} — ajuste a data se precisar.`);
    navigate(`/app/reunioes/${novoId}`);
  };

  const handleDelete = () => {
    deleteReuniao(reuniao.id);
    toast.success("Reunião excluída com sucesso!");
    navigate("/app/reunioes");
  };

  const start = new Date(reuniao.scheduledAt);
  const end = new Date(start.getTime() + (reuniao.durationMinutes || 60) * 60000);
  const hhmm = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const dateOnly = start.toLocaleDateString("pt-BR");
  const l = reuniao.meetLink || "";
  const formatoLabel = reuniao.googleEventId ? "Google Calendar"
    : l.startsWith("Presencial") ? l
    : l.includes("meet.google.com") ? "Google Meet"
    : l.includes("meet.jit.si") ? "Sala S.P.Y. (Jitsi)"
    : l ? "Link externo" : "Sem link";
  const linkAbrivel = /^https:\/\//i.test(l);
  const cliente = (clienteBase as any[]).find((c) => c.id === (reuniao.clienteId || lead?.clientId)) || null;
  const tarefasDoLead = lead
    ? (tasks as any[])
        .filter((t) => t.lead_id === lead.id && !t.deleted_at)
        .sort((a, b) => new Date(a.due_date || 0).getTime() - new Date(b.due_date || 0).getTime())
    : [];

  const criarTarefa = async () => {
    if (!lead || !newTaskTitle.trim()) return;
    await addTask({
      lead_id: lead.id,
      title: newTaskTitle.trim(),
      description: `Criada a partir da reunião "${reuniao.companyName || reuniao.leadName}".`,
      status: "Em Aberto",
      priority: "Média",
      due_date: newTaskDate ? new Date(`${newTaskDate}T12:00:00`).toISOString() : new Date().toISOString(),
    });
    setNewTaskTitle(""); setNewTaskDate(""); setShowTaskForm(false);
    toast.success("Tarefa criada.");
  };

  const STATUS_TONE: Record<string, string> = {
    Agendada: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
    "Em Andamento": "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20",
    Concluída: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
    Cancelada: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  };
  const card = "rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] shadow-sm";
  const sectionTitle = "text-xs font-black text-[var(--color-text-primary)] flex items-center gap-2";
  const ghostBtn = "h-9 px-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-xs font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] transition-all inline-flex items-center gap-1.5 cursor-pointer";

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)] overflow-hidden">

      {/* ── Top bar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate("/app/reunioes")}
            className="h-10 w-10 flex items-center justify-center rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-all cursor-pointer"
            title="Voltar"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-11 h-11 rounded-xl bg-[var(--color-primary-blue)]/10 flex items-center justify-center text-sm font-black text-[var(--color-primary-blue)] select-none shrink-0">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-base font-black text-[var(--color-text-primary)] leading-tight truncate">{reuniao.companyName || reuniao.leadName}</p>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1"><User className="w-3 h-3" /> Com {reuniao.closerName || "—"}</span>
              <span>•</span>
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDateTime(reuniao.scheduledAt)}</span>
              <span>•</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {reuniao.durationMinutes} minutos</span>
            </p>
          </div>
          <select
            value={reuniao.status}
            onChange={(e) => handleStatusChange(e.target.value as Reuniao["status"])}
            className={cn("h-8 px-2.5 rounded-lg border text-xs font-black cursor-pointer focus:outline-none", STATUS_TONE[reuniao.status] ?? STATUS_TONE.Agendada)}
            title="Alterar status"
          >
            {(["Agendada", "Em Andamento", "Concluída", "Cancelada"] as const).map((st) => <option key={st} value={st}>{st}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {isActive && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
              <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              <span className="text-xs font-black text-rose-500 tabular-nums">{timer}</span>
            </div>
          )}
          <button onClick={() => setShowEdit(true)} className={ghostBtn}><Pencil className="w-3.5 h-3.5" /> Editar</button>
          <button onClick={handleDuplicate} className={ghostBtn}><CopyPlus className="w-3.5 h-3.5" /> Duplicar</button>
          <button onClick={() => setShowDelete(true)} className={cn(ghostBtn, "text-rose-500 border-rose-500/30 hover:bg-rose-500/10")}><Trash2 className="w-3.5 h-3.5" /> Excluir</button>
          {linkAbrivel && (
            <a href={reuniao.meetLink} target="_blank" rel="noopener noreferrer">
              <Button className="h-9 px-4 text-xs font-black gap-2">
                <Video className="w-3.5 h-3.5" /> {l.includes("meet.google.com") ? "Abrir Google Meet" : "Abrir link"}
                <ExternalLink className="w-3 h-3 opacity-70" />
              </Button>
            </a>
          )}
          {isActive && (
            <Button
              onClick={handleEnd}
              disabled={ending}
              className="h-9 px-4 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs gap-2"
            >
              {generatingReport ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
              {generatingReport ? "Gerando relatório..." : "Encerrar"}
            </Button>
          )}
        </div>
      </div>

      {/* ── Corpo em 3 colunas ── */}
      <div className="flex flex-1 overflow-hidden flex-col lg:flex-row">

        {/* ════ COLUNA 1 — Sala + abas + Aurora ════ */}
        <div className="flex flex-col lg:w-[50%] lg:border-r border-[var(--color-border-subtle)] overflow-y-auto p-4 gap-4">

          {/* Vídeo / sala */}
          {isJitsiLink(reuniao.meetLink) ? (
            <div className="relative rounded-2xl overflow-hidden border border-[var(--color-border-default)] bg-black shrink-0" style={{ height: "420px" }}>
              <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-3 py-2 bg-black/60 backdrop-blur-sm">
                <div className="flex items-center gap-1.5">
                  {isActive
                    ? <><div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /><span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Ao Vivo</span></>
                    : <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">Encerrada</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={copyMeetLink} className="flex items-center gap-1.5 px-2 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] text-white font-bold cursor-pointer border-none">
                    <Copy className="w-3 h-3" /> Link
                  </button>
                  <a href={reuniao.meetLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2 py-1 bg-white/10 hover:bg-white/20 rounded-lg text-[10px] text-white">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              <div className="absolute inset-0 pt-9">
                <JitsiEmbed
                  roomName={jitsiRoomName(reuniao.meetLink)}
                  displayName={reuniao.closerName || "Closer"}
                  email={reuniao.closerEmail}
                  onLeave={isActive ? handleEnd : undefined}
                />
              </div>
            </div>
          ) : (
            <div className={cn(card, "overflow-hidden shrink-0")}>
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)]">
                <span className="text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5">
                  {isActive
                    ? <><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /><span className="text-emerald-600 dark:text-emerald-400">Sala Ativa</span></>
                    : <span className="text-[var(--color-text-muted)]">Reunião {reuniao.status === "Cancelada" ? "Cancelada" : "Concluída"}</span>}
                </span>
                <div className="flex items-center gap-2">
                  {l && !l.startsWith("Presencial") && (
                    <button onClick={copyMeetLink} className={cn(ghostBtn, "h-8 text-[10px]")}><Copy className="w-3 h-3" /> Copiar link</button>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-center justify-center py-8 px-6 text-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary-blue)]/10 flex items-center justify-center">
                  {l.startsWith("Presencial") ? <Building2 className="w-8 h-8 text-[var(--color-primary-blue)]" /> : <Video className="w-8 h-8 text-[var(--color-primary-blue)]" />}
                </div>
                <div>
                  <p className="font-black text-[var(--color-text-primary)] text-sm">
                    {l.startsWith("Presencial") ? "Reunião presencial" : `${formatoLabel} — abre em nova aba`}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-1 leading-relaxed max-w-sm">
                    {l.startsWith("Presencial")
                      ? l.replace(/^Presencial:?\s*/, "") || "Local a combinar"
                      : 'Reuniões criadas como "Sala S.P.Y." ficam embutidas aqui; as demais abrem no serviço de origem.'}
                  </p>
                </div>
                {linkAbrivel && (
                  <a href={reuniao.meetLink} target="_blank" rel="noopener noreferrer">
                    <Button className="h-10 px-5 text-xs font-black gap-2"><Video className="w-4 h-4" /> {l.includes("meet.google.com") ? "Abrir Google Meet" : "Abrir link"} <ExternalLink className="w-3.5 h-3.5 opacity-70" /></Button>
                  </a>
                )}
                {reuniao.pauta && (
                  <div className="w-full px-4 py-3 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-xl text-left mt-1">
                    <p className="text-[9px] font-black text-[var(--color-text-faint)] uppercase tracking-widest mb-1">Pauta</p>
                    <p className="text-xs text-[var(--color-text-muted)] leading-relaxed whitespace-pre-wrap">{reuniao.pauta}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Abas: notas / transcrição / resumo */}
          <div className={cn(card, "overflow-hidden shrink-0")}>
            <div className="flex items-center gap-1 px-3 border-b border-[var(--color-border-subtle)]">
              {([
                { id: "notas" as const, label: "Notas do Closer", icon: FileText },
                { id: "transcricao" as const, label: "Transcrição (IA)", icon: Ear },
                { id: "resumo" as const, label: "Resumo da Aurora", icon: Brain },
              ]).map(({ id: tid, label, icon: Icon }) => (
                <button
                  key={tid}
                  onClick={() => setTab(tid)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-3 text-xs font-bold border-b-2 transition-all cursor-pointer bg-transparent border-x-0 border-t-0",
                    tab === tid
                      ? "border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]"
                      : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>

            <div className="p-4">
              {tab === "notas" && (
                <div className="space-y-2">
                  <textarea
                    value={notes}
                    maxLength={2000}
                    onChange={(e) => { setNotes(e.target.value); saveNotes(e.target.value); }}
                    placeholder="Anotações em tempo real — objeções, pontos de interesse, decisões, próximos passos..."
                    className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl p-3 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40 transition-all resize-none placeholder:text-[var(--color-text-faint)] min-h-[160px]"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-[var(--color-text-faint)]">{notes.length}/2000</span>
                    <div className="flex items-center gap-3">
                      <span className={cn("text-[11px] flex items-center gap-1", notesDirty ? "text-amber-500" : "text-emerald-600 dark:text-emerald-400")}>
                        {notesDirty ? <><Loader2 className="w-3 h-3 animate-spin" /> Salvando...</> : <><CheckCircle2 className="w-3 h-3" /> Salvo automaticamente</>}
                      </span>
                      <Button onClick={saveNotesNow} disabled={!notesDirty} className="h-9 px-4 text-xs font-black gap-1.5">
                        <Save className="w-3.5 h-3.5" /> Salvar notas
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {tab === "transcricao" && (
                transcript.trim() ? (
                  <pre className="text-xs text-[var(--color-text-muted)] whitespace-pre-wrap font-sans leading-relaxed max-h-80 overflow-y-auto">{transcript}</pre>
                ) : (
                  <div className="flex flex-col items-center py-8 gap-2 text-center">
                    <Ear className="w-6 h-6 text-[var(--color-text-faint)]" />
                    <p className="text-xs text-[var(--color-text-faint)]">A transcrição aparece aqui conforme a Aurora ouve a reunião.</p>
                  </div>
                )
              )}

              {tab === "resumo" && (
                reportText || auroraOutput ? (
                  <div className="space-y-3 max-h-80 overflow-y-auto">
                    {reportText && (
                      <div>
                        <p className="text-[10px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-widest mb-1">Relatório pós-reunião</p>
                        <pre className="text-xs text-[var(--color-text-muted)] whitespace-pre-wrap font-sans leading-relaxed">{reportText}</pre>
                      </div>
                    )}
                    {auroraOutput && (
                      <div>
                        <p className="text-[10px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-widest mb-1">Análise da Aurora</p>
                        <pre className="text-xs text-[var(--color-text-muted)] whitespace-pre-wrap font-sans leading-relaxed">{auroraOutput}</pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-8 gap-2 text-center">
                    <Brain className="w-6 h-6 text-[var(--color-text-faint)]" />
                    <p className="text-xs text-[var(--color-text-faint)]">O resumo aparece depois de encerrar a reunião ou pedir a análise da Aurora.</p>
                  </div>
                )
              )}
            </div>
          </div>

          {/* Análise da Aurora */}
          <div className={cn(card, "p-4 space-y-3 shrink-0")}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <AuroraCore mode={auroraCoreMode} size={36} />
                <div>
                  <h4 className="text-sm font-black text-[var(--color-text-primary)]">Análise da Aurora</h4>
                  <p className="text-[11px] text-[var(--color-text-muted)]">Insights automáticos da reunião, transcrição e próximos passos.</p>
                </div>
              </div>
              <button
                onClick={analyzeWithAurora}
                disabled={auroraLoading || !transcript.trim()}
                className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-500 rounded-xl text-xs font-black text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border-none"
              >
                {auroraLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Brain className="w-3.5 h-3.5" />}
                {auroraLoading ? "Analisando..." : "Analisar reunião com a Aurora"}
              </button>
            </div>

            {!transcript.trim() && !auroraOutput && (
              <p className="text-[11px] text-[var(--color-text-faint)]">Precisa de transcrição (a Aurora ouve a reunião automaticamente quando a sala está ativa) antes de pedir a análise.</p>
            )}

            {auroraError && (
              <div className="p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                <p className="text-[11px] text-rose-500 leading-relaxed">{auroraError}</p>
              </div>
            )}

            {auroraOutput && (
              <div className="space-y-2">
                <div className="px-4 py-3 bg-violet-500/[0.06] border border-violet-500/15 rounded-xl">
                  <pre className="text-[11px] text-[var(--color-text-muted)] whitespace-pre-wrap font-sans leading-relaxed">{auroraOutput}</pre>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {lead?.id && (
                    <button
                      onClick={saveAuroraAsActivity}
                      disabled={auroraSaved}
                      className={cn(ghostBtn, "h-8 text-[11px] disabled:opacity-40 disabled:cursor-not-allowed")}
                    >
                      {auroraSaved ? <CheckCircle2 className="w-3 h-3 text-emerald-500" /> : <Save className="w-3 h-3" />}
                      {auroraSaved ? "Salva no lead" : "Salvar como atividade no lead"}
                    </button>
                  )}
                  {devProjectForPdf && (
                    <button
                      onClick={() => handleDownloadDevProjectPdf(devProjectForPdf)}
                      className="flex items-center gap-1.5 px-3 h-8 bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/25 rounded-xl text-[11px] font-bold text-emerald-600 dark:text-emerald-400 transition-all cursor-pointer"
                    >
                      <Download className="w-3 h-3" /> Baixar PDF: {devProjectForPdf.name}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Relatório IA pós-reunião */}
          {showReport && reportText && (
            <div className="shrink-0">
              <button
                onClick={() => setReportExpanded(!reportExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 bg-violet-500/[0.08] border border-violet-500/20 rounded-2xl text-violet-600 dark:text-violet-400 font-black text-xs hover:bg-violet-500/15 transition-all cursor-pointer"
              >
                <span className="flex items-center gap-2"><Brain className="w-4 h-4" /> Relatório IA Pós-Reunião</span>
                {reportExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {reportExpanded && (
                <div className={cn(card, "mt-2 px-4 py-4 overflow-y-auto max-h-96")}>
                  <pre className="text-[11px] text-[var(--color-text-muted)] whitespace-pre-wrap font-sans leading-relaxed">{reportText}</pre>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ════ COLUNA 2 — Informações, participantes, lead, cliente ════ */}
        <div className="lg:w-[22%] lg:border-r border-[var(--color-border-subtle)] overflow-y-auto p-4 space-y-4">
          <div className={cn(card, "p-4 space-y-3")}>
            <h4 className={sectionTitle}><FileText className="w-4 h-4 text-[var(--color-text-muted)]" /> Informações da Reunião</h4>
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[var(--color-primary-blue)]/10 flex items-center justify-center text-sm font-black text-[var(--color-primary-blue)] shrink-0">{initials}</div>
              <div className="min-w-0 flex-1">
                <p className="font-black text-sm text-[var(--color-text-primary)] truncate">{reuniao.companyName || reuniao.leadName}</p>
                <p className="text-[11px] text-[var(--color-text-muted)]">{reuniao.escopo || "Reunião"}</p>
              </div>
              <span className={cn("text-[10px] font-black px-2 py-0.5 rounded-full border shrink-0", STATUS_TONE[reuniao.status] ?? STATUS_TONE.Agendada)}>{reuniao.status}</span>
            </div>
            <div className="space-y-2 text-xs text-[var(--color-text-muted)]">
              <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 shrink-0" /> {dateOnly}</div>
              <div className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 shrink-0" /> {hhmm(start)} - {hhmm(end)} ({reuniao.durationMinutes} minutos)</div>
              <div className="flex items-center gap-2"><Video className="w-3.5 h-3.5 shrink-0" /> <span className="truncate">{formatoLabel}</span></div>
              <div className="flex items-start gap-2"><User className="w-3.5 h-3.5 shrink-0 mt-0.5" /> <div><p className="text-[var(--color-text-primary)] font-bold">{reuniao.closerName || "Não definido"}</p><p className="text-[10px] text-[var(--color-text-faint)]">Responsável</p></div></div>
            </div>
          </div>

          <div className={cn(card, "p-4 space-y-3")}>
            <div className="flex items-center justify-between">
              <h4 className={sectionTitle}><Users className="w-4 h-4 text-[var(--color-text-muted)]" /> Participantes ({1 + (reuniao.convidados?.length || 0)})</h4>
              <button onClick={() => setShowEdit(true)} className={cn(ghostBtn, "h-8 text-[11px]")}><Plus className="w-3 h-3" /> Convidar</button>
            </div>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] text-[11px] font-black flex items-center justify-center shrink-0">
                {(reuniao.closerName || "?").split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{reuniao.closerName || "—"}</p>
                <p className="text-[10px] text-[var(--color-text-faint)] truncate">{reuniao.closerEmail || "Organizador"}</p>
              </div>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 shrink-0">Responsável</span>
            </div>
            {(reuniao.convidados || []).map((email) => (
              <div key={email} className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] text-[11px] font-black flex items-center justify-center shrink-0">
                  {email.slice(0, 2).toUpperCase()}
                </div>
                <p className="text-xs text-[var(--color-text-muted)] truncate">{email}</p>
              </div>
            ))}
          </div>

          <div className={cn(card, "p-4 space-y-3")}>
            <div className="flex items-center justify-between">
              <h4 className={sectionTitle}><User className="w-4 h-4 text-[var(--color-text-muted)]" /> Lead vinculado</h4>
              {lead && (
                <button onClick={() => navigate(`/app/crm/pipeline?lead=${lead.id}`)} className="p-1.5 rounded-lg text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)] cursor-pointer bg-transparent border-none" title="Abrir no pipeline">
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {lead ? (
              <>
                <div>
                  <p className="text-sm font-black text-[var(--color-text-primary)]">{lead.name}</p>
                  {lead.company && <p className="text-[11px] text-[var(--color-text-muted)]">{lead.company}</p>}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {lead.scoreIA !== undefined && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-lg">
                      <Target className="w-3 h-3 text-[var(--color-text-faint)]" />
                      <span className={`text-xs font-black ${scoreColor}`}>{lead.scoreIA}</span>
                    </span>
                  )}
                  {tempCfg && (
                    <span className={cn("flex items-center gap-1.5 px-2.5 py-1 border rounded-lg", tempCfg.bg)}>
                      <tempCfg.icon className={cn("w-3 h-3", tempCfg.color)} />
                      <span className={cn("text-[10px] font-black", tempCfg.color)}>{tempCfg.label}</span>
                    </span>
                  )}
                </div>
                {lead.lead_interesse_cliente && (
                  <div className="px-3 py-2 bg-[var(--color-primary-blue)]/[0.06] border border-[var(--color-primary-blue)]/15 rounded-xl">
                    <p className="text-[9px] font-black text-[var(--color-primary-blue)] uppercase tracking-widest mb-0.5">Interesse</p>
                    <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">{lead.lead_interesse_cliente}</p>
                  </div>
                )}
                {lead.source && (
                  <div className="flex items-center gap-2 text-[11px] text-[var(--color-text-muted)]"><Zap className="w-3 h-3 shrink-0" /> Origem: {lead.source}</div>
                )}
                {lead.iaSummary && (
                  <div>
                    <button onClick={() => setSdrExpanded(!sdrExpanded)} className="w-full flex items-center justify-between text-[10px] font-black text-[var(--color-text-muted)] uppercase tracking-widest cursor-pointer bg-transparent border-none p-0">
                      <span className="flex items-center gap-1.5"><TrendingUp className="w-3 h-3 text-violet-500" /> Relatório SDR</span>
                      {sdrExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    {sdrExpanded && (
                      <div className="mt-2 px-3 py-3 bg-violet-500/[0.05] border border-violet-500/10 rounded-xl max-h-60 overflow-y-auto">
                        <pre className="text-[10px] text-[var(--color-text-muted)] whitespace-pre-wrap font-sans leading-relaxed">{lead.iaSummary}</pre>
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <p className="text-xs text-[var(--color-text-faint)] text-center py-1">— Sem lead vinculado —</p>
                <button onClick={() => setShowEdit(true)} className={cn(ghostBtn, "w-full justify-center text-[11px]")}><Link2 className="w-3 h-3" /> Vincular lead</button>
              </>
            )}
          </div>

          <div className={cn(card, "p-4 space-y-3")}>
            <h4 className={sectionTitle}><Building2 className="w-4 h-4 text-[var(--color-text-muted)]" /> Cliente</h4>
            {cliente ? (
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0"><Building2 className="w-5 h-5" /></div>
                <div className="min-w-0">
                  <p className="text-sm font-black text-[var(--color-text-primary)] truncate">{cliente.name}</p>
                  <p className="text-[11px] text-[var(--color-text-muted)] truncate">{cliente.industry || "Setor não informado"}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-[var(--color-text-faint)]">Nenhum cliente vinculado a esta reunião.</p>
            )}
          </div>

          <div className={cn(card, "p-4 space-y-3")}>
            <div className="flex items-center justify-between">
              <h4 className={sectionTitle}><Tag className="w-4 h-4 text-[var(--color-text-muted)]" /> Classificação</h4>
              <button onClick={() => setShowEdit(true)} className={cn(ghostBtn, "h-8 text-[11px]")}>Gerenciar</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2.5 py-1 rounded-lg bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] text-[11px] font-bold">{reuniao.tipo || "Outros"}</span>
              {reuniao.escopo && <span className="px-2.5 py-1 rounded-lg bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] text-[11px] font-bold">{reuniao.escopo}</span>}
            </div>
          </div>
        </div>

        {/* ════ COLUNA 3 — Aurora ao vivo + próximos passos ════ */}
        <div className="lg:w-[28%] flex flex-col overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-[var(--color-border-subtle)] shrink-0">
            <h3 className="text-xs font-black text-violet-600 dark:text-violet-400 flex items-center gap-2">
              <AuroraCore
                mode={meetingPresence.status === "analyzing" ? "thinking" : meetingPresence.status === "error" ? "error" : "idle"}
                size={18}
              />
              AURORA — AO VIVO
            </h3>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-1 leading-relaxed flex items-center gap-1.5">
              <Ear className="w-3 h-3 shrink-0" />
              {meetingPresence.status === "listening" && "Ouvindo a reunião em segundo plano — fala só quando vale a pena."}
              {meetingPresence.status === "analyzing" && "Analisando o que foi dito..."}
              {meetingPresence.status === "error" && (meetingPresence.errorMsg || "Não consegui ouvir a reunião.")}
              {meetingPresence.status === "idle" && "Aguardando a reunião começar..."}
            </p>
            {meetingIsJitsi && (
              <p className={cn(
                "text-[10px] mt-1.5 flex items-center gap-1.5 font-bold",
                jitsiVoiceStatus === "connected" || jitsiVoiceStatus === "speaking" ? "text-emerald-500"
                  : jitsiVoiceStatus === "error" ? "text-rose-500" : "text-[var(--color-text-faint)]"
              )}>
                <span className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  jitsiVoiceStatus === "connected" || jitsiVoiceStatus === "speaking" ? "bg-emerald-500 animate-pulse"
                    : jitsiVoiceStatus === "error" ? "bg-rose-500" : "bg-slate-400"
                )} />
                {jitsiVoiceStatus === "connecting" && "Entrando na sala do Jitsi..."}
                {jitsiVoiceStatus === "connected" && "Na call — presente como \"Aurora — IA\""}
                {jitsiVoiceStatus === "speaking" && "Falando na call agora"}
                {jitsiVoiceStatus === "error" && "Não consegui entrar na sala do Jitsi"}
                {jitsiVoiceStatus === "idle" && "Ainda não entrou na sala"}
              </p>
            )}
          </div>

          {/* Insights estruturados da Aurora */}
          {(insights || (!isActive && podeGerarInsights)) && (
            <div className="border-b border-[var(--color-border-subtle)] p-4 space-y-4 max-h-[55%] overflow-y-auto shrink-0">
              {!insights ? (
                <div className="flex flex-col items-center text-center gap-2 py-2">
                  <Sparkles className="w-5 h-5 text-violet-500" />
                  <p className="text-[11px] text-[var(--color-text-muted)]">Gere o resumo, os pontos-chave e os próximos passos com a Aurora.</p>
                  <Button onClick={gerarInsights} disabled={insightsLoading} className="h-8 px-3 text-[11px] font-black gap-1.5">
                    {insightsLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                    {insightsLoading ? "Gerando..." : "Gerar insights"}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="p-3 rounded-xl bg-violet-500/[0.07] border border-violet-500/15">
                    <div className="flex items-center justify-between mb-1.5">
                      <p className="text-[10px] font-black text-violet-600 dark:text-violet-400 uppercase tracking-widest flex items-center gap-1.5"><Sparkles className="w-3 h-3" /> Aurora — Resumo da reunião</p>
                      <button onClick={gerarInsights} disabled={insightsLoading} className="text-[10px] font-bold text-[var(--color-text-muted)] hover:text-violet-500 bg-transparent border-none cursor-pointer" title="Gerar de novo">
                        {insightsLoading ? "..." : "Atualizar"}
                      </button>
                    </div>
                    <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">{insights.resumo}</p>
                  </div>

                  {insights.pontos_chave.length > 0 && (
                    <div className="space-y-1.5">
                      <h5 className={sectionTitle}><FileText className="w-3.5 h-3.5 text-violet-500" /> Principais pontos</h5>
                      {insights.pontos_chave.map((p, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] text-[var(--color-text-muted)]">
                          <span className={cn("w-2 h-2 rounded-full mt-1 shrink-0", p.tom === "positivo" ? "bg-emerald-500" : p.tom === "atencao" ? "bg-amber-500" : "bg-violet-500")} />
                          {p.texto}
                        </div>
                      ))}
                    </div>
                  )}

                  {insights.proximos_passos.length > 0 && (
                    <div className="space-y-1.5">
                      <h5 className={sectionTitle}><ListChecks className="w-3.5 h-3.5 text-violet-500" /> Próximos passos sugeridos</h5>
                      {insights.proximos_passos.map((p, i) => {
                        const criado = passosCriados.has(p.titulo);
                        return (
                          <div key={i} className="flex items-center gap-2 text-[11px]">
                            <span className="flex-1 min-w-0 text-[var(--color-text-primary)]">{p.titulo}<span className="text-[var(--color-text-faint)]"> · em até {p.prazo_dias}d</span></span>
                            {lead ? (
                              <button
                                onClick={() => criarTarefaSugerida(p.titulo, p.prazo_dias)}
                                disabled={criado}
                                className="shrink-0 px-2 py-1 rounded-lg border border-[var(--color-border-default)] text-[10px] font-bold text-[var(--color-text-muted)] hover:bg-[var(--color-surface-sunken)] disabled:opacity-50 cursor-pointer bg-transparent"
                              >
                                {criado ? "Criada" : "Criar tarefa"}
                              </button>
                            ) : null}
                          </div>
                        );
                      })}
                      {!lead && <p className="text-[10px] text-[var(--color-text-faint)]">Vincule um lead para transformar em tarefas.</p>}
                    </div>
                  )}

                  {insights.observacoes && (
                    <div className="space-y-1.5">
                      <h5 className={sectionTitle}><Brain className="w-3.5 h-3.5 text-violet-500" /> Observações da Aurora</h5>
                      <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed p-3 rounded-xl bg-violet-500/[0.06] border border-violet-500/15">{insights.observacoes}</p>
                    </div>
                  )}

                  <div className={cn(
                    "p-3 rounded-xl border",
                    insights.sentimento.rotulo === "Positivo" ? "bg-emerald-500/[0.07] border-emerald-500/20"
                      : insights.sentimento.rotulo === "Negativo" ? "bg-rose-500/[0.07] border-rose-500/20" : "bg-amber-500/[0.07] border-amber-500/20"
                  )}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="flex items-center gap-2 text-xs font-black text-[var(--color-text-primary)]">
                        {insights.sentimento.rotulo === "Positivo" ? <Smile className="w-4 h-4 text-emerald-500" /> : insights.sentimento.rotulo === "Negativo" ? <Frown className="w-4 h-4 text-rose-500" /> : <Meh className="w-4 h-4 text-amber-500" />}
                        Sentimento do cliente
                      </span>
                      <span className="text-[10px] font-black text-[var(--color-text-muted)]">{insights.sentimento.rotulo} · {insights.sentimento.pontuacao}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", insights.sentimento.rotulo === "Positivo" ? "bg-emerald-500" : insights.sentimento.rotulo === "Negativo" ? "bg-rose-500" : "bg-amber-500")}
                        style={{ width: `${insights.sentimento.pontuacao}%` }}
                      />
                    </div>
                    <p className="text-[9px] text-[var(--color-text-faint)] mt-1.5">Estimativa da IA a partir do texto da reunião, não uma medição.</p>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-[140px]">
            {meetingPresence.messages.length === 0 && (
              <p className="text-[11px] text-[var(--color-text-faint)] text-center py-6">
                As observações da Aurora sobre a conversa aparecem aqui conforme a reunião avança.
              </p>
            )}
            {meetingPresence.messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "px-3 py-2 rounded-xl text-[11px] leading-relaxed",
                  m.spoken
                    ? "bg-violet-500/[0.08] border border-violet-500/20 text-violet-700 dark:text-violet-200"
                    : "bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]"
                )}
              >
                {m.spoken && <p className="text-[8px] font-black uppercase tracking-widest text-violet-500 mb-1">Falou na call</p>}
                {m.text}
              </div>
            ))}
          </div>

          {/* Próximos passos (tarefas reais do lead) */}
          <div className="border-t border-[var(--color-border-subtle)] p-4 space-y-3 max-h-[45%] overflow-y-auto shrink-0">
            <div className="flex items-center justify-between">
              <h4 className={sectionTitle}><ListChecks className="w-4 h-4 text-violet-500" /> Próximos passos</h4>
              {lead && (
                <button onClick={() => setShowTaskForm((v) => !v)} className={cn(ghostBtn, "h-8 text-[11px]")}><Plus className="w-3 h-3" /> Criar tarefa</button>
              )}
            </div>
            {!lead && <p className="text-[11px] text-[var(--color-text-faint)]">Vincule um lead à reunião para acompanhar e criar tarefas aqui.</p>}
            {lead && showTaskForm && (
              <div className="space-y-2 p-3 rounded-xl bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)]">
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Ex: Enviar proposta atualizada"
                  className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={newTaskDate}
                    onChange={(e) => setNewTaskDate(e.target.value)}
                    className="flex-1 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-lg px-3 py-2 text-xs text-[var(--color-text-primary)] focus:outline-none"
                  />
                  <Button onClick={criarTarefa} disabled={!newTaskTitle.trim()} className="h-8 px-3 text-[11px] font-black">Salvar</Button>
                </div>
              </div>
            )}
            {lead && tarefasDoLead.length === 0 && !showTaskForm && (
              <p className="text-[11px] text-[var(--color-text-faint)]">Nenhuma tarefa para este lead ainda.</p>
            )}
            {tarefasDoLead.slice(0, 6).map((t) => {
              const done = t.status === "Concluída";
              return (
                <label key={t.id} className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={done}
                    onChange={() => updateTask(t.id, { status: done ? "Em Aberto" : "Concluída", completed_at: done ? null : new Date().toISOString() })}
                    className="mt-0.5 w-4 h-4 accent-[var(--color-primary-blue)] cursor-pointer"
                  />
                  <span className="flex-1 min-w-0">
                    <span className={cn("block text-xs", done ? "line-through text-[var(--color-text-faint)]" : "text-[var(--color-text-primary)]")}>{t.title}</span>
                    {t.due_date && <span className="block text-[10px] text-[var(--color-text-faint)]">até {new Date(t.due_date).toLocaleDateString("pt-BR")}</span>}
                  </span>
                </label>
              );
            })}
          </div>

          {meetingIsJitsi && (
            <AuroraJitsiVoice
              roomName={jitsiRoomName(reuniao.meetLink)}
              active={meetingIsActive}
              onStatusChange={setJitsiVoiceStatus}
              pendingSpeech={pendingSpeech}
            />
          )}
        </div>
      </div>

      <NovaReuniaoModal isOpen={showEdit} reuniao={reuniao} onClose={() => setShowEdit(false)} />
      <ConfirmModal
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Confirmar Exclusão de Reunião"
        message="Tem certeza de que deseja remover permanentemente esta reunião? Os dados associados não poderão ser recuperados."
      />
    </div>
  );
}
