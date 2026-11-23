import React, { useRef, useEffect, useLayoutEffect, useState } from "react";
import { AI_OUTSIDE_AURORA_ENABLED } from "../../../lib/featureFlags";
import { ArrowLeft, Phone, MoreVertical, Sparkles, MessageCircle, CheckCheck, Send, Mic, Paperclip, Clock, Calendar, Info, Mail, CheckCircle2, Search } from "lucide-react";
import { Contact, Message, RightPanelState } from "./useMessaging";
import { toast } from "sonner";
import { Trash2, X, FileText, Image as ImageIcon, Loader2 } from "lucide-react";
import { prepararArquivo, formatarTamanho, formatarDuracao, formatoDeGravacao, gravacaoDisponivel, LIMITE_BYTES, type MidiaParaEnviar } from "../../../lib/chatMedia";

import { ConversasSection } from "../../../components/ui/lead-details/ConversasSection";
const SmileIcon = ({className}: {className?: string}) => (
  <svg viewBox="0 0 24 24" width="24" height="24" className={className} fill="currentColor">
    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8zm-2-9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm4 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm-2 5c2.327 0 4.316-1.42 5.092-3.411a.999.999 0 0 0-.916-1.391H7.824a1 1 0 0 0-.916 1.391C7.684 14.58 9.673 16 12 16z"></path>
  </svg>
);

interface ActiveChatAreaProps {
  isMobile: boolean;
  activeChat: string | null;
  setActiveChat: (id: string | null) => void;
  previousChat: string | null;
  rightPanel: RightPanelState;
  setRightPanel: React.Dispatch<React.SetStateAction<RightPanelState>>;
  currentContact: Contact | undefined;
  currentMessages: Message[];
  isOffline: boolean;
  handleManualRetry: () => void;
  sentiment: string;
  viewMode: "chat" | "unified";
  setViewMode: (mode: "chat" | "unified") => void;
  matchingLead: any;
  setShowAddActivityModal: (show: boolean) => void;
  relatedActivities: any[];
  parseMessageTimeToTimestamp: (timeStr: string) => number;
  parseActivityDateToTimestamp: (dateStr: string) => number;
  inputText: string;
  setInputText: (text: string) => void;
  handleSendMessage: () => void;
  handleSendMedia: (m: MidiaParaEnviar, caption: string) => Promise<boolean>;
}

