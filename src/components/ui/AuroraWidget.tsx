import { useEffect, useMemo, useRef, useState } from "react";
import { X, Send, Mic, Square } from "lucide-react";
import { cn } from "../../lib/utils";
import { apiFetch } from "../../lib/apiClient";
import { AuroraCore } from "./auroraCore/AuroraCore";
import type { AuroraCoreMode } from "./auroraCore/auroraCoreStates";
import { useAuroraVoice } from "../../hooks/useAuroraVoice";
import { AuroraTokenMeter } from "./AuroraTokenMeter";
import { useAuroraTokenUsage } from "../../hooks/useAuroraTokenUsage";
import { useAuth } from "../../contexts/AuthContext";
import { useDraggableFab } from "../../hooks/useDraggableFab";

interface AuroraMessage {
  id: string;
  role: "user" | "aurora";
  text: string;
}

function buildGreeting(userName?: string | null): AuroraMessage {
  const firstName = userName?.trim().split(/\s+/)[0];
  return {
    id: "greeting",
    role: "aurora",
    text: `Olá${firstName ? `, ${firstName}` : ""}. Sou a Aurora. Pode falar ou digitar — pergunte sobre a diretoria, agenda, Spotify, WhatsApp ou o S.P.Y..`,
  };
}

/**
 * Balão de chat flutuante global com a Aurora (assistente do G-TECH AI OS), embutido no S.P.Y..
 * Só renderizado para usuários master (ver Layout.tsx) — a Aurora atende só Gustavo/G-TECH,
 * com ferramentas de escrita reais escopadas ao tenant da G-TECH, então não faz sentido (e não
 * é seguro) mostrá-la para usuários de outros tenants do S.P.Y..
 *
 * Fala com POST /api/ai/aurora-chat (server.ts), que faz o proxy autenticado até o webhook do
 * Chat Trigger da Aurora no n8n — a URL do webhook nunca chega até este componente.
 */
