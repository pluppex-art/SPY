import { toast } from "sonner";
import { RefreshCw, UserRound, Bot, CheckCircle2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { useChatbotConversations } from "../../hooks/useChatbots";
import type { ChatbotFlow, SessionStatus } from "../../lib/chatbot/types";

const STATUS: Record<SessionStatus, { label: string; cls: string; Icon: typeof Bot }> = {
  active: { label: "Em atendimento pelo bot", cls: "text-sky-600 bg-sky-500/10", Icon: Bot },
  handoff: { label: "Com atendente", cls: "text-rose-600 bg-rose-500/10", Icon: UserRound },
  finished: { label: "Concluída", cls: "text-emerald-600 bg-emerald-500/10", Icon: CheckCircle2 },
};

const fmtPhone = (d: string) => (d ? `+${d}` : "Número oculto pelo WhatsApp");
const fmtWhen = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function ChatbotConversations({ chatbotId, flow, readOnly }: { chatbotId: string; flow: ChatbotFlow; readOnly: boolean }) {
  const { items, loading, refresh, releaseToBot } = useChatbotConversations(chatbotId);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-text-muted)]">As últimas 100 conversas deste chatbot. “Devolver ao bot” faz a próxima mensagem do contato recomeçar o fluxo.</p>
        <Button size="xs" variant="outline" onClick={refresh} disabled={loading}>
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>
      {items.length === 0 ? (
        <Card className="p-8 text-center text-sm text-[var(--color-text-muted)]">Nenhuma conversa ainda. Quando alguém escrever para o número do chatbot, aparece aqui.</Card>
      ) : (
        <div className="space-y-2">
          {items.map((c) => {
            const s = STATUS[c.status];
            const resumo = Object.entries(c.vars)
              .filter(([k]) => k !== "telefone" && !k.startsWith("_"))
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ");
            return (
              <Card key={c.id} className="p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-[var(--color-text-primary)]">{fmtPhone(c.phone)}</span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold rounded-full px-2 py-0.5 ${s.cls}`}>
                      <s.Icon className="w-3 h-3" /> {s.label}
                    </span>
                    <span className="text-[11px] text-[var(--color-text-faint)]">{fmtWhen(c.lastInputAt)}</span>
                  </div>
                  {c.status === "active" && c.currentNode && flow.nodes[c.currentNode] && (
                    <p className="text-[11px] text-[var(--color-text-faint)] mt-0.5">Aguardando resposta no passo “{c.currentNode}”</p>
                  )}
                  {resumo && <p className="text-xs text-[var(--color-text-muted)] mt-1 truncate">{resumo}</p>}
                </div>
                {c.status === "handoff" && !readOnly && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      const r = await releaseToBot(c.id);
                      if (r.error) toast.error(r.error);
                      else toast.success("Conversa devolvida ao bot.");
                    }}
                  >
                    <Bot className="w-3.5 h-3.5" /> Devolver ao bot
                  </Button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
