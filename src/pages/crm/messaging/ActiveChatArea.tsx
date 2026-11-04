import React, { useRef, useEffect } from "react";
import { 
  ArrowLeft, Phone, MoreVertical, Sparkles, MessageCircle, 
  CheckCheck, Send, Mic, Paperclip, Camera, Clock, 
  Calendar, Info, Mail, CheckCircle2, ChevronRight, Search
} from "lucide-react";
import { Contact, Message, RightPanelState } from "./useMessaging";

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
  handleSendMessage
}: ActiveChatAreaProps) {
  const chatContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [currentMessages, activeChat, rightPanel, viewMode]);

  if (!currentContact) {
    return !isMobile ? (
      <div className="flex-1 flex items-center justify-center relative bg-[#0F172A]/30 rounded-3xl">
        <div className="flex flex-col items-center justify-center max-w-[420px] text-center relative z-10 px-6">
          <div className="w-24 h-24 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-blue-900/30 mb-8 transform -rotate-12 ring-4 ring-white/5">
            <MessageCircle className="w-10 h-10 text-white transform rotate-12" strokeWidth={2} />
          </div>
          <h2 className="text-white text-3xl font-bold tracking-tight mb-4">Central de Mensagens</h2>
          <p className="text-slate-400 text-[15px] leading-relaxed mb-8 font-medium">
            Omnichannel inteligente. Gerencie WhatsApp, Instagram e E-mail em um só lugar.
          </p>
          <div className="bg-white/5 border border-white/5 rounded-full px-5 py-2 flex items-center gap-2 text-slate-300 text-[12px] font-bold uppercase tracking-wider shadow-sm backdrop-blur-sm">
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
          : 'flex-1 h-full flex flex-col bg-[#0F172A]/50 z-0 relative'
      }`}>
      {/* Chat Header */}
      <div className="shrink-0 h-[64px] px-2 md:px-6 flex items-center justify-between border-b border-white/5 bg-[#0F172A]/90 backdrop-blur-md z-10 w-full shadow-sm">
        <div className="flex items-center gap-1.5 md:gap-3 max-w-[75%] cursor-pointer" onClick={() => { if(isMobile) setRightPanel("info"); }} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (isMobile) setRightPanel("info"); } }}>
          {isMobile && (
            <button 
              onClick={(e) => { e.stopPropagation(); setActiveChat(null); setRightPanel("none"); }}
              className="p-2 -ml-1 text-slate-400 hover:text-white rounded-full flex items-center justify-center cursor-pointer transition-colors"
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
                <h2 className="text-white font-semibold text-[15px] md:text-[16px] truncate tracking-tight group-hover:text-blue-400 transition-colors leading-tight flex items-center">
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
                <span className="text-[12px] text-slate-400 truncate mt-0.5 flex items-center gap-1">
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
          <button 
            type="button"
            onClick={() => setRightPanel(p => p === "ai" ? "none" : "ai")}
            title="Assistente de IA"
            className={`p-2 rounded-lg cursor-pointer transition-all ${rightPanel === "ai" ? 'bg-[var(--color-primary-blue)]/20 text-[var(--color-primary-blue)] ring-1 ring-[var(--color-primary-blue)]/50' : 'hover:bg-[var(--color-surface-sunken)] hover:text-[var(--color-text-primary)]'}`}
          >
            <Sparkles className={`w-4 h-4 ${rightPanel === "ai" ? 'animate-pulse' : ''}`} />
          </button>
          <div className="w-[1px] h-5 bg-[var(--color-border-subtle)] mx-1"></div>
          <button type="button" className="p-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-elevated)] hover:border-[var(--color-border-default)] hover:text-[var(--color-text-primary)] rounded-lg cursor-pointer transition-colors hidden sm:flex"><Search className="w-4 h-4" /></button>
          <button type="button" className="p-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-elevated)] hover:border-[var(--color-border-default)] hover:text-[var(--color-text-primary)] rounded-lg cursor-pointer transition-colors"><Phone className="w-4 h-4" /></button>
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
      <div className="shrink-0 bg-[var(--color-surface-sunken)] border-b border-[var(--color-border-subtle)] py-2 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div className="flex bg-[var(--color-surface)] rounded-xl p-0.5 border border-[var(--color-border-default)] w-fit">
          <button 
            type="button"
            onClick={() => setViewMode("chat")}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold tracking-tight transition-all cursor-pointer ${
              viewMode === "chat" 
                ? "bg-[var(--color-primary-blue)] !text-white shadow-xs" 
                : "text-slate-400 hover:text-white"
            }`}
          >
            💬 Apenas Chat
          </button>
          <button 
            onClick={() => setViewMode("unified")}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold tracking-tight transition-all cursor-pointer ${
              viewMode === "unified" 
                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-indigo-500/10" 
                : "text-slate-400 hover:text-white"
            }`}
          >
            ⚡ Visão Unificada
          </button>
        </div>

        {matchingLead ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-400">
              Vínculo CRM ativo: <strong className="text-white font-medium">{matchingLead.name}</strong>
            </span>
            <button 
              onClick={() => setShowAddActivityModal(true)}
              className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 text-emerald-400 text-[10px] font-black uppercase rounded-lg cursor-pointer transition-all animate-none"
            >
              + Novo Evento CRM
            </button>
          </div>
        ) : (
          <span className="text-[11px] text-slate-500 italic">Nenhum Lead CRM correspondente a este telefone.</span>
        )}
      </div>

      {/* Chat Messages / Live Timeline Content */}
      <div 
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 bg-[var(--color-surface)] scrollbar-thin scrollbar-thumb-white/10"
      >
        {viewMode === "chat" ? (
          /* Simple Chat History Flow */
          currentMessages.length > 0 ? (
            <>
              <div className="flex justify-center mb-6">
                <span className="text-[11px] font-medium text-slate-400 bg-white/5 px-3 py-1 rounded-full uppercase tracking-wider backdrop-blur-sm">
                  Hoje
                </span>
              </div>
              
              {currentMessages.map((msg) => {
                const isMe = msg.sender === "me";
                return (
                  <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[85%] sm:max-w-[70%] px-4 py-2.5 relative shadow-sm ${
                        isMe 
                          ? 'bg-blue-600 text-white rounded-2xl rounded-tr-sm' 
                          : 'bg-white/5 text-slate-100 rounded-2xl rounded-tl-sm border border-white/5'
                      }`}>
                       <p className="text-[14.5px] leading-relaxed break-words whitespace-pre-wrap pb-2">
                         {msg.text}
                       </p>
                       <span className={`text-[10px] font-medium absolute bottom-1.5 right-3 flex items-center gap-1 ${isMe ? 'text-blue-200/80' : 'text-slate-500'}`}>
                         {msg.time}
                         {isMe && (
                           <CheckCheck className="w-3.5 h-3.5 text-emerald-400" strokeWidth={2.5}/>
                         )}
                       </span>
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <div className="flex items-center justify-center h-full opacity-50 flex-col gap-4">
              <div className="bg-white/5 p-6 rounded-full shadow-lg ring-1 ring-white/10">
                <MessageCircle className="w-10 h-10 text-emerald-400" />
              </div>
              <p className="text-sm text-slate-400 font-medium font-sans">Inicie a conversa no WhatsApp</p>
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
                  <Clock className="w-10 h-10 text-slate-500" strokeWidth={1} />
                  <p className="text-sm text-slate-400">Nenhuma interação registrada na jornada deste cliente.</p>
                </div>
              );
            }

            return (
              <div className="space-y-6 relative border-l border-white/5 pl-4 md:pl-6 ml-2 md:ml-4 py-2 font-sans text-left">
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
                                : 'bg-white/5 text-slate-100 rounded-2xl rounded-tl-sm border border-white/5'
                            }`}>
                            <div className="text-[9px] uppercase tracking-wider text-slate-400 mb-1 font-bold">
                              {isMe ? "Canal SAÍDA" : "Cliente WhatsApp ENTRADA"}
                            </div>
                            <p className="text-[14px] leading-relaxed break-words whitespace-pre-wrap pb-2">
                              {msg.text}
                            </p>
                            <div className="text-[10px] text-slate-400 mt-1.5 text-right flex items-center justify-end gap-1 font-medium">
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
                        <span className="absolute -left-[27px] md:-left-[35px] w-5 h-5 rounded-full bg-slate-900 border-2 border-amber-500/40 flex items-center justify-center z-10 shadow-lg">
                          {act.type === 'Ligação' && <Phone className="w-2.5 h-2.5 text-amber-400" />}
                          {act.type === 'E-mail' && <Mail className="w-2.5 h-2.5 text-blue-400" />}
                          {act.type === 'Reunião' && <Calendar className="w-2.5 h-2.5 text-pink-400" />}
                          {act.type === 'Outro' && <Info className="w-2.5 h-2.5 text-purple-400" />}
                        </span>
                        <div className="bg-[var(--color-surface-elevated)]/60 border border-white/10 rounded-2xl p-4 space-y-2 hover:border-amber-500/20 transition-all shadow-md">
                          <div className="flex items-center justify-between gap-2">
                            <span className="px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold text-[9px] uppercase tracking-wider">
                              🏛️ {act.type} (CRM)
                            </span>
                            <span className="text-[10px] text-slate-500 font-medium">{act.date}</span>
                          </div>
                          <h4 className="text-white text-xs md:text-sm font-bold tracking-tight">
                            {act.title}
                          </h4>
                          <p className="text-slate-400 text-xs md:text-xs leading-relaxed">
                            {act.description}
                          </p>
                          <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
                            <span>Agente: <strong className="text-slate-300 font-medium">{act.seller}</strong></span>
                            <span className="text-emerald-400">Registrado no CRM ✓</span>
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

      {/* Chat Input */}
      <div className="p-3 sm:p-4 shrink-0 relative bg-[#0F172A]/80 border-t border-white/5 backdrop-blur-md z-10 w-full box-border">
        <div className="flex items-end gap-2 sm:gap-3 mx-auto w-full max-w-4xl">
          <div className="flex-1 bg-[var(--color-surface-elevated)] border border-white/5 rounded-2xl flex items-end min-h-[50px] shadow-inner transition-colors focus-within:border-blue-500/50 min-w-0">
            <button className="p-3 sm:p-3.5 text-slate-400 hover:text-white shrink-0 cursor-pointer transition-colors">
               <SmileIcon className="w-5 h-5" />
            </button>
            
            <textarea 
              value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Mensagem..."
              className="flex-1 min-w-0 w-full max-h-[120px] bg-transparent text-white border-0 focus:ring-0 resize-none py-[14px] px-1 text-[15px] outline-none placeholder-slate-500 overflow-y-auto block"
              rows={1}
            />
            
            <button 
              onClick={() => setRightPanel(p => p === "ai" ? "none" : "ai")}
              className="p-3.5 text-blue-400 hover:text-blue-300 shrink-0 cursor-pointer transition-colors hidden sm:block"
              title="Sugestão com IA"
            >
               <Sparkles className="w-5 h-5" />
            </button>

            <button className="p-3 sm:p-3.5 text-slate-400 hover:text-white shrink-0 cursor-pointer transition-colors">
               <Paperclip className="w-5 h-5 -rotate-45" />
            </button>
            {!inputText && (
              <button className="p-3 sm:p-3.5 pl-1 pr-3 sm:pr-4 text-slate-400 hover:text-white shrink-0 cursor-pointer transition-colors">
                 <Camera className="w-5 h-5" />
              </button>
            )}
          </div>
          
          <button 
            onClick={handleSendMessage}
            className="w-[46px] h-[46px] sm:w-[50px] sm:h-[50px] rounded-2xl bg-blue-600 flex items-center justify-center shrink-0 hover:bg-blue-500 active:scale-95 transition-all shadow-md shadow-blue-900/30 cursor-pointer"
          >
            {inputText.trim() ? (
              <Send className="w-5 h-5 sm:w-5 sm:h-5 translate-x-[2px] translate-y-[-1px] text-white" />
            ) : (
              <Mic className="w-5 h-5 sm:w-5 sm:h-5 text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
