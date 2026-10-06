import { useState } from "react";
import { Modal } from "../../modal";
import { Button } from "../../button";
import {
  Calendar, Clock, User, FileText, Video,
  Copy, Building2, Loader2, CheckCircle2, ExternalLink, MessageCircle,
  MapPin, Plus, X, Monitor, RefreshCw, Handshake, MoreHorizontal,
} from "lucide-react";
import { generateJitsiLink } from "../../JitsiEmbed";
import { createCalendarEvent } from "../../../../lib/google-calendar";
import { useData } from "../../../../contexts/DataContext";
import { useAuth } from "../../../../contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "../../../../lib/utils";
import { useNavigate } from "react-router-dom";

/** Mesmas 5 categorias da Agenda Comercial (coluna real `tipo` em
 * `reunioes`) — ver AgendaCRM.tsx pros filtros/cores que usam esse mesmo
 * valor. Substitui o antigo seletor Cliente/Interna/Equipe, que nunca foi
 * persistido (não existe coluna pra isso). */
export type TipoCompromisso = "Reunião" | "Demonstração" | "Follow-up" | "Fechamento" | "Outros";

export const TIPO_COMPROMISSO_OPTIONS: { id: TipoCompromisso; label: string; desc: string; icon: typeof Video }[] = [
  { id: "Reunião",       label: "Reunião",       desc: "Alinhamento ou reunião comercial",        icon: Video          },
  { id: "Demonstração",  label: "Demonstração",  desc: "Apresentação/demo do produto",             icon: Monitor        },
  { id: "Follow-up",     label: "Follow-up",     desc: "Acompanhamento com um lead ou cliente",     icon: RefreshCw      },
  { id: "Fechamento",    label: "Fechamento",    desc: "Negociação final, contrato ou assinatura", icon: Handshake      },
  { id: "Outros",        label: "Outros",        desc: "Qualquer outro compromisso",               icon: MoreHorizontal },
];

interface NovaReuniaoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function NovaReuniaoModal({ isOpen, onClose }: NovaReuniaoModalProps) {
  const { colaboradores, leads, addReuniao } = useData();
  const { activeTenantId, user } = useAuth();
  const navigate = useNavigate();

  const [tipo, setTipo] = useState<TipoCompromisso>("Reunião");
  const [formato, setFormato]         = useState<"axis" | "presencial">("axis");
  const [localEndereco, setLocalEndereco] = useState("");
  const [title, setTitle]             = useState("");
  const [pauta, setPauta]             = useState("");
  const [closerName, setCloserName]   = useState(user?.name || "");
  const [date, setDate]               = useState(() => new Date().toISOString().slice(0, 10));
  const [time, setTime]               = useState("09:00");
  const [duration, setDuration]       = useState(60);

  // Convidados adicionais
  const [convidados, setConvidados]   = useState<string[]>([]);
  const [novoConvidado, setNovoConvidado] = useState("");

  // For "cliente" type, optionally link a lead
  const [linkedLeadId, setLinkedLeadId] = useState("");

  const [loading, setLoading] = useState(false);
  const [created, setCreated] = useState<{ id: string; meetLink: string; calendarLink?: string; isPresencial?: boolean; localEndereco?: string } | null>(null);

  const closerOptions: { name: string; email: string }[] = (() => {
    let fromColab = (colaboradores as any[])
      .filter((c: any) => c.status !== "Desligado")
      .map((c: any) => ({ name: c.nome || c.name || "", email: c.email || "" }))
      .filter((c) => c.name);
    if (fromColab.length === 0) {
      const sellers = [...new Set((leads as any[]).map((l: any) => l.seller).filter(Boolean))] as string[];
      fromColab = (sellers as string[]).map((s) => ({ name: s, email: "" }));
    }
    if (user?.name && !fromColab.some((c) => c.name === user.name)) {
      fromColab = [{ name: user.name, email: user.email || "" }, ...fromColab];
    }
    return fromColab;
  })();

  const closerEmail = closerOptions.find((c) => c.name === closerName)?.email ?? "";

  const linkedLead = linkedLeadId
    ? (leads as any[]).find((l) => l.id === linkedLeadId)
    : null;

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

