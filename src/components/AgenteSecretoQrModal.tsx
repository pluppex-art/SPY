import { useEffect, useRef, useState } from "react";
import { Modal } from "./ui/modal";
import { Button } from "./ui/button";
import { apiFetch } from "../lib/apiClient";

const QR_REFRESH_MS = 20_000; // o QR do WhatsApp expira em ~20s
const QR_RETRY_MS = 3_000; // sessão acabou de ser religada: o QR leva alguns segundos para existir
const STATUS_POLL_MS = 3_000;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Chamado quando o WhatsApp conecta (QR lido) — o pai recarrega o status e avisa o usuário. */
  onConnected: () => void;
  /** Consulta o status atual; devolve true quando já está conectado. */
  checkConnected: () => Promise<boolean>;
  title?: string;
}

// QR code do Agente Secreto do próprio usuário (sessão resolvida no servidor, nunca enviada pelo navegador).
// Renova o QR sozinho, religa a sessão se ela caiu e fecha quando o WhatsApp conectar.
export function AgenteSecretoQrModal({ open, onClose, onConnected, checkConnected, title = "Conectar o Agente Secreto" }: Props) {
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const closedRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    setQr("");
    setError("");
    closedRef.current = false;
    let qrTimer: ReturnType<typeof setTimeout> | undefined;

    const refreshQr = async () => {
      let next = QR_REFRESH_MS;
      try {
        const r = await apiFetch("/api/agente-secreto/minha-sessao/qr", { method: "POST" });
        const data = await r.json().catch(() => ({}));
        if (closedRef.current) return;
        if (data.status === "CONNECTED") { onConnected(); return; }
        if (r.ok && data.qrcode) { setQr(data.qrcode); setError(""); }
        else if (data.retry) { next = QR_RETRY_MS; setError("Religando a sessão…"); }
        else { next = QR_RETRY_MS; setError(data.error || "Não foi possível gerar o QR code."); }
      } catch {
        next = QR_RETRY_MS;
        if (!closedRef.current) setError("Não foi possível gerar o QR code.");
      }
      if (!closedRef.current) qrTimer = setTimeout(refreshQr, next);
    };

    const poll = async () => {
      if (!closedRef.current && (await checkConnected()) && !closedRef.current) onConnected();
    };

    refreshQr();
    const statusTimer = setInterval(poll, STATUS_POLL_MS);
    return () => {
      closedRef.current = true;
      if (qrTimer) clearTimeout(qrTimer);
      clearInterval(statusTimer);
    };
    // onConnected/checkConnected mudam a cada render do pai; o ciclo só reinicia ao abrir/fechar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={title}
      description="Leia o QR code com o WhatsApp do seu celular."
      footer={<Button variant="ghost" onClick={onClose}>Fechar</Button>}
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
  );
}
