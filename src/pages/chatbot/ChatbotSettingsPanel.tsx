import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, QrCode, Smartphone, CheckCircle2, WifiOff } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Card } from "../../components/ui/card";
import { apiFetch } from "../../lib/apiClient";
import { useData } from "../../contexts/DataContext";
import { getStageId } from "../../lib/funilStages";
import type { ChatbotSettings } from "../../lib/chatbot/types";
import type { Chatbot } from "../../hooks/useChatbots";

const SELECT = "h-10 w-full rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-3 text-sm text-[var(--color-text-primary)] disabled:opacity-60";
const TEXTAREA = "w-full min-h-[72px] rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] px-3 py-2 text-sm text-[var(--color-text-primary)] disabled:opacity-60";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-[var(--color-text-faint)]">{hint}</span>}
    </label>
  );
}

const toList = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

type WaStatus = "CONNECTED" | "CONNECTING" | "DISCONNECTED" | "UNKNOWN";

function WhatsAppConnection({ bot, readOnly, onSessionCreated }: { bot: Chatbot; readOnly: boolean; onSessionCreated: () => void }) {
  const [status, setStatus] = useState<WaStatus | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState<string>("");
  const [showQr, setShowQr] = useState(false);

  const loadStatus = useCallback(async () => {
    if (!bot.whatsappSession) return null;
    try {
      const r = await apiFetch(`/api/chatbots/${bot.id}/whatsapp`);
      const data = r.ok ? await r.json().catch(() => null) : null;
      if (data?.status) {
        setStatus(data.status as WaStatus);
        setPhone(data.phone ?? null);
        return data.status as WaStatus;
      }
    } catch {
      /* sem rede: mantém o último estado conhecido */
    }
    return null;
  }, [bot.id, bot.whatsappSession]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Enquanto o QR está aberto: renova o código e confere se já conectou.
  useEffect(() => {
    if (!showQr || !bot.whatsappSession) return;
    let stopped = false;
    const tick = async () => {
      try {
        const r = await apiFetch(`/api/chatbots/${bot.id}/whatsapp/qr`, { method: "POST" });
        const data = await r.json().catch(() => ({}));
        if (stopped) return;
        if (data.status === "CONNECTED") {
          setShowQr(false);
          setQr("");
          await loadStatus();
          toast.success("WhatsApp conectado ao chatbot!");
          return;
        }
        if (data.qrcode) setQr(data.qrcode);
      } catch {
        /* tenta de novo no próximo ciclo */
      }
    };
    tick();
    const t = setInterval(tick, 5000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [showQr, bot.id, bot.whatsappSession, loadStatus]);

  const connect = async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/chatbots/${bot.id}/whatsapp`, { method: "POST" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(data.error || "Não foi possível criar a conexão.");
        return;
      }
      onSessionCreated();
      setShowQr(true);
    } finally {
      setBusy(false);
    }
  };

  const connected = status === "CONNECTED";

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Smartphone className="w-4 h-4 text-[var(--color-text-muted)]" />
        <h4 className="text-sm font-bold text-[var(--color-text-primary)]">Número de WhatsApp do chatbot</h4>
      </div>
      <p className="text-xs text-[var(--color-text-muted)]">
        O chatbot usa um número <b>só dele</b> — escaneie o QR code com o WhatsApp do número que vai atender. Esse número não pode ser o mesmo de outro agente.
      </p>

      {!bot.whatsappSession ? (
        <Button size="sm" onClick={connect} disabled={readOnly || busy}>
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <QrCode className="w-3.5 h-3.5" />} Conectar WhatsApp
        </Button>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            {connected ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <WifiOff className="w-4 h-4 text-amber-500" />}
            <span className="font-medium text-[var(--color-text-primary)]">
              {connected ? `Conectado${phone ? ` · ${phone}` : ""}` : status === "CONNECTING" ? "Aguardando leitura do QR code" : status === "UNKNOWN" ? "Estado desconhecido" : "Desconectado"}
            </span>
            {!readOnly && !connected && (
              <Button size="xs" variant="outline" className="ml-auto" onClick={() => setShowQr((v) => !v)}>
                <QrCode className="w-3 h-3" /> {showQr ? "Fechar QR" : "Mostrar QR code"}
              </Button>
            )}
          </div>
          {showQr && (
            <div className="grid place-items-center rounded-xl bg-white p-3 w-fit mx-auto">
              {qr ? <img src={qr} alt="QR code do WhatsApp" className="w-56 h-56" /> : <Loader2 className="w-6 h-6 animate-spin text-slate-400 m-16" />}
            </div>
          )}
          {showQr && <p className="text-[11px] text-center text-[var(--color-text-faint)]">WhatsApp → Aparelhos conectados → Conectar um aparelho</p>}
        </div>
      )}
    </Card>
  );
}

interface Props {
  bot: Chatbot;
  name: string;
  description: string;
  settings: ChatbotSettings;
  funilId: string | null;
  etapaId: string | null;
  readOnly: boolean;
  onName: (v: string) => void;
  onDescription: (v: string) => void;
  onSettings: (s: ChatbotSettings) => void;
  onFunil: (funilId: string | null, etapaId: string | null) => void;
  onSessionCreated: () => void;
}

export function ChatbotSettingsPanel({ bot, name, description, settings, funilId, etapaId, readOnly, onName, onDescription, onSettings, onFunil, onSessionCreated }: Props) {
  const { funis } = useData();
  const funisAtivos = (funis ?? []).filter((f: any) => f && f.ativo !== false && Array.isArray(f.etapas));
  const funil = funisAtivos.find((f: any) => f.id === funilId);
  const set = <K extends keyof ChatbotSettings>(key: K, value: ChatbotSettings[K]) => onSettings({ ...settings, [key]: value });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <Card className="p-4 space-y-3">
          <h4 className="text-sm font-bold text-[var(--color-text-primary)]">Identificação</h4>
          <Field label="Nome do chatbot">
            <Input disabled={readOnly} maxLength={120} value={name} onChange={(e) => onName(e.target.value)} />
          </Field>
          <Field label="Descrição (opcional)">
            <textarea className={TEXTAREA} disabled={readOnly} maxLength={300} value={description} onChange={(e) => onDescription(e.target.value)} />
          </Field>
        </Card>

        <Card className="p-4 space-y-3">
          <h4 className="text-sm font-bold text-[var(--color-text-primary)]">Onde os leads entram no CRM</h4>
          <Field label="Funil">
            <select
              className={SELECT}
              disabled={readOnly}
              value={funilId ?? ""}
              onChange={(e) => {
                const f = funisAtivos.find((x: any) => x.id === e.target.value);
                onFunil(f ? f.id : null, f ? getStageId(f.id, 0) : null);
              }}
            >
              <option value="">Padrão do sistema</option>
              {funisAtivos.map((f: any) => (
                <option key={f.id} value={f.id}>{f.nome}</option>
              ))}
            </select>
          </Field>
          {funil && (
            <Field label="Etapa de entrada">
              <select className={SELECT} disabled={readOnly} value={etapaId ?? ""} onChange={(e) => onFunil(funil.id, e.target.value || null)}>
                {funil.etapas.map((nome: string, idx: number) => (
                  <option key={getStageId(funil.id, idx)} value={getStageId(funil.id, idx)}>{nome}</option>
                ))}
              </select>
            </Field>
          )}
        </Card>

        <WhatsAppConnection bot={bot} readOnly={readOnly} onSessionCreated={onSessionCreated} />
      </div>

      <Card className="p-4 space-y-3 h-fit">
        <h4 className="text-sm font-bold text-[var(--color-text-primary)]">Comportamento</h4>
        <Field label="Palavras que recomeçam o fluxo" hint="Separe por vírgula. Ex.: menu, inicio">
          <Input disabled={readOnly} value={settings.restart_keywords.join(", ")} onChange={(e) => set("restart_keywords", toList(e.target.value))} />
        </Field>
        <Field label="Palavras que chamam um atendente" hint="Valem em qualquer ponto da conversa. Ex.: atendente, humano">
          <Input disabled={readOnly} value={settings.handoff_keywords.join(", ")} onChange={(e) => set("handoff_keywords", toList(e.target.value))} />
        </Field>
        <Field label="Resposta ao pedir atendente">
          <textarea className={TEXTAREA} disabled={readOnly} maxLength={400} value={settings.handoff_text} onChange={(e) => set("handoff_text", e.target.value)} />
        </Field>
        <Field label="Avisar este WhatsApp quando pedirem atendente (opcional)" hint="Com DDI, só números. Ex.: 5563999990000. Sem isso, o aviso aparece só nas notificações do SPY.">
          <Input disabled={readOnly} inputMode="numeric" maxLength={15} value={settings.handoff_notify_phone ?? ""} onChange={(e) => set("handoff_notify_phone", e.target.value.replace(/\D/g, ""))} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Conversa nova após (min)" hint="Sem mensagens por esse tempo, recomeça do início.">
            <Input disabled={readOnly} type="number" min={1} value={settings.session_timeout_minutes} onChange={(e) => set("session_timeout_minutes", Math.max(1, Number(e.target.value) || 1))} />
          </Field>
          <Field label="Bot volta após atendente (h)" hint="Silêncio depois de passar para humano.">
            <Input disabled={readOnly} type="number" min={1} value={settings.handoff_timeout_hours} onChange={(e) => set("handoff_timeout_hours", Math.max(1, Number(e.target.value) || 1))} />
          </Field>
        </div>
      </Card>
    </div>
  );
}
