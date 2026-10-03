import React, { useEffect, useState } from "react";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { FormField } from "../../components/ui/form-field";
import { Badge } from "../../components/ui/badge";
import { EmptyState } from "../../components/ui/empty-state";
import { Plug, X, Send, RefreshCw, ShieldAlert, KeyRound, Copy, Code2 } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "../../components/ui/confirm-dialog";
import { useExternalIntegrations, type ExternalIntegrationInput } from "../../hooks/useExternalIntegrations";
import { apiFetch } from "../../lib/apiClient";

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

const API_ENDPOINTS: { method: "GET" | "POST"; path: string; note: string }[] = [
  { method: "POST", path: "/api/v1/leads", note: "Cria ou atualiza um lead (dedup por telefone/e-mail)" },
  { method: "GET", path: "/api/v1/leads", note: "Lista leads (?seller=&status=&limit=&offset=)" },
  { method: "POST", path: "/api/v1/lead-activities", note: "Registra uma atividade no histórico de um lead" },
  { method: "GET", path: "/api/v1/lead-activities", note: "Lista atividades (?leadId=&type=)" },
  { method: "POST", path: "/api/v1/finance-entries", note: "Cria/atualiza um lançamento financeiro" },
  { method: "GET", path: "/api/v1/finance-entries", note: "Lista lançamentos (?status=&type=)" },
  { method: "POST", path: "/api/v1/clients", note: "Cadastra/completa um cliente na Base de Clientes" },
  { method: "GET", path: "/api/v1/clients", note: "Lista clientes (?status=)" },
  { method: "POST", path: "/api/v1/meetings", note: "Cria/atualiza um compromisso na Agenda" },
  { method: "GET", path: "/api/v1/meetings", note: "Lista compromissos (?status=)" },
  { method: "POST", path: "/api/v1/products", note: "Cadastra/atualiza um produto do catálogo" },
  { method: "GET", path: "/api/v1/products", note: "Lista produtos (?active=)" },
];

const EVENT_OPTIONS = [
  "Novo Lead Criado", "Negócio Ganho", "Negócio Perdido", "Nova Tarefa SDR",
  "Tarefa Concluída", "Proposta Aceita", "Pagamento Recebido", "Contrato Assinado", "Implementação Concluída",
];

const AUTH_TYPE_LABELS: Record<string, string> = {
  none: "Sem autenticação",
  api_key: "Chave de API (header)",
  bearer: "Bearer Token",
  basic: "Basic Auth",
};

