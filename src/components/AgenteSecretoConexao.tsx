import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { WifiOff } from "lucide-react";
import { Button } from "./ui/button";
import { AgenteSecretoQrModal } from "./AgenteSecretoQrModal";
import { apiFetch } from "../lib/apiClient";
import { useAuth } from "../contexts/AuthContext";

const STATUS_POLL_MS = 60_000;
/** Disparado quando o status do Agente Secreto muda (ex.: conectou pela página de configurações). */
export const AGENTE_SECRETO_STATUS_EVENT = "agente-secreto-status";

type Status = "CONNECTED" | "CONNECTING" | "DISCONNECTED" | "UNKNOWN";

// Aviso do Agente Secreto do próprio vendedor: se a sessão de WhatsApp dele cair, mostra "desconectado"
// com o botão Reconectar (QR code), para ele mesmo se reconectar sem pedir ajuda. Quem não tem sessão
// ligada ao login não vê nada.
export function AgenteSecretoConexao() {
  const { user } = useAuth();
  const [hasSession, setHasSession] = useState(false);
  const [ativo, setAtivo] = useState(true); // pausado por férias/afastamento: não é queda, não mostra aviso
  const [status, setStatus] = useState<Status>("CONNECTED");
  const [open, setOpen] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const r = await apiFetch("/api/agente-secreto/minha-sessao");
      const data = r.ok ? await r.json().catch(() => null) : null;
      if (!data?.session) { setHasSession(false); return null; }
      setHasSession(true);
      setAtivo(data.ativo !== false);
      setStatus(data.status as Status);
      return data.status as Status;
    } catch {
      return null; // sem rede: mantém o último estado conhecido
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    loadStatus();
    const t = setInterval(loadStatus, STATUS_POLL_MS);
    window.addEventListener(AGENTE_SECRETO_STATUS_EVENT, loadStatus);
    return () => { clearInterval(t); window.removeEventListener(AGENTE_SECRETO_STATUS_EVENT, loadStatus); };
  }, [user?.id, loadStatus]);

  if (!hasSession || !ativo || status === "CONNECTED" || status === "UNKNOWN") return null;

  return (
    <>
      <div
        role="alert"
        className="fixed bottom-4 left-4 z-[60] flex items-center gap-3 rounded-xl border border-rose-500/40 bg-[var(--color-surface-elevated)] px-4 py-3 shadow-xl"
      >
        <WifiOff className="w-4 h-4 text-rose-500 shrink-0" />
        <div className="text-xs">
          <p className="font-bold text-[var(--color-text-primary)]">Agente Secreto desconectado</p>
          <p className="text-[var(--color-text-muted)]">Ele parou de acompanhar suas conversas no WhatsApp.</p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>Reconectar</Button>
      </div>

      <AgenteSecretoQrModal
        open={open}
        onClose={() => setOpen(false)}
        title="Reconectar o Agente Secreto"
        checkConnected={async () => (await loadStatus()) === "CONNECTED"}
        onConnected={() => {
          setStatus("CONNECTED");
          setOpen(false);
          toast.success("Agente Secreto reconectado!");
        }}
      />
    </>
  );
}
