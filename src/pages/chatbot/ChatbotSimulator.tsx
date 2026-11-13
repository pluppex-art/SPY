import { useEffect, useRef, useState } from "react";
import { RotateCcw, Send, Paperclip, UserPlus, UserRound } from "lucide-react";
import { Button } from "../../components/ui/button";
import { runChatbot } from "../../lib/chatbot/engine";
import type { ChatbotAction, ChatbotFlow, ChatbotSettings, SessionState } from "../../lib/chatbot/types";

type Line =
  | { from: "me"; text: string }
  | { from: "bot"; text: string }
  | { from: "media"; text: string }
  | { from: "system"; text: string };

const SIM_PHONE = "5511900000000";

function actionLines(actions: ChatbotAction[]): Line[] {
  return actions.flatMap<Line>((a) => {
    switch (a.kind) {
      case "send_text":
        return [{ from: "bot", text: a.text }];
      case "send_media":
        return [{ from: "media", text: `${a.media_kind === "image" ? "Imagem" : "Arquivo"}: ${a.filename || a.url}${a.caption ? ` — ${a.caption}` : ""}` }];
      case "create_lead": {
        const v = a.vars;
        return [{ from: "system", text: `Lead seria criado no CRM — nome: ${v.nome || "(não coletado)"}, e-mail: ${v.email || "(não coletado)"}` }];
      }
      case "save_data":
        return [{ from: "system", text: `Seriam gravados em "${a.target}": ${a.map.map((m) => `${m.field}=${a.vars[m.variable] ?? "(não coletado)"}`).join(", ")}` }];
      case "handoff":
        return [{ from: "system", text: a.reason === "keyword" ? "Contato pediu um atendente — o bot para de responder." : "Conversa passada para um atendente — o bot para de responder." }];
    }
  });
}

/**
 * Conversa de teste que roda o MESMO motor do n8n (src/lib/chatbot/engine.ts) no navegador: nada é
 * enviado por WhatsApp e nenhum lead é criado — serve para o cliente testar o fluxo antes de ativar.
 */
export function ChatbotSimulator({ flow, settings }: { flow: ChatbotFlow; settings: ChatbotSettings }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [session, setSession] = useState<SessionState | null>(null);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const step = (text: string, current: SessionState | null, prefix: Line[]) => {
    const r = runChatbot({ flow, settings, session: current, text, phone: SIM_PHONE, now: Date.now() });
    const extra: Line[] = [];
    if (r.note === "handoff_silencio") extra.push({ from: "system", text: "Conversa com atendente — o bot não responde." });
    if (r.note === "loop") extra.push({ from: "system", text: "O fluxo repetiu mensagens sem esperar resposta e foi interrompido. Revise as ligações." });
    if (r.note === "fluxo_vazio") extra.push({ from: "system", text: "Fluxo vazio: defina o primeiro passo." });
    setLines([...prefix, ...actionLines(r.actions), ...extra]);
    setSession(r.session);
  };

  const reset = () => {
    setLines([]);
    setSession(null);
    step("oi", null, []);
  };

  useEffect(() => {
    reset();
    // Reinicia quando o fluxo muda para o teste sempre refletir o que está no editor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, settings]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [lines]);

  const send = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    step(text, session, [...lines, { from: "me", text }]);
  };

  return (
    <div className="flex flex-col h-full min-h-[420px]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)]">
        <div>
          <p className="text-xs font-bold text-[var(--color-text-primary)]">Simulador</p>
          <p className="text-[11px] text-[var(--color-text-faint)]">Teste de verdade, sem enviar nada no WhatsApp.</p>
        </div>
        <Button size="xs" variant="outline" onClick={reset}>
          <RotateCcw className="w-3 h-3" /> Reiniciar
        </Button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-[var(--color-surface-sunken)]">
        {lines.map((l, i) =>
          l.from === "system" ? (
            <div key={i} className="flex items-start gap-1.5 text-[11px] text-[var(--color-text-muted)] bg-[var(--color-surface-elevated)] border border-dashed border-[var(--color-border-default)] rounded-lg px-2.5 py-1.5">
              {/atendente/i.test(l.text) ? <UserRound className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <UserPlus className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
              <span>{l.text}</span>
            </div>
          ) : (
            <div key={i} className={`flex ${l.from === "me" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                  l.from === "me" ? "bg-emerald-500/15 text-[var(--color-text-primary)] rounded-br-sm" : "bg-[var(--color-surface-elevated)] border border-[var(--color-border-subtle)] rounded-bl-sm"
                }`}
              >
                {l.from === "media" && <Paperclip className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />}
                {l.text}
              </div>
            </div>
          )
        )}
        <div ref={endRef} />
      </div>
      <form
        className="flex gap-2 p-2 border-t border-[var(--color-border-subtle)]"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Digite como se fosse o cliente…"
          className="flex-1 h-10 rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-3 text-sm text-[var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary-blue)]"
        />
        <Button type="submit" size="icon" aria-label="Enviar">
          <Send className="w-4 h-4" />
        </Button>
      </form>
    </div>
  );
}
