import React from "react";
import { 
  X, Info, Sparkles, Phone, Mail, Clock, Trash2, ShieldCheck, Send, Zap
} from "lucide-react";
import { Contact, RightPanelState } from "./useMessaging";

interface RightControlDrawerProps {
  rightPanel: RightPanelState;
  setRightPanel: React.Dispatch<React.SetStateAction<RightPanelState>>;
  previousPanel: RightPanelState;
  currentContact: Contact;
  sentiment: string;
  aiAnalysis: string;
  aiSuggestion: string;
  aiMessages: { id: string, text: string, type: 'user'|'system' }[];
  aiPrompt: string;
  setAiPrompt: (p: string) => void;
  aiTyping: boolean;
  handleAiAsk: () => void;
}

export function RightControlDrawer({
  rightPanel,
  setRightPanel,
  previousPanel,
  currentContact,
  sentiment,
  aiAnalysis,
  aiSuggestion,
  aiMessages,
  aiPrompt,
  setAiPrompt,
  aiTyping,
  handleAiAsk
}: RightControlDrawerProps) {
  return (
    <>
      {/* Backdrop */}
      <div 
        className={`absolute inset-0 bg-black/50 backdrop-blur-xs z-40 transition-opacity duration-300 ${rightPanel !== 'none' ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`} 
        onClick={() => setRightPanel("none")}
      />
      
      {/* Drawer */}
      <div className={`absolute top-0 right-0 bottom-0 w-[90%] sm:w-[380px] bg-[var(--color-surface-elevated)] flex flex-col border-l border-[var(--color-border-default)] shadow-2xl z-50 transform transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] ${rightPanel !== 'none' ? 'translate-x-0' : 'translate-x-[100%]'}`}>
        
        {/* Panel Header */}
        <div className="shrink-0 h-[64px] px-5 flex items-center justify-between border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)]">
          <h2 className="text-sm text-[var(--color-text-primary)] font-bold flex items-center gap-2">
            {(rightPanel === "info" || (rightPanel === "none" && previousPanel === "info")) ? <Info className="w-4 h-4 text-[var(--color-text-muted)]"/> : <Sparkles className="w-4 h-4 text-[var(--color-primary-blue)]"/>}
            {(rightPanel === "info" || (rightPanel === "none" && previousPanel === "info")) ? "Dados do Contato" : "S.P.Y. Copilot"}
          </h2>
          <button 
            type="button"
            onClick={() => setRightPanel("none")} 
            className="p-1.5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] hover:bg-[var(--color-surface)] rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Panel Content: Info */}
        <div className={`flex-1 overflow-y-auto p-6 space-y-6 ${(rightPanel === "info" || (rightPanel === "none" && previousPanel === "info")) ? 'block' : 'hidden'}`}>
          <div className="flex flex-col items-center text-center">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold mb-3 shadow-md text-white ${
                currentContact.channel === 'WhatsApp' ? 'bg-emerald-600' :
                currentContact.channel === 'Instagram' ? 'bg-pink-600' :
                'bg-blue-600'
              }`}>
                {currentContact.avatar}
              </div>
              <h2 className="text-base text-[var(--color-text-primary)] font-bold tracking-tight">{currentContact.name}</h2>
              <p className="text-[var(--color-text-muted)] text-xs font-semibold mt-1 uppercase tracking-wider flex items-center gap-1.5 justify-center">
                {currentContact.channel}
              </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {currentContact.phone ? (
            <a href={`tel:${String(currentContact.phone).replace(/[^\d+]/g, "")}`} className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 p-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-emerald-500/20 transition-colors cursor-pointer">
              <Phone className="w-3.5 h-3.5"/> Ligar
            </a>
            ) : (
            <button type="button" disabled className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 p-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 opacity-40 cursor-not-allowed">
              <Phone className="w-3.5 h-3.5"/> Ligar
            </button>
            )}
            {currentContact.email ? (
            <a href={`mailto:${currentContact.email}`} className="bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 text-[var(--color-primary-blue)] p-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 hover:bg-[var(--color-primary-blue)]/20 transition-colors cursor-pointer">
              <Mail className="w-3.5 h-3.5"/> E-mail
            </a>
            ) : (
            <button type="button" disabled className="bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 text-[var(--color-primary-blue)] p-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 opacity-40 cursor-not-allowed">
              <Mail className="w-3.5 h-3.5"/> E-mail
            </button>
            )}
          </div>

          <div className="bg-[var(--color-surface-sunken)] rounded-xl p-4 border border-[var(--color-border-subtle)] space-y-4 text-left">
              <div>
                <h4 className="text-[var(--color-text-muted)] text-[10px] font-bold uppercase tracking-wider mb-1">Telefone</h4>
                <p className="text-[var(--color-text-primary)] text-xs font-mono font-medium">{currentContact.phone || "Não cadastrado"}</p>
              </div>
              {currentContact.email && (
                <div>
                  <h4 className="text-[var(--color-text-muted)] text-[10px] font-bold uppercase tracking-wider mb-1">E-mail</h4>
                  <p className="text-[var(--color-text-primary)] text-xs font-medium break-all">{currentContact.email}</p>
                </div>
              )}
              <div>
                <h4 className="text-[var(--color-text-muted)] text-[10px] font-bold uppercase tracking-wider mb-1 flex items-center gap-1.5"><Clock className="w-3 h-3" /> SLA de Atendimento</h4>
                <p className={`text-xs font-bold flex items-center gap-1.5 ${currentContact.slaStatus?.includes('Atrasado') ? 'text-rose-500' : 'text-emerald-500'}`}>
                  <span className={`w-2 h-2 rounded-full ${currentContact.slaStatus?.includes('Atrasado') ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                  {currentContact.slaStatus || "Dentro do Prazo"}
                </p>
              </div>
              <div>
                <h4 className="text-[var(--color-text-muted)] text-[10px] font-bold uppercase tracking-wider mb-2">Tags / Estágio</h4>
                <div className="flex flex-wrap gap-1.5">
                  {currentContact.tags?.map((tag, idx) => (
                    <span key={idx} className="px-2 py-0.5 bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-md text-[10px] text-[var(--color-text-primary)] font-bold uppercase">
                      {tag}
                    </span>
                  ))}
                  {/* "+ Tag" escondido: sem handler/endpoint de edição de tags de contato do chat. */}
                  {false && <button className="px-2 py-0.5 border border-dashed border-[var(--color-border-default)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface)] rounded-md text-[10px] font-bold transition-colors cursor-pointer uppercase">
                    + Tag
                  </button>}
                </div>
              </div>
              <div>
                <h4 className="text-[var(--color-text-muted)] text-[10px] font-bold uppercase tracking-wider mb-2">Histórico de Compras</h4>
                <div className="space-y-1.5">
                  {currentContact.purchaseHistory && currentContact.purchaseHistory.length > 0 ? currentContact.purchaseHistory.map((ph, idx) => (
                    <div key={idx} className="flex flex-col gap-0.5 bg-[var(--color-surface)] p-2.5 rounded-lg border border-[var(--color-border-subtle)]">
                      <div className="flex items-start justify-between">
                        <p className="text-xs text-[var(--color-text-primary)] font-bold">{ph.item}</p>
                        <span className="text-xs text-emerald-500 font-bold shrink-0 ml-2">{ph.value}</span>
                      </div>
                      <p className="text-[10px] text-[var(--color-text-muted)]">{ph.date}</p>
                    </div>
                  )) : (
                    <p className="text-xs text-[var(--color-text-muted)] italic">Nenhuma compra registrada.</p>
                  )}
                </div>
              </div>
          </div>

          {/* "Apagar Conversa" e "Bloquear Contato" escondidos: não há endpoint/ação implementada
              (apagar histórico e bloqueio exigem backend). Código preservado abaixo. */}
          {false && (
          <div className="space-y-2 pt-2 border-t border-[var(--color-border-subtle)]">
              <button className="w-full text-left text-rose-500 bg-rose-500/10 border border-rose-500/20 text-xs p-3 hover:bg-rose-500/20 rounded-xl transition-colors flex items-center gap-2.5 font-bold cursor-pointer">
                <Trash2 className="w-4 h-4"/> Apagar Conversa
              </button>
              <button className="w-full text-left text-[var(--color-text-muted)] bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-xs p-3 hover:text-[var(--color-text-primary)] rounded-xl transition-colors flex items-center gap-2.5 font-bold cursor-pointer">
                <ShieldCheck className="w-4 h-4"/> Bloquear Contato
              </button>
          </div>
          )}
        </div>

        {/* Panel Content: AI */}
        <div className={`flex-1 flex flex-col ${(rightPanel === "ai" || (rightPanel === "none" && previousPanel === "ai")) ? 'block' : 'hidden'}`}>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
              
              <div className="bg-[var(--color-primary-blue)]/10 rounded-xl p-4 border border-[var(--color-primary-blue)]/20 relative overflow-hidden text-left">
                <h4 className="text-[var(--color-primary-blue)] text-[10px] font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5"/> Análise da Conversa (Master AI)
                </h4>
                <p className="text-[var(--color-text-primary)] text-xs leading-relaxed">
                  {aiAnalysis || "O S.P.Y. Copilot está analisando as interações da conversa para sintetizar insights comerciais em tempo real..."}
                </p>
                {aiSuggestion && (
                  <div className="mt-3 p-2.5 bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-lg text-xs text-[var(--color-text-primary)] leading-relaxed">
                    <strong className="text-[var(--color-primary-blue)] block mb-0.5">💡 Sugestão de Abordagem:</strong>
                    {aiSuggestion}
                  </div>
                )}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-[var(--color-text-muted)] text-[10px] font-bold uppercase tracking-wider">Sentimento:</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                    sentiment === "Positivo" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500" :
                    sentiment === "Negativo" ? "bg-rose-500/10 border-rose-500/30 text-rose-500" :
                    sentiment === "Analisando..." ? "bg-blue-500/10 border-blue-500/30 text-blue-500 animate-pulse" :
                    "bg-amber-500/10 border-amber-500/30 text-amber-500"
                  }`}>{sentiment || "Pendente"}</span>
                </div>
              </div>

              {/* AI Conversation List */}
              <div className="space-y-3">
                {aiMessages.map((aimsg) => (
                  <div key={aimsg.id} className={`flex w-full ${aimsg.type === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in duration-150`}>
                    {aimsg.type === 'system' && (
                      <div className="w-6 h-6 rounded-full bg-[var(--color-primary-blue)]/15 border border-[var(--color-primary-blue)]/30 flex items-center justify-center mr-1.5 shrink-0 self-end mb-0.5">
                        <Sparkles className="w-3 h-3 text-[var(--color-primary-blue)]" />
                      </div>
                    )}
                    <div className={`max-w-[85%] p-3 rounded-xl text-xs leading-relaxed text-left ${
                      aimsg.type === 'user' 
                        ? 'bg-[var(--color-primary-blue)] text-white rounded-br-none' 
                        : 'bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] rounded-bl-none'
                    }`}>
                      {aimsg.text}
                    </div>
                  </div>
                ))}
                
                {aiTyping && (
                  <div className="flex w-full justify-start animate-in fade-in duration-200">
                     <div className="w-6 h-6 rounded-full bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 flex items-center justify-center mr-1.5 shrink-0 self-end mb-0.5">
                        <Sparkles className="w-3 h-3 text-[var(--color-primary-blue)]" />
                      </div>
                     <div className="px-3 py-2 bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] text-[var(--color-text-muted)] rounded-xl text-xs font-medium flex items-center gap-1">
                       Gerando resposta...
                     </div>
                  </div>
                )}
              </div>
          </div>

          {/* AI Chat Input */}
          <div className="p-3 border-t border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] shrink-0">
            <div className="flex gap-2 items-end">
              <textarea 
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                placeholder="Pergunte ao S.P.Y. Copilot..." 
                rows={1}
                className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border-default)] rounded-xl px-3 py-2 text-xs text-[var(--color-text-primary)] outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] resize-none max-h-[100px] overflow-y-auto w-full min-w-0 placeholder:text-[var(--color-text-muted)]" 
                onKeyDown={(e) => {
                  if(e.key === 'Enter' && !e.shiftKey) { 
                    e.preventDefault(); 
                    handleAiAsk(); 
                  }
                }}
              />
              <button 
                type="button"
                className={`p-2.5 rounded-xl shadow-xs transition-all shrink-0 ${aiPrompt.trim() && !aiTyping ? 'bg-[var(--color-primary-blue)] text-white cursor-pointer' : 'bg-[var(--color-surface)] text-[var(--color-text-muted)] pointer-events-none'}`}
                onClick={handleAiAsk}
              >
                <Send className="w-4 h-4"/>
              </button>
            </div>
          </div>
        </div>

      </div>
    </>
  );
}
