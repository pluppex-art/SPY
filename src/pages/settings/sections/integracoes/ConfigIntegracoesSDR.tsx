import { useState, useEffect } from "react";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { FormField } from "../../../../components/ui/form-field";
import { Switch } from "../../../../components/ui/switch";
import { Badge } from "../../../../components/ui/badge";
import { Zap, Send, Save, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useData } from "../../../../contexts/DataContext";
import { apiFetch } from "../../../../lib/apiClient";

const SETTING_KEY = "integracoes_sdr_webhooks";

const DEFAULT_SDR_INTEGRATIONS = {
  webhookUrl: "",
  webhookActive: false,
  leadQualificadoUrl: "",
  leadQualificadoActive: false,
};

export function ConfigIntegracoesSDR() {
  const { appSettings, saveAppSetting } = useData();
  const [config, setConfig] = useState(DEFAULT_SDR_INTEGRATIONS);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    const saved = appSettings?.[SETTING_KEY];
    if (saved) { setConfig(saved); setHydrated(true); }
  }, [appSettings, hydrated]);

  const [testing, setTesting] = useState(false);

  const saveConfig = (updated: typeof config) => {
    setConfig(updated);
    setHydrated(true);
    saveAppSetting(SETTING_KEY, updated);
  };

  const testWebhook = async (event: string, url: string) => {
    if (!url) { toast.error("Preencha a URL do webhook antes de testar."); return; }
    setTesting(true);
    try {
      const res = await apiFetch("/api/integrations/webhook-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, event }),
      });
      const data = await res.json();
      if (data.ok) toast.success(`Webhook '${event}' disparado! Resposta HTTP ${data.status} recebida.`);
      else toast.error(data.error || `Endpoint respondeu com status ${data.status}.`);
    } catch {
      toast.error("Falha ao contatar o servidor para disparar o teste.");
    } finally {
      setTesting(false);
    }
  };

  const handleSaveReuniao = () => {
    saveConfig(config);
    toast.success("Webhook de Reunião Agendada salvo com sucesso!");
  };

  const handleSaveQualificado = () => {
    saveConfig(config);
    toast.success("Webhook de Lead Qualificado salvo com sucesso!");
  };

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2.5">
          Integrações SDR & Pré-Vendas
          <Zap className="w-5 h-5 text-[var(--color-primary-blue)]" />
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Cadastre os endpoints e valide a conexão com "Disparar Teste" (chamada HTTP real). O disparo automático nestes eventos de qualificação ainda não está implementado — hoje só o teste manual envia uma requisição de verdade.
        </p>
      </div>

      {/* Reunião Agendada */}
      <Card className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden shadow-sm">
        <div className="p-5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-[var(--color-text-primary)] text-sm">
                Reunião Agendada (Qualificação Concluída)
              </h3>
              <Badge variant={config.webhookActive ? "success" : "neutral"} dot dotPulse={config.webhookActive}>
                {config.webhookActive ? "Ativo" : "Pausado"}
              </Badge>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Disparado sempre que um lead atinge a etapa de Reunião Agendada no pipeline do SDR.
            </p>
          </div>
          <Switch
            checked={config.webhookActive}
            onCheckedChange={(val) => saveConfig({ ...config, webhookActive: val })}
            label={config.webhookActive ? "Ativado" : "Desativado"}
          />
        </div>

        <div className="p-5 space-y-4">
          <FormField label="Endpoint URL (POST)" required hint="URL que receberá o JSON com os dados do lead e da reunião">
            <Input
              type="url"
              value={config.webhookUrl}
              onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })}
              placeholder="https://n8n.sua-empresa.com/webhook/..."
              className="font-mono text-xs"
            />
          </FormField>

          <div className="bg-[var(--color-surface-sunken)] p-4 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] space-y-1.5">
            <span className="text-[10px] font-black uppercase text-[var(--color-text-faint)] tracking-widest block">
              Payload de Exemplo (JSON)
            </span>
            <pre className="text-[11px] text-[var(--color-text-muted)] font-mono overflow-auto leading-relaxed">{`{
  "event": "sdr.reuniao_agendada",
  "lead": {
    "id": "123",
    "name": "Maria Silva",
    "company": "TechCorp Brasil",
    "scoreIA": 92,
    "temperature": "quente",
    "seller_sdr": "Roberto Ramos",
    "ia_summary": "Empresa demonstrou forte interesse no plano corporativo..."
  },
  "timestamp": "${new Date().toISOString()}"
}`}</pre>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => testWebhook("sdr.reuniao_agendada", config.webhookUrl)}
              loading={testing}
              className="h-9 px-4 text-xs font-bold gap-1.5"
            >
              <Send className="w-3.5 h-3.5" /> Disparar Teste
            </Button>
            <Button
              type="button"
              onClick={handleSaveReuniao}
              className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
            >
              <Save className="w-3.5 h-3.5" /> Salvar Webhook
            </Button>
          </div>
        </div>
      </Card>

      {/* Lead Qualificado */}
      <Card className="bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] overflow-hidden shadow-sm">
        <div className="p-5 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-[var(--color-text-primary)] text-sm">
                Lead Qualificado (Score IA Atingido)
              </h3>
              <Badge variant={config.leadQualificadoActive ? "success" : "neutral"} dot dotPulse={config.leadQualificadoActive}>
                {config.leadQualificadoActive ? "Ativo" : "Pausado"}
              </Badge>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
              Disparado quando a IA (Aurora) classifica o lead com score suficiente para transferência.
            </p>
          </div>
          <Switch
            checked={config.leadQualificadoActive}
            onCheckedChange={(val) => saveConfig({ ...config, leadQualificadoActive: val })}
            label={config.leadQualificadoActive ? "Ativado" : "Desativado"}
          />
        </div>

        <div className="p-5 space-y-4">
          <FormField label="Endpoint URL (POST)" required hint="URL para receber leads qualificados pela Master AI">
            <Input
              type="url"
              value={config.leadQualificadoUrl}
              onChange={(e) => setConfig({ ...config, leadQualificadoUrl: e.target.value })}
              placeholder="https://n8n.seumodelo.com/webhook/sdr-qualificado"
              className="font-mono text-xs"
            />
          </FormField>

          <div className="bg-[var(--color-surface-sunken)] p-4 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] space-y-1.5">
            <span className="text-[10px] font-black uppercase text-[var(--color-text-faint)] tracking-widest block">
              Payload de Exemplo (JSON)
            </span>
            <pre className="text-[11px] text-[var(--color-text-muted)] font-mono overflow-auto leading-relaxed">{`{
  "event": "sdr.lead_qualificado",
  "lead": {
    "id": "123",
    "name": "Maria Silva",
    "scoreIA": 92,
    "events": ["score_updated", "profile_mapped", "needs_confirmed"]
  },
  "timestamp": "${new Date().toISOString()}"
}`}</pre>
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => testWebhook("sdr.lead_qualificado", config.leadQualificadoUrl)}
              loading={testing}
              className="h-9 px-4 text-xs font-bold gap-1.5"
            >
              <Send className="w-3.5 h-3.5" /> Disparar Teste
            </Button>
            <Button
              type="button"
              onClick={handleSaveQualificado}
              className="h-9 px-4 text-xs font-bold gap-1.5 shadow-xs"
            >
              <Save className="w-3.5 h-3.5" /> Salvar Webhook
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