  const handleCreate = async () => {
    if (!closerName.trim()) { toast.error("Selecione o responsável."); return; }
    if (formato === "presencial" && !localEndereco.trim()) {
      toast.error("Informe o local ou endereço da reunião presencial.");
      return;
    }

    setLoading(true);
    try {
      const reuniaoId   = `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const isPresencial = formato === "presencial";
      const meetLink    = isPresencial
        ? (localEndereco.trim() ? `Presencial: ${localEndereco.trim()}` : "Presencial (Local a combinar)")
        : generateJitsiLink(reuniaoId);
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();

      const displayTitle = title.trim() || (
        linkedLead
          ? `${tipo} com ${linkedLead.company || linkedLead.name}`
          : `${tipo} Interna`
      );

      const allAttendees = Array.from(new Set([linkedLead?.email, closerEmail, ...convidados].filter(Boolean))) as string[];

      const saved = await addReuniao({
        id:           reuniaoId,
        leadId:       linkedLead?.id   ?? `standalone-${reuniaoId}`,
        clienteId:    linkedLead?.clientId ?? undefined,
        leadName:     linkedLead?.name  ?? closerName,
        companyName:  linkedLead?.company ?? displayTitle,
        leadEmail:    linkedLead?.email ?? "",
        closerName,
        closerEmail,
        convidados,
        scheduledAt,
        durationMinutes: duration,
        meetLink,
        status:  "Agendada",
        pauta:   pauta.trim() || undefined,
        tipo,
      } as any);

      if (!saved) {
        // addReuniao já mostrou o toast de erro do insert real — não segue
        // pro fluxo de sucesso (convite Google/WhatsApp) com algo que não
        // foi salvo.
        setLoading(false);
        return;
      }

      let calendarLink: string | undefined;
      if (activeTenantId) {
        try {
          const startISO = `${date}T${time}:00`;
          const endDate  = new Date(`${date}T${time}:00`);
          endDate.setMinutes(endDate.getMinutes() + duration);
          const calEvent = await createCalendarEvent(activeTenantId, {
            title: isPresencial ? `Reunião Presencial — ${displayTitle}` : displayTitle,
            description: [
              isPresencial ? "📍 Reunião Presencial" : "🖥️ Sala de vídeo S.P.Y. (Jitsi)",
              isPresencial ? `🏢 Local: ${localEndereco.trim()}` : `🔗 Acesse: ${meetLink}`,
              !isPresencial ? "Nenhum app necessário — funciona direto no navegador." : "",
              closerName ? `👤 Responsável: ${closerName}` : "",
              convidados.length > 0 ? `👥 Outros Participantes: ${convidados.join(", ")}` : "",
              pauta ? `\n📋 Pauta:\n${pauta}` : "",
            ].filter(Boolean).join("\n"),
            location: isPresencial ? localEndereco.trim() : undefined,
            startISO,
            endISO: endDate.toISOString().slice(0, 19),
            attendeeEmails: allAttendees,
            skipConferenceData: true,
          });
          calendarLink = calEvent.htmlLink;
        } catch {
          // Opcional
        }
      }

      setCreated({ id: reuniaoId, meetLink, calendarLink, isPresencial, localEndereco: localEndereco.trim() });
      toast.success(calendarLink
        ? "Reunião criada! Convite enviado pelo Google Calendar."
        : isPresencial
        ? "Reunião presencial criada com sucesso!"
        : "Reunião criada com sucesso!"
      );
    } catch (err) {
      toast.error("Erro ao criar reunião.");
    } finally {
      setLoading(false);
    }
  };

  const buildWhatsAppUrl = (meetLink: string) => {
    const dateStr = new Date(`${date}T${time}:00`).toLocaleDateString("pt-BR");
    const isPresencial = formato === "presencial";
    const displayTitle = title.trim() || (
      linkedLead
        ? `${tipo} com ${linkedLead.company || linkedLead.name}`
        : `${tipo} Interna`
    );
    const msg = [
      `Olá! 👋`,
      "",
      `Você foi convidado para: *${displayTitle}*`,
      "",
      `📅 *Data:* ${dateStr} às ${time}`,
      `⏱️ *Duração:* ${duration} minutos`,
      closerName ? `👤 *Responsável:* ${closerName}` : "",
      convidados.length > 0 ? `👥 *Participantes:* ${[closerEmail, ...convidados].filter(Boolean).join(", ")}` : "",
      pauta ? `\n📋 *Pauta:*\n${pauta}` : "",
      "",
      isPresencial
        ? `📍 *Formato: Presencial*\n🏢 *Local:* ${localEndereco.trim() || "A combinar"}`
        : `🔗 *Link de acesso:*\n${meetLink}\n\nAcesse direto pelo navegador — sem precisar instalar nada. ✅`,
    ].filter(Boolean).join("\n");

    const encoded = encodeURIComponent(msg);
    const phone = (linkedLead as any)?.phone as string | undefined;
    if (phone) {
      const digits = phone.replace(/\D/g, "");
      const number = digits.startsWith("55") ? digits : `55${digits}`;
      return `https://wa.me/${number}?text=${encoded}`;
    }
    return `https://wa.me/?text=${encoded}`;
  };