export function ActiveChatArea({
  isMobile,
  activeChat,
  setActiveChat,
  previousChat,
  rightPanel,
  setRightPanel,
  currentContact,
  currentMessages,
  isOffline,
  handleManualRetry,
  sentiment,
  viewMode,
  setViewMode,
  matchingLead,
  setShowAddActivityModal,
  relatedActivities,
  parseMessageTimeToTimestamp,
  parseActivityDateToTimestamp,
  inputText,
  setInputText,
  handleSendMessage,
  handleSendMedia
}: ActiveChatAreaProps) {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  // Só acompanha o fim da conversa enquanto a pessoa está lá embaixo: se ela subiu para ler, não puxa de volta.
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Anexos e áudio ────────────────────────────────────────────────────────
  const [anexo, setAnexo] = useState<MidiaParaEnviar | null>(null);
  const [menuAnexo, setMenuAnexo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const arquivoImagem = useRef<HTMLInputElement>(null);
  const arquivoDoc = useRef<HTMLInputElement>(null);
  const gravador = useRef<MediaRecorder | null>(null);
  const trechos = useRef<Blob[]>([]);
  const fluxo = useRef<MediaStream | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const limparAnexo = () => {
    setAnexo((a) => { if (a?.previewUrl) URL.revokeObjectURL(a.previewUrl); return null; });
  };
  const pararFluxo = () => { fluxo.current?.getTracks().forEach((t) => t.stop()); fluxo.current = null; };

  // Trocou de conversa ou saiu da tela: descarta anexo e gravação em andamento.
  useEffect(() => {
    limparAnexo();
    setMenuAnexo(false);
    if (gravador.current && gravador.current.state !== "inactive") { gravador.current.onstop = null; gravador.current.stop(); }
    pararFluxo();
    setGravando(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat]);
  useEffect(() => () => { pararFluxo(); }, []);

  // Fecha o menu de anexo ao clicar fora.
  useEffect(() => {
    if (!menuAnexo) return;
    const fora = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) setMenuAnexo(false); };
    document.addEventListener("pointerdown", fora);
    return () => document.removeEventListener("pointerdown", fora);
  }, [menuAnexo]);

  // Relógio da gravação (para sozinho em 3 minutos).
  useEffect(() => {
    if (!gravando) return;
    const t = setInterval(() => setSegundos((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [gravando]);
  useEffect(() => { if (gravando && segundos >= 180) void terminarGravacao(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [segundos, gravando]);

  const escolherArquivo = async (file: File | undefined, forcar?: "image") => {
    setMenuAnexo(false);
    if (!file) return;
    const r = await prepararArquivo(file, forcar);
    if (r.ok === false) { toast.error(r.erro); return; }
    limparAnexo();
    setAnexo(r.midia);
    inputRef.current?.focus();
  };

  const iniciarGravacao = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const formato = formatoDeGravacao();
      const rec = new MediaRecorder(stream, formato ? { mimeType: formato, audioBitsPerSecond: 32000 } : undefined);
      trechos.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) trechos.current.push(e.data); };
      rec.start(250);
      gravador.current = rec;
      fluxo.current = stream;
      setSegundos(0);
      setGravando(true);
    } catch {
      toast.error("Não foi possível usar o microfone. Permita o acesso ao microfone no navegador.");
    }
  };

  const terminarGravacao = async (enviar: boolean) => {
    const rec = gravador.current;
    if (!rec) { setGravando(false); return; }
    const blob = await new Promise<Blob | null>((ok) => {
      rec.onstop = () => ok(trechos.current.length ? new Blob(trechos.current, { type: rec.mimeType || "audio/webm" }) : null);
      if (rec.state !== "inactive") rec.stop(); else ok(null);
    });
    pararFluxo();
    gravador.current = null;
    setGravando(false);
    if (!enviar || !blob) return;
    if (blob.size > LIMITE_BYTES) { toast.error(`O áudio ficou com ${formatarTamanho(blob.size)}. O máximo é ${formatarTamanho(LIMITE_BYTES)}.`); return; }
    const ext = /ogg/.test(blob.type) ? "ogg" : /mp4/.test(blob.type) ? "m4a" : "webm";
    setEnviando(true);
    await handleSendMedia({ kind: "audio", blob, mimetype: blob.type, filename: `audio.${ext}` }, "");
    setEnviando(false);
  };

  const enviarAnexo = async () => {
    if (!anexo || enviando) return;
    setEnviando(true);
    const ok = await handleSendMedia(anexo, inputText);
    setEnviando(false);
    if (ok) { limparAnexo(); setInputText(""); }
  };

  const podeEnviar = !!anexo || !!inputText.trim();
  const enviar = () => (anexo ? void enviarAnexo() : handleSendMessage());

  const noFim = useRef(true);
  const ultimoId = useRef<string | null>(null);
  const aoRolar = () => {
    const el = chatContainerRef.current;
    if (el) noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
  };
  const irAoFim = (suave: boolean) => {
    const el = chatContainerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: suave ? "smooth" : "auto" });
  };

  // A caixa cresce com o texto (até 120px) e volta ao tamanho normal depois de enviar.
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [inputText]);
  // Abriu uma conversa no computador: já pode digitar.
  useEffect(() => { if (!isMobile && activeChat) inputRef.current?.focus(); }, [activeChat, isMobile]);

  // Abriu outra conversa (ou trocou a visão): vai direto para a última mensagem.
  useLayoutEffect(() => {
    noFim.current = true;
    ultimoId.current = null;
    irAoFim(false);
  }, [activeChat, viewMode]);

  // Chegou mensagem nova: desce só se a pessoa já estava no fim ou se foi ela quem enviou.
  useEffect(() => {
    const ultima = currentMessages[currentMessages.length - 1];
    const id = ultima?.id ?? null;
    if (id === ultimoId.current) return;
    const primeira = ultimoId.current === null;
    ultimoId.current = id;
    if (primeira) { irAoFim(false); return; }
    if (noFim.current || ultima?.sender === "me") irAoFim(true);
  }, [currentMessages]);

  if (!currentContact) {
    return !isMobile ? (
      <div className="flex-1 flex items-center justify-center relative bg-[var(--color-surface-sunken)] rounded-3xl">
        <div className="flex flex-col items-center justify-center max-w-[420px] text-center relative z-10 px-6">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-900/30 mb-8 transform -rotate-12 ring-4 ring-white/5">
            <MessageCircle className="w-10 h-10 text-white transform rotate-12" strokeWidth={2} />
          </div>
          <h2 className="text-[var(--color-text-primary)] text-3xl font-bold tracking-tight mb-4">Central de Mensagens</h2>
          <p className="text-[var(--color-text-muted)] text-[15px] leading-relaxed mb-8 font-medium">
            Omnichannel inteligente. Gerencie WhatsApp, Instagram e E-mail em um só lugar.
          </p>
          <div className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-full px-5 py-2 flex items-center gap-2 text-[var(--color-text-muted)] text-[12px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Criptografado
          </div>
        </div>
      </div>
    ) : null;
  }

  const viewChatId = isMobile ? (activeChat || previousChat) : activeChat;

  return (
    <div className={`${
        isMobile
          ? `absolute inset-0 flex flex-col bg-[var(--color-surface)] transition-transform duration-400 ease-[cubic-bezier(0.32,0.72,0,1)] z-20 shadow-[0_0_40px_rgba(0,0,0,0.8)] ${activeChat ? 'translate-x-[0%]' : 'translate-x-[100%]'}`
          : 'flex-1 min-w-0 h-full flex flex-col bg-[var(--color-surface)] z-0 relative overflow-x-clip'
      }`}>
      {/* Chat Header */}
      <div className="shrink-0 h-[64px] px-2 md:px-6 flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-elevated)] z-10 w-full shadow-sm">
        <div className="flex items-center gap-1.5 md:gap-3 max-w-[75%] cursor-pointer" onClick={() => { if(isMobile) setRightPanel("info"); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (isMobile) setRightPanel("info"); } }}>
          {isMobile && (
            <button 
              onClick={(e) => { e.stopPropagation(); setActiveChat(null); setRightPanel("none"); }}
              className="p-2 -ml-1 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] rounded-full flex items-center justify-center cursor-pointer transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
          )}
          <div className="relative shrink-0 flex items-center gap-2.5 md:gap-3 group">
             <div className={`w-10 h-10 md:w-11 md:h-11 rounded-full flex items-center justify-center text-sm md:text-base font-bold text-white shadow-inner transition-transform group-hover:scale-105 ${
                currentContact.channel === 'WhatsApp' ? 'bg-gradient-to-br from-emerald-500 to-emerald-700' :
                currentContact.channel === 'Instagram' ? 'bg-gradient-to-br from-pink-500 to-purple-700' :
                'bg-gradient-to-br from-blue-500 to-indigo-700'
              }`}>
                {currentContact.avatar}
              </div>
              <div className="flex flex-col justify-center min-w-0">
                <h2 className="text-[var(--color-text-primary)] font-semibold text-[15px] md:text-[16px] truncate tracking-tight group-hover:text-[var(--color-primary-blue)] transition-colors leading-tight flex items-center">
                  {currentContact.name}
                  {sentiment && (
                    <span className={`ml-2 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border shrink-0 ${
                      sentiment === "Positivo" ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.15)]" :
                      sentiment === "Negativo" ? "bg-rose-500/15 border-rose-500/30 text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.15)]" :
                      sentiment === "Analisando..." ? "bg-blue-500/15 border-blue-500/30 text-blue-400 animate-pulse" :
                      "bg-amber-500/15 border-amber-500/30 text-amber-400"
                    }`}>
                      {sentiment}
                    </span>
                  )}
                </h2>
                <span className="text-[12px] text-[var(--color-text-muted)] truncate mt-0.5 flex items-center gap-1">
                  {isOffline ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleManualRetry();
                      }}
                      className="text-rose-400 font-bold uppercase text-[10px] bg-rose-500/10 border border-rose-500/25 px-2 py-0.5 rounded cursor-pointer flex items-center gap-1 hover:bg-rose-500/20 active:scale-95 transition-all shadow-[0_0_12px_rgba(244,63,94,0.15)]"
                    >
                      <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></span> Offline - Reconectar ↻
                    </button>
                  ) : currentContact.online ? (
                    <><span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse mr-0.5"></span> Online</>
                  ) : (
                   'visto por último hoje'
                  )}
                </span>
              </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1 text-[var(--color-text-muted)] shrink-0">
          {AI_OUTSIDE_AURORA_ENABLED && (<button 
            type="button"
            onClick={() => setRightPanel(p => p === "ai" ? "none" : "ai")}
            title="Assistente de IA"
            className={`p-2 rounded-lg cursor-pointer transition-all ${rightPanel === "ai" ? 'bg-[var(--color-primary-blue)]/20 text-[var(--color-primary-blue)] ring-1 ring-[var(--color-primary-blue)]/50' : 'hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]'}`}
          >
            <Sparkles className={`w-4 h-4 ${rightPanel === "ai" ? 'animate-pulse' : ''}`} />
          </button>)}
          {AI_OUTSIDE_AURORA_ENABLED && <div className="w-[1px] h-5 bg-[var(--color-border-subtle)] mx-1"></div>}
          {/* Busca na conversa escondida: sem implementação. */}
          {false && <button type="button" className="p-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-lg cursor-pointer transition-colors hidden sm:flex"><Search className="w-4 h-4" /></button>}
          {currentContact.phone && (
            <a href={`tel:${String(currentContact.phone).replace(/[^\d+]/g, "")}`} title="Ligar" className="p-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-elevated)] hover:border-[var(--color-border-default)] hover:text-[var(--color-text-primary)] rounded-lg cursor-pointer transition-colors"><Phone className="w-4 h-4" /></a>
          )}
          <button 
            type="button"
            onClick={() => setRightPanel(p => p === "info" ? "none" : "info")}
            title="Info do Contato"
            className={`p-2 rounded-lg cursor-pointer transition-colors ${rightPanel === "info" ? 'bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)]' : 'hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]'}`}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* View Mode Switcher and Binding Status header */}
      <div className="shrink-0 bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)] py-2 px-4 flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-2.5">
        <div className="flex bg-[var(--color-surface)] rounded-xl p-0.5 border border-[var(--color-border-default)] w-fit">
          <button 
            type="button"
            onClick={() => setViewMode("chat")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-tight transition-all cursor-pointer ${
              viewMode === "chat" 
                ? "bg-[var(--color-primary-blue)] !text-white shadow-xs" 
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            💬 Apenas Chat
          </button>
          <button 
            onClick={() => setViewMode("unified")}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-tight transition-all cursor-pointer ${
              viewMode === "unified" 
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-500/10" 
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            }`}
          >
            ⚡ Visão Unificada
          </button>
        </div>

        {matchingLead ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[var(--color-text-muted)]">
              Vínculo Vendas ativo: <strong className="text-[var(--color-text-primary)] font-medium">{matchingLead.name}</strong>
            </span>
            <button 
              onClick={() => setShowAddActivityModal(true)}
              className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase rounded-lg cursor-pointer transition-all animate-none"
            >
              + Novo Evento Vendas
            </button>
          </div>
        ) : (
          <span className="text-[11px] text-[var(--color-text-faint)] italic">Nenhum Lead Vendas correspondente a este telefone.</span>
        )}
      </div>

      {/* Chat Messages / Live Timeline Content */}
      <div 
        ref={chatContainerRef}
        onScroll={aoRolar}
        className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden p-4 md:p-6 space-y-5 bg-[var(--color-surface)] scrollbar-thin scrollbar-thumb-white/10"
      >
        {viewMode === "chat" && matchingLead ? (
          /* Contato ligado a um lead: a conversa aparece igual ao detalhe do lead (imagem, áudio com
             transcrição, vendedor de cada mensagem e histórico completo). Recarrega quando chega mensagem. */
          <ConversasSection embed key={matchingLead.id} sinal={currentMessages.length} lead={matchingLead} />
        ) : viewMode === "chat" ? (
          /* Simple Chat History Flow */
          currentMessages.length > 0 ? (
            <>
              <div className="bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] p-3.5 space-y-2">
                {currentMessages.map((msg) => {
                  const isMe = msg.sender === "me";
                  return (
                    <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`px-3 py-2 rounded-2xl text-xs max-w-[82%] leading-relaxed ${
                          isMe
                            ? "bg-[var(--color-primary-blue)] text-white rounded-tr-none"
                            : "bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] rounded-tl-none shadow-sm"
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.text || <em className="opacity-60">[mensagem sem texto]</em>}</p>
                        <span className="text-[9px] opacity-60 flex items-center justify-end gap-1 mt-1">
                          {msg.time}
                          {isMe && <CheckCheck className="w-3 h-3" />}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full opacity-50 flex-col gap-4">
              <div className="bg-[var(--color-surface-sunken)] p-6 rounded-full shadow-lg ring-1 ring-white/10">
                <MessageCircle className="w-10 h-10 text-emerald-400" />
              </div>
              <p className="text-sm text-[var(--color-text-muted)] font-medium font-sans">Inicie a conversa no WhatsApp</p>
            </div>
          )
        ) : (
          /* Unified Linear CRM Timeline Flow */
          (() => {
            const timelineItems: any[] = [];
            currentMessages.forEach(msg => {
              timelineItems.push({
                type: "message",
                timestamp: parseMessageTimeToTimestamp(msg.time),
                data: msg
              });
            });
            relatedActivities.forEach(act => {
              timelineItems.push({
                type: "activity",
                timestamp: parseActivityDateToTimestamp(act.date),
                data: act
              });
            });
            timelineItems.sort((a, b) => a.timestamp - b.timestamp);

            if (timelineItems.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center h-full opacity-50 py-16 gap-3">
                  <Clock className="w-10 h-10 text-[var(--color-text-faint)]" strokeWidth={1} />
                  <p className="text-sm text-[var(--color-text-muted)]">Nenhuma interação registrada na jornada deste cliente.</p>
                </div>
              );
            }

            return (
              <div className="space-y-6 relative border-l border-[var(--color-border-default)] pl-4 md:pl-6 ml-2 md:ml-4 py-2 font-sans text-left">
                {timelineItems.map((item, idx) => {
                  if (item.type === "message") {
                    const msg = item.data;
                    const isMe = msg.sender === "me";
                    return (
                      <div key={`msg-${msg.id}-${idx}`} className="relative group">
                        <span className={`absolute -left-[25px] md:-left-[33px] w-4 h-4 rounded-full border-2 ${isMe ? 'bg-blue-600 border-[var(--color-surface)]' : 'bg-emerald-500 border-[var(--color-surface)]'} flex items-center justify-center z-10 shadow`}>
                          <span className="w-1.5 h-1.5 bg-white rounded-full"></span>
                        </span>
                        <div className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[85%] sm:max-w-[70%] px-4 py-2.5 relative shadow-md ${
                              isMe 
                                ? 'bg-blue-600/90 text-white rounded-2xl rounded-tr-sm' 
                                : 'bg-[var(--color-surface-sunken)] text-[var(--color-text-primary)] rounded-2xl rounded-tl-sm border border-[var(--color-border-default)]'
                            }`}>
                            <div className="text-[9px] uppercase tracking-wider text-[var(--color-text-muted)] mb-1 font-bold">
                              {isMe ? "Canal SAÍDA" : "Cliente WhatsApp ENTRADA"}
                            </div>
                            <p className="text-[14px] leading-relaxed break-words whitespace-pre-wrap pb-2">
                              {msg.text}
                            </p>
                            <div className="text-[10px] text-[var(--color-text-muted)] mt-1.5 text-right flex items-center justify-end gap-1 font-medium">
                              <span>{msg.time}</span>
                              {isMe && <CheckCheck className="w-3 h-3 text-emerald-400" />}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  } else {
                    const act = item.data;
                    return (
                      <div key={`act-${act.id}-${idx}`} className="relative pl-1.5">
                        <span className="absolute -left-[27px] md:-left-[35px] w-5 h-5 rounded-full bg-[var(--color-surface)] border-2 border-amber-500/40 flex items-center justify-center z-10 shadow-lg">
                          {act.type === 'Ligação' && <Phone className="w-2.5 h-2.5 text-amber-400" />}
                          {act.type === 'E-mail' && <Mail className="w-2.5 h-2.5 text-blue-400" />}
                          {act.type === 'Reunião' && <Calendar className="w-2.5 h-2.5 text-pink-400" />}
                          {act.type === 'Outro' && <Info className="w-2.5 h-2.5 text-purple-400" />}
                        </span>
                        <div className="bg-[var(--color-surface-elevated)]/60 border border-[var(--color-border-default)] rounded-2xl p-4 space-y-2 hover:border-amber-500/20 transition-all shadow-md">
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-[9px] uppercase tracking-wider">
                              🏛️ {act.type} (Vendas)
                            </span>
                            <span className="text-[10px] text-[var(--color-text-faint)] font-medium">{act.date}</span>
                          </div>
                          <h4 className="text-[var(--color-text-primary)] text-xs md:text-sm font-bold tracking-tight">
                            {act.title}
                          </h4>
                          <p className="text-[var(--color-text-muted)] text-xs md:text-xs leading-relaxed">
                            {act.description}
                          </p>
                          <div className="pt-2 border-t border-[var(--color-border-default)] flex items-center justify-between text-[10px] text-[var(--color-text-muted)]">
                            <span>Agente: <strong className="text-[var(--color-text-muted)] font-medium">{act.seller}</strong></span>
                            <span className="text-emerald-400">Registrado em Vendas ✓</span>
                          </div>
                        </div>
                      </div>
                    );
                  }
                })}
              </div>
            );
          })()
        )}
      </div>

      {/* Caixa de mensagem: texto, anexo (foto/documento) e áudio */}
      <div className="p-3 sm:p-4 shrink-0 relative bg-[var(--color-surface-elevated)] border-t border-[var(--color-border-subtle)] z-10 w-full box-border">
        <input ref={arquivoImagem} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { void escolherArquivo(e.target.files?.[0], "image"); e.target.value = ""; }} />
        <input ref={arquivoDoc} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip" className="hidden" onChange={(e) => { void escolherArquivo(e.target.files?.[0]); e.target.value = ""; }} />

        {anexo && (
          <div className="mx-auto w-full max-w-4xl mb-2 flex items-center gap-3 rounded-2xl border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)] p-2.5">
            {anexo.previewUrl ? (
              <img src={anexo.previewUrl} alt="Prévia da imagem" className="w-14 h-14 rounded-xl object-cover shrink-0" />
            ) : (
              <span className="w-14 h-14 rounded-xl bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] grid place-items-center shrink-0"><FileText className="w-6 h-6 text-[var(--color-primary-blue)]" /></span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-[var(--color-text-primary)] truncate">{anexo.filename}</p>
              <p className="text-[11px] text-[var(--color-text-muted)]">{formatarTamanho(anexo.blob.size)} · escreva uma legenda abaixo, se quiser</p>
            </div>
            <button type="button" onClick={limparAnexo} aria-label="Remover anexo" title="Remover anexo" className="p-2 rounded-full text-[var(--color-text-muted)] hover:text-rose-500 hover:bg-[var(--color-surface-elevated)] cursor-pointer border-none bg-transparent">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {gravando ? (
          <div className="flex items-center gap-3 mx-auto w-full max-w-4xl">
            <div className="flex-1 flex items-center gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/5 px-4 min-h-[50px]">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shrink-0" />
              <span className="text-sm font-bold text-rose-600 tabular-nums">{formatarDuracao(segundos)}</span>
              <span className="text-xs text-[var(--color-text-muted)] truncate">Gravando áudio…</span>
            </div>
            <button type="button" onClick={() => void terminarGravacao(false)} aria-label="Cancelar gravação" title="Cancelar" className="w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-2xl border border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-rose-500 grid place-items-center shrink-0 cursor-pointer bg-transparent">
              <Trash2 className="w-5 h-5" />
            </button>
            <button type="button" onClick={() => void terminarGravacao(true)} aria-label="Enviar áudio" title="Enviar áudio" className="w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-2xl bg-blue-600 hover:bg-blue-500 grid place-items-center shrink-0 cursor-pointer border-none shadow-md active:scale-95 transition-all">
              <Send className="w-5 h-5 translate-x-[2px] translate-y-[-1px] text-white" />
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2 sm:gap-3 mx-auto w-full max-w-4xl">
            <div className="flex-1 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-2xl flex items-end min-h-[50px] transition-colors focus-within:border-blue-500/50 min-w-0 relative">
              <div ref={menuRef} className="relative shrink-0">
                <button type="button" onClick={() => setMenuAnexo((v) => !v)} aria-label="Anexar arquivo" aria-expanded={menuAnexo} title="Anexar foto ou documento" className="p-3 sm:p-3.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer transition-colors border-none bg-transparent">
                  <Paperclip className="w-5 h-5 -rotate-45" />
                </button>
                {menuAnexo && (
                  <div className="absolute bottom-full left-0 mb-2 w-52 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] shadow-xl p-1 z-30">
                    <button type="button" onClick={() => arquivoImagem.current?.click()} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] cursor-pointer border-none bg-transparent text-left">
                      <ImageIcon className="w-4 h-4 text-pink-500" /> Foto ou imagem
                    </button>
                    <button type="button" onClick={() => arquivoDoc.current?.click()} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-bold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)] cursor-pointer border-none bg-transparent text-left">
                      <FileText className="w-4 h-4 text-blue-500" /> Documento
                    </button>
                  </div>
                )}
              </div>

              <textarea
                ref={inputRef}
                value={inputText}
                onChange={e => setInputText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (podeEnviar) enviar();
                  }
                }}
                placeholder={anexo ? "Legenda (opcional)…" : "Mensagem..."}
                className="flex-1 min-w-0 w-full max-h-[120px] bg-transparent text-[var(--color-text-primary)] border-0 focus:ring-0 resize-none py-[14px] px-1 text-[15px] outline-none placeholder:text-[var(--color-text-faint)] overflow-y-auto block"
                rows={1}
              />

              {AI_OUTSIDE_AURORA_ENABLED && (<button
                onClick={() => setRightPanel(p => p === "ai" ? "none" : "ai")}
                className="p-3.5 text-blue-400 hover:text-blue-300 shrink-0 cursor-pointer transition-colors hidden sm:block border-none bg-transparent"
                title="Sugestão com IA"
              >
                <Sparkles className="w-5 h-5" />
              </button>)}
            </div>

            {podeEnviar || !gravacaoDisponivel() ? (
              <button
                onClick={enviar}
                disabled={!podeEnviar || enviando}
                aria-label="Enviar mensagem"
                title="Enviar (Enter)"
                className="w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-2xl bg-blue-600 flex items-center justify-center shrink-0 hover:bg-blue-500 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 transition-all shadow-md shadow-blue-900/30 cursor-pointer border-none"
              >
                {enviando ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Send className="w-5 h-5 translate-x-[2px] translate-y-[-1px] text-white" />}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void iniciarGravacao()}
                disabled={enviando}
                aria-label="Gravar áudio"
                title="Gravar áudio"
                className="w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-2xl bg-blue-600 flex items-center justify-center shrink-0 hover:bg-blue-500 active:scale-95 disabled:opacity-40 transition-all shadow-md shadow-blue-900/30 cursor-pointer border-none"
              >
                {enviando ? <Loader2 className="w-5 h-5 text-white animate-spin" /> : <Mic className="w-5 h-5 text-white" />}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
