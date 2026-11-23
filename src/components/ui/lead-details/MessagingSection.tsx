import { useState } from "react";
import { Card } from "../card";
import { Button } from "../button";
import { Input } from "../input";
import { EmptyState } from "../empty-state";
import { Send, MessageSquareOff } from "lucide-react";
import { toast } from "sonner";

interface MessagingSectionProps {
  leadName: string;
  companyName: string;
  seller: string;
}

// Achado de UX 2026-09-21: esta aba simulava uma conversa real (mensagens
// fixas de exemplo, "envio" que só empilhava texto no estado local sem
// mandar nada a lugar nenhum, e até uma resposta falsa de IA aparecendo
// sozinha 1s depois) — um vendedor podia genuinamente achar que contatou o
// lead e recebeu resposta, quando nada foi enviado. Não existe hoje nenhuma
// integração real de WhatsApp/e-mail/Instagram conectada a esta tela (as
// tabelas `chat_messages`/`whatsapp_instances` existem no banco mas não são
// usadas por nenhuma página ainda). Até essa integração existir, a ação real
// e honesta que dá pra oferecer aqui é copiar a mensagem pronta pro
// vendedor colar no aplicativo de verdade.
export function MessagingSection({ leadName, companyName, seller }: MessagingSectionProps) {
  const [chatChannel, setChatChannel] = useState<'whatsapp' | 'email' | 'instagram'>('whatsapp');
  const [quickMessageText, setQuickMessageText] = useState("");

  const handleCopyQuickMessage = async () => {
    if (!quickMessageText.trim()) return;
    try {
      await navigator.clipboard.writeText(quickMessageText);
      toast.success(`Mensagem copiada — cole no ${chatChannel === 'whatsapp' ? 'WhatsApp' : chatChannel === 'email' ? 'e-mail' : 'Instagram'} do lead.`);
    } catch {
      toast.error("Não foi possível copiar a mensagem.");
    }
  };

  const applyMessageTemplate = (tpl: string) => {
    const formatted = tpl
      .replace("{client}", leadName)
      .replace("{company}", companyName)
      .replace("{seller}", seller || "Consultor");
    setQuickMessageText(formatted);
    toast.info("Modelo inserido no campo de envio.");
  };

  return (
    <div className="px-5 py-4 space-y-4 animate-in fade-in duration-200">
      <Card className="p-4 space-y-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] pb-2">
          <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-primary-blue)]">
            Comunicação Integrada
          </h4>
          <div className="flex gap-1.5">
            {[
              { id: 'whatsapp', label: 'WhatsApp' },
              { id: 'email', label: 'E-mail' },
              { id: 'instagram', label: 'Instagram' }
            ].map(ch => (
              <button
                key={ch.id}
                type="button"
                onClick={() => setChatChannel(ch.id as any)}
                className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-[var(--radius-control)] transition-all cursor-pointer ${
                  chatChannel === ch.id
                    ? 'bg-[var(--color-primary-blue)] text-white shadow-sm'
                    : 'bg-[var(--color-surface-sunken)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                {ch.label}
              </button>
            ))}
          </div>
        </div>
        <EmptyState
          icon={MessageSquareOff}
          title="Envio direto ainda não conectado"
          description={`A integração de ${chatChannel === 'whatsapp' ? 'WhatsApp' : chatChannel === 'email' ? 'e-mail' : 'Instagram'} desta tela ainda não está disponível. Escreva a mensagem abaixo e use "Copiar" para colar no aplicativo de verdade.`}
          className="h-60"
        />
        <div className="flex gap-2">
          <Input
            type="text"
            placeholder={`Escreva uma mensagem para ${chatChannel.toUpperCase()}...`}
            value={quickMessageText}
            onChange={(e) => setQuickMessageText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCopyQuickMessage()}
            className="flex-1 text-xs"
          />
          <Button onClick={handleCopyQuickMessage} className="px-3.5 font-bold shrink-0 gap-1.5">
            <Send className="w-4 h-4" /> Copiar
          </Button>
        </div>
      </Card>

      <div className="space-y-2.5">
        <h4 className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
          Modelos Rápidos de Resposta
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {[
            { title: "Apresentação Comercial", text: "Olá {client}! Vi seu interesse em nossa solução. Sou o(a) {seller}. Podemos agendar uma chamada rápida de 10 min amanhã?" },
            { title: "Retomada de Proposta", text: "Oi {client}, tudo bem? Estou revisando o planejamento da {company}. Conseguiram analisar a proposta que enviamos?" },
            { title: "Envio de Minuta / Escopo", text: "Prezado {client}, segue o escopo dos serviços discutidos para a {company}." },
            { title: "Link de Agendamento", text: "Para facilitar nosso alinhamento, {client}, segue meu calendário: calendly.com/{seller}-axis" }
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
