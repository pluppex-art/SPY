import React, { useState } from 'react';
import { Activity, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '../../../../lib/apiClient';

interface WebhookModalProps {
  webhookModalLead: any;
  setWebhookModalLead: (lead: any) => void;
  webhookUrl: string;
  setWebhookUrl: (v: string) => void;
}

export function WebhookModal({
  webhookModalLead,
  setWebhookModalLead,
  webhookUrl,
  setWebhookUrl
}: WebhookModalProps) {
  const [isSending, setIsSending] = useState(false);
  if (!webhookModalLead) return null;

  const handleSend = async () => {
    if (!webhookUrl) { toast.error("Informe uma URL válida."); return; }
    setIsSending(true);
    try {
      const res = await apiFetch("/api/integrations/webhook-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: webhookUrl,
          event: "sdr_handoff",
          payload: {
            event: "sdr_handoff",
            lead: {
              id: webhookModalLead.id,
              name: webhookModalLead.name,
              company: webhookModalLead.company,
              email: webhookModalLead.email,
              phone: webhookModalLead.phone,
              value: webhookModalLead.value,
              scoreIA: webhookModalLead.scoreIA,
            },
            timestamp: new Date().toISOString(),
          },
        }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success(`Passagem de bastão enviada com sucesso (HTTP ${data.status}).`);
        setWebhookModalLead(null);
        setWebhookUrl("");
      } else {
        toast.error(data.error || `O endpoint respondeu com erro (HTTP ${data.status ?? "?"}).`);
      }
    } catch (err: any) {
      toast.error(err.message || "Falha ao chamar o webhook.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4 animate-in fade-in duration-150">
      <div className="bg-[var(--color-surface)] border border-white/10 rounded-2xl p-6 max-h-[90dvh] overflow-y-auto w-full max-w-md shadow-2xl relative text-left ring-1 ring-black/5 animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200">
        <button onClick={() => setWebhookModalLead(null)} className="absolute top-4 right-4 p-2 text-slate-500 hover:text-white rounded-lg hover:bg-white/5 transition-colors border-none bg-transparent cursor-pointer">
          ✕
        </button>
        <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-500" /> Webhook SDR para Closer
        </h3>
        <p className="text-xs text-slate-400 mb-6">
          Envie manualmente os dados do lead <strong className="text-white">{webhookModalLead.name}</strong> para uma URL de automação (n8n/Zapier). Disparo automático recorrente para todo handoff ainda não está implementado — este botão envia uma requisição real agora.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">Endpoint URL (POST)</label>
            <input
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://sua-url-do-webhook.com"
              className="w-full bg-[var(--color-surface-elevated)] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500/50"
            />
          </div>

          <button
            onClick={handleSend}
            disabled={isSending}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-colors cursor-pointer text-sm border-none disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSending && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSending ? "Enviando..." : "Enviar Passagem de Bastão"}
          </button>
        </div>
      </div>
    </div>
  );
}