  const handleEnter = () => {
    if (!created) return;
    onClose();
    navigate(`/app/reunioes/${created.id}`);
  };

  const reset = () => {
    setTitle(""); setPauta(""); setCloserName(user?.name || "");
    setLinkedLeadId(""); setCreated(null);
    setTipo("Reunião"); setFormato("axis"); setLocalEndereco("");
    setConvidados([]); setNovoConvidado("");
    setDate(new Date().toISOString().slice(0, 10));
    setTime("09:00"); setDuration(60);
  };

  const handleClose = () => { reset(); onClose(); };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Nova Reunião"
      maxWidth="max-w-md"
      footer={
        !created ? (
          <div className="flex items-center justify-end gap-2 w-full">
            <Button variant="ghost" onClick={handleClose} className="text-slate-400 h-9 px-4 text-xs">
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={loading}
              className="bg-blue-600 hover:bg-blue-500 text-white font-black h-9 px-6 text-xs gap-2"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Video className="w-3.5 h-3.5" />}
              Criar Reunião
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 w-full">
            <Button
              variant="outline"
              onClick={() => { navigator.clipboard.writeText(created.meetLink); toast.success("Link copiado!"); }}
              className="flex-1 border-white/10 text-slate-400 h-9 text-xs gap-1.5"
            >
              <Copy className="w-3.5 h-3.5" /> Copiar Link
            </Button>
            <Button
              onClick={handleEnter}
              className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-black h-9 text-xs gap-1.5"
            >
              <Video className="w-3.5 h-3.5" /> Entrar na Sala
            </Button>
          </div>
        )
      }
    >
      {created ? (
        /* ── Success state ── */
        <div className="flex flex-col items-center gap-4 py-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <div>
            <p className="text-base font-black text-white">Reunião Criada!</p>
            <p className="text-xs text-slate-500 mt-1">
              {created.calendarLink ? "Convite enviado pelo Google Calendar." : "Sala S.P.Y. pronta para uso"}
            </p>
          </div>
          <div className="w-full px-4 py-3 bg-[var(--color-surface)] border border-white/[0.08] rounded-xl text-left space-y-3">
            <div>
              <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Link da Sala</p>
              <p className="text-[11px] text-blue-400 font-mono break-all">{created.meetLink}</p>
            </div>
            {created.calendarLink && (
              <div>
                <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest mb-1">Evento no Google Calendar</p>
                <a
                  href={created.calendarLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors"
                >
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  Abrir evento no Calendar
                </a>
              </div>
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

          <p className="text-[10px] text-slate-600">
            {created.calendarLink ? "Participantes receberão o convite por e-mail." : "Compartilhe o link com os participantes."}
          </p>
        </div>
      ) : (
        /* ── Form ── */
        <div className="space-y-4 py-2">

          {/* Tipo */}
          <div className="space-y-1.5">
            <label className="text-[8px] font-black uppercase tracking-widest text-slate-500">Tipo de Compromisso</label>
            <div className="grid grid-cols-3 gap-2">
              {TIPO_COMPROMISSO_OPTIONS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTipo(id)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all text-center",
                    tipo === id
                      ? "bg-blue-500/15 border-blue-500/30 text-blue-300"
                      : "bg-white/[0.02] border-white/[0.06] text-slate-500 hover:border-white/[0.12] hover:text-slate-300"
                  )}
                >
                  <Icon className="w-4 h-4" />
                  <span className="text-[9px] font-black uppercase tracking-wider">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Título */}
          <div className="space-y-1.5">
            <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
              <FileText className="w-3 h-3" /> Título (opcional)
            </label>
            <input
              type="text"
              placeholder={`Ex: ${tipo} com o cliente...`}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-[var(--color-surface)] border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/40 transition-all"
            />
          </div>

          {/* Vincular lead (opcional, qualquer tipo) */}
          <div className="space-y-1.5">
            <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
              <User className="w-3 h-3" /> Vincular Lead (opcional)
            </label>
            <select
              value={linkedLeadId}
              onChange={(e) => setLinkedLeadId(e.target.value)}
              className="w-full bg-[var(--color-surface)] border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500/40 transition-all"
            >
              <option value="">— Sem lead vinculado —</option>
              {(leads as any[]).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.company || l.name}{l.company && l.name ? ` · ${l.name}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Responsável */}
          <div className="space-y-1.5">
            <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
              <User className="w-3 h-3" /> Responsável *
            </label>
            {closerOptions.length > 0 ? (
              <select
                value={closerName}
                onChange={(e) => setCloserName(e.target.value)}
                className="w-full bg-[var(--color-surface)] border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500/40 transition-all"
              >
                <option value="">Selecionar responsável...</option>
                {closerOptions.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                placeholder="Nome do responsável..."
                value={closerName}
                onChange={(e) => setCloserName(e.target.value)}
                className="w-full bg-[var(--color-surface)] border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/40 transition-all"
              />
            )}
          </div>

          {/* Data e Hora */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <Calendar className="w-3 h-3" /> Data
              </label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-[var(--color-surface)] border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500/40 transition-all"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
                <Clock className="w-3 h-3" /> Horário
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full bg-[var(--color-surface)] border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white focus:outline-none focus:border-blue-500/40 transition-all"
              />
            </div>
          </div>

          {/* Duração */}
          <div className="space-y-1.5">
            <label className="text-[8px] font-black uppercase tracking-widest text-slate-500 flex items-center gap-1.5">
              <Clock className="w-3 h-3" /> Duração
            </label>
            <div className="flex gap-2">
              {[30, 45, 60, 90].map((min) => (
                <button
                  key={min}
                  onClick={() => setDuration(min)}
                  className={cn(
                    "flex-1 py-2 rounded-xl border text-[10px] font-black transition-all",
                    duration === min
                      ? "bg-blue-500/15 border-blue-500/30 text-blue-300"
                      : "bg-white/[0.02] border-white/[0.06] text-slate-500 hover:border-white/[0.12] hover:text-slate-300"
                  )}
                >
                  {min}min
                </button>
              ))}
            </div>
          </div>

          {/* Pauta */}
          <div className="space-y-1.5">
            <label className="text-[8px] font-black uppercase tracking-widest text-slate-500">Pauta (opcional)</label>
            <textarea
              value={pauta}
              onChange={(e) => setPauta(e.target.value)}
              placeholder="Objetivos da reunião, pontos a discutir..."
              rows={3}
              className="w-full bg-[var(--color-surface)] border border-white/[0.08] rounded-xl px-3 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500/40 transition-all resize-none"
            />
          </div>

          {/* Info sala S.P.Y. */}
          <div className="flex items-center gap-3 p-3 bg-blue-500/[0.06] border border-blue-500/15 rounded-xl">
            <Video className="w-4 h-4 text-blue-400 shrink-0" />
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Será criada uma <strong className="text-blue-300">Sala S.P.Y. (Jitsi)</strong> exclusiva. Compartilhe o link com os participantes — nenhum app necessário.
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
