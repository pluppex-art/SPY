import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../../modal";
import { Button } from "../../button";
import {
  Calendar, Clock, User, Users, FileText, Video, Copy, Building2, Loader2,
  CheckCircle2, ExternalLink, MessageCircle, Plus, X, Monitor, RefreshCw,
  Handshake, MoreHorizontal, Link2, MapPin, AlignLeft, ChevronDown,
} from "lucide-react";
import { generateJitsiLink } from "../../JitsiEmbed";
import { createCalendarEvent } from "../../../../lib/google-calendar";
import { useData } from "../../../../contexts/DataContext";
import { useAuth } from "../../../../contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "../../../../lib/utils";
import { useNavigate } from "react-router-dom";
import type { Reuniao } from "../../../../contexts/DataContextTypes";

/** Categorias da Agenda Comercial (coluna real `tipo` em `reunioes`) — ver
 * AgendaCRM.tsx pros filtros/cores que usam esse mesmo valor. */
export type TipoCompromisso = "Reunião" | "Demonstração" | "Follow-up" | "Fechamento" | "Outros";

export const TIPO_COMPROMISSO_OPTIONS: { id: TipoCompromisso; label: string; desc: string; icon: typeof Video }[] = [
  { id: "Reunião",       label: "Reunião",       desc: "Alinhamento ou reunião comercial",        icon: Video          },
  { id: "Demonstração",  label: "Demonstração",  desc: "Apresentação/demo do produto",             icon: Monitor        },
  { id: "Follow-up",     label: "Follow-up",     desc: "Acompanhamento com um lead ou cliente",     icon: RefreshCw      },
  { id: "Fechamento",    label: "Fechamento",    desc: "Negociação final, contrato ou assinatura", icon: Handshake      },
  { id: "Outros",        label: "Outros",        desc: "Qualquer outro compromisso",               icon: MoreHorizontal },
];

type Escopo = "Cliente" | "Interna" | "Equipe";
const ESCOPO_OPTIONS: { id: Escopo; desc: string; icon: typeof Video }[] = [
  { id: "Cliente", desc: "Reunião com cliente ou lead",      icon: User      },
  { id: "Interna", desc: "Reunião entre times",              icon: Building2 },
  { id: "Equipe",  desc: "Reunião com membros da equipe",    icon: Users     },
];

type Formato = "axis" | "meet" | "presencial" | "externo";
const FORMATO_OPTIONS: { id: Formato; label: string }[] = [
  { id: "axis",       label: "Sala S.P.Y. (Jitsi)" },
  { id: "meet",       label: "Google Meet" },
  { id: "externo",    label: "Link externo (Meet, Zoom...)" },
  { id: "presencial", label: "Presencial" },
];

const LEMBRETE_OPTIONS: { label: string; minutes: number | null }[] = [
  { label: "Não lembrar", minutes: null },
  { label: "30 minutos antes", minutes: 30 },
  { label: "1 hora antes", minutes: 60 },
  { label: "1 dia antes", minutes: 1440 },
];

const TITLE_MAX = 100;
const PAUTA_MAX = 1000;

const inputCls =
  "w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl px-3 py-2.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/40 transition-all";
const labelCls = "text-[10px] font-black uppercase tracking-widest text-[var(--color-text-muted)] flex items-center gap-1.5";

const initials = (name: string) =>
  name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("") || "?";

const STATUS_OPTIONS: Reuniao["status"][] = ["Agendada", "Em Andamento", "Concluída", "Cancelada"];

interface NovaReuniaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Quando informada, o modal abre em modo edição dessa reunião. */
  reuniao?: Reuniao | null;
}

