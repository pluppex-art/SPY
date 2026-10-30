import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { WifiOff } from "lucide-react";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { apiFetch } from "../lib/apiClient";
import { useAuth } from "../contexts/AuthContext";

const STATUS_POLL_MS = 60_000;
const QR_REFRESH_MS = 20_000; // o QR do WhatsApp expira em ~20s
const QR_RETRY_MS = 3_000; // sessão acabou de ser religada: o QR leva alguns segundos para existir
const MODAL_STATUS_POLL_MS = 3_000;

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
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const closedRef = useRef(false);

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
    return () => clearInterval(t);
  }, [user?.id, loadStatus]);

  useEffect(() => {
    if (!open) return;
    closedRef.current = false;
    let qrTimer: ReturnType<typeof setTimeout> | undefined;

    const refreshQr = async () => {
      let next = QR_REFRESH_MS;
      try {
        const r = await apiFetch("/api/agente-secreto/minha-sessao/qr", { method: "POST" });
        const data = await r.json().catch(() => ({}));
        if (closedRef.current) return;
        if (data.status === "CONNECTED") {
          setStatus("CONNECTED");
          setOpen(false);
          toast.success("Agente Secreto reconectado!");
          return;
        }
        if (r.ok && data.qrcode) { setQr(data.qrcode); setError(""); }
        else if (data.retry) { next = QR_RETRY_MS; setError("Religando a sessão…"); }
        else { next = QR_RETRY_MS; setError(data.error || "Não foi possível gerar o QR code."); }
      } catch {
        next = QR_RETRY_MS;
        if (!closedRef.current) setError("Não foi possível gerar o QR code.");
      }
      if (!closedRef.current) qrTimer = setTimeout(refreshQr, next);
    };

    const checkStatus = async () => {
      const s = await loadStatus();
      if (!closedRef.current && s === "CONNECTED") {
        toast.success("Agente Secreto reconectado!");
        setOpen(false);
      }
    };

    refreshQr();
    const statusTimer = setInterval(checkStatus, MODAL_STATUS_POLL_MS);
    return () => {
      closedRef.current = true;
      if (qrTimer) clearTimeout(qrTimer);
      clearInterval(statusTimer);
    };
  }, [open, loadStatus]);

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
        <Button size="sm" onClick={() => { setQr(""); setError(""); setOpen(true); }}>Reconectar</Button>
      </div>

      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Reconectar o Agente Secreto"
        description="Leia o QR code com o WhatsApp do seu celular."
        footer={<Button variant="ghost" onClick={() => setOpen(false)}>Fechar</Button>}
      >
        <ol className="text-sm text-[var(--color-text-muted)] list-decimal pl-5 space-y-1 mb-4">
          <li>Abra o WhatsApp no celular.</li>
          <li>Vá em Aparelhos conectados › Conectar um aparelho.</li>
          <li>Aponte a câmera para o QR code abaixo.</li>
        </ol>
        <div className="flex items-center justify-center min-h-[260px] rounded-xl bg-white p-3">
          {qr.startsWith("data:") ? (
            <img src={qr} alt="QR code do WhatsApp" className="w-60 h-60" />
          ) : (
            <span className="text-sm text-neutral-500">{error || "Gerando QR code..."}</span>
          )}
        </div>
        {error && qr && <p className="text-xs text-amber-400 mt-2">{error}</p>}
        <p className="text-xs text-[var(--color-text-muted)] mt-3 text-center">O QR é renovado automaticamente.</p>
      </Modal>
    </>
  );
}