export function AuroraWidget() {
  const [isOpen, setIsOpen] = useState(false);
  // A bolinha pode ser arrastada para qualquer canto (mouse ou dedo); a posição fica salva neste aparelho.
  const fab = useDraggableFab("spy_aurora_fab");
  const [messages, setMessages] = useState<AuroraMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || loadingRef.current) return;

    // Destrava o autoplay do áudio de resposta AQUI — dentro do mesmo gesto do clique/Enter que
    // disparou o envio. Antes só acontecia dentro do fluxo do microfone; digitando e mandando por
    // texto, o navegador bloqueava a voz da resposta em silêncio (sem erro nenhum aparecendo).
    voice.primeAudio();

    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "user", text }]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await apiFetch("/api/ai/aurora-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new Error("Aurora está indisponível agora.");
      }
      if (!res.ok || data.error) throw new Error(data.error ?? "Aurora está indisponível agora.");
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "aurora", text: data.output ?? "" }]);
      if (data.audioBase64) {
        voice.playAudioBase64(data.audioBase64, () => setSpeaking(true), () => setSpeaking(false));
      }
    } catch (err: any) {
      setError(err.message ?? "Falha ao falar com a Aurora.");
    } finally {
      setLoading(false);
    }
  };

  const voice = useAuroraVoice((text) => send(text));
  const { usage: tokenUsage } = useAuroraTokenUsage();
  const { user } = useAuth();
  const bubbleRingColor =
    tokenUsage?.limitReached ? "rgba(244,63,94,0.65)" // rose-500
    : (tokenUsage?.percentUsed ?? 0) >= 90 ? "rgba(245,158,11,0.6)" // amber-500
    : null;

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  // Saudação local (nunca enviada à Aurora) na primeira vez que o painel abre vazio — pra não
  // começar em branco.
  useEffect(() => {
    if (isOpen && messages.length === 0) setMessages([buildGreeting(user?.name)]);
  }, [isOpen, messages.length, user?.name]);

  // Mapeia o estado real do widget pro modelo de estados do núcleo — tudo aqui agora é real:
  // "listening" enquanto o microfone está ativo, "speaking" enquanto o áudio de resposta toca.
  const coreMode: AuroraCoreMode = useMemo(() => {
    if (listening) return "listening";
    if (error) return "error";
    if (loading) return "thinking";
    if (speaking) return "speaking";
    return "idle";
  }, [listening, error, loading, speaking]);

  const toggleMic = () => {
    if (listening) {
      voice.stopPushToTalk();
      return;
    }
    voice.startPushToTalk(
      () => { setListening(true); setInterim(""); },
      () => { setListening(false); setInterim(""); },
      (text) => setInterim(text)
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* ── Painel de chat ── */}
      {isOpen && (
        <div style={fab.panelStyle(384)} className="fixed bottom-[calc(9.5rem+env(safe-area-inset-bottom))] lg:bottom-24 right-4 md:right-6 z-50 w-[calc(100vw-2rem)] sm:w-96 h-[70dvh] lg:h-[560px] max-h-[calc(100dvh-13rem)] lg:max-h-[calc(100dvh-8rem)] flex flex-col bg-[var(--color-surface-elevated)] border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-white/[0.07] shrink-0">
            <div className="flex items-center gap-2.5">
              <AuroraCore mode={coreMode} size={28} showToggle />
              <div>
                <p className="text-[11px] font-black text-white">Aurora</p>
                <p className="text-[9px] text-slate-500">
                  {tokenUsage?.percentUsed != null ? `${tokenUsage.percentUsed.toFixed(1)}% do ciclo` : "Assistente operacional"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <AuroraTokenMeter />
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 bg-white/[0.03] hover:bg-white/5 rounded-lg text-slate-500 hover:text-white transition-all"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div ref={bodyRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5">

            {messages.map((m) => (
              <div key={m.id} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] px-3 py-2 rounded-xl text-[11px] leading-relaxed whitespace-pre-wrap",
                    m.role === "user"
                      ? "bg-violet-600 text-white rounded-br-sm"
                      : "bg-white/[0.04] border border-white/[0.06] text-slate-200 rounded-bl-sm"
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl rounded-bl-sm px-3 py-2.5 flex items-center gap-1.5">
                  <span className="flex items-center gap-0.5" aria-hidden="true">
                    {[0, 150, 300].map((delay) => (
                      <span
                        key={delay}
                        className="w-1 h-1 rounded-full bg-violet-400 animate-bounce motion-reduce:animate-none"
                        style={{ animationDelay: `${delay}ms` }}
                      />
                    ))}
                  </span>
                  <span className="text-[10px] text-slate-500" role="status">Aurora está digitando...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="mx-1 p-2.5 bg-rose-500/10 border border-rose-500/20 rounded-xl">
                <p className="text-[10px] text-rose-400 leading-relaxed">{error}</p>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-white/[0.07] shrink-0">
            {listening && (
              <div className="px-3 pt-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                <p className="text-[10px] text-slate-400 italic truncate">{interim || "Ouvindo..."}</p>
              </div>
            )}
            <div className="p-3 flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                rows={1}
                placeholder="Fale ou digite pra Aurora..."
                className="flex-1 resize-none bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 py-2.5 text-[11px] text-white placeholder:text-slate-600 focus:outline-none focus:border-violet-500/40 disabled:opacity-50"
              />
              {voice.isVoiceInputSupported() && (
                <button
                  onClick={toggleMic}
                  disabled={loading}
                  title={listening ? "Parar de ouvir" : "Falar com a Aurora"}
                  className={cn(
                    "shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed",
                    listening
                      ? "bg-rose-600 hover:bg-rose-500 animate-pulse"
                      : "bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08]"
                  )}
                >
                  {listening ? <Square className="w-3.5 h-3.5 text-white" /> : <Mic className="w-3.5 h-3.5 text-slate-300" />}
                </button>
              )}
              <button
                onClick={() => send()}
                disabled={loading || !input.trim()}
                className="shrink-0 w-9 h-9 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-all"
              >
                <Send className="w-3.5 h-3.5 text-white" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Botão flutuante (o próprio núcleo da Aurora) ── */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        {...fab.handlers}
        style={{ ...(bubbleRingColor ? { boxShadow: `0 8px 30px rgba(139,92,246,0.35), 0 0 0 2px ${bubbleRingColor}` } : {}), ...fab.style }}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] lg:bottom-6 right-3 md:right-6 z-50 w-11 h-11 sm:w-14 sm:h-14 rounded-full max-md:opacity-90 shadow-[0_8px_30px_rgba(139,92,246,0.35)] flex items-center justify-center transition-all hover:scale-105 overflow-hidden bg-black/20 backdrop-blur-sm"
        title={
          tokenUsage?.limitReached
            ? "Limite de tokens do ciclo atingido"
            : (tokenUsage?.percentUsed ?? 0) >= 90
            ? `Uso de tokens perto do limite (${tokenUsage?.percentUsed}%)`
            : "Falar com a Aurora (arraste para mover)"
        }
      >
        <div className="max-md:scale-[0.8] shrink-0"><AuroraCore mode={coreMode} size={56} /></div>
        {isOpen && (
          <div className="absolute inset-0 rounded-full bg-black/45 flex items-center justify-center">
            <X className="w-5 h-5 text-white" />
          </div>
        )}
      </button>
    </>
  );
}