export function NovaReuniaoModal({ isOpen, onClose, reuniao }: NovaReuniaoModalProps) {
  const { colaboradores, leads, clienteBase, addReuniao, updateReuniao } = useData();
  const isEdit = !!reuniao;
  const { activeTenantId, user } = useAuth();
  const navigate = useNavigate();

  const [escopo, setEscopo]           = useState<Escopo>("Cliente");
  const [tipo, setTipo]               = useState<TipoCompromisso>("Reunião");
  const [clienteId, setClienteId]     = useState("");
  const [linkedLeadId, setLinkedLeadId] = useState("");
  const [title, setTitle]             = useState("");
  const [pauta, setPauta]             = useState("");
  const [closerName, setCloserName]   = useState(user?.name || "");
  const [date, setDate]               = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime]               = useState("09:00");
  const [duration, setDuration]       = useState(60);
  const [formato, setFormato]         = useState<Formato>("axis");
  const [localEndereco, setLocalEndereco] = useState("");
  const [linkExterno, setLinkExterno] = useState("");
  const [convidados, setConvidados]   = useState<string[]>([]);
  const [novoConvidado, setNovoConvidado] = useState("");
  const [showParticipantes, setShowParticipantes] = useState(false);
  const [lembrete, setLembrete] = useState<number | null>(null);
  const [lembretePersonalizado, setLembretePersonalizado] = useState(false);
  const [status, setStatus] = useState<Reuniao["status"]>("Agendada");
  const initial = useRef({ title: "", pauta: "", leadId: "" });

  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ id: string; meetLink: string; calendarLink?: string } | null>(null);

  const closerOptions = useMemo(() => {
    let list = (colaboradores as any[])
      .filter((c: any) => c.status !== "Desligado")
      .map((c: any) => ({ name: c.nome || c.name || "", email: c.email || "", cargo: c.cargo || "" }))
      .filter((c) => c.name);
    if (list.length === 0) {
      const sellers = [...new Set((leads as any[]).map((l: any) => l.seller).filter(Boolean))] as string[];
      list = sellers.map((s) => ({ name: s, email: "", cargo: "" }));
    }
    if (user?.name && !list.some((c) => c.name === user.name)) {
      list = [{ name: user.name, email: user.email || "", cargo: "" }, ...list];
    }
    return list;
  }, [colaboradores, leads, user]);

  const closer = closerOptions.find((c) => c.name === closerName);
  const closerEmail = closer?.email ?? "";
  const cliente = (clienteBase as any[]).find((c) => c.id === clienteId) || null;
  const linkedLead = linkedLeadId ? (leads as any[]).find((l) => l.id === linkedLeadId) : null;
  const leadsDoCliente = useMemo(() => {
    if (!cliente) return leads as any[];
    const doCliente = (leads as any[]).filter((l) => l.clientId === cliente.id);
    return doCliente.length > 0 ? doCliente : (leads as any[]);
  }, [leads, cliente]);

  // Preenche o formulário ao abrir em modo edição. O título não tem coluna
  // própria: vive em companyName, ou na primeira linha da pauta quando um
  // lead com empresa ocupa companyName (mesma convenção do cadastro).
  useEffect(() => {
    if (!isOpen || !reuniao) return;
    const r = reuniao;
    const d = new Date(r.scheduledAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    const lead = (leads as any[]).find((l) => l.id === r.leadId);
    const leadOcupaEmpresa = !!lead?.company && r.companyName === lead.company;
    const [primeira, ...resto] = (r.pauta || "").split("\n\n");
    const t = leadOcupaEmpresa ? primeira || "" : r.companyName || "";
    const p = leadOcupaEmpresa ? resto.join("\n\n") : r.pauta || "";
    initial.current = { title: t, pauta: p, leadId: lead ? lead.id : "" };
    setEscopo((r.escopo as Escopo) || "Cliente");
    setTipo((r.tipo as TipoCompromisso) || "Outros");
    setClienteId(r.clienteId || "");
    setLinkedLeadId(lead ? lead.id : "");
    setTitle(t);
    setPauta(p);
    setCloserName(r.closerName || "");
    setDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`);
    setDuration(r.durationMinutes || 60);
    setConvidados(r.convidados || []);
    setStatus(r.status);
    const l = r.meetLink || "";
    if (l.startsWith("Presencial")) { setFormato("presencial"); setLocalEndereco(l.replace(/^Presencial:?\s*/, "")); }
    else if (l.includes("meet.jit.si")) setFormato("axis");
    else { setFormato("externo"); setLinkExterno(l); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, reuniao]);

  const handleSaveEdit = async () => {
    if (!reuniao) return;
    if (!title.trim()) { toast.error("Informe o título da reunião."); return; }
    if (!closerName.trim()) { toast.error("Selecione o responsável."); return; }
    if (formato === "presencial" && !localEndereco.trim()) { toast.error("Informe o local ou endereço da reunião presencial."); return; }
    if (formato === "externo" && !/^https:\/\/\S+$/i.test(linkExterno.trim())) { toast.error("Informe um link externo válido (https://...)."); return; }

    const meetLink = formato === "presencial"
      ? `Presencial: ${localEndereco.trim()}`
      : formato === "externo"
      ? linkExterno.trim()
      : (reuniao.meetLink || "").includes("meet.jit.si") ? reuniao.meetLink : generateJitsiLink(reuniao.id);

    const updates: Record<string, unknown> = {
      closerName,
      closerEmail: closerName === reuniao.closerName ? reuniao.closerEmail : closerEmail,
      convidados,
      scheduledAt: new Date(`${date}T${time}:00`).toISOString(),
      durationMinutes: duration,
      meetLink,
      status,
      tipo,
      escopo,
    };
    if (cliente) updates.clienteId = cliente.id;
    if (linkedLead && linkedLead.id !== initial.current.leadId) {
      updates.leadId = linkedLead.id;
      updates.leadName = linkedLead.name;
      updates.leadEmail = linkedLead.email || "";
      if (!updates.clienteId && linkedLead.clientId) updates.clienteId = linkedLead.clientId;
    }
    // Título/pauta só são regravados se mudaram — evita reescrever o que
    // veio de reuniões antigas ou importadas.
    if (title !== initial.current.title || pauta !== initial.current.pauta || updates.leadId) {
      const leadFinal = (updates.leadId ? linkedLead : (leads as any[]).find((l) => l.id === reuniao.leadId)) as any;
      if (leadFinal?.company) {
        updates.companyName = leadFinal.company;
        updates.pauta = `${title.trim()}${pauta.trim() ? `\n\n${pauta.trim()}` : ""}`;
      } else {
        updates.companyName = title.trim();
        updates.pauta = pauta.trim() || undefined;
      }
    }
    setLoading(true);
    try {
      await updateReuniao(reuniao.id, updates as Partial<Reuniao>);
      toast.success("Reunião atualizada!");
      reset();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const toggleParticipante = (email: string) => {
    if (!email) return;
    setConvidados((prev) => (prev.includes(email) ? prev.filter((c) => c !== email) : [...prev, email]));
  };

  const handleAddConvidado = () => {
    const val = novoConvidado.trim().toLowerCase();
    if (!val) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) { toast.error("E-mail de participante inválido."); return; }
    if (!convidados.includes(val)) setConvidados((prev) => [...prev, val]);
    setNovoConvidado("");
  };

  const buildTitleFallback = () => title.trim();

  const handleCreate = async () => {
    if (!title.trim()) { toast.error("Informe o título da reunião."); return; }
    if (!closerName.trim()) { toast.error("Selecione o responsável."); return; }
    if (escopo === "Cliente" && !cliente && !linkedLead) { toast.error("Selecione o cliente (ou vincule um lead)."); return; }
    if (formato === "presencial" && !localEndereco.trim()) {
      toast.error("Informe o local ou endereço da reunião presencial.");
      return;
    }
    if (formato === "externo" && !/^https:\/\/\S+$/i.test(linkExterno.trim())) {
      toast.error("Informe um link externo válido (https://...).");
      return;
    }

    setLoading(true);
    try {
      const reuniaoId = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const isPresencial = formato === "presencial";
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
      const displayTitle = buildTitleFallback();
      const allAttendees = Array.from(new Set([linkedLead?.email, closerEmail, ...convidados].filter(Boolean))) as string[];

      let meetLink = isPresencial
        ? `Presencial: ${localEndereco.trim()}`
        : formato === "externo"
        ? linkExterno.trim()
        : formato === "axis"
        ? generateJitsiLink(reuniaoId)
        : "";

      const createGoogleEvent = async (link: string) => {
        const startISO = `${date}T${time}:00`;
        const endDate = new Date(`${date}T${time}:00`);
        endDate.setMinutes(endDate.getMinutes() + duration);
        return createCalendarEvent(activeTenantId!, {
          title: isPresencial ? `Reunião Presencial — ${displayTitle}` : displayTitle,
          description: [
            isPresencial ? "📍 Reunião Presencial" : formato === "axis" ? "🖥️ Sala de vídeo S.P.Y. (Jitsi)" : "🔗 Reunião online",
            isPresencial ? `🏢 Local: ${localEndereco.trim()}` : link ? `🔗 Acesse: ${link}` : "",
            formato === "axis" ? "Nenhum app necessário — funciona direto no navegador." : "",
            closerName ? `👤 Responsável: ${closerName}` : "",
            convidados.length > 0 ? `👥 Outros Participantes: ${convidados.join(", ")}` : "",
            pauta ? `\n📋 Pauta:\n${pauta}` : "",
          ].filter(Boolean).join("\n"),
          location: isPresencial ? localEndereco.trim() : undefined,
          startISO,
          endISO: endDate.toISOString().slice(0, 19),
          attendeeEmails: allAttendees,
          skipConferenceData: formato !== "meet",
          reminderMinutes: lembrete ?? undefined,
        });
      };

      let calendarLink: string | undefined;
      if (formato === "meet") {
        // O link do Meet só existe depois que o evento é criado no Google —
        // sem conexão ativa não há como gerar, então aborta em vez de salvar
        // uma reunião sem link.
        if (!activeTenantId) { setLoading(false); return; }
        try {
          const ev = await createGoogleEvent("");
          if (!ev.hangoutLink) throw new Error("sem link");
          meetLink = ev.hangoutLink;
          calendarLink = ev.htmlLink;
        } catch {
          toast.error("Não foi possível gerar o link do Google Meet. Conecte o Google Calendar em Configurações > Integrações ou escolha outro formato.");
          setLoading(false);
          return;
        }
      }

      // `reunioes` não tem coluna de título: o título vai em companyName
      // (convenção já usada pelos eventos do Google) — quando um lead
      // vinculado ocupa companyName com a empresa dele, o título entra
      // no começo da pauta pra não se perder.
      const tituloNaPauta = !!linkedLead?.company;
      const pautaFinal = tituloNaPauta
        ? `${displayTitle}${pauta.trim() ? `\n\n${pauta.trim()}` : ""}`
        : pauta.trim() || undefined;

      const saved = await addReuniao({
        id:           reuniaoId,
        leadId:       linkedLead?.id ?? `standalone-${reuniaoId}`,
        clienteId:    cliente?.id ?? linkedLead?.clientId ?? undefined,
        leadName:     linkedLead?.name ?? cliente?.name ?? closerName,
        companyName:  linkedLead?.company ?? displayTitle,
        leadEmail:    linkedLead?.email ?? "",
        closerName,
        closerEmail,
        convidados,
        scheduledAt,
        durationMinutes: duration,
        meetLink,
        status:  "Agendada",
        pauta:   pautaFinal,
        tipo,
        escopo,
      } as any);

      if (!saved) { setLoading(false); return; }

      if (formato !== "meet" && activeTenantId) {
        try {
          const calEvent = await createGoogleEvent(meetLink);
          calendarLink = calEvent.htmlLink;
        } catch {
          // Opcional: sem conexão Google no servidor o agendamento segue valendo
        }
      }

      setCreated({ id: reuniaoId, meetLink, calendarLink });
      toast.success(calendarLink ? "Reunião criada! Convite enviado pelo Google Calendar." : "Reunião criada com sucesso!");
    } catch {
      toast.error("Erro ao criar reunião.");
    } finally {
      setLoading(false);
    }
  };

  const buildWhatsAppUrl = (meetLink: string) => {
    const dateStr = new Date(`${date}T${time}:00`).toLocaleDateString("pt-BR");
    const presencial = formato === "presencial";
    const msg = [
      `Olá! 👋`,
      "",
      `Você foi convidado para: *${title.trim()}*`,
      "",
      `📅 *Data:* ${dateStr} às ${time}`,
      `⏱️ *Duração:* ${duration} minutos`,
      closerName ? `👤 *Responsável:* ${closerName}` : "",
      convidados.length > 0 ? `👥 *Participantes:* ${[closerEmail, ...convidados].filter(Boolean).join(", ")}` : "",
      pauta ? `\n📋 *Pauta:*\n${pauta}` : "",
      "",
      presencial
        ? `📍 *Formato: Presencial*\n🏢 *Local:* ${localEndereco.trim()}`
        : `🔗 *Link de acesso:*\n${meetLink}`,
    ].filter(Boolean).join("\n");
    const encoded = encodeURIComponent(msg);
    const phone = (linkedLead as any)?.phone as string | undefined;
    if (phone) {
      const digits = phone.replace(/\D/g, "");
      return `https://wa.me/${digits.startsWith("55") ? digits : `55${digits}`}?text=${encoded}`;
    }
    return `https://wa.me/?text=${encoded}`;
  };

  const handleEnter = () => {
    if (!created) return;
    onClose();
    navigate(`/app/reunioes/${created.id}`);
  };

  const reset = () => {
    setEscopo("Cliente"); setTipo("Reunião"); setClienteId(""); setLinkedLeadId("");
    setTitle(""); setPauta(""); setCloserName(user?.name || "");
    setDate(new Date().toISOString().slice(0, 10)); setTime("09:00"); setDuration(60);
    setFormato("axis"); setLocalEndereco(""); setLinkExterno("");
    setConvidados([]); setNovoConvidado(""); setShowParticipantes(false);
    setLembrete(null); setLembretePersonalizado(false);
    setCreated(null);
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] flex items-center justify-center shrink-0">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <div className="text-base font-black text-[var(--color-text-primary)] leading-tight">{isEdit ? "Editar Reunião" : "Nova Reunião"}</div>
            <div className="text-xs font-normal text-[var(--color-text-muted)]">{isEdit ? "Atualize os dados, o horário ou o status da reunião." : "Agende uma reunião e mantenha seu time alinhado."}</div>
          </div>
        </div>
      }
      maxWidth="max-w-2xl"
      footer={
        !created ? (
          <div className="flex items-center justify-between gap-2 w-full">
            <Button variant="ghost" onClick={handleClose} className="h-10 px-5 text-xs">
              Cancelar
            </Button>
            <Button
              onClick={isEdit ? handleSaveEdit : handleCreate}
              disabled={loading}
              className="bg-orange-500 hover:bg-orange-600 text-white font-black h-10 px-6 text-xs gap-2"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
              {isEdit ? "Salvar alterações" : "Criar Reunião"}
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 w-full">
            <Button
              variant="outline"
              onClick={() => { navigator.clipboard.writeText(created.meetLink); toast.success("Link copiado!"); }}
              className="flex-1 h-10 text-xs gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" /> Copiar Link
            </Button>
            <Button onClick={handleEnter} className="flex-1 h-10 text-xs font-black gap-1.5">
              <Video className="w-3.5 h-3.5" /> Entrar na Sala
            </Button>
          </div>
        )
      }
    >
      {created ? (
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <div>
            <p className="text-base font-black text-[var(--color-text-primary)]">Reunião Criada!</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {created.calendarLink ? "Convite enviado pelo Google Calendar." : "Agendamento salvo na agenda."}
            </p>
          </div>
          <div className="w-full px-4 py-3 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-xl text-left space-y-3">
            <div>
              <p className="text-[9px] font-black text-[var(--color-text-faint)] uppercase tracking-widest mb-1">Link / Local</p>
              <p className="text-[11px] text-[var(--color-primary-blue)] font-mono break-all">{created.meetLink}</p>
            </div>
            {created.calendarLink && (
              <a
                href={created.calendarLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] text-[var(--color-primary-blue)] hover:underline"
              >
                <ExternalLink className="w-3 h-3 shrink-0" /> Abrir evento no Google Calendar
              </a>
            )}
          </div>
          <a
            href={buildWhatsAppUrl(created.meetLink)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/25 text-[#25D366] text-[11px] font-black uppercase tracking-widest transition-all"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {(linkedLead as any)?.phone ? "Enviar convite pelo WhatsApp" : "Compartilhar via WhatsApp"}
          </a>
        </div>
      ) : (
        <div className="space-y-5 py-1">
          {/* Escopo */}
          <div className="space-y-1.5">
            <label className={labelCls}>Tipo de reunião</label>
            <div className="grid grid-cols-3 gap-2">
              {ESCOPO_OPTIONS.map(({ id, desc, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setEscopo(id)}
                  className={cn(
                    "relative flex flex-col items-center gap-1 p-3 rounded-xl border transition-all text-center cursor-pointer",
                    escopo === id
                      ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/50 text-[var(--color-primary-blue)]"
                      : "bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-blue)]/30"
                  )}
                >
                  {escopo === id && <CheckCircle2 className="absolute top-2 right-2 w-3.5 h-3.5" />}
                  <Icon className="w-5 h-5" />
                  <span className="text-xs font-black">{id}</span>
                  <span className="text-[10px] font-normal opacity-80 leading-tight">{desc}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Cliente + lead */}
          {escopo === "Cliente" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className={labelCls}><Building2 className="w-3 h-3" /> Cliente <span className="text-rose-500">*</span></label>
                <select value={clienteId} onChange={(e) => { setClienteId(e.target.value); setLinkedLeadId(""); }} className={inputCls}>
                  <option value="">Selecione um cliente...</option>
                  {(clienteBase as any[]).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                {cliente?.industry && (
                  <p className="text-[10px] text-[var(--color-text-faint)]">Setor: {cliente.industry}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}><User className="w-3 h-3" /> Vincular lead <span className="font-normal normal-case tracking-normal">(opcional)</span></label>
                <select value={linkedLeadId} onChange={(e) => setLinkedLeadId(e.target.value)} className={inputCls}>
                  <option value="">Selecione um lead...</option>
                  {leadsDoCliente.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.company || l.name}{l.company && l.name ? ` · ${l.name}` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Título */}
          <div className="space-y-1.5">
            <label className={labelCls}><FileText className="w-3 h-3" /> Título da reunião <span className="text-rose-500">*</span></label>
            <input
              type="text"
              maxLength={TITLE_MAX}
              placeholder={`Ex: ${tipo} com o cliente`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
            />
            <p className="text-[10px] text-[var(--color-text-faint)] text-right">{title.length}/{TITLE_MAX}</p>
          </div>

          {/* Tipo de compromisso (categoria da agenda) */}
          <div className="space-y-1.5">
            <label className={labelCls}>Categoria na agenda</label>
            <div className="flex flex-wrap gap-2">
              {TIPO_COMPROMISSO_OPTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTipo(id)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer",
                    tipo === id
                      ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/50 text-[var(--color-primary-blue)]"
                      : "bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-blue)]/30"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" /> {label}
                </button>
              ))}
            </div>
          </div>

          {/* Responsável + participantes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className={labelCls}><User className="w-3 h-3" /> Responsável <span className="text-rose-500">*</span></label>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] text-[11px] font-black flex items-center justify-center shrink-0">
                  {initials(closerName)}
                </div>
                {closerOptions.length > 0 ? (
                  <select value={closerName} onChange={(e) => setCloserName(e.target.value)} className={inputCls}>
                    <option value="">Selecionar responsável...</option>
                    {closerOptions.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}{c.cargo ? ` — ${c.cargo}` : ""}</option>
                    ))}
                  </select>
                ) : (
                  <input type="text" placeholder="Nome do responsável..." value={closerName} onChange={(e) => setCloserName(e.target.value)} className={inputCls} />
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={labelCls}><Users className="w-3 h-3" /> Participantes <span className="font-normal normal-case tracking-normal">(opcional)</span></label>
              <button
                type="button"
                onClick={() => setShowParticipantes((v) => !v)}
                className={cn(inputCls, "flex items-center justify-between gap-2 cursor-pointer text-left")}
              >
                <span className="flex items-center gap-1 min-w-0 overflow-hidden">
                  {convidados.length === 0 && <span className="text-[var(--color-text-faint)]">Adicionar participantes...</span>}
                  {convidados.slice(0, 4).map((e) => (
                    <span key={e} className="w-6 h-6 rounded-full bg-[var(--color-primary-blue)]/10 text-[var(--color-primary-blue)] text-[9px] font-black flex items-center justify-center shrink-0" title={e}>
                      {initials(e.split("@")[0].replace(/[._-]/g, " "))}
                    </span>
                  ))}
                  {convidados.length > 4 && <span className="text-[10px] text-[var(--color-text-muted)]">+{convidados.length - 4}</span>}
                </span>
                <ChevronDown className="w-4 h-4 shrink-0 text-[var(--color-text-faint)]" />
              </button>
            </div>
          </div>

          {showParticipantes && (
            <div className="p-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {closerOptions.filter((c) => c.email && c.name !== closerName).map((c) => {
                  const on = convidados.includes(c.email.toLowerCase());
                  return (
                    <button
                      key={c.email}
                      type="button"
                      onClick={() => toggleParticipante(c.email.toLowerCase())}
                      className={cn(
                        "px-2.5 py-1 rounded-full border text-[11px] font-bold cursor-pointer transition-colors",
                        on
                          ? "bg-[var(--color-primary-blue)] text-white border-transparent"
                          : "bg-[var(--color-surface-elevated)] border-[var(--color-border-default)] text-[var(--color-text-muted)]"
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
              {convidados.filter((e) => !closerOptions.some((c) => c.email.toLowerCase() === e)).map((e) => (
                <span key={e} className="inline-flex items-center gap-1 mr-1.5 px-2 py-0.5 rounded-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-[11px]">
                  {e}
                  <button type="button" onClick={() => toggleParticipante(e)} className="border-none bg-transparent cursor-pointer text-[var(--color-text-faint)] hover:text-rose-500 p-0">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Convidar por e-mail..."
                  value={novoConvidado}
                  onChange={(e) => setNovoConvidado(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddConvidado(); } }}
                  className={inputCls}
                />
                <Button type="button" variant="outline" onClick={handleAddConvidado} className="h-9 w-9 p-0 shrink-0">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Data, horário, duração */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.4fr] gap-3">
            <div className="space-y-1.5">
              <label className={labelCls}><Calendar className="w-3 h-3" /> Data <span className="text-rose-500">*</span></label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}><Clock className="w-3 h-3" /> Horário <span className="text-rose-500">*</span></label>
              <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
            </div>
            <div className="space-y-1.5">
              <label className={labelCls}><Clock className="w-3 h-3" /> Duração</label>
              <div className="flex gap-1.5">
                {[30, 45, 60, 90].map((min) => (
                  <button
                    key={min}
                    type="button"
                    onClick={() => setDuration(min)}
                    className={cn(
                      "flex-1 py-2.5 rounded-xl border text-[11px] font-black transition-all cursor-pointer",
                      duration === min
                        ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/50 text-[var(--color-primary-blue)]"
                        : "bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-blue)]/30"
                    )}
                  >
                    {min}min
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Local / link */}
          <div className="space-y-1.5">
            <label className={labelCls}><Link2 className="w-3 h-3" /> Local / Link da reunião</label>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.6fr] gap-3">
              <select value={formato} onChange={(e) => setFormato(e.target.value as Formato)} className={inputCls}>
                {FORMATO_OPTIONS.filter((f) => !(isEdit && f.id === "meet")).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
              {(formato === "axis" || formato === "meet") && (
                <input type="text" disabled value="Link gerado automaticamente ao criar" className={cn(inputCls, "opacity-70")} />
              )}
              {formato === "externo" && (
                <input type="url" placeholder="https://meet.google.com/abc-defg-hij" value={linkExterno} onChange={(e) => setLinkExterno(e.target.value)} className={inputCls} />
              )}
              {formato === "presencial" && (
                <div className="relative">
                  <MapPin className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
                  <input type="text" placeholder="Endereço ou local do encontro" value={localEndereco} onChange={(e) => setLocalEndereco(e.target.value)} className={cn(inputCls, "pl-8")} />
                </div>
              )}
            </div>
          </div>

          {/* Pauta */}
          <div className="space-y-1.5">
            <label className={labelCls}><AlignLeft className="w-3 h-3" /> Pauta da reunião <span className="font-normal normal-case tracking-normal">(opcional)</span></label>
            <textarea
              value={pauta}
              maxLength={PAUTA_MAX}
              onChange={(e) => setPauta(e.target.value)}
              placeholder="Objetivos da reunião, pontos a discutir..."
              rows={3}
              className={cn(inputCls, "resize-none")}
            />
            <p className="text-[10px] text-[var(--color-text-faint)] text-right">{pauta.length}/{PAUTA_MAX}</p>
          </div>

          {isEdit && (
            <div className="space-y-1.5">
              <label className={labelCls}>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as Reuniao["status"])} className={inputCls}>
                {STATUS_OPTIONS.map((st) => <option key={st} value={st}>{st}</option>)}
              </select>
              <p className="text-[10px] text-[var(--color-text-faint)]">
                A edição não altera o evento já enviado ao Google Calendar nem reenvia convites.
              </p>
            </div>
          )}

          {!isEdit && (
          <div className="space-y-1.5">
            <label className={labelCls}>Lembretes</label>
            <div className="flex flex-wrap gap-2">
              {LEMBRETE_OPTIONS.map((o) => (
                <button
                  key={o.label}
                  type="button"
                  onClick={() => { setLembrete(o.minutes); setLembretePersonalizado(false); }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer",
                    !lembretePersonalizado && lembrete === o.minutes
                      ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/50 text-[var(--color-primary-blue)]"
                      : "bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-blue)]/30"
                  )}
                >
                  {o.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setLembretePersonalizado(true); setLembrete((v) => v ?? 15); }}
                className={cn(
                  "px-3 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer",
                  lembretePersonalizado
                    ? "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/50 text-[var(--color-primary-blue)]"
                    : "bg-[var(--color-surface-sunken)] border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:border-[var(--color-primary-blue)]/30"
                )}
              >
                Personalizado
              </button>
              {lembretePersonalizado && (
                <span className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)]">
                  <input
                    type="number"
                    min={1}
                    max={40320}
                    value={lembrete ?? ""}
                    onChange={(e) => setLembrete(e.target.value ? Math.max(1, Math.min(40320, Number(e.target.value))) : null)}
                    className={cn(inputCls, "w-20 py-1.5")}
                  />
                  minutos antes
                </span>
              )}
            </div>
            {lembrete !== null && (
              <p className="text-[10px] text-[var(--color-text-faint)]">
                O aviso é enviado pelo Google Calendar aos participantes — exige o Google Calendar conectado em Configurações &gt; Integrações.
              </p>
            )}
          </div>
          )}

          {formato === "axis" && !isEdit && (
            <div className="flex items-center gap-3 p-3 bg-[var(--color-primary-blue)]/[0.06] border border-[var(--color-primary-blue)]/15 rounded-xl">
              <Video className="w-4 h-4 text-[var(--color-primary-blue)] shrink-0" />
              <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
                Será criada uma <strong className="text-[var(--color-primary-blue)]">Sala S.P.Y. (Jitsi)</strong> exclusiva. Compartilhe o link com os participantes — nenhum app necessário.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
