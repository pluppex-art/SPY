import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { apiFetch } from "../lib/apiClient";
import { useAuth } from "../contexts/AuthContext";

const DISMISS_KEY = "spy_wa_pairing_dismissed";
const QR_REFRESH_MS = 20_000; // o QR do WhatsApp expira em ~20s
const STATUS_POLL_MS = 3_000;

type Instance = { id: string; name: string; status: string };

// Primeiro login do colaborador: se ele tem uma sessão de WhatsApp (criada pelo RH) que ainda não
// foi pareada, mostra o QR code pra ele adicionar o Agente Secreto no próprio telefone.
export function WhatsAppPairingModal() {
  const { user } = useAuth();
  const [instance, setInstance] = useState<Instance | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  const closedRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    try { if (sessionStorage.getItem(DISMISS_KEY) === user.id) return; } catch { /* storage indisponível */ }
    let cancelled = false;
    apiFetch("/api/whatsapp/instances/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        // Só faz sentido com o WAHA real: no simulador não existe QR de verdade.
        if (cancelled || !data?.instance || data.provider !== "waha") return;
        if (data.instance.status === "CONNECTED") return;
        setInstance(data.instance);
        setOpen(true);
      })
      .catch(() => { /* sem sessão/rede: segue sem modal */ });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (!open || !instance) return;
    closedRef.current = false;
    const id = instance.id;

    const refreshQr = async () => {
      try {
        const r = await apiFetch(`/api/whatsapp/instances/${id}/qrcode`, { method: "POST" });
        const data = await r.json().catch(() => ({}));
        if (closedRef.current) return;
        if (r.ok && data.qrcode) { setQr(data.qrcode); setError(""); }
        else setError(data.error || "Não foi possível gerar o QR code.");
      } catch {
        if (!closedRef.current) setError("Não foi possível gerar o QR code.");
      }
    };

    const checkStatus = async () => {
      try {
        const r = await apiFetch(`/api/whatsapp/instances/${id}/connect`, { method: "POST" });
        const data = await r.json().catch(() => ({}));
        if (!closedRef.current && r.ok && data.status === "CONNECTED") {
          toast.success("WhatsApp conectado! O Agente Secreto já está no seu telefone.");
          setOpen(false);
        }
      } catch { /* tenta de novo no próximo ciclo */ }
    };

    refreshQr();
    const qrTimer = setInterval(refreshQr, QR_REFRESH_MS);
    const statusTimer = setInterval(checkStatus, STATUS_POLL_MS);
    return () => {
      closedRef.current = true;
      clearInterval(qrTimer);
      clearInterval(statusTimer);
    };
  }, [open, instance]);

  const handleLater = () => {
    try { if (user?.id) sessionStorage.setItem(DISMISS_KEY, user.id); } catch { /* ignore */ }
    setOpen(false);
  };

  if (!instance) return null;

  return (
    <Modal
      isOpen={open}
      onClose={handleLater}
      title="Conecte seu WhatsApp"
      description="Adicione o Agente Secreto ao seu telefone."
      footer={<Button variant="ghost" onClick={handleLater}>Fazer depois</Button>}
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
      <p className="text-xs text-[var(--color-text-muted)] mt-3 text-center">
        Sessão: {instance.name}. O QR é renovado automaticamente.
      </p>
    </Modal>
  );
}
