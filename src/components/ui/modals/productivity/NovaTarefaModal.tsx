import React, { useEffect, useMemo, useState } from "react";
import {
  ClipboardList, Layers, Users, Calendar, Clock,
  Mail, X, Plus, CalendarCheck, Loader2, CheckCircle2, AlertCircle,
} from "lucide-react";
import { Modal } from "../../modal";
import { Button } from "../../button";
import { useData } from "../../../../contexts/DataContext";
import { useAuth } from "../../../../contexts/AuthContext";
import { connectGoogleCalendar, getGoogleCalendarStatus } from "../../../../lib/google-auth";
import { createCalendarEvent } from "../../../../lib/google-calendar";
import { toast } from "sonner";
import {
  listarDepartamentosTarefa, mesmoDepartamento, TIPOS_TAREFA_CLIENTE, TIPOS_TAREFA_INTERNA,
} from "../../../../lib/departamentosTarefa";

export type NovaTarefaPayload = {
  /** Área responsável pela tarefa (Comercial, Dev, Marketing...). */
  departamento?: string;
  nome: string;
  tipo: string;
  prioridade: string;
  /** ISO datetime — início */
  dataInicio: string;
  /** ISO datetime — fim */
  dataFim: string;
  /** Compatibilidade legado (recebe dataInicio) */
  data?: string;
  /** id do lead vinculado (`leads.id`) — vazio = tarefa interna, sem lead. */
  relacionado: string;
  /** `users.id` do responsável (`colaboradores.user_id`) — vazio = não atribuído. */
  vendedor: string;
  produtos: string[];
  tags: string;
  /** E-mails dos convidados */
  convidados: string[];
  bloquearAgenda: boolean;
  calendarLink?: string;
};

type NovaTarefaModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: NovaTarefaPayload) => void;
  initialValue?: Partial<NovaTarefaPayload> | null;
  title?: string;
  submitText?: string;
};

const labelClass =
  "text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5";
const fieldClass =
  "w-full bg-[var(--color-surface)] border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:border-[var(--color-primary-blue)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]/30 transition-all placeholder:text-slate-600";

const TASK_TYPES = TIPOS_TAREFA_CLIENTE;

const PRIORITIES = ["Alta", "Média", "Baixa"];

/** Retorna today no formato YYYY-MM-DD */
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
/** HH:MM daqui a 1 hora */
function oneHourFromNow() {
  const d = new Date();
  d.setHours(d.getHours() + 1, 0, 0, 0);
  return d.toTimeString().slice(0, 5);
}
function twoHoursFromNow() {
  const d = new Date();
  d.setHours(d.getHours() + 2, 0, 0, 0);
  return d.toTimeString().slice(0, 5);
}
function buildISO(date: string, time: string) {
  if (!date || !time) return "";
  return `${date}T${time}:00`;
}

