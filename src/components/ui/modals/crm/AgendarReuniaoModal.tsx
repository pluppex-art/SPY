import { useState, useEffect } from "react";
import { Modal } from "../../modal";
import { Button } from "../../button";
import {
  Calendar, Clock, User, FileText, Video,
  Copy, ExternalLink, Loader2, CheckCircle2, AlertCircle, MessageCircle, Phone,
  MapPin, Plus, X, Users,
} from "lucide-react";
import { connectGoogleCalendar, getGoogleCalendarStatus } from "../../../../lib/google-auth";
import { createMeetSpace } from "../../../../lib/meet";
import { createCalendarEvent } from "../../../../lib/google-calendar";
import { generateJitsiLink } from "../../JitsiEmbed";
import { useData } from "../../../../contexts/DataContext";
import { useAuth } from "../../../../contexts/AuthContext";
import { toast } from "sonner";
import { cn, dataLocalISO, dataHoraLocalISO } from "../../../../lib/utils";

interface AgendarReuniaoModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: { id: string; name: string; company: string; email: string; phone?: string; seller: string; clienteId?: string };
  onConfirm: (reuniaoId: string, meetLink: string) => void;
}

export function AgendarReuniaoModal({ isOpen, onClose, lead, onConfirm }: AgendarReuniaoModalProps) {
  const { colaboradores, leads, addReuniao } = useData();
  const { activeTenantId, user } = useAuth();

  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [createdMeeting, setCreatedMeeting] = useState<{
    id: string;
    meetLink: string;
    calendarLink?: string;
    isPresencial?: boolean;
    localEndereco?: string;
  } | null>(null);
  const [googleAuthError, setGoogleAuthError] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState("");
  const [videoProvider, setVideoProvider] = useState<"axis" | "google" | "presencial">("axis");
  const [localEndereco, setLocalEndereco] = useState("");

  const [closerName, setCloserName] = useState(lead.seller || user?.name || "");
  const [closerEmail, setCloserEmail] = useState("");
  const [date, setDate] = useState(() => dataLocalISO());
  const [time, setTime] = useState("09:00");
  const [duration, setDuration] = useState(60);
  const [leadEmail, setLeadEmail] = useState(lead.email || "");
  const [pauta, setPauta]             = useState("");
  const [leadPhone, setLeadPhone]     = useState(lead.phone || "");

  const [convidados, setConvidados]   = useState<string[]>([]);
  const [novoConvidado, setNovoConvidado] = useState("");

  const closerOptions: { name: string; email: string }[] = (() => {
    let fromColab = (colaboradores as any[])
      .filter((c: any) => c.status !== "Desligado")
      .map((c: any) => ({ name: c.nome || c.name || "", email: c.email || "" }))
      .filter((c) => c.name);
    if (fromColab.length === 0) {
      const sellers = [...new Set((leads as any[]).map((l: any) => l.seller).filter(Boolean))];
      fromColab = (sellers as string[]).map((s) => ({ name: s, email: "" }));
    }
    if (user?.name && !fromColab.some((c) => c.name === user.name)) {
      fromColab = [{ name: user.name, email: user.email || "" }, ...fromColab];
    }
    return fromColab;
  })();

  useEffect(() => {
    const found = closerOptions.find(
      (c) => c.name === closerName
    );
    setCloserEmail(found?.email || "");
  }, [closerName, closerOptions]);

  useEffect(() => {
    if (!activeTenantId) return;
    getGoogleCalendarStatus(activeTenantId).then((status) => {
      if (status.connected) setGoogleEmail(status.email || "Conectado");
    });
  }, [activeTenantId]);

  useEffect(() => {
    if (isOpen) {
      setCreatedMeeting(null);
      setCloserName(lead.seller || user?.name || "");
      setLeadEmail(lead.email || "");
      setLeadPhone(lead.phone || "");
      setPauta("");
      setLocalEndereco("");
      setConvidados([]);
      setNovoConvidado("");
      setGoogleAuthError(null);
      if (activeTenantId) {
        getGoogleCalendarStatus(activeTenantId).then((status) => {
          if (status.connected) setGoogleEmail(status.email || "Conectado");
        });
      }
    }
  }, [isOpen, lead.seller, lead.email, activeTenantId, user?.name]);

  const handleConnectGoogle = async () => {
    if (!activeTenantId) return;
    try {
      setLoading(true);
      setGoogleAuthError(null);
      await connectGoogleCalendar(activeTenantId, window.location.pathname);
    } catch (err: any) {
      const msg: string = err.message || "Tente novamente";
      setGoogleAuthError(msg);
      toast.error(msg, { duration: 8000 });
      setLoading(false);
    }
  };

  const handleAddConvidado = (emailToAdd?: string) => {
    const val = (emailToAdd || novoConvidado).trim().toLowerCase();
    if (!val) return;
    if (!convidados.includes(val)) {
      setConvidados((prev) => [...prev, val]);
    }
    setNovoConvidado("");
  };

  const handleRemoveConvidado = (email: string) => {
    setConvidados((prev) => prev.filter((c) => c !== email));
  };

  const allAttendeesFormatted = () => {
    return Array.from(new Set([leadEmail, closerEmail, ...convidados].filter(Boolean))).join(", ");
  };

  const handleCreateMeeting = async () => {
    if (!closerName) { toast.error("Selecione o closer responsável."); return; }
    if (!date || !time) { toast.error("Informe data e horário."); return; }
    if (videoProvider === "presencial" && !localEndereco.trim()) {
      toast.error("Informe o endereço ou local da reunião presencial.");
      return;
    }

    const startISO = `${date}T${time}:00`;
    const endDate = new Date(`${date}T${time}:00`);
    endDate.setMinutes(endDate.getMinutes() + duration);
    const endISO = dataHoraLocalISO(endDate);
    const reuniaoId = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const allAttendees = Array.from(new Set([leadEmail, closerEmail, ...convidados].filter(Boolean)));

    const baseReuniao = {
      leadId: lead.id, clienteId: lead.clienteId,
      leadName: lead.name, companyName: lead.company,
      leadEmail, closerName, closerEmail,
      scheduledAt: startISO, durationMinutes: duration,
      status: "Agendada" as const, pauta: pauta || undefined,
      convidados: convidados.length > 0 ? convidados : undefined,
    };

    if (videoProvider === "presencial") {
      setLoading(true);
      try {
        const presencialMeetDesc = localEndereco.trim()
          ? `Presencial: ${localEndereco.trim()}`
          : "Presencial (Local a combinar)";

        let calendarLink: string | undefined;
        let googleEventId: string | undefined;
        if (activeTenantId) {
          try {
            const calEvent = await createCalendarEvent(activeTenantId, {
              title: `Reunião Presencial — ${lead.company || lead.name}`,
              description: [
                "📍 Reunião Presencial",
                `🏢 Local / Endereço: ${localEndereco.trim()}`,
                closerName ? `👤 Responsável: ${closerName}` : "",
                convidados.length > 0 ? `👥 Outros Participantes: ${convidados.join(", ")}` : "",
                pauta ? `\n📋 Pauta:\n${pauta}` : "",
              ].filter(Boolean).join("\n"),
              location: localEndereco.trim(),
              startISO,
              endISO,
              attendeeEmails: allAttendees,
              skipConferenceData: true,
            });
            calendarLink = calEvent.htmlLink;
            googleEventId = calEvent.id;
          } catch {
            toast.warning("Reunião presencial registrada, mas convite de calendário não enviado.");
          }
        }

        (addReuniao as any)({
          id: reuniaoId,
          ...baseReuniao,
          meetLink: presencialMeetDesc,
          tipo: "presencial",
          local: localEndereco.trim(),
          googleEventId,
        });
        setCreatedMeeting({
          id: reuniaoId,
          meetLink: presencialMeetDesc,
          calendarLink,
          isPresencial: true,
          localEndereco: localEndereco.trim(),
        });
        toast.success(calendarLink
          ? "Reunião presencial agendada e convite sincronizado no Google Calendar!"
          : "Reunião presencial agendada com sucesso!"
        );
      } catch (err: any) {
        toast.error("Erro ao agendar reunião presencial: " + (err.message || "Tente novamente"));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (videoProvider === "axis") {
      setLoading(true);
      try {
        const jitsiLink = generateJitsiLink(reuniaoId);
        let calendarLink: string | undefined;
        let googleEventId: string | undefined;
        if (activeTenantId) {
          try {
            const calEvent = await createCalendarEvent(activeTenantId, {
              title: `Reunião — ${lead.company || lead.name}`,
              description: [
                "🖥️ Sala de vídeo S.P.Y. (Jitsi)",
                `🔗 Acesse: ${jitsiLink}`,
                "Nenhum app necessário — funciona direto no navegador.",
                closerName ? `👤 Responsável: ${closerName}` : "",
                convidados.length > 0 ? `👥 Outros Participantes: ${convidados.join(", ")}` : "",
                pauta ? `\n📋 Pauta:\n${pauta}` : "",
              ].filter(Boolean).join("\n"),
              startISO,
              endISO,
              attendeeEmails: allAttendees,
              skipConferenceData: true,
            });
            calendarLink = calEvent.htmlLink;
            googleEventId = calEvent.id;
          } catch {
            toast.warning("Sala criada, mas convite de calendário não enviado.");
          }
        }

        (addReuniao as any)({ id: reuniaoId, ...baseReuniao, meetLink: jitsiLink, googleEventId });
        setCreatedMeeting({ id: reuniaoId, meetLink: jitsiLink, calendarLink });
        toast.success(calendarLink
          ? "Sala S.P.Y. criada! Convite enviado pelo Google Calendar."
          : "Sala S.P.Y. criada! O vídeo abre direto no sistema."
        );
      } catch (err: any) {
        toast.error("Erro ao criar sala: " + (err.message || "Tente novamente"));
      } finally {
        setLoading(false);
      }
      return;
    }

    if (googleAuthError || !googleEmail) {
      const link = manualLink.trim();
      if (!link) { toast.error("Insira um link do Google Meet ou conecte sua conta Google."); return; }
      (addReuniao as any)({ id: reuniaoId, ...baseReuniao, meetLink: link });
      setCreatedMeeting({ id: reuniaoId, meetLink: link });
      toast.success("Reunião agendada com link manual!");
      return;
    }

    if (!activeTenantId) { toast.error("Nenhum tenant ativo."); return; }
    setLoading(true);
    try {
      const meetSpace = await createMeetSpace(activeTenantId);
      let googleEventId: string | undefined;
      try {
        const calEvent = await createCalendarEvent(activeTenantId, {
          title: `Reunião — ${lead.company || lead.name}`,
          description: [
            pauta || `Reunião comercial com ${lead.name}${lead.company ? ` (${lead.company})` : ""}.`,
            convidados.length > 0 ? `\n👥 Participantes: ${allAttendees.join(", ")}` : "",
          ].filter(Boolean).join("\n"),
          startISO, endISO, attendeeEmails: allAttendees,
        });
        googleEventId = calEvent.id;
      } catch {
        toast.warning("Reunião criada, mas convite de calendário não enviado.");
      }

      (addReuniao as any)({ id: reuniaoId, ...baseReuniao, meetLink: meetSpace.meetingUri, googleEventId });
      setCreatedMeeting({ id: reuniaoId, meetLink: meetSpace.meetingUri });
      toast.success("Reunião agendada! Convite enviado ao lead, closer e participantes.");
    } catch (err: any) {
      if (err?.message === "google_calendar_not_connected" || err?.message === "google_calendar_reauth_required") {
        setGoogleEmail(null);
        toast.error("Sua conexão com o Google expirou ou foi desfeita — reconecte e tente novamente.");
      } else {
        toast.error("Erro ao criar reunião: " + (err.message || "Tente novamente"));
      }
    } finally {
      setLoading(false);
    }
  };

  const buildWhatsAppUrl = (meetLink: string) => {
    const dateStr = new Date(`${date}T${time}:00`).toLocaleDateString("pt-BR");
    const isPresencial = videoProvider === "presencial";
    const msg = [
      `Olá, ${lead.name}! 👋`,
      "",
      `Sua reunião com *${lead.company || "a nossa equipe"}* foi confirmada. 🎯`,
      "",
      `📅 *Data:* ${dateStr} às ${time}`,
      `⏱️ *Duração:* ${duration} minutos`,
      closerName ? `👤 *Responsável:* ${closerName}` : "",
      convidados.length > 0 ? `👥 *Participantes:* ${allAttendeesFormatted()}` : "",
      pauta ? `\n📋 *Pauta:*\n${pauta}` : "",
      "",
      isPresencial
        ? `📍 *Formato: Reunião Presencial*\n🏢 *Local:* ${localEndereco.trim() || "A combinar"}`
        : `🔗 *Link de acesso:*\n${meetLink}\n\nAcesse direto pelo navegador — sem precisar instalar nada. ✅`,
    ].filter(Boolean).join("\n");

    const encoded = encodeURIComponent(msg);
    if (leadPhone) {
      const digits = leadPhone.replace(/\D/g, "");
      const number = digits.startsWith("55") ? digits : `55${digits}`;
      return `https://wa.me/${number}?text=${encoded}`;
    }
    return `https://wa.me/?text=${encoded}`;
  };

  const inputCls =
    "w-full bg-[var(--color-surface)] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/20 transition-all placeholder:text-slate-600";
  const labelCls =
    "text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5 flex items-center gap-1.5";

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Agendar Reunião"
      maxWidth="max-w-lg"
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-slate-400 hover:text-white px-4 h-9 text-sm"
          >
            {createdMeeting ? "Fechar" : "Cancelar"}
          </Button>
          {createdMeeting ? (
            createdMeeting.isPresencial ? (
              <Button
                onClick={onClose}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 h-9 text-sm"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                Concluir Agendamento
              </Button>
            ) : (
              <Button
                onClick={() => onConfirm(createdMeeting.id, createdMeeting.meetLink)}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 h-9 text-sm"
              >
                <Video className="w-3.5 h-3.5 mr-1.5" />
                Entrar na Reunião
              </Button>
            )
          ) : (
            <Button
              onClick={handleCreateMeeting}
              disabled={loading}
              className="bg-[var(--color-primary-blue)] hover:brightness-110 text-white font-bold px-5 h-9 text-sm disabled:opacity-50"
            >
              {loading
                ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                : <Calendar className="w-3.5 h-3.5 mr-1.5" />}
              {loading ? "Criando..." : "Agendar Reunião"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4 py-1">
        {/* Lead info */}
        <div className="flex items-center gap-3 p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
          <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0 text-sm font-black text-blue-300 select-none">
            {((lead.company || lead.name || "R").slice(0, 2)).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-white truncate">{lead.company || lead.name}</div>
            <div className="text-xs text-slate-400 truncate">{lead.name}{lead.email ? ` · ${lead.email}` : ""}</div>
          </div>
        </div>

        {/* Video / Meeting provider toggle */}
        <div>
          <label className={labelCls}><Video className="w-3 h-3" /> Formato da Reunião</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setVideoProvider("axis")}
              className={cn(
                "flex flex-col items-start gap-1 p-2.5 rounded-xl border text-left transition-all",
                videoProvider === "axis"
                  ? "bg-blue-500/15 border-blue-500/30 text-blue-300"
                  : "bg-white/[0.03] border-white/[0.08] text-slate-400 hover:border-white/20"
              )}
            >
              <span className="text-xs font-black">🖥️ Sala S.P.Y.</span>
              <span className="text-[10px] leading-tight opacity-70">Vídeo no CRM</span>
            </button>
            <button
              type="button"
              onClick={() => setVideoProvider("google")}
              className={cn(
                "flex flex-col items-start gap-1 p-2.5 rounded-xl border text-left transition-all",
                videoProvider === "google"
                  ? "bg-blue-500/15 border-blue-500/30 text-blue-300"
                  : "bg-white/[0.03] border-white/[0.08] text-slate-400 hover:border-white/20"
              )}
            >
              <span className="text-xs font-black">📹 Google Meet</span>
              <span className="text-[10px] leading-tight opacity-70">Meet & convite</span>
            </button>
            <button
              type="button"
              onClick={() => setVideoProvider("presencial")}
              className={cn(
                "flex flex-col items-start gap-1 p-2.5 rounded-xl border text-left transition-all",
                videoProvider === "presencial"
                  ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                  : "bg-white/[0.03] border-white/[0.08] text-slate-400 hover:border-white/20"
              )}
            >
              <span className="text-xs font-black">📍 Presencial</span>
              <span className="text-[10px] leading-tight opacity-70">No local físico</span>
            </button>
          </div>
        </div>

        {/* Campo de endereço/local quando for Presencial */}
        {videoProvider === "presencial" && (
          <div className="p-3 bg-emerald-500/[0.06] border border-emerald-500/20 rounded-xl space-y-1.5">
            <label className={cn(labelCls, "text-emerald-400")}>
              <MapPin className="w-3 h-3 text-emerald-400" /> Endereço / Local da Reunião
            </label>
            <input
              type="text"
              value={localEndereco}
              onChange={(e) => setLocalEndereco(e.target.value)}
              placeholder="Ex: Av. Paulista, 1000 - 12º andar, sala 4 ou endereço do cliente..."
              className={cn(inputCls, "border-emerald-500/30 focus:border-emerald-500/60")}
              required
            />
            <p className="text-[10px] text-slate-400">
              O local será sincronizado no Google Agenda e formatado na confirmação de WhatsApp.
            </p>
          </div>
        )}

        {/* Google Connect */}
        <div className={cn(
          "rounded-xl border p-3 space-y-2",
          googleEmail
            ? "bg-emerald-500/[0.07] border-emerald-500/20"
            : googleAuthError
            ? "bg-rose-500/[0.07] border-rose-500/20"
            : "bg-white/[0.02] border-white/[0.08]"
        )}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {googleEmail
                ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                : <AlertCircle className={cn("w-4 h-4 shrink-0", googleAuthError ? "text-rose-400" : "text-amber-400")} />}
              <div className="min-w-0">
                <div className={cn("text-xs font-bold", googleEmail ? "text-emerald-400" : googleAuthError ? "text-rose-400" : "text-slate-200")}>
                  {googleEmail ? `Google Conectado (${googleEmail})` : googleAuthError ? "Falha na conexão Google" : "Google Agenda"}
                </div>
                <div className="text-[10px] text-slate-400 truncate">
                  {googleEmail ? "Convites e bloqueio de agenda sincronizados automaticamente" : "Conecte para enviar convites por e-mail e bloquear horários"}
                </div>
              </div>
            </div>
            {!googleEmail && (
              <Button
                onClick={handleConnectGoogle}
                disabled={loading}
                className="bg-white text-gray-800 hover:bg-gray-100 font-bold px-3 h-7 text-xs shrink-0"
              >
                Conectar
              </Button>
            )}
          </div>
          {googleAuthError && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] text-rose-300 leading-relaxed">{googleAuthError}</p>
              {videoProvider === "google" && (
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">
                    <Video className="w-3 h-3 inline mr-1" />Link manual do Google Meet
                  </label>
                  <input
                    type="url"
                    value={manualLink}
                    onChange={(e) => setManualLink(e.target.value)}
                    placeholder="https://meet.google.com/abc-defg-hij"
                    className="w-full bg-[var(--color-surface)] border border-white/[0.08] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500/50 transition-all placeholder:text-slate-600"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Form */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className={labelCls}><User className="w-3 h-3" /> Closer / Responsável</label>
            <select value={closerName} onChange={(e) => setCloserName(e.target.value)} className={inputCls}>
              <option value="">Selecione o closer...</option>
              {closerOptions.map((c) => (
                <option key={c.name} value={c.name}>{c.name}{c.email ? ` — ${c.email}` : ""}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelCls}><Calendar className="w-3 h-3" /> Data</label>
            <input
              type="date"
              value={date}
              min={dataLocalISO()}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}><Clock className="w-3 h-3" /> Horário</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className={inputCls} />
          </div>

          <div>
            <label className={labelCls}><Clock className="w-3 h-3" /> Duração</label>
            <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} className={inputCls}>
              <option value={30}>30 minutos</option>
              <option value={45}>45 minutos</option>
              <option value={60}>1 hora</option>
              <option value={90}>1h 30min</option>
              <option value={120}>2 horas</option>
            </select>
          </div>

          <div>
            <label className={labelCls}><User className="w-3 h-3" /> E-mail do Lead</label>
            <input
              type="email"
              value={leadEmail}
              onChange={(e) => setLeadEmail(e.target.value)}
              placeholder="email@lead.com"
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}><Phone className="w-3 h-3" /> WhatsApp do Lead</label>
            <input
              type="tel"
              value={leadPhone}
              onChange={(e) => setLeadPhone(e.target.value)}
              placeholder="(11) 99999-9999"
              className={inputCls}
            />
          </div>

          {/* Outros participantes / convidados */}
          <div className="col-span-2 space-y-2 p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
            <label className={labelCls}><Users className="w-3 h-3 text-blue-400" /> Outros Participantes / Convidados</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={novoConvidado}
                onChange={(e) => setNovoConvidado(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddConvidado();
                  }
                }}
                placeholder="email@participante.com"
                className={cn(inputCls, "flex-1")}
              />
              <Button
                type="button"
                onClick={() => handleAddConvidado()}
                variant="outline"
                className="text-xs h-9 px-3 gap-1 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar
              </Button>
            </div>
            {/* Atalho rápido colaboradores */}
            {closerOptions.filter(c => c.email && c.name !== closerName && !convidados.includes(c.email.toLowerCase())).length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[10px] text-slate-500">Adicionar equipe:</span>
                {closerOptions
                  .filter(c => c.email && c.name !== closerName && !convidados.includes(c.email.toLowerCase()))
                  .slice(0, 4)
                  .map(colab => (
                    <button
                      key={colab.email}
                      type="button"
                      onClick={() => handleAddConvidado(colab.email)}
                      className="text-[10px] px-2 py-0.5 rounded bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/10 transition-colors"
                    >
                      + {colab.name.split(" ")[0]}
                    </button>
                  ))}
              </div>
            )}
            {/* Chips dos convidados */}
            {convidados.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {convidados.map((email) => (
                  <span
                    key={email}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-500/15 border border-blue-500/30 rounded-lg text-xs text-blue-300"
                  >
                    {email}
                    <button
                      type="button"
                      onClick={() => handleRemoveConvidado(email)}
                      className="hover:text-rose-400 p-0.5 rounded"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="col-span-2">
            <label className={labelCls}><FileText className="w-3 h-3" /> Pauta (opcional)</label>
            <textarea
              value={pauta}
              onChange={(e) => setPauta(e.target.value)}
              placeholder="Objetivo da reunião, pontos a discutir..."
              rows={3}
              className={cn(inputCls, "resize-none")}
            />
          </div>
        </div>

        {/* Result after creation */}
        {createdMeeting && (
          <div className="bg-emerald-500/[0.08] border border-emerald-500/20 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
              <CheckCircle2 className="w-4 h-4" />
              {createdMeeting.isPresencial
                ? "Reunião Presencial Agendada!"
                : `Reunião criada! ${createdMeeting.calendarLink ? "Convite enviado pelo Google Calendar." : "Sala pronta."}`}
            </div>

            {/* Detalhe da Sala / Local */}
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">
                {createdMeeting.isPresencial ? "Local da Reunião" : "Link da Sala"}
              </p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={createdMeeting.isPresencial ? (createdMeeting.localEndereco || createdMeeting.meetLink) : createdMeeting.meetLink}
                  className="flex-1 bg-[var(--color-surface)] border border-white/[0.08] rounded-lg px-3 py-1.5 text-xs text-slate-300 font-mono min-w-0"
                />
                <button
                  onClick={() => {
                    const textToCopy = createdMeeting.isPresencial ? (createdMeeting.localEndereco || createdMeeting.meetLink) : createdMeeting.meetLink;
                    navigator.clipboard.writeText(textToCopy);
                    toast.success("Copiado com sucesso!");
                  }}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg text-xs text-slate-400 hover:text-white transition-all"
                >
                  <Copy className="w-3 h-3" />
                </button>
                {!createdMeeting.isPresencial && (
                  <a href={createdMeeting.meetLink} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <button className="flex items-center gap-1 px-2.5 py-1.5 bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] rounded-lg text-xs text-slate-400 hover:text-white transition-all">
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </a>
                )}
              </div>
            </div>

            {/* Link do evento no Google Calendar */}
            {createdMeeting.calendarLink && (
              <div>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Evento no Google Calendar</p>
                <a
                  href={createdMeeting.calendarLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  Abrir evento no Calendar
                </a>
              </div>
            )}

            {/* Botão WhatsApp */}
            <a
              href={buildWhatsAppUrl(createdMeeting.meetLink)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-[#25D366]/10 hover:bg-[#25D366]/20 border border-[#25D366]/25 text-[#25D366] text-[11px] font-black uppercase tracking-widest transition-all"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              {leadPhone ? "Enviar confirmação pelo WhatsApp" : "Compartilhar via WhatsApp"}
            </a>

            {allAttendeesFormatted() && (
              <p className="text-[10px] text-slate-500">
                {createdMeeting.calendarLink ? "Convite enviado para:" : "Participantes:"}{" "}
                {allAttendeesFormatted()}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
