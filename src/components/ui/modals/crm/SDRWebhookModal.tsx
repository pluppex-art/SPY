import { useState } from "react";
import { Modal } from "../../modal";
import { Button } from "../../button";
import { Webhook, Activity, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import axios from "axios";
import { friendlyError } from "../../../../lib/friendlyError";

interface SDRWebhookModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SDRWebhookModal({ isOpen, onClose }: SDRWebhookModalProps) {
  const [endpoint, setEndpoint] = useState("");
  const [secretAuth, setSecretAuth] = useState("");
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");

  const handleTestPing = async () => {
    if (!endpoint) {
      toast.error("O Endpoint URL não pode estar vazio.");
      return;
    }

    setTesting(true);
    setStatus("idle");

    try {
      const payload = {
        event: "sdr_funnel_test",
        timestamp: new Date().toISOString(),
        robot: "Aurora",
        data: {
          message: "SPY_CORE_SYSTEMS_PING",
        }
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };
      if (secretAuth) {
        headers["Authorization"] = `Bearer ${secretAuth}`;
      }

      await axios.post(endpoint, payload, { headers, timeout: 8000 });

      toast.success("Ping enviado! O endpoint respondeu com sucesso.");
      setStatus("success");
    } catch (e: any) {
      toast.error(`Falha no Ping: ${e.response?.status ? `HTTP ${e.response.status}` : friendlyError(e)}`);
      setStatus("error");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    if (!endpoint) {
      toast.error("Endpoint inválido!");
      return;
    }
    toast.success("Webhook do Funil SDR salvo com sucesso!");
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={
      <div className="flex items-center gap-2">
        <Webhook className="w-5 h-5 text-[#00c8ff]" />
        <span className="font-display font-medium">Configuração de Webhook (SDR)</span>
      </div>
    }>
      <div className="space-y-6">
        <div className="bg-[#0f172a] p-4 rounded-xl border border-blue-500/20">
          <p className="text-xs text-slate-300 leading-relaxed mb-0">
            Conecte a Aurora ao seu <strong>Vendas</strong>, <strong>N8N</strong>, <strong>Make</strong> ou <strong>RD Station</strong>.
            Todas as conversões de leads ou análises de pipeline dispararão um POST usando `axios` com os dados JSON.
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-400">Endpoint URL (POST)</label>
            <input 
              type="url" 
              value={endpoint}
              onChange={(e) => { setEndpoint(e.target.value); setStatus("idle"); }}
              className="w-full bg-[var(--color-surface)] border border-white/10 rounded-lg px-4 py-2 text-white focus:border-[#00c8ff] focus:outline-none focus:ring-1 focus:ring-[#00c8ff] font-mono text-xs" 
              placeholder="https://sua-integracao.com.br/webhook/..." 
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-400 flex items-center justify-between">
              Auth Token 
              <span className="text-[10px] bg-slate-800 text-slate-500 px-2 py-0.5 rounded uppercase">Opcional</span>
            </label>
            <input 
              type="password" 
              value={secretAuth}
              onChange={(e) => setSecretAuth(e.target.value)}
              className="w-full bg-[var(--color-surface)] border border-white/10 rounded-lg px-4 py-2 text-white focus:border-[#00c8ff] focus:outline-none focus:ring-1 focus:ring-[#00c8ff] font-mono text-xs" 
              placeholder="Bearer Token (se necessário)" 
            />
          </div>
        </div>

        {status === "success" && (
          <div className="bg-emerald-900/30 text-emerald-400 border border-emerald-500/50 p-3 rounded-lg flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" />
            <span className="text-xs font-medium">Conexão verificada. O endpoint respondeu com sucesso ao ping real.</span>
          </div>
        )}

        <div className="flex items-center gap-3 pt-4 border-t border-white/10">
          <Button 
            variant="ghost" 
            className="text-slate-400 font-medium font-sans flex-1"
            onClick={onClose}
          >
            Cancelar
          </Button>
          <Button 
            variant="outline" 
            className="border-blue-500/30 text-blue-400 hover:bg-blue-500/10 font-medium font-sans px-4"
            onClick={handleTestPing}
            disabled={testing || !endpoint}
          >
            {testing ? <Activity className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 mr-1" />}
            {testing ? "Enviando..." : "Testar POST"}
          </Button>
          <Button 
            className="bg-[#00c8ff] hover:bg-blue-400 text-black font-bold font-sans flex-1"
            onClick={handleSave}
            disabled={!endpoint}
          >
            Salvar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
