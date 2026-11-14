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
      {/* Fica na barra do topo, ao lado do nome do usuário (antes era um aviso flutuando no canto da tela). */}
      <div
        role="alert"
        title="O Agente Secreto parou de acompanhar suas conversas no WhatsApp."
        className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 pl-2.5 pr-1 py-1 shrink-0"
      >
        <WifiOff className="w-4 h-4 text-rose-500 shrink-0" aria-hidden />
        <p className="hidden lg:block text-[11px] font-bold leading-tight text-[var(--color-text-primary)] whitespace-nowrap">Agente Secreto desconectado</p>
        <span className="sr-only lg:hidden">Agente Secreto desconectado.</span>
        <Button size="sm" onClick={() => setOpen(true)} className="h-7 px-3 text-[11px]">Reconectar</Button>
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
