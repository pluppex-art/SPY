import React from "react";
import { Card } from "../card";
import { Button } from "../button";
import { Input } from "../input";
import { Send } from "lucide-react";

interface ChatSectionProps {
  chatChannel: 'whatsapp' | 'email' | 'instagram';
  setChatChannel: (val: 'whatsapp' | 'email' | 'instagram') => void;
  chatLog: Array<{ id: string; sender: 'me' | 'client' | 'ai'; text: string; time: string; channel: string }>;
  quickMessageText: string;
  setQuickMessageText: (val: string) => void;
  handleSendQuickMessage: () => void;
  applyMessageTemplate: (tpl: string) => void;
  leadName: string;
}

export function ChatSection({
  chatChannel,
  setChatChannel,
  chatLog,
  quickMessageText,
  setQuickMessageText,
  handleSendQuickMessage,
  applyMessageTemplate,
  leadName
}: ChatSectionProps) {
  return (
    <div className="px-5 py-4 space-y-4 animate-in fade-in duration-200">
      <Card className="p-4 space-y-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-2">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-primary-blue)]">
            Chat Omnichannel
          </h4>
          <div className="flex gap-1.5">
            {['whatsapp', 'email', 'instagram'].map(ch => (
              <button
                key={ch}
                type="button"
                onClick={() => setChatChannel(ch as any)}
                className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-[var(--radius-control)] transition-all cursor-pointer ${
                  chatChannel === ch
                    ? 'bg-[var(--color-primary-blue)] text-white shadow-sm'
                    : 'bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {ch === 'whatsapp' ? 'WhatsApp' : ch === 'email' ? 'E-mail' : 'Instagram'}
              </button>
            ))}
          </div>
        </div>

        {/* Messaging Live Simulator Sandbox */}
        <div className="h-60 overflow-y-auto bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] p-3.5 space-y-2.5">
          {chatLog.filter(m => m.channel === chatChannel).map(msg => {
            const isMe = msg.sender === 'me';
            const isAi = msg.sender === 'ai';
            return (
              <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`p-3 rounded-2xl text-xs max-w-[82%] leading-relaxed ${
                  isMe ? 'bg-[var(--color-primary-blue)] text-white rounded-tr-none' :
                  isAi ? 'bg-[var(--color-primary-blue)]/10 border border-[var(--color-primary-blue)]/20 text-[var(--color-primary-blue)] rounded-tl-none font-medium' :
                  'bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] text-[var(--color-text-primary)] rounded-tl-none shadow-sm'
                }`}>
                  <p>{msg.text}</p>
                  <span className="text-[9px] opacity-60 block mt-1 text-right">{msg.time}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Chat message composer */}
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder={`Digite uma resposta para enviar via ${chatChannel.toUpperCase()}...`}
            value={quickMessageText}
            onChange={(e) => setQuickMessageText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendQuickMessage()}
            className="flex-1 text-xs"
          />
          <Button onClick={handleSendQuickMessage} className="px-3.5 font-bold shrink-0">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </Card>

      {/* Templates shortcuts */}
      <div className="space-y-2.5">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
          Modelos Rápidos de Resposta
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            { title: "Apresentação Comercial", text: "Olá {client}! Vi seu interesse na Consultoria Enterprise. Sou consultor principal S.P.Y.. Podemos agendar uma chamada rápida de 10 min amanhã?" },
            { title: "SLA Follow-up", text: "Oi {client}, tudo bom? Estou reavaliando nosso cronograma de implantação. Conseguiram analisar nossa proposta?" },
            { title: "Proposta Comercial", text: "Prezado {client}, segue em anexo a proposta oficial do escopo de serviços contratado." },
            { title: "Link de Calendário", text: "Para facilitar nosso alinhamento, {client}, segue meu link de agendamento online." }
          ].map((tpl, i) => (
            <Card
              key={i}
              onClick={() => applyMessageTemplate(tpl.text)}
              className="p-3 hover:border-[var(--color-primary-blue)]/50 transition-all cursor-pointer bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)]"
            >
              <h5 className="text-xs font-bold text-[var(--color-text-primary)]">{tpl.title}</h5>
              <p className="text-[11px] text-[var(--color-text-muted)] truncate mt-1">{tpl.text.replace("{client}", leadName)}</p>
              <span className="text-[9px] text-[var(--color-primary-blue)] font-bold block mt-1 uppercase">Usar modelo &rarr;</span>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