export function NovaTarefaModal({
  isOpen,
  onClose,
  onSave,
  initialValue,
  title = "Nova Tarefa / Compromisso",
  submitText = "Agendar Tarefa",
}: NovaTarefaModalProps) {
  const { colaboradores, products, leads, tasks } = useData();
  const { activeTenantId, user } = useAuth();

  // `assigned_to` FK pra `users.id`, não `colaboradores.id` (texto, nem uuid) —
  // por isso a opção usa `user_id` do colaborador. Colaborador sem `user_id`
  // vinculado (conta de sistema nunca logada) fica de fora da lista, já que
  // não há como atribuir uma tarefa a ele via essa coluna.
  const collaboratorOptions = useMemo(
    () =>
      (colaboradores as any[])
        .filter((c) => c.status !== "Desligado")
        .map((c) => ({ id: c.user_id as string, name: (c.nome || c.name || "") as string, email: (c.email || "") as string }))
        .filter((c) => c.name && c.id),
    [colaboradores]
  );
  const sellerOptions = collaboratorOptions;
  const currentUserColaboradorId = useMemo(() => {
    if (!user?.email) return "";
    return collaboratorOptions.find((c) => c.email.toLowerCase() === user.email!.toLowerCase())?.id || "";
  }, [collaboratorOptions, user?.email]);

  /* ─── Leads disponíveis pra vincular a tarefa (`lead_id`) ─────────────── */
  const leadOptions = useMemo(
    () => (leads as any[]).map((l) => ({ id: l.id as string, label: (l.company || l.name || "") as string })).filter((l) => l.label),
    [leads]
  );

  /* ─── Campos principais ─────────────────────────────────────── */
  // Tarefa pode ser de um cliente (lead) ou interna de qualquer departamento.
  const departamentoDoUsuario = useMemo(() => {
    const eu = (colaboradores as any[]).find((c) => (user?.id && c.user_id === user.id) || (user?.email && c.email && c.email.toLowerCase() === user.email.toLowerCase()));
    const d = (eu?.departamento as string) || ""; return /^geral$/i.test(d.trim()) ? "" : d;
  }, [colaboradores, user?.id, user?.email]);
  const departamentoOptions = useMemo(() => listarDepartamentosTarefa(colaboradores as any[], tasks as any[]), [colaboradores, tasks]);
  const [escopo, setEscopo] = useState<"cliente" | "interna">(initialValue && !initialValue.relacionado ? "interna" : "cliente");
  const [departamento, setDepartamento] = useState(initialValue?.departamento || departamentoDoUsuario || "");
  const tiposDoEscopo = escopo === "interna" ? TIPOS_TAREFA_INTERNA : TIPOS_TAREFA_CLIENTE;

  const [nome, setNome] = useState(initialValue?.nome || "");
  const [tipo, setTipo] = useState(initialValue?.tipo || TASK_TYPES[0]);
  const [prioridade, setPrioridade] = useState(initialValue?.prioridade || "Média");
  const [relacionado, setRelacionado] = useState(initialValue?.relacionado || "");
  const [vendedor, setVendedor] = useState(initialValue?.vendedor || currentUserColaboradorId || "");
  const [produtos, setProdutos] = useState<string[]>(initialValue?.produtos || []);
  const [tags, setTags] = useState(initialValue?.tags || "");

  /* ─── Data / Hora ───────────────────────────────────────────── */
  const [dataDate, setDataDate] = useState(todayStr());
  const [horaInicio, setHoraInicio] = useState(oneHourFromNow());
  const [horaFim, setHoraFim] = useState(twoHoursFromNow());

  /* ─── Convidados ────────────────────────────────────────────── */
  const [convidados, setConvidados] = useState<string[]>(initialValue?.convidados || []);
  const [emailAvulso, setEmailAvulso] = useState("");
  const [bloquearAgenda, setBloquearAgenda] = useState(initialValue?.bloquearAgenda || false);

  /* ─── Google Calendar ───────────────────────────────────────── */
  const [googleEmail, setGoogleEmail] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  /* ─── Reset ao abrir ────────────────────────────────────────── */
  useEffect(() => {
    if (!isOpen) return;
    const ehInterna = !!initialValue && !initialValue.relacionado;
    setEscopo(ehInterna ? "interna" : "cliente");
    setDepartamento(initialValue?.departamento || departamentoDoUsuario || "");
    setNome(initialValue?.nome || "");
    setTipo(initialValue?.tipo || (ehInterna ? TIPOS_TAREFA_INTERNA : TIPOS_TAREFA_CLIENTE)[0]);
    setPrioridade(initialValue?.prioridade || "Média");
    if (initialValue?.dataInicio) {
      const [d, t] = initialValue.dataInicio.split("T");
      if (d) setDataDate(d);
      if (t) setHoraInicio(t.slice(0, 5));
    } else if (initialValue?.data) {
      const [d, t] = initialValue.data.split("T");
      if (d) setDataDate(d);
      if (t) setHoraInicio(t.slice(0, 5));
    } else {
      setDataDate(todayStr());
      setHoraInicio(oneHourFromNow());
    }
    if (initialValue?.dataFim) {
      const [, t] = initialValue.dataFim.split("T");
      if (t) setHoraFim(t.slice(0, 5));
    } else {
      setHoraFim(twoHoursFromNow());
    }
    setRelacionado(initialValue?.relacionado || "");
    setVendedor(initialValue?.vendedor || currentUserColaboradorId || "");
    setProdutos(initialValue?.produtos || []);
    setTags(initialValue?.tags || "");
    setConvidados(initialValue?.convidados || []);
    setBloquearAgenda(initialValue?.bloquearAgenda || false);
    setEmailAvulso("");
    setGoogleError(null);
    // Checar se já está conectado
    if (activeTenantId) {
      getGoogleCalendarStatus(activeTenantId).then((status) => {
        if (status.connected) setGoogleEmail(status.email || "Conectado");
      });
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Convidados helpers ─────────────────────────────────────── */
  const addConvidadoByEmail = (email: string) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || convidados.includes(trimmed)) return;
    setConvidados((prev) => [...prev, trimmed]);
    setEmailAvulso("");
  };

  const addCollaboratorAsGuest = (collab: { name: string; email: string }) => {
    if (!collab.email) { toast.error(`${collab.name} não tem e-mail cadastrado.`); return; }
    addConvidadoByEmail(collab.email);
  };

  const removeConvidado = (email: string) =>
    setConvidados((prev) => prev.filter((c) => c !== email));

  const toggleProduto = (id: string) =>
    setProdutos((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );

  /* ─── Google Connect ─────────────────────────────────────────── */
  const handleConnectGoogle = async () => {
    if (!activeTenantId) return;
    try {
      setGoogleLoading(true);
      setGoogleError(null);
      // Redireciona a página inteira pro consentimento do Google — volta
      // pra esta mesma rota depois (o modal precisa ser reaberto).
      await connectGoogleCalendar(activeTenantId, window.location.pathname);
    } catch (err: any) {
      const msg = err.message || "Erro ao conectar com Google";
      setGoogleError(msg);
      toast.error(msg, { duration: 8000 });
      setGoogleLoading(false);
    }
  };

  /* ─── Submit ─────────────────────────────────────────────────── */
  const canSubmit = useMemo(
    () => Boolean(nome.trim() && dataDate && horaInicio),
    [nome, dataDate, horaInicio]
  );

  const relacionadoLabel = leadOptions.find((l) => l.id === relacionado)?.label || "Interno";
  const vendedorLabel = sellerOptions.find((c) => c.id === vendedor)?.name || "";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit) return;

    const dataInicio = buildISO(dataDate, horaInicio);
    const dataFim    = buildISO(dataDate, horaFim || horaInicio);

    let calendarLink: string | undefined;

    if (bloquearAgenda) {
      try {
        if (!activeTenantId) throw new Error("Nenhum tenant ativo.");

        const attendees = Array.from(new Set([...convidados])).filter(Boolean);
        const event = await createCalendarEvent(activeTenantId, {
          title: `${tipo} — ${nome}`,
          description: [
            `📋 Tarefa: ${nome}`,
            `🏢 Relacionado: ${relacionadoLabel}`,
            vendedorLabel ? `👤 Responsável: ${vendedorLabel}` : "",
            tags ? `🏷️ Tags: ${tags}` : "",
            attendees.length > 0 ? `👥 Convidados: ${attendees.join(", ")}` : "",
          ].filter(Boolean).join("\n"),
          startISO: dataInicio,
          endISO: dataFim,
          attendeeEmails: attendees,
          skipConferenceData: true,
        });
        calendarLink = event.htmlLink;
        toast.success(
          attendees.length > 0
            ? `Evento criado no Google Calendar! ${attendees.length} participante(s) notificado(s).`
            : "Evento sincronizado na sua agenda Google com sucesso!"
        );
      } catch (err: any) {
        const reason = err?.message === "google_calendar_not_connected"
          ? "conecte sua conta Google primeiro"
          : (err?.message || "");
        toast.warning("Tarefa salva, mas não foi possível criar o evento no Calendar: " + reason);
      }
    }

    onSave({
      nome: nome.trim(),
      tipo,
      departamento: departamento || undefined,
      prioridade,
      dataInicio,
      dataFim,
      data: dataInicio,
      relacionado: escopo === "interna" ? "" : relacionado,
      vendedor,
      produtos,
      tags: tags.trim(),
      convidados,
      bloquearAgenda,
      calendarLink,
    });
  };

  /* ─── Render ─────────────────────────────────────────────────── */
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      maxWidth="max-w-2xl"
      title={
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center">
            <Layers className="w-5 h-5 text-[var(--color-primary-blue)]" />
          </div>
          <div>
            <div className="text-base font-black text-white">{title}</div>
            <div className="text-[10px] uppercase tracking-widest font-bold text-slate-400 mt-1">
              Tarefas de clientes e de qualquer departamento da empresa
            </div>
          </div>
        </div>
      }
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} className="text-slate-400 hover:text-white">
            Cancelar
          </Button>
          <Button
            type="submit"
            form="nova-tarefa-form"
            className="bg-[var(--color-primary-blue)] hover:brightness-110 text-white font-bold px-6"
            disabled={!canSubmit}
          >
            {submitText}
          </Button>
        </>
      }
    >
      <form id="nova-tarefa-form" onSubmit={handleSubmit} className="space-y-5 text-left">
        {/* Escopo: tarefa de um cliente ou interna de um departamento */}
        <div className="space-y-2">
          <label className={labelClass}>Tipo de tarefa</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: "cliente", rotulo: "De cliente", dica: "Ligada a um lead ou empresa" },
              { id: "interna", rotulo: "Interna", dica: "Trabalho de um departamento" },
            ] as const).map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setEscopo(o.id);
                  const lista = o.id === "interna" ? TIPOS_TAREFA_INTERNA : TIPOS_TAREFA_CLIENTE;
                  if (!lista.includes(tipo)) setTipo(lista[0]);
                }}
                aria-pressed={escopo === o.id}
                className={`text-left px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${escopo === o.id ? "border-[var(--color-primary-blue)] bg-[var(--color-primary-blue)]/10" : "border-white/10 bg-transparent hover:bg-white/5"}`}
              >
                <span className="block text-sm font-black text-white">{o.rotulo}</span>
                <span className="block text-[11px] text-slate-400">{o.dica}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Linha 1: Nome + Cliente (só tarefa de cliente) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className={labelClass}>
              <ClipboardList className="w-3 h-3" /> Título da tarefa
            </label>
            <input
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className={fieldClass}
              placeholder={escopo === "interna" ? "Ex: Revisar o layout da landing page" : "Ex: Reunião com Cliente Vértice"}
              required
            />
          </div>
          {escopo === "cliente" ? (
            <div className="space-y-2">
              <label className={labelClass}>
                <Users className="w-3 h-3" /> Lead / Empresa Associado
              </label>
              <select value={relacionado} onChange={(e) => setRelacionado(e.target.value)} className={fieldClass}>
                <option value="">Nenhum</option>
                {leadOptions.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-2">
              <label className={labelClass}>
                <Layers className="w-3 h-3" /> Departamento
              </label>
              <select value={departamento} onChange={(e) => setDepartamento(e.target.value)} className={fieldClass}>
                <option value="">Sem departamento</option>
                {departamentoOptions.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
        </div>

        {escopo === "cliente" && (
          <div className="space-y-2">
            <label className={labelClass}><Layers className="w-3 h-3" /> Departamento responsável</label>
            <select value={departamento} onChange={(e) => setDepartamento(e.target.value)} className={fieldClass}>
              <option value="">Sem departamento</option>
              {departamentoOptions.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        )}

        {/* Linha 2: Tipo + Prioridade */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className={labelClass}>
              <Layers className="w-3 h-3" /> Categoria
            </label>
            <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={fieldClass}>
              {tiposDoEscopo.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Prioridade</label>
            <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className={fieldClass}>
              {PRIORITIES.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Linha 3: Data + Hora início + Hora fim */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="space-y-2">
            <label className={labelClass}>
              <Calendar className="w-3 h-3" /> Data
            </label>
            <input
              type="date"
              value={dataDate}
              min={todayStr()}
              onChange={(e) => setDataDate(e.target.value)}
              className={fieldClass}
              required
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>
              <Clock className="w-3 h-3" /> Hora início
            </label>
            <input
              type="time"
              value={horaInicio}
              onChange={(e) => setHoraInicio(e.target.value)}
              className={fieldClass}
              required
            />
          </div>
          <div className="space-y-2">
            <label className={labelClass}>
              <Clock className="w-3 h-3" /> Hora fim
            </label>
            <input
              type="time"
              value={horaFim}
              onChange={(e) => setHoraFim(e.target.value)}
              className={fieldClass}
            />
          </div>
        </div>

        {/* Linha 4: Vendedor responsável */}
        <div className="space-y-2">
          <label className={labelClass}>
            <Users className="w-3 h-3" /> Responsável
          </label>
          <select value={vendedor} onChange={(e) => setVendedor(e.target.value)} className={fieldClass}>
            <option value="">Não Atribuído</option>
            {sellerOptions.map((c) => (
              <option key={c.id} value={c.id}>{c.name}{c.email ? ` — ${c.email}` : ""}</option>
            ))}
            {sellerOptions.length === 0 && (
              <option value="" disabled>Nenhum colaborador cadastrado</option>
            )}
          </select>
        </div>

        {/* Linha 5: Convidados */}
        <div className="space-y-2">
          <label className={labelClass}>
            <Mail className="w-3 h-3" /> Convidados
            <span className="text-[9px] text-slate-500 normal-case tracking-normal ml-1">
              (receberão convite no Google Calendar se "Bloquear agenda" estiver ativo)
            </span>
          </label>

          {/* Tags de convidados já adicionados */}
          {convidados.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {convidados.map((email) => (
                <span
                  key={email}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/25 text-[11px] font-semibold text-white"
                >
                  {email}
                  <button
                    type="button"
                    onClick={() => removeConvidado(email)}
                    className="ml-0.5 text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Adicionar colaborador do sistema */}
          {collaboratorOptions.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {collaboratorOptions.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  disabled={convidados.includes(c.email.toLowerCase())}
                  onClick={() => addCollaboratorAsGuest(c)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed
                    bg-[var(--color-surface)] border-white/10 text-slate-400 hover:border-[var(--color-primary-blue)]/40 hover:text-white"
                >
                  <Plus className="w-2.5 h-2.5" /> {c.name}
                </button>
              ))}
            </div>
          )}

          {/* Input e-mail avulso (cliente externo) */}
          <div className="flex gap-2">
            <input
              type="email"
              value={emailAvulso}
              onChange={(e) => setEmailAvulso(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addConvidadoByEmail(emailAvulso); }
              }}
              className={fieldClass + " flex-1"}
              placeholder="email@cliente.com — pressione Enter para adicionar"
            />
            <button
              type="button"
              onClick={() => addConvidadoByEmail(emailAvulso)}
              className="px-4 py-3 rounded-xl bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/25 text-[var(--color-primary-blue)] text-sm font-bold hover:bg-[var(--color-primary-blue)]/20 transition-all"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Linha 6: Bloquear agenda (Google Calendar) */}
        <div className="rounded-xl border border-white/10 bg-[var(--color-surface)]/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <CalendarCheck className="w-4 h-4 text-[var(--color-primary-blue)]" />
              <div>
                <div className="text-sm font-bold text-white">Bloquear na agenda dos convidados</div>
                <div className="text-[10px] text-slate-500">
                  Cria um evento no Google Calendar e envia convite para todos os convidados
                </div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={bloquearAgenda}
              onClick={() => setBloquearAgenda((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                bloquearAgenda ? "bg-[var(--color-primary-blue)]" : "bg-white/10"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                  bloquearAgenda ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Status Google */}
          {bloquearAgenda && (
            <div className={`rounded-lg border p-3 flex items-center justify-between gap-3 ${
              googleEmail
                ? "bg-emerald-500/[0.07] border-emerald-500/20"
                : googleError
                ? "bg-rose-500/[0.07] border-rose-500/20"
                : "bg-amber-500/[0.05] border-amber-500/20"
            }`}>
              <div className="flex items-center gap-2 min-w-0">
                {googleEmail
                  ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  : <AlertCircle className={`w-4 h-4 shrink-0 ${googleError ? "text-rose-400" : "text-amber-400"}`} />}
                <div className="min-w-0">
                  <div className={`text-xs font-bold ${googleEmail ? "text-emerald-400" : googleError ? "text-rose-400" : "text-amber-400"}`}>
                    {googleEmail ? `Google conectado${googleEmail !== "Conectado" ? ` (${googleEmail})` : ""}` : googleError ? "Erro na autenticação Google" : "Google não conectado"}
                  </div>
                  {!googleEmail && (
                    <div className="text-[10px] text-slate-500">
                      {googleError || "Conecte sua conta Google para enviar convites de calendário"}
                    </div>
                  )}
                </div>
              </div>
              {!googleEmail && (
                <button
                  type="button"
                  onClick={handleConnectGoogle}
                  disabled={googleLoading}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-gray-800 text-xs font-bold hover:bg-gray-100 transition-all disabled:opacity-60"
                >
                  {googleLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                  Conectar Google
                </button>
              )}
            </div>
          )}
        </div>

        {/* Linha 7: Produtos + Tags */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className={labelClass}>Produtos / Serviços Relacionados</label>
            {products.length === 0 ? (
              <p className="text-xs text-slate-500 italic px-1">Nenhum produto cadastrado no catálogo.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-[var(--color-surface)] border border-white/10 rounded-xl">
                {products.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProduto(p.id)}
                    className={`px-2.5 py-1 text-[10px] font-bold rounded-full transition-colors ${
                      produtos.includes(p.id)
                        ? "bg-[var(--color-primary-blue)] text-white"
                        : "bg-[var(--color-surface-sunken)] text-slate-400 hover:bg-white/10"
                    }`}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-2">
            <label className={labelClass}>Tags</label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              className={fieldClass}
              placeholder="Ex: prioridade alta, follow-up"
            />
          </div>
        </div>
      </form>
    </Modal>
  );
}
