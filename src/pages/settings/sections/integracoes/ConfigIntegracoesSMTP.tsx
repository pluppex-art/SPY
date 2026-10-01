import { useState, useEffect } from "react";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { FormField } from "../../../../components/ui/form-field";
import { Alert } from "../../../../components/ui/alert";
import { Mail, Server, ShieldCheck, Send, Save } from "lucide-react";
import { toast } from "sonner";
import { useData } from "../../../../contexts/DataContext";
import { apiFetch } from "../../../../lib/apiClient";

const SETTING_KEY = "integracoes_smtp";

const DEFAULT_SMTP = {
  smtpServer: "",
  smtpPort: "587",
  smtpUser: "",
  smtpPass: "",
  fromEmail: "",
  encryption: "StartTLS",
};

export function ConfigIntegracoesSMTP() {
  const { appSettings, saveAppSetting } = useData();
  const [config, setConfig] = useState(DEFAULT_SMTP);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    const saved = appSettings?.[SETTING_KEY];
    if (saved) { setConfig(saved); setHydrated(true); }
  }, [appSettings, hydrated]);

  const [testing, setTesting] = useState(false);

  const testConnection = async () => {
    if (!config.smtpServer || !config.smtpUser || !config.smtpPass) {
      toast.error("Preencha host, usuário e senha antes de testar.");
      return;
    }
    setTesting(true);
    try {
      const res = await apiFetch("/api/integrations/smtp-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (data.ok) toast.success("Conexão SMTP validada com sucesso! Handshake e autenticação confirmados.");
      else toast.error(data.error || "Falha na autenticação SMTP.");
    } catch {
      toast.error("Falha ao contatar o servidor para testar a conexão.");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setHydrated(true);
    await saveAppSetting(SETTING_KEY, config);
    toast.success("Preferências de SMTP salvas com sucesso!");
  };

  return (
    <div className="max-w-4xl space-y-6 animate-in fade-in duration-300 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--color-text-primary)] flex items-center gap-2.5">
          Servidores SMTP & Disparos de E-mail
          <Server className="w-5 h-5 text-[var(--color-primary-blue)]" />
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Configure seu servidor SMTP e valide a conexão com "Testar Conexão TLS" (handshake e autenticação reais). Estas credenciais ainda não são usadas para enviar e-mails do sistema (propostas, faturas, avisos) — só para o teste de conexão.
        </p>
      </div>

      <Alert variant="info" title="Segurança & Entregabilidade">
        Recomendamos o uso da porta 587 com protocolo STARTTLS e uma chave de aplicativo dedicada (em vez da senha principal da conta).
      </Alert>

      <Card className="p-6 space-y-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <h3 className="font-bold text-xs uppercase tracking-widest text-[var(--color-primary-blue)] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[var(--color-primary-blue)]" /> Credenciais de Transmissão Autenticada
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Servidor Host (Host)" required>
            <Input
              type="text"
              value={config.smtpServer}
              onChange={(e) => setConfig({ ...config, smtpServer: e.target.value })}
              placeholder="smtp.dominio.com"
            />
          </FormField>

          <FormField label="Porta de Conexão" required>
            <Input
              type="text"
              value={config.smtpPort}
              onChange={(e) => setConfig({ ...config, smtpPort: e.target.value })}
              className="font-mono"
              placeholder="587 ou 465"
            />
          </FormField>

          <FormField label="Criptografia / Protocolo">
            <select 
              value={config.encryption}
              onChange={(e) => setConfig({ ...config, encryption: e.target.value })}
              className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
            >
              <option value="StartTLS">StartTLS (Recomendado - Porta 587)</option>
              <option value="SSL/TLS">SSL/TLS Direto (Porta 465)</option>
              <option value="Nenhuma">Nenhuma (Porta 25)</option>
            </select>
          </FormField>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Usuário Autenticado (User / API Key)" required>
            <Input
              type="text"
              value={config.smtpUser}
              onChange={(e) => setConfig({ ...config, smtpUser: e.target.value })}
            />
          </FormField>

          <FormField label="Senha de Aplicativo (Secret Password)" required>
            <Input
              type="password"
              value={config.smtpPass}
              onChange={(e) => setConfig({ ...config, smtpPass: e.target.value })}
              placeholder="••••••••••••••••••••"
            />
          </FormField>
        </div>

        <FormField label="E-mail de Remetente Padrão (From Email)" hint="Endereço que aparecerá como remetente para os clientes">
          <Input
            type="email"
            value={config.fromEmail}
            onChange={(e) => setConfig({ ...config, fromEmail: e.target.value })}
            placeholder="contato@empresa.com.br"
          />
        </FormField>

        <div className="pt-4 border-t border-[var(--color-border-subtle)] flex flex-col sm:flex-row justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={testConnection}
            loading={testing}
            className="font-bold text-xs gap-2"
          >
            <Send className="w-3.5 h-3.5" /> Testar Conexão TLS
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="font-bold text-xs gap-1.5 shadow-xs"
          >
            <Save className="w-3.5 h-3.5" /> Salvar Configuração SMTP
          </Button>
        </div>
      </Card>
    </div>
  );
}
