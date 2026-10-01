import { useState, useEffect, useRef, useMemo } from "react";
import {
  Phone,
  Mic,
  MicOff,
  Plus,
  Trash2,
  MessageSquare,
  Sparkles,
  Flame,
  Sun,
  Snowflake,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sliders,
} from "lucide-react";
import { useAuth } from "../../../contexts/AuthContext";
import { toast } from "sonner";
import { apiFetch } from "../../../lib/apiClient";
import { Button } from "../button";
import { Card } from "../card";
import { Badge } from "../badge";
import { cn } from "../../../lib/utils";
import { calculateLeadScore } from "../../../lib/leadScore";

interface Note {
  id: string;
  text: string;
  author: string;
  createdAt: string;
  category?: "chamada" | "interesse" | "objecao" | "decisor" | "geral";
  scoreImpact?: number;
}

interface NotasSectionProps {
  lead: any;
  leadName: string;
  companyName?: string;
  updateLead: (id: string, data: any) => void;
  score?: number;
  temperature?: "Quente" | "Morno" | "Frio";
  probability?: number;
  handleUpdateScore?: (newScore: number, customTemp?: "Quente" | "Morno" | "Frio") => void;
  seller?: string;
  setAlterationLogs?: any;
}

function parseNotes(raw: string | null | undefined): Note[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  if (raw.trim()) {
    return [
      {
        id: crypto.randomUUID(),
        text: raw.trim(),
        author: "Sistema",
        createdAt: new Date().toISOString(),
        category: "geral",
      },
    ];
  }
  return [];
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

export function NotasSection({
  lead,
  leadName,
  companyName,
  updateLead,
  score = 50,
  temperature = "Morno",
  probability = 50,
  handleUpdateScore,
  seller,
  setAlterationLogs,
}: NotasSectionProps) {
  const { user } = useAuth();
  const [notes, setNotes] = useState<Note[]>([]);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [authorName, setAuthorName] = useState("Usuário");
  const [isAnalyzingIA, setIsAnalyzingIA] = useState(false);
  const [showScoreSlider, setShowScoreSlider] = useState(false);
  const [activeCategory, setActiveCategory] = useState<"chamada" | "interesse" | "objecao" | "decisor" | "geral">("geral");

  const recognitionRef = useRef<any>(null);
  const inputPrefixRef = useRef("");

  useEffect(() => {
    setNotes(parseNotes(lead?.notes));
  }, [lead?.id, lead?.notes]);

  // Achado de UX 2026-09-21: usava o metadata da sessão do Supabase Auth
  // (user_metadata.name/full_name), que este app nunca preenche — sempre caía
  // no fallback seguinte, o prefixo do e-mail antes do "@" (ex.: "Autor:
  // marketingnicollasrocha" em vez do nome real da pessoa). O nome de exibição
  // de verdade vem de `public.users.name`, já exposto via useAuth().user.name
  // (é a mesma fonte usada em "Vendedor Responsável" na aba Informações).
  useEffect(() => {
    setAuthorName(user?.name || seller || "Consultor");
  }, [user?.name, seller]);

  useEffect(() => () => recognitionRef.current?.stop(), []);

  const persist = (updated: Note[]) => {
    // updateLead já grava no Supabase — o update direto aqui era um
    // round-trip redundante escrevendo a mesma coluna `notes` duas vezes.
    updateLead(lead.id, { notes: JSON.stringify(updated) });
  };

  const applyScoreChange = (deltaOrTarget: number, isAbsolute = false) => {
    const current = score;
    const target = isAbsolute ? deltaOrTarget : Math.max(0, Math.min(100, current + deltaOrTarget));
    if (handleUpdateScore) {
      handleUpdateScore(target);
    } else {
      const derivedTemp = target >= 71 ? "Quente" : target >= 41 ? "Morno" : "Frio";
      updateLead(lead.id, { scoreIA: target, temperature: derivedTemp });
    }
    toast.success(`Score atualizado para ${target}/100!`);
  };

  const addNoteWithCategory = async (cat: "chamada" | "interesse" | "objecao" | "decisor" | "geral" = activeCategory) => {
    const text = input.trim();
    if (!text || saving) return;

    setSaving(true);
    const id = crypto.randomUUID();

    let scoreImpact = 0;
    if (cat === "interesse") scoreImpact = 15;
    else if (cat === "decisor") scoreImpact = 10;
    else if (cat === "objecao") scoreImpact = -10;

    const note: Note = {
      id,
      text,
      author: authorName,
      createdAt: new Date().toISOString(),
      category: cat,
      scoreImpact: scoreImpact !== 0 ? scoreImpact : undefined,
    };

    const updated = [note, ...notes];
    setNotes(updated);
    setInput("");
    setActiveCategory("geral");
    await persist(updated);
    setSaving(false);

    // Recalcular Score IA do lead com base na etapa atual e no novo histórico de notas
    const evalResult = calculateLeadScore(lead, null, null, updated);
    if (handleUpdateScore) {
      handleUpdateScore(evalResult.score, evalResult.temperature);
    } else {
      updateLead(lead.id, {
        scoreIA: evalResult.score,
        temperature: evalResult.temperature,
        probability: evalResult.probability,
      });
    }

    // AI Grammar & refinement check
    try {
      const res = await apiFetch("/api/ai/corrigir-nota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: text }),
        signal: AbortSignal.timeout(6000),
      });
      if (res.ok) {
        let data: any;
        try { data = await res.json(); } catch { return; }
        if (data.corrigido?.trim() && data.corrigido.trim() !== text) {
          const corrected = updated.map((n) =>
            n.id === id ? { ...n, text: data.corrigido.trim() } : n
          );
          setNotes(corrected);
          await persist(corrected);
        }
      }
    } catch {}
  };

  const deleteNote = async (noteId: string) => {
    const updated = notes.filter((n) => n.id !== noteId);
    setNotes(updated);
    await persist(updated);
    toast.info("Anotação removida.");

    // Recalcular Score IA com as notas restantes e a etapa do lead
    const evalResult = calculateLeadScore(lead, null, null, updated);
    if (handleUpdateScore) {
      handleUpdateScore(evalResult.score, evalResult.temperature);
    } else {
      updateLead(lead.id, {
        scoreIA: evalResult.score,
        temperature: evalResult.temperature,
        probability: evalResult.probability,
      });
    }
  };

  const startRecording = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Gravação de voz não suportada neste navegador.");
      return;
    }

    inputPrefixRef.current = input.trim();
    const r = new SR();
    r.lang = "pt-BR";
    r.continuous = true;
    r.interimResults = true;

    r.onresult = (e: any) => {
      let interim = "", final = "";
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) final += t + " ";
        else interim += t;
      }
      const voiceText = (final + interim).trim();
      const prefix = inputPrefixRef.current;
      setInput(prefix ? `${prefix} ${voiceText}` : voiceText);
    };

    r.onerror = (e: any) => {
      if (e.error !== "aborted") toast.error("Erro na gravação: " + e.error);
      stopRecording();
    };

    r.onend = () => {
      if (recognitionRef.current) {
        recognitionRef.current = null;
        setIsRecording(false);
      }
    };

    recognitionRef.current = r;
    r.start();
    setIsRecording(true);
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsRecording(false);
  };

  // Avaliação do Score baseado no histórico real de anotações E na etapa do lead no funil
  const handleAIEvaluateScore = () => {
    if (notes.length === 0 && !input.trim()) {
      toast.info("Adicione pelo menos uma nota para a IA analisar o perfil do lead.");
      return;
    }

    setIsAnalyzingIA(true);

    setTimeout(() => {
      const candidateNotes = input.trim()
        ? [{ text: input.trim(), category: activeCategory }, ...notes]
        : notes;

      const evalResult = calculateLeadScore(lead, null, null, candidateNotes);

      if (handleUpdateScore) {
        handleUpdateScore(evalResult.score, evalResult.temperature);
      } else {
        updateLead(lead.id, {
          scoreIA: evalResult.score,
          score_ia: evalResult.score,
          temperature: evalResult.temperature,
          probability: evalResult.probability,
        });
      }

      setIsAnalyzingIA(false);
      toast.success(`Score IA Recalculado: ${evalResult.score}/100 (${evalResult.temperature})!`, {
        description: evalResult.reasons.join(" • ") || "Avaliação calibrada considerando a etapa do funil e as anotações.",
      });
    }, 500);
  };

  const tempIcon = temperature === "Quente"
    ? <Flame className="w-4 h-4 text-danger" />
    : temperature === "Morno"
    ? <Sun className="w-4 h-4 text-warning" />
    : <Snowflake className="w-4 h-4 text-[var(--color-primary-blue)]" />;

  const tempBadgeClass = temperature === "Quente"
    ? "bg-danger/10 border-danger/30 text-danger"
    : temperature === "Morno"
    ? "bg-warning/10 border-warning/30 text-warning"
    : "bg-[var(--color-primary-blue)]/10 border-[var(--color-primary-blue)]/30 text-[var(--color-primary-blue)]";

  return (
    <div className="px-5 py-4 space-y-4">
      {/* ── CARD CENTRAL DE SCORE & TEMPERATURA INTEGRADO ÀS NOTAS ── */}
      <Card className="p-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[var(--color-primary-blue)]/10 flex items-center justify-center">
              {tempIcon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-[var(--color-text-primary)] tracking-wide">Score do Lead</span>
                <span className={cn("text-[9px] px-2 py-0.5 rounded-full border font-black uppercase tracking-wider", tempBadgeClass)}>
                  {temperature}
                </span>
              </div>
              <p className="text-[10px] text-[var(--color-text-faint)]">
                Qualificação baseada nas interações e notas
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleAIEvaluateScore}
              disabled={isAnalyzingIA}
              className="h-7 text-[10px] font-bold gap-1 text-[var(--color-primary-blue)] border-[var(--color-primary-blue)]/30 hover:bg-[var(--color-primary-blue)]/10 cursor-pointer"
              title="A IA analisa as notas e calcula o Score automaticamente"
            >
              <Sparkles className={cn("w-3 h-3 text-[var(--color-primary-blue)]", isAnalyzingIA && "animate-spin")} />
              {isAnalyzingIA ? "Avaliando..." : "Score por IA"}
            </Button>

            <button
              type="button"
              onClick={() => setShowScoreSlider(v => !v)}
              className="w-7 h-7 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors"
              title="Ajuste manual de Score"
            >
              <Sliders className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Visual Score Gauge & Progress Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-black text-[var(--color-text-primary)] tabular-nums">{score}</span>
              <span className="text-[10px] text-[var(--color-text-muted)] font-bold">/100</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-text-muted)] font-bold">
              <TrendingUp className="w-3 h-3 text-success" />
              <span>{probability}% de conversão</span>
            </div>
          </div>

          <div className="h-2 w-full bg-[var(--color-surface-sunken)] rounded-full overflow-hidden border border-[var(--color-border-subtle)]">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                score >= 71 ? "bg-success" :
                score >= 41 ? "bg-warning" :
                "bg-danger"
              )}
              style={{ width: `${Math.max(4, score)}%` }}
            />
          </div>
        </div>

        {/* Quick presets or Slider */}
        {showScoreSlider ? (
          <div className="pt-2 border-t border-[var(--color-border-subtle)] space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between text-[10px] font-bold text-[var(--color-text-muted)]">
              <span>Frio (0)</span>
              <span className="text-[var(--color-text-primary)] font-mono text-xs">{score}</span>
              <span>Quente (100)</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={score}
              onChange={(e) => applyScoreChange(Number(e.target.value), true)}
              className="w-full accent-[var(--color-primary-blue)] cursor-pointer h-1.5 bg-[var(--color-surface-sunken)] rounded-lg"
            />
          </div>
        ) : (
          <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-[var(--color-border-subtle)] text-[10px]">
            <span className="text-[var(--color-text-muted)] font-bold">Ajustes rápidos:</span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => applyScoreChange(30, true)}
                className="px-2 py-0.5 rounded border border-[var(--color-primary-blue)]/20 bg-[var(--color-primary-blue)]/5 hover:bg-[var(--color-primary-blue)]/15 text-[var(--color-primary-blue)] font-bold transition-all"
              >
                ❄️ 30
              </button>
              <button
                type="button"
                onClick={() => applyScoreChange(65, true)}
                className="px-2 py-0.5 rounded border border-warning/20 bg-warning/5 hover:bg-warning/15 text-warning font-bold transition-all"
              >
                ☀️ 65
              </button>
              <button
                type="button"
                onClick={() => applyScoreChange(90, true)}
                className="px-2 py-0.5 rounded border border-danger/20 bg-danger/5 hover:bg-danger/15 text-danger font-bold transition-all"
              >
                🔥 90
              </button>
              <button
                type="button"
                onClick={() => applyScoreChange(5, false)}
                className="px-2 py-0.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border-subtle)] text-[var(--color-text-muted)] font-bold transition-all"
              >
                +5
              </button>
              <button
                type="button"
                onClick={() => applyScoreChange(-5, false)}
                className="px-2 py-0.5 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] hover:bg-[var(--color-border-subtle)] text-[var(--color-text-muted)] font-bold transition-all"
              >
                -5
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* ── SELETOR DE CATEGORIA RÁPIDA / CHIPS DE INTENÇÃO ── */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-black uppercase tracking-wider text-[var(--color-text-muted)]">
            Nova Anotação
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant={isRecording ? "danger" : "outline"}
              size="sm"
              onClick={() => (isRecording ? stopRecording() : startRecording())}
              className="text-[10px] font-bold h-7 gap-1"
            >
              {isRecording ? <MicOff className="w-3 h-3" /> : <Mic className="w-3 h-3 text-[var(--color-text-muted)]" />}
              {isRecording ? "Parar" : "Gravar Voz"}
            </Button>
          </div>
        </div>

        {/* Chips de intenção que impactam o score */}
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-1">
          <button
            type="button"
            onClick={() => {
              setActiveCategory("chamada");
              if (!input.includes("📞 Ligação:")) setInput(v => `📞 Ligação: ${v}`);
            }}
            className={cn(
              "px-2.5 py-1 rounded-lg border text-[10px] font-bold whitespace-nowrap transition-all cursor-pointer",
              activeCategory === "chamada"
                ? "bg-[var(--color-primary-blue)]/20 border-[var(--color-primary-blue)] text-[var(--color-primary-blue)]"
                : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            )}
          >
            <Phone className="w-3 h-3 inline mr-1 text-[var(--color-primary-blue)]" /> Ligação
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveCategory("interesse");
              if (!input.includes("🔥 Alto Interesse:")) setInput(v => `🔥 Alto Interesse: ${v}`);
            }}
            className={cn(
              "px-2.5 py-1 rounded-lg border text-[10px] font-bold whitespace-nowrap transition-all cursor-pointer",
              activeCategory === "interesse"
                ? "bg-success/20 border-success text-success"
                : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            )}
          >
            <Flame className="w-3 h-3 inline mr-1 text-success" /> Interesse (+15)
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveCategory("decisor");
              if (!input.includes("🎯 Decisor Contatado:")) setInput(v => `🎯 Decisor Contatado: ${v}`);
            }}
            className={cn(
              "px-2.5 py-1 rounded-lg border text-[10px] font-bold whitespace-nowrap transition-all cursor-pointer",
              activeCategory === "decisor"
                ? "bg-success/20 border-success text-success"
                : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            )}
          >
            <CheckCircle2 className="w-3 h-3 inline mr-1 text-success" /> Decisor (+10)
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveCategory("objecao");
              if (!input.includes("⚠️ Objeção:")) setInput(v => `⚠️ Objeção: ${v}`);
            }}
            className={cn(
              "px-2.5 py-1 rounded-lg border text-[10px] font-bold whitespace-nowrap transition-all cursor-pointer",
              activeCategory === "objecao"
                ? "bg-warning/20 border-warning text-warning"
                : "bg-[var(--color-surface-sunken)] border-[var(--color-border-subtle)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
            )}
          >
            <AlertTriangle className="w-3 h-3 inline mr-1 text-warning" /> Objeção (-10)
          </button>
        </div>
      </div>

      {/* ── TEXTAREA DE NOTA ── */}
      <div className="relative">
        {isRecording && (
          <div className="absolute top-2.5 left-3.5 flex items-center gap-1.5 z-10 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-danger animate-pulse" />
            <span className="text-[9px] text-danger font-black uppercase tracking-widest">Gravando voz...</span>
          </div>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              addNoteWithCategory();
            }
          }}
          placeholder="Escreva anotações importantes sobre a negociação (Ctrl+Enter para salvar)..."
          rows={3}
          className={cn(
            "w-full bg-[var(--color-surface-elevated)] border rounded-[var(--radius-control)] px-4 py-3 pr-12 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] transition-all resize-none leading-relaxed",
            isRecording ? "border-danger/30 pt-8" : "border-[var(--color-border-default)]"
          )}
        />
        <Button
          size="sm"
          onClick={() => addNoteWithCategory()}
          disabled={!input.trim() || saving}
          loading={saving}
          className="absolute bottom-3 right-3 w-7 h-7 p-0 rounded-lg shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <div className="flex items-center justify-between -mt-2">
        <p className="text-[10px] text-[var(--color-text-faint)]">
          Autor: <span className="text-[var(--color-text-muted)] font-semibold">{authorName}</span>
        </p>
        <p className="text-[10px] text-[var(--color-text-faint)] flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-[var(--color-primary-blue)]" /> Correção ortográfica IA ativa
        </p>
      </div>

      {/* ── LISTA DE NOTAS ── */}
      {notes.length > 0 ? (
        <div className="space-y-2.5">
          {notes.map((note) => {
            const isCall = note.category === "chamada" || note.text.includes("📞");
            const isInterest = note.category === "interesse" || (note.scoreImpact && note.scoreImpact > 0);
            const isObjection = note.category === "objecao" || (note.scoreImpact && note.scoreImpact < 0);

            return (
              <Card
                key={note.id}
                className={cn(
                  "p-3.5 bg-[var(--color-surface-elevated)] border space-y-2 transition-all",
                  isInterest ? "border-success/25 bg-success/[0.02]" :
                  isObjection ? "border-warning/25 bg-warning/[0.02]" :
                  "border-[var(--color-border-default)]"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-bold text-[var(--color-primary-blue)] uppercase tracking-wider">
                      {formatDate(note.createdAt)}
                    </p>
                    {note.scoreImpact && (
                      <span className={cn(
                        "text-[9px] font-black px-1.5 py-0.2 rounded border",
                        note.scoreImpact > 0
                          ? "bg-success/10 border-success/30 text-success"
                          : "bg-warning/10 border-warning/30 text-warning"
                      )}>
                        {note.scoreImpact > 0 ? `+${note.scoreImpact}` : note.scoreImpact} Score
                      </span>
                    )}
                    <span className="text-[10px] text-[var(--color-text-faint)]">por {note.author}</span>
                  </div>

                  <button
                    onClick={() => deleteNote(note.id)}
                    className="p-1 bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] hover:bg-danger/10 rounded text-[var(--color-text-faint)] hover:text-danger transition-all cursor-pointer"
                    title="Remover Nota"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <p className="text-xs text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">
                  {note.text}
                </p>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 py-8 text-center border border-dashed border-[var(--color-border-default)] rounded-[var(--radius-panel)]">
          <MessageSquare className="w-6 h-6 text-[var(--color-text-faint)]" />
          <p className="text-xs text-[var(--color-text-muted)] font-bold">Nenhuma anotação registrada ainda.</p>
          <p className="text-[11px] text-[var(--color-text-faint)]">
            Adicione observações da negociação acima para calibrar o Score do Lead automaticamente.
          </p>
        </div>
      )}
    </div>
  );
}
