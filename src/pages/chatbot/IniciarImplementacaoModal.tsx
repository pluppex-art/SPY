import { useState } from "react";
import { Loader2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "../../components/ui/modal";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { apiFetch } from "../../lib/apiClient";

/**
 * Caminho comercial: a equipe informa o WhatsApp do cliente (e o nome da empresa, se for número novo) e o chatbot
 * abre a conversa pelo número exclusivo. O servidor cadastra o cliente/implementação e manda a primeira mensagem.
 */
export function IniciarImplementacaoModal({ botId, botName, isOpen, onClose }: { botId: string; botName: string; isOpen: boolean; onClose: () => void }) {
  const [whatsapp, setWhatsapp] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");

  const close = () => { if (busy) return; setWhatsapp(""); setEmpresa(""); setErro(""); onClose(); };

  const iniciar = async () => {
    if (busy) return;
    setBusy(true); setErro("");
    try {
      const res = await apiFetch(`/api/chatbots/${botId}/iniciar-implementacao`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ whatsapp, empresa }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) { setErro(body?.error || "Não foi possível iniciar agora."); return; }
      toast.success("Conversa iniciada pelo WhatsApp do chatbot.", { description: body.clienteCriado ? "Cliente e implementação cadastrados." : "Implementação existente reaproveitada." });
      close();
    } catch {
      setErro("Sem conexão com o servidor. Tente de novo em instantes.");
    } finally { setBusy(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={close} maxWidth="max-w-md" title={<span className="flex items-center gap-2"><Rocket className="w-4 h-4 text-[var(--color-primary-blue)]" /> Iniciar implementação</span>}
      description={`${botName} abre a conversa com o cliente, faz as perguntas e, ao terminar, cria a empresa e envia o link de acesso.`}
      footer={<div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={close} disabled={busy}>Cancelar</Button>
        <Button variant="success" size="sm" onClick={iniciar} disabled={busy || !whatsapp.trim()} className="gap-1.5">{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Iniciar conversa</Button></div>}>
      <div className="space-y-4">
        <label className="block space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">WhatsApp do cliente</span>
          <Input value={whatsapp} inputMode="tel" placeholder="(63) 99999-8888" onChange={(e) => setWhatsapp(e.target.value)} />
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">Nome da empresa</span>
          <Input value={empresa} placeholder="Ex.: Acme Ltda" onChange={(e) => setEmpresa(e.target.value)} />
          <span className="block text-[11px] text-[var(--color-text-faint)]">Obrigatório só para número novo. Se o cliente já está cadastrado, o sistema reaproveita o cadastro.</span>
        </label>
        {erro && <p role="alert" className="text-xs text-rose-500">{erro}</p>}
      </div>
    </Modal>
  );
}