export function ConfigConectoresExternos() {
  const { integrations, loading, saving, create, update, remove, test } = useExternalIntegrations();

  const [form, setForm] = useState<ExternalIntegrationInput>({
    name: "",
    base_url: "",
    auth_type: "none",
    auth_header_name: "",
    secret_value: "",
    sync_events: [],
  });
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; status: number | null; error?: string; latencyMs?: number }>>({});

  // ── Chaves de API (/api/v1/*) — self-service, sem precisar editar .env ────
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [creatingKey, setCreatingKey] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const fetchApiKeys = () => {
    apiFetch("/api/settings/api-keys")
      .then((res) => res.json())
      .then((data) => setApiKeys(data.keys || []))
      .catch(() => {})
      .finally(() => setApiKeysLoading(false));
  };
  useEffect(() => { fetchApiKeys(); }, []);

  const handleCreateKey = async () => {
    if (!newKeyName.trim()) { toast.error("Dê um nome pra identificar a chave (ex.: nome do app)."); return; }
    setCreatingKey(true);
    try {
      const res = await apiFetch("/api/settings/api-keys", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Erro ao criar chave.");
      setRevealedKey(data.key);
      setNewKeyName("");
      fetchApiKeys();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao criar chave.");
    } finally {
      setCreatingKey(false);
    }
  };

  const handleRevokeKey = async (id: string, name: string) => {
    if (!(await confirmDialog({ title: "Revogar chave", description: `Revogar a chave "${name}"? Qualquer app usando ela para de funcionar imediatamente.` }))) return;
    setRevokingId(id);
    try {
      const res = await apiFetch(`/api/settings/api-keys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json())?.error || "Erro ao revogar chave.");
      toast.success("Chave revogada.");
      fetchApiKeys();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao revogar chave.");
    } finally {
      setRevokingId(null);
    }
  };

  const copyText = async (text: string, okMsg: string) => {
    try { await navigator.clipboard.writeText(text); toast.success(okMsg); } catch { toast.error("Não foi possível copiar."); }
  };

  const isUrlValid = form.base_url === "" || form.base_url.startsWith("https://");

  const toggleEvent = (event: string) => {
    setForm((f) => ({
      ...f,
      sync_events: f.sync_events.includes(event) ? f.sync_events.filter((e) => e !== event) : [...f.sync_events, event],
    }));
  };

  const handleCreate = async () => {
    if (!form.name || !form.base_url) {
      toast.error("Preencha nome e URL base.");
      return;
    }
    try {
      new URL(form.base_url);
      if (!form.base_url.startsWith("https://")) {
        toast.error("Por segurança, a URL base deve usar HTTPS.");
        return;
      }
    } catch {
      toast.error("URL base inválida.");
      return;
    }
    const { error } = await create(form);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Conector cadastrado. Ative os eventos de sincronização e teste a conexão.");
    setForm({ name: "", base_url: "", auth_type: "none", auth_header_name: "", secret_value: "", sync_events: [] });
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    const { error } = await update(id, { active: !active } as Partial<ExternalIntegrationInput>);
    if (error) toast.error(error);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirmDialog({ title: "Excluir conector", description: `Excluir o conector "${name}"? Essa ação não pode ser desfeita.` }))) return;
    const { error } = await remove(id);
    if (error) toast.error(error);
    else toast.success("Conector removido.");
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const result = await test(id);
      setTestResults((prev) => ({ ...prev, [id]: result }));
      if (result.ok) toast.success(`Conexão OK — HTTP ${result.status} recebido.`);
      else toast.error(result.error || `Endpoint respondeu com status ${result.status}.`);
    } catch {
      toast.error("Falha ao contatar o servidor para testar a conexão.");
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-black tracking-tight text-[var(--color-text-primary)] flex items-center gap-2.5">
          Conectores Externos
          <Plug className="w-5 h-5 text-[var(--color-primary-blue)]" />
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Conecte o ERP/CRM próprio da sua empresa (ou outro sistema) ao SPY via API/Webhook autenticado — nunca uma conexão
          direta ao banco de dados de terceiros. Ative os eventos que devem ser enviados automaticamente pra esse sistema.
        </p>
      </div>

      <Card className="p-6 space-y-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <div>
          <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2"><KeyRound className="w-4 h-4 text-[var(--color-primary-blue)]" /> Chaves de API</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Pra qualquer app (seu ou de um cliente) mandar ou puxar dados do SPY direto pela API (<code className="font-mono">/api/v1/*</code>, ver referência abaixo) —
            sem precisar de ninguém mexer em configuração do servidor pra cada app novo.
          </p>
        </div>

        {revealedKey && (
          <div className="rounded-[var(--radius-control)] border border-success/30 bg-success/5 p-4 space-y-2">
            <p className="text-xs font-bold text-success">Chave criada — copie agora, ela não aparece de novo:</p>
            <div className="flex gap-2">
              <code className="flex-1 text-xs font-mono bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 overflow-x-auto">{revealedKey}</code>
              <Button size="sm" onClick={() => copyText(revealedKey, "Chave copiada.")} className="shrink-0 gap-1.5"><Copy className="w-3.5 h-3.5" /> Copiar</Button>
            </div>
            <button type="button" onClick={() => setRevealedKey(null)} className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] cursor-pointer">Fechar</button>
          </div>
        )}

        <div className="flex gap-2">
          <Input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="Nome da chave (ex.: App do cliente X)" className="text-xs" />
          <Button onClick={handleCreateKey} loading={creatingKey} className="shrink-0 text-xs font-bold">Gerar chave</Button>
        </div>

        <div className="space-y-2">
          {apiKeysLoading ? (
            <div className="text-center py-4 text-[var(--color-text-faint)] text-xs">Carregando...</div>
          ) : apiKeys.length === 0 ? (
            <p className="text-xs text-[var(--color-text-faint)] py-2">Nenhuma chave criada ainda.</p>
          ) : (
            apiKeys.map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-3 bg-[var(--color-surface-sunken)] px-3.5 py-2.5 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] text-xs">
                <div className="min-w-0">
                  <p className="font-bold text-[var(--color-text-primary)] truncate">{k.name}</p>
                  <p className="font-mono text-[10px] text-[var(--color-text-faint)]">{k.key_prefix}… · criada {new Date(k.created_at).toLocaleDateString("pt-BR")}{k.last_used_at ? ` · último uso ${new Date(k.last_used_at).toLocaleDateString("pt-BR")}` : " · nunca usada"}</p>
                </div>
                {k.revoked_at ? (
                  <Badge variant="neutral">Revogada</Badge>
                ) : (
                  <button onClick={() => handleRevokeKey(k.id, k.name)} disabled={revokingId === k.id} className="text-[var(--color-text-faint)] hover:text-danger p-1 transition-colors shrink-0" title="Revogar chave">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </Card>

      <Card className="p-4 bg-warning/5 border border-warning/20 flex gap-3">
        <ShieldAlert className="w-5 h-5 text-warning shrink-0 mt-0.5" />
        <p className="text-xs text-[var(--color-text-muted)]">
          Esta é a V1 do conector: só API/Webhook autenticado (chave de API, Bearer Token ou Basic Auth), nunca conexão SQL
          direta a um banco de terceiro — decisão deliberada por segurança. A chave/token que você cadastrar aqui nunca é
          mostrada de volta depois de salva; use "Testar Conexão" para confirmar que está correta.
        </p>
      </Card>

      <Card className="p-6 space-y-5 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Novo Conector (webhook de saída)</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <FormField label="Nome do sistema" required>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ex.: ERP interno da empresa" />
          </FormField>
          <FormField label="URL base (endpoint HTTPS)" required error={!isUrlValid ? "A URL deve usar HTTPS." : undefined}>
            <Input
              type="url"
              value={form.base_url}
              onChange={(e) => setForm((f) => ({ ...f, base_url: e.target.value }))}
              placeholder="https://erp-do-cliente.com/webhooks/spy"
              className="font-mono text-xs"
            />
          </FormField>
          <FormField label="Tipo de autenticação">
            <select
              value={form.auth_type}
              onChange={(e) => setForm((f) => ({ ...f, auth_type: e.target.value as ExternalIntegrationInput["auth_type"] }))}
              className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)] h-10"
            >
              {Object.entries(AUTH_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </FormField>
          {form.auth_type === "api_key" && (
            <FormField label="Nome do header (ex.: X-API-Key)">
              <Input
                value={form.auth_header_name}
                onChange={(e) => setForm((f) => ({ ...f, auth_header_name: e.target.value }))}
                placeholder="X-API-Key"
                className="font-mono text-xs"
              />
            </FormField>
          )}
          {form.auth_type !== "none" && (
            <FormField label={form.auth_type === "basic" ? "Usuário:senha" : "Chave/Token"}>
              <Input
                type="password"
                value={form.secret_value}
                onChange={(e) => setForm((f) => ({ ...f, secret_value: e.target.value }))}
                placeholder="••••••••"
                className="font-mono text-xs"
              />
            </FormField>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-[var(--color-text-primary)]">Eventos que disparam sincronização</label>
          <div className="flex flex-wrap gap-2">
            {EVENT_OPTIONS.map((event) => (
              <button
                key={event}
                type="button"
                onClick={() => toggleEvent(event)}
                className="cursor-pointer"
              >
                <Badge variant={form.sync_events.includes(event) ? "success" : "neutral"}>{event}</Badge>
              </button>
            ))}
          </div>
        </div>
        <Button onClick={handleCreate} disabled={saving || !isUrlValid} className="font-bold text-xs h-10">
          Cadastrar Conector
        </Button>
      </Card>

      <Card className="p-5 space-y-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center justify-between">
          <span>Conectores Cadastrados</span>
          <Badge variant="secondary">{integrations.length}</Badge>
        </h3>
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-8 text-[var(--color-text-faint)] text-xs">Carregando...</div>
          ) : integrations.length === 0 ? (
            <EmptyState icon={Plug} title="Nenhum conector cadastrado" description="Cadastre um sistema externo acima para começar a sincronizar eventos." className="py-8" />
          ) : (
            integrations.map((integ) => {
              const result = testResults[integ.id];
              return (
                <div key={integ.id} className="bg-[var(--color-surface-sunken)] p-3.5 rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-[var(--color-text-primary)]">{integ.name}</span>
                    <div className="flex gap-2 items-center">
                      <button onClick={() => handleToggleActive(integ.id, integ.active)} className="cursor-pointer">
                        <Badge variant={integ.active ? "success" : "neutral"} dot dotPulse={integ.active}>
                          {integ.active ? "Ativo" : "Pausado"}
                        </Badge>
                      </button>
                      <button onClick={() => handleDelete(integ.id, integ.name)} className="text-[var(--color-text-faint)] hover:text-danger p-1 transition-colors" title="Remover conector">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="text-[11px] font-mono text-[var(--color-text-muted)] truncate">{integ.baseUrl}</div>
                  <div className="flex flex-wrap gap-1.5 items-center">
                    <Badge variant="secondary">{AUTH_TYPE_LABELS[integ.authType]}</Badge>
                    {integ.hasSecret && <Badge variant="secondary">Credencial configurada</Badge>}
                    {integ.syncEvents.map((e) => <Badge key={e} variant="neutral">{e}</Badge>)}
                  </div>
                  {integ.lastSyncAt && (
                    <div className="text-[10px] text-[var(--color-text-faint)]">
                      Último envio: {new Date(integ.lastSyncAt).toLocaleString("pt-BR")} ({integ.lastSyncStatus})
                    </div>
                  )}
                  <div className="pt-1.5 border-t border-[var(--color-border-subtle)] flex justify-between items-center">
                    <button
                      onClick={() => handleTest(integ.id)}
                      disabled={testingId === integ.id}
                      className="text-xs font-bold text-[var(--color-primary-blue)] hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    >
                      <Send className={`w-3 h-3 ${testingId === integ.id ? "animate-pulse" : ""}`} /> Testar Conexão
                    </button>
                    {result && (
                      <Badge variant={result.ok ? "success" : "destructive"}>
                        {result.ok ? `HTTP ${result.status}` : (result.error || `HTTP ${result.status}`)}
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>

      <Card className="p-6 space-y-4 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] shadow-sm">
        <h3 className="text-sm font-bold text-[var(--color-text-primary)] flex items-center gap-2"><Code2 className="w-4 h-4 text-[var(--color-primary-blue)]" /> Referência da API</h3>
        <p className="text-xs text-[var(--color-text-muted)]">
          Toda chamada leva a chave no header <code className="font-mono bg-[var(--color-surface-sunken)] px-1 py-0.5 rounded">x-api-key</code>. O tenant é sempre resolvido pela chave — nunca enviado no corpo da requisição.
        </p>
        <div className="rounded-[var(--radius-control)] border border-[var(--color-border-subtle)] overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="bg-[var(--color-surface-sunken)] text-[10px] uppercase font-semibold text-[var(--color-text-muted)]">
              <tr><th className="px-3 py-2">Método</th><th className="px-3 py-2">Endpoint</th><th className="px-3 py-2">O que faz</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {API_ENDPOINTS.map((e) => (
                <tr key={`${e.method}-${e.path}`}>
                  <td className="px-3 py-2"><Badge variant={e.method === "GET" ? "secondary" : "success"} className="font-mono">{e.method}</Badge></td>
                  <td className="px-3 py-2 font-mono text-[var(--color-text-primary)]">{e.path}</td>
                  <td className="px-3 py-2 text-[var(--color-text-muted)]">{e.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--color-text-primary)]">Exemplo — criar um lead</span>
            <button
              type="button"
              onClick={() => copyText(
                `curl -X POST https://www.spycrm.com.br/api/v1/leads \\\n  -H "x-api-key: SUA_CHAVE" \\\n  -H "Content-Type: application/json" \\\n  -d '{"name": "Maria Silva", "email": "maria@exemplo.com", "phone": "11999998888", "value": 997}'`,
                "Exemplo copiado."
              )}
              className="text-[11px] text-[var(--color-primary-blue)] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <Copy className="w-3 h-3" /> Copiar
            </button>
          </div>
          <pre className="text-[11px] font-mono bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] rounded-[var(--radius-control)] p-3 overflow-x-auto text-[var(--color-text-muted)]">{`curl -X POST https://www.spycrm.com.br/api/v1/leads \\
  -H "x-api-key: SUA_CHAVE" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "Maria Silva", "email": "maria@exemplo.com", "phone": "11999998888", "value": 997}'`}</pre>
        </div>
        <p className="text-[11px] text-[var(--color-text-faint)]">
          Pra ser avisado automaticamente quando algo acontece no SPY (lead criado, negócio ganho, tarefa concluída, pagamento recebido, etc.), cadastre um Conector Externo acima com os eventos que te interessam.
        </p>
      </Card>
    </div>
  );
}
