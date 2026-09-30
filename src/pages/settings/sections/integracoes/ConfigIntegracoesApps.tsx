import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { Badge } from "../../../../components/ui/badge";
import { Input } from "../../../../components/ui/input";
import { Switch } from "../../../../components/ui/switch";
import { FormField } from "../../../../components/ui/form-field";
import { Modal } from "../../../../components/ui/modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../../../components/ui/tabs";
import { Alert } from "../../../../components/ui/alert";
import { EmptyState } from "../../../../components/ui/empty-state";
import {
  Zap,
  Settings,
  MessageSquare,
  Search,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Globe,
  CreditCard,
  Wallet,
  Send,
  Copy,
  ExternalLink,
  ShieldCheck,
  Eye,
  RefreshCw,
  Play,
  Check,
  Lock,
  Server,
  Facebook,
  Plus,
  ArrowUpRight,
  Sparkles,
  Layers,
  HelpCircle,
  Database,
  Truck,
  ShoppingCart,
} from "lucide-react";
import { useData } from "../../../../contexts/DataContext";
import { useAuth } from "../../../../contexts/AuthContext";
import { toast } from "sonner";
import { NovaIntegracaoModal } from "../../../../components/ui/modals/settings/NovaIntegracaoModal";
import { apiFetch } from "../../../../lib/apiClient";
import { DEFAULT_META_CONFIG, DEFAULT_GOOGLE_CONFIG, DEFAULT_PAYMENT_CONFIG, DEFAULT_MAXDATA_CONFIG } from "../../../../lib/tenantIntegrations";
import { INTEGRATION_CATALOG, catalogHasAnyValue, catalogMissingRequired, type CatalogIntegration, type CatalogValues } from "../../../../lib/integrationCatalog";

// Integration Categories
type IntegrationCategory = "todas" | "anuncios" | "mensageria" | "pagamentos" | "automacoes" | "email" | "dados" | "crm" | "erp" | "ecommerce" | "produtividade" | "logistica";

type MaxDataConfig = typeof DEFAULT_MAXDATA_CONFIG;

/** Modal de uma conexão Max Data (a mesma tela serve às duas APIs: notas fiscais e estoque). */
function MaxDataConnectionModal({
  title, subtitle, which, tenantId, config, setConfig, onClose, onToggleConnected,
}: {
  title: string;
  subtitle: string;
  which: "notas" | "estoque";
  tenantId: string | null;
  config: MaxDataConfig;
  setConfig: React.Dispatch<React.SetStateAction<MaxDataConfig>>;
  onClose: () => void;
  onToggleConnected: () => void;
}) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  // Usa a configuração já SALVA (o servidor lê do banco — a chave nunca sai do navegador pra essa chamada).
  const handleTest = async () => {
    setTesting(true);
    setResult(null);
    try {
      const res = await apiFetch(`/api/integrations/maxdata/test${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ which }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        const nome = data.empresa?.fantasia || data.empresa?.razaoSocial;
        setResult({ ok: true, text: nome ? `Conexão validada — empresa: ${nome}.` : "Login aceito pela Max Data." });
      } else {
        setResult({ ok: false, text: data?.error || "Falha ao conectar à Max Data." });
      }
    } catch {
      setResult({ ok: false, text: "Falha ao contatar o servidor." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      maxWidth="max-w-xl"
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <Database className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h3 className="text-base font-black text-[var(--color-text-primary)]">{title}</h3>
            <p className="text-xs text-[var(--color-text-muted)]">{subtitle}</p>
          </div>
        </div>
      }
      footer={
        <div className="flex justify-between items-center w-full">
          <Badge variant={config.connected ? "success" : "neutral"} dot dotPulse={config.connected}>
            {config.connected ? "Conectada" : "Desconectada"}
          </Badge>
          <Button onClick={() => { toast.success("Configuração salva."); onClose(); }}>Fechar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Alert variant="info" title="Conexão pronta, comportamento a definir">
          Login da MaxAPI: nome, chave e descrição da aplicação, mais terminal e empresa. Os campos são salvos
          automaticamente. Nesta etapa o SPY só LÊ dados do Max (entradas de nota fiscal); enviar vendas ou emitir
          NF-e não está ligado.
        </Alert>
        <FormField label="URL base da API" required hint="Endereço da MaxAPI deste cliente — pedir à Max Data (a documentação não traz)">
          <Input type="text" value={config.apiUrl} onChange={(e) => setConfig((p) => ({ ...p, apiUrl: e.target.value }))} placeholder="https://" />
        </FormField>
        <FormField label="Nome da aplicação (application_name)" required>
          <Input type="text" value={config.clientId} onChange={(e) => setConfig((p) => ({ ...p, clientId: e.target.value }))} />
        </FormField>
        <FormField label="Chave da aplicação (application_key)" required hint="Fica guardada neste ambiente e nunca aparece em relatórios nem links">
          <Input type="password" autoComplete="off" value={config.apiKey} onChange={(e) => setConfig((p) => ({ ...p, apiKey: e.target.value }))} />
        </FormField>
        <FormField label="Descrição da aplicação (application_description)" required>
          <Input type="text" value={config.applicationDescription} onChange={(e) => setConfig((p) => ({ ...p, applicationDescription: e.target.value }))} placeholder="EMPRESA_SPYCRM" />
        </FormField>
        <div className="grid grid-cols-3 gap-3">
          <FormField label="Terminal" required hint="Ex.: PDV01">
            <Input type="text" value={config.terminal} onChange={(e) => setConfig((p) => ({ ...p, terminal: e.target.value }))} />
          </FormField>
          <FormField label="ID da empresa (empId)" required>
            <Input type="text" inputMode="numeric" value={config.empId} onChange={(e) => setConfig((p) => ({ ...p, empId: e.target.value.replace(/\D/g, "") }))} />
          </FormField>
          <FormField label="ID do usuário (idUser)" hint="0 se não houver">
            <Input type="text" inputMode="numeric" value={config.idUser} onChange={(e) => setConfig((p) => ({ ...p, idUser: e.target.value.replace(/\D/g, "") }))} />
          </FormField>
        </div>
        <FormField label="Ambiente">
          <select
            value={config.environment}
            onChange={(e) => setConfig((p) => ({ ...p, environment: e.target.value as "sandbox" | "production" }))}
            className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs cursor-pointer"
          >
            <option value="production">Produção</option>
            <option value="sandbox">Sandbox / testes</option>
          </select>
        </FormField>
        <FormField label="Observações">
          <Input type="text" value={config.notes} onChange={(e) => setConfig((p) => ({ ...p, notes: e.target.value }))} />
        </FormField>
        <Button variant="outline" onClick={handleTest} disabled={testing} className="w-full text-xs font-bold gap-2">
          <Activity className="w-3.5 h-3.5 text-cyan-500" /> {testing ? "Testando…" : "Testar conexão (usa a configuração salva)"}
        </Button>
        {result && (
          <div className={`p-3 rounded-[var(--radius-control)] border text-xs ${result.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"}`}>
            {result.text}
          </div>
        )}
        <div className="flex items-center justify-between rounded-[var(--radius-control)] border border-[var(--color-border-default)] p-3">
          <div>
            <p className="text-xs font-bold text-[var(--color-text-primary)]">Marcar como conectada</p>
            <p className="text-[11px] text-[var(--color-text-muted)]">Só depois de testar. Requer os campos obrigatórios preenchidos.</p>
          </div>
          <Switch checked={config.connected} onCheckedChange={onToggleConnected} />
        </div>
      </div>
    </Modal>
  );
}

const CATALOG_CATEGORY_STYLE: Record<string, { icon: any; iconBg: string }> = {
  anuncios: { icon: Globe, iconBg: "bg-pink-500/10 text-pink-400 border-pink-500/20" },
  mensageria: { icon: MessageSquare, iconBg: "bg-sky-500/10 text-sky-400 border-sky-500/20" },
  pagamentos: { icon: CreditCard, iconBg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" },
  email: { icon: Send, iconBg: "bg-rose-500/10 text-rose-400 border-rose-500/20" },
  crm: { icon: Layers, iconBg: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
  erp: { icon: Server, iconBg: "bg-teal-500/10 text-teal-400 border-teal-500/20" },
  ecommerce: { icon: ShoppingCart, iconBg: "bg-lime-500/10 text-lime-500 border-lime-500/20" },
  produtividade: { icon: Zap, iconBg: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  logistica: { icon: Truck, iconBg: "bg-slate-500/10 text-slate-400 border-slate-500/20" },
};

/** Modal genérico do catálogo: mesma tela pra qualquer serviço, montada a partir dos campos dele. */
function CatalogIntegrationModal({
  def, values, onChange, onClose, onToggleReady, tenantId,
}: {
  tenantId?: string | null;
  def: CatalogIntegration;
  values: CatalogValues;
  onChange: (patch: CatalogValues) => void;
  onClose: () => void;
  onToggleReady: () => void;
}) {
  const style = CATALOG_CATEGORY_STYLE[def.category];
  const Icon = style.icon;
  const [progress, setProgress] = useState("");
  const [busy, setBusy] = useState<"test" | "import" | null>(null);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const missing = catalogMissingRequired(def, values);

  const callKommo = async (action: "test" | "import") => {
    if (missing.length > 0) { toast.error(`Preencha: ${missing.join(", ")}`); return; }
    setBusy(action); setResult(null);
    try {
      // O servidor lê as credenciais salvas — aguarda o autosave do card antes de chamar.
      await new Promise((r) => setTimeout(r, 800));
      const url = `/api/integrations/kommo/${action}${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ""}`;
      if (action === "test") {
        const res = await apiFetch(url, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) { setResult({ ok: false, text: data?.error || "Falha ao falar com a Kommo." }); return; }
        const funis = (data.pipelines || []).map((p: any) => `${p.name} (${p.stages} etapas)`).join(", ");
        setResult({ ok: true, text: `Conectado à conta "${data.account?.name}". Funis: ${funis || "nenhum"}.` });
        onChange({ connected: true });
      } else {
        // O servidor processa alguns lotes por chamada (limite de tempo da hospedagem); repetimos até acabar.
        let cursor: number | null = 1;
        let created = 0, updated = 0, skipped = 0, funis = 0, truncated = false;
        let vendedores: string[] = [];
        let cadastro: any = null;
        const porFunil: Record<string, { nome: string; vistos: number; salvos: number }> = {};
        const amostras: string[] = [];
        while (cursor) {
          setProgress(`Importando… ${created + updated} leads até agora`);
          const res: Response = await apiFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cursor }) });
          const data: any = await res.json().catch(() => ({}));
          if (!res.ok) {
            setResult({ ok: false, text: `${data?.error || "Falha ao importar da Kommo."}${created + updated > 0 ? ` (${created + updated} leads já foram salvos; é só importar de novo para continuar.)` : ""}` });
            return;
          }
          created += data.created; updated += data.updated; skipped += data.skipped; funis = data.funis; truncated = !!data.truncated; vendedores = data.vendedores || vendedores; cadastro = data.cadastroVendedores || cadastro;
          for (const [pid, v] of Object.entries<any>(data.porFunil || {})) {
            const e = (porFunil[pid] ||= { nome: v.nome, vistos: 0, salvos: 0 });
            e.vistos += v.vistos; e.salvos += v.salvos;
          }
          for (const a of data.skippedSamples || []) if (amostras.length < 5) amostras.push(a);
          cursor = data.done ? null : data.nextCursor;
        }
        const text = `${created + updated} leads sincronizados (${created} novos, ${updated} atualizados) em ${funis} funil(is).${skipped ? ` ${skipped} ignorados (funil arquivado).` : ""}${cadastro ? ` Vendedores: ${cadastro.created.length} cadastrados, ${cadastro.existing} já existiam, ${cadastro.colaboradores} no RH (Colaboradores)${cadastro.skipped.length ? `, ${cadastro.skipped.length} não cadastrados (${cadastro.skipped.map((s: any) => `${s.name}: ${s.reason}`).join("; ")})` : ""}. Eles entram pelo "Esqueci minha senha".` : vendedores.length ? ` Vendedores: ${vendedores.join(", ")}.` : ""}${truncated ? " Limite de segurança atingido; importe de novo para continuar." : ""}\nPor funil (Kommo → SPY): ${Object.values(porFunil).map((f) => `${f.nome} ${f.vistos} → ${f.salvos}`).join(" · ")}.${amostras.length ? ` Não importados: ${amostras.join("; ")}.` : ""}`;
        setResult({ ok: true, text });
        onChange({ connected: true, lastImportAt: new Date().toISOString(), lastImportSummary: text });
        toast.success("Kommo sincronizada com o SPY.");
      }
    } catch (e: any) {
      setResult({ ok: false, text: e?.message || "Falha de rede." });
    } finally { setBusy(null); }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      maxWidth="max-w-xl"
      title={
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl border flex items-center justify-center ${style.iconBg}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-black text-[var(--color-text-primary)]">{def.name}</h3>
            <p className="text-xs text-[var(--color-text-muted)]">{def.live ? "Conexão e sincronização" : "Cadastro de credenciais"}</p>
          </div>
        </div>
      }
      footer={
        <div className="flex justify-between items-center w-full">
          <Badge variant={values.connected ? "success" : "neutral"} dot>{values.connected ? (def.live ? "Conectada" : "Credenciais prontas") : "Não marcada"}</Badge>
          <Button onClick={onClose}>Fechar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {def.live ? (
          <Alert variant="info" title={`Sincronização com ${def.name}`}>
            Preencha as credenciais (salvas automaticamente), use <strong>Testar conexão</strong> e depois <strong>Importar da {def.name}</strong>.
            A importação é somente leitura e pode ser repetida sem duplicar: leads já importados são atualizados.
          </Alert>
        ) : (
          <Alert variant="info" title="Só credenciais, por enquanto">
            Guarda com segurança as credenciais deste serviço neste ambiente (salvas automaticamente). O SPY ainda
            <strong> não sincroniza dados</strong> com {def.name} — o cadastro deixa tudo pronto para quando a conexão for ligada.
          </Alert>
        )}
        {def.fields.map((f) => (
          <FormField key={f.prop} label={f.label} required={f.required} hint={f.help}>
            {f.kind === "select" ? (
              <select
                value={values[f.prop] ?? f.options?.[0] ?? ""}
                onChange={(e) => onChange({ [f.prop]: e.target.value })}
                className="w-full bg-[var(--color-surface-sunken)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs cursor-pointer"
              >
                {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <Input
                type={f.kind === "secret" ? "password" : "text"}
                autoComplete="off"
                value={values[f.prop] ?? ""}
                placeholder={f.placeholder}
                onChange={(e) => onChange({ [f.prop]: e.target.value })}
              />
            )}
          </FormField>
        ))}
        <FormField label="Observações">
          <Input type="text" value={values.notes ?? ""} onChange={(e) => onChange({ notes: e.target.value })} />
        </FormField>
        {def.live ? (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => callKommo("test")} disabled={!!busy}>{busy === "test" ? "Testando…" : "Testar conexão"}</Button>
              <Button onClick={() => callKommo("import")} disabled={!!busy}>{busy === "import" ? (progress || "Importando…") : `Importar da ${def.name}`}</Button>
            </div>
            {result && <Alert variant={result.ok ? "success" : "danger"} title={result.ok ? "Tudo certo" : "Não deu certo"}>{result.text}</Alert>}
            {!result && values.lastImportAt && (
              <p className="text-[11px] text-[var(--color-text-muted)]">
                Última importação: {new Date(values.lastImportAt).toLocaleString("pt-BR")} — {values.lastImportSummary}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between rounded-[var(--radius-control)] border border-[var(--color-border-default)] p-3">
            <div>
              <p className="text-xs font-bold text-[var(--color-text-primary)]">Marcar credenciais como prontas</p>
              <p className="text-[11px] text-[var(--color-text-muted)]">Requer os campos obrigatórios preenchidos.</p>
            </div>
            <Switch checked={!!values.connected} onCheckedChange={onToggleReady} />
          </div>
        )}
      </div>
    </Modal>
  );
}

export function ConfigIntegracoesApps() {
  const navigate = useNavigate();
  const { activeTenantId } = useAuth();
  const { setWhatsappWebhookUrl, appSettings, appSettingsLoaded, saveAppSetting, globalWebhooks } = useData();

  // Search & Filter State
  const [activeCategory, setActiveCategory] = useState<IntegrationCategory>("todas");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [isNovaIntegracaoModalOpen, setIsNovaIntegracaoModalOpen] = useState(false);
  const [selectedConfigModal, setSelectedConfigModal] = useState<string | null>(null);

  // Meta Ads, Google Ads, Pagamentos e integrações customizadas vêm do
  // Supabase (app_settings, via DataContext) — hidratado uma vez quando o
  // fetch inicial do tenant chega, e daí em diante lido/gravado por lá.
  const [metaConfig, setMetaConfig] = useState(DEFAULT_META_CONFIG);
  const [googleConfig, setGoogleConfig] = useState(DEFAULT_GOOGLE_CONFIG);
  const [paymentConfig, setPaymentConfig] = useState(DEFAULT_PAYMENT_CONFIG);
  const [maxdataConfig, setMaxdataConfig] = useState(DEFAULT_MAXDATA_CONFIG);
  const [maxdataEstoqueConfig, setMaxdataEstoqueConfig] = useState(DEFAULT_MAXDATA_CONFIG);
  const [catalogConfig, setCatalogConfig] = useState<Record<string, CatalogValues>>({});
  const [customIntegrations, setCustomIntegrations] = useState<any[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Rascunho editável do modal de pagamento (Mercado Pago/Stripe/Asaas) — os
  // <Input> desse modal eram `defaultValue` sem `onChange`, então nada que o
  // usuário digitava era capturado em lugar nenhum, e "Salvar Credenciais"
  // nunca gravava nada. Corrigido: os campos agora são controlados por este
  // estado, hidratado a partir de paymentConfig quando o modal abre.
  const [paymentDraft, setPaymentDraft] = useState<{ environment: "sandbox" | "production"; publicKey: string; secretKey: string }>({
    environment: "sandbox", publicKey: "", secretKey: "",
  });
  const [testingPayment, setTestingPayment] = useState(false);
  const [paymentTestResult, setPaymentTestResult] = useState<{ ok: boolean; detail: string } | null>(null);

  useEffect(() => {
    if (selectedConfigModal === "mercadopago") {
      setPaymentDraft({ environment: paymentConfig.mercadoPago.environment, publicKey: paymentConfig.mercadoPago.publicKey, secretKey: paymentConfig.mercadoPago.accessToken });
      setPaymentTestResult(null);
    } else if (selectedConfigModal === "stripe") {
      setPaymentDraft({ environment: paymentConfig.stripe.environment, publicKey: paymentConfig.stripe.publishableKey, secretKey: paymentConfig.stripe.secretKey });
      setPaymentTestResult(null);
    } else if (selectedConfigModal === "asaas") {
      setPaymentDraft({ environment: paymentConfig.asaas.environment, publicKey: paymentConfig.asaas.apiKey, secretKey: paymentConfig.asaas.apiKey });
      setPaymentTestResult(null);
    }
  }, [selectedConfigModal]);

  const handleSavePaymentCredentials = () => {
    if (selectedConfigModal === "mercadopago") {
      setPaymentConfig((prev: any) => ({ ...prev, mercadoPago: { ...prev.mercadoPago, environment: paymentDraft.environment, publicKey: paymentDraft.publicKey, accessToken: paymentDraft.secretKey } }));
    } else if (selectedConfigModal === "stripe") {
      setPaymentConfig((prev: any) => ({ ...prev, stripe: { ...prev.stripe, environment: paymentDraft.environment, publishableKey: paymentDraft.publicKey, secretKey: paymentDraft.secretKey } }));
    } else if (selectedConfigModal === "asaas") {
      setPaymentConfig((prev: any) => ({ ...prev, asaas: { ...prev.asaas, environment: paymentDraft.environment, apiKey: paymentDraft.secretKey } }));
    }
    toast.success("Credenciais salvas.");
    setSelectedConfigModal(null);
  };

  const handleTestPaymentGateway = async () => {
    if (!paymentDraft.secretKey) {
      toast.error("Preencha a chave secreta / access token antes de testar.");
      return;
    }
    setTestingPayment(true);
    setPaymentTestResult(null);
    try {
      const res = await apiFetch("/api/integrations/payment-gateway-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selectedConfigModal, environment: paymentDraft.environment, secretKey: paymentDraft.secretKey }),
      });
      const data = await res.json();
      setPaymentTestResult({ ok: !!data.ok, detail: data.ok ? (data.accountLabel || "Credenciais válidas.") : (data.error || "Falha na autenticação.") });
      if (data.ok) toast.success(`Conexão validada — ${data.accountLabel || "credenciais aceitas pelo gateway"}.`);
      else toast.error(data.error || "Falha na autenticação com o gateway.");
    } catch (err: any) {
      setPaymentTestResult({ ok: false, detail: "Falha ao contatar o servidor." });
      toast.error("Falha ao contatar o servidor para testar o gateway.");
    } finally {
      setTestingPayment(false);
    }
  };

  useEffect(() => {
    if (hydrated || !appSettingsLoaded) return;
    // Defaults por baixo do que está salvo: uma configuração PARCIAL (ex.: gravada
    // de fora pela Implementação) não pode derrubar a tela ao ler campo ausente.
    if (appSettings.integracoes_meta_ads) setMetaConfig({ ...DEFAULT_META_CONFIG, ...appSettings.integracoes_meta_ads, trackedEvents: { ...DEFAULT_META_CONFIG.trackedEvents, ...(appSettings.integracoes_meta_ads.trackedEvents || {}) } });
    if (appSettings.integracoes_google_ads) setGoogleConfig({ ...DEFAULT_GOOGLE_CONFIG, ...appSettings.integracoes_google_ads });
    if (appSettings.integracoes_payments) {
      const saved = appSettings.integracoes_payments;
      setPaymentConfig({
        mercadoPago: { ...DEFAULT_PAYMENT_CONFIG.mercadoPago, ...(saved.mercadoPago || {}) },
        stripe: { ...DEFAULT_PAYMENT_CONFIG.stripe, ...(saved.stripe || {}) },
        asaas: { ...DEFAULT_PAYMENT_CONFIG.asaas, ...(saved.asaas || {}) },
      });
    }
    if (appSettings.integracoes_maxdata) setMaxdataConfig({ ...DEFAULT_MAXDATA_CONFIG, ...appSettings.integracoes_maxdata });
    if (appSettings.integracoes_maxdata_estoque) setMaxdataEstoqueConfig({ ...DEFAULT_MAXDATA_CONFIG, ...appSettings.integracoes_maxdata_estoque });
    if (appSettings.integracoes_catalogo && typeof appSettings.integracoes_catalogo === "object") setCatalogConfig(appSettings.integracoes_catalogo);
    if (appSettings.integracoes_custom) setCustomIntegrations(appSettings.integracoes_custom);
    setHydrated(true);
  }, [appSettings, appSettingsLoaded, hydrated]);

  // WhatsApp (Simulador ou WAHA real) State
  const [instances, setInstances] = useState<any[]>([]);
  const [newInstanceName, setNewInstanceName] = useState("");
  const [creatingInstance, setCreatingInstance] = useState(false);
  const [connectingInstanceId, setConnectingInstanceId] = useState<string | null>(null);

  // Persiste no Supabase a cada mudança (mesmo modelo de auto-save que já
  // existia, só trocando o destino de localStorage para app_settings) — só
  // depois de hidratar, pra não sobrescrever dado real salvo com os padrões.
  useEffect(() => {
    if (hydrated) saveAppSetting("integracoes_meta_ads", metaConfig);
  }, [metaConfig, hydrated]);

  useEffect(() => {
    if (hydrated) saveAppSetting("integracoes_google_ads", googleConfig);
  }, [googleConfig, hydrated]);

  useEffect(() => {
    if (hydrated) saveAppSetting("integracoes_payments", paymentConfig);
  }, [paymentConfig, hydrated]);

  useEffect(() => {
    if (hydrated) saveAppSetting("integracoes_custom", customIntegrations);
  }, [customIntegrations, hydrated]);

  useEffect(() => {
    if (hydrated) saveAppSetting("integracoes_maxdata", maxdataConfig);
  }, [maxdataConfig, hydrated]);

  useEffect(() => {
    if (hydrated) saveAppSetting("integracoes_maxdata_estoque", maxdataEstoqueConfig);
  }, [maxdataEstoqueConfig, hydrated]);

  useEffect(() => {
    if (hydrated) saveAppSetting("integracoes_catalogo", catalogConfig);
  }, [catalogConfig, hydrated]);

  const updateCatalog = (id: string, patch: CatalogValues) =>
    setCatalogConfig((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }));

  const toggleCatalogReady = (def: CatalogIntegration) => {
    const cur = catalogConfig[def.id];
    const next = !cur?.connected;
    const missing = catalogMissingRequired(def, cur);
    if (next && missing.length > 0) {
      toast.error(`Falta preencher: ${missing.join(", ")}.`);
      setSelectedConfigModal(`cat-${def.id}`);
      return;
    }
    updateCatalog(def.id, { connected: next });
    toast[next ? "success" : "info"](next ? `${def.name}: credenciais marcadas como prontas.` : `${def.name}: desmarcada.`);
  };

  const toggleMaxdata = (
    cfg: MaxDataConfig,
    setCfg: React.Dispatch<React.SetStateAction<MaxDataConfig>>,
    modalId: string,
    label: string
  ) => {
    const next = !cfg.connected;
    if (next && (!cfg.apiUrl.trim() || !cfg.apiKey.trim() || !cfg.clientId.trim() || !cfg.applicationDescription.trim() || !cfg.terminal.trim() || !cfg.empId.trim())) {
      toast.error("Preencha URL, nome/chave/descrição da aplicação, terminal e empresa antes de marcar como conectada.");
      setSelectedConfigModal(modalId);
      return;
    }
    setCfg((prev) => ({ ...prev, connected: next }));
    toast[next ? "success" : "info"](next ? `${label} marcada como conectada.` : `${label} desconectada.`);
  };
  const handleToggleMaxdataConnected = () => toggleMaxdata(maxdataConfig, setMaxdataConfig, "maxdata", "Max Data — Notas fiscais");
  const handleToggleMaxdataEstoqueConnected = () => toggleMaxdata(maxdataEstoqueConfig, setMaxdataEstoqueConfig, "maxdata-estoque", "Max Data — Estoque");

  const [whatsappProviderStatus, setWhatsappProviderStatus] = useState<{ provider: "simulator" | "waha"; configured: boolean } | null>(null);

  // Load instances for WhatsApp
  useEffect(() => {
    fetchInstances();
    apiFetch("/api/whatsapp/provider-status").then((r) => r.json()).then(setWhatsappProviderStatus).catch(() => setWhatsappProviderStatus(null));
  }, []);

  const fetchInstances = () => {
    apiFetch("/api/whatsapp/instances")
      .then((res) => res.json())
      .then((data) => {
        setInstances(data);
        if (data.length > 0) setWhatsappWebhookUrl(data[0].webhookUrl || "");
      })
      .catch((err) => console.error("Error fetching instances:", err));
  };

  // Meta Ads actions
  const [selectedMetaTestEvent, setSelectedMetaTestEvent] = useState("Lead");
  const [isTestingMeta, setIsTestingMeta] = useState(false);

  const handleTestMetaPixel = async () => {
    if (!metaConfig.pixelId || !metaConfig.capiToken) {
      toast.error("Preencha o ID do Pixel e o Token de Acesso CAPI antes de testar.");
      return;
    }
    setIsTestingMeta(true);
    const started = Date.now();
    try {
      const res = await apiFetch("/api/integrations/meta-pixel-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pixelId: metaConfig.pixelId, accessToken: metaConfig.capiToken, event: selectedMetaTestEvent }),
      });
      const data = await res.json();
      const pingResult = {
        event: selectedMetaTestEvent,
        timestamp: new Date().toLocaleTimeString("pt-BR"),
        status: data.status ?? 0,
        latency: Date.now() - started,
        ok: !!data.ok,
      };
      setMetaConfig((prev: any) => ({ ...prev, lastTestPing: pingResult, pixelStatus: data.ok ? "active" : "pending" }));
      if (data.ok) toast.success(`Evento '${selectedMetaTestEvent}' aceito pela Graph API do Meta (HTTP ${data.status}).`);
      else toast.error(data.error || `Graph API recusou o evento (HTTP ${data.status ?? "?"}). Confira o Pixel ID e o token.`);
    } catch (err: any) {
      toast.error("Falha ao contatar o servidor para testar o Pixel.");
    } finally {
      setIsTestingMeta(false);
    }
  };

  const handleToggleMetaConnected = () => {
    setMetaConfig((prev: any) => {
      const next = !prev.connected;
      if (next && (!prev.pixelId || !prev.capiToken)) {
        toast.error("Preencha o Pixel ID e o Token CAPI e valide com o teste de ping antes de marcar como conectado.");
        return prev;
      }
      toast[next ? "success" : "info"](
        next ? "Meta Ads marcado como conectado." : "Meta Ads desconectado."
      );
      return { ...prev, connected: next };
    });
  };

  // Google Ads / GA4 actions
  const [isTestingGoogle, setIsTestingGoogle] = useState(false);
  const handleTestGoogleTag = async () => {
    if (!googleConfig.measurementId || !googleConfig.apiSecret) {
      toast.error("Preencha o Measurement ID (GA4) e o API Secret antes de testar.");
      return;
    }
    setIsTestingGoogle(true);
    const started = Date.now();
    try {
      const res = await apiFetch("/api/integrations/ga4-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ measurementId: googleConfig.measurementId, apiSecret: googleConfig.apiSecret, event: "generate_lead" }),
      });
      const data = await res.json();
      const pingResult = {
        event: "generate_lead",
        timestamp: new Date().toLocaleTimeString("pt-BR"),
        status: data.status ?? 0,
        latency: Date.now() - started,
        ok: !!data.ok,
      };
      setGoogleConfig((prev: any) => ({ ...prev, lastTestPing: pingResult, tagStatus: data.ok ? "active" : "pending" }));
      if (data.ok) toast.success("Payload validado pelo endpoint de depuração do GA4 (Measurement Protocol).");
      else toast.error(data.error || (data.validationMessages?.[0]?.description) || "GA4 rejeitou o payload de teste. Confira o Measurement ID e o API Secret.");
    } catch (err: any) {
      toast.error("Falha ao contatar o servidor para validar o GA4.");
    } finally {
      setIsTestingGoogle(false);
    }
  };

  const handleToggleGoogleConnected = () => {
    setGoogleConfig((prev: any) => {
      const next = !prev.connected;
      if (next && !prev.measurementId) {
        toast.error("Preencha ao menos o Measurement ID antes de marcar como conectado.");
        return prev;
      }
      toast[next ? "success" : "info"](
        next ? "Google Ads/Analytics marcado como conectado." : "Google Ads/Analytics desconectado."
      );
      return { ...prev, connected: next };
    });
  };

  const handleCreateInstance = () => {
    if (!newInstanceName.trim()) { toast.error("Dê um nome para a instância."); return; }
    setCreatingInstance(true);
    // A URL de webhook não é mais enviada daqui — o servidor gera e registra
    // automaticamente no WAHA ao criar a instância (ver POST /api/whatsapp/instances).
    apiFetch("/api/whatsapp/instances", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newInstanceName.trim() }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Erro ao criar instância.");
        toast.success("Instância criada.");
        setNewInstanceName("");
        fetchInstances();
      })
      .catch((err: any) => toast.error(err?.message || "Erro ao criar instância."))
      .finally(() => setCreatingInstance(false));
  };

  const handleConnectInstance = (id: string) => {
    setConnectingInstanceId(id);
    apiFetch(`/api/whatsapp/instances/${id}/connect`, { method: "POST" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || "Erro ao conectar instância.");
        toast.success(data.status === "CONNECTED" ? "Instância conectada!" : `Status: ${data.status}`);
        fetchInstances();
      })
      .catch((err: any) => toast.error(err?.message || "Erro ao conectar instância."))
      .finally(() => setConnectingInstanceId(null));
  };

  // Built-in list of catalog integrations
  const allIntegrations = useMemo(() => {
    const list = [
      {
        id: "meta-ads",
        name: "Meta Ads (Facebook & Instagram)",
        category: "anuncios" as IntegrationCategory,
        icon: Facebook,
        iconBg: "bg-blue-600/10 text-blue-500 border-blue-500/20",
        description:
          "Rastreamento avançado com Pixel Meta, Conversions API (CAPI) server-side, captura automática de Leads e sincronização de funis.",
        connected: metaConfig.connected,
        statusText: metaConfig.connected ? "Conectado" : "Não Conectado",
        statusVariant: (metaConfig.connected ? "success" : "neutral") as any,
        badgeText: metaConfig.connected ? (metaConfig.trackingActive ? "Pixel Ativo" : "Pausado") : "Disponível",
        highlightInfo: metaConfig.connected
          ? `Pixel: ${metaConfig.pixelId || "Não configurado"}`
          : "Requer Token ou Pixel ID",
        onConfigure: () => setSelectedConfigModal("meta-ads"),
        onToggle: handleToggleMetaConnected,
      },
      {
        id: "google-ads",
        name: "Google Ads & Analytics (G-Tag)",
        category: "anuncios" as IntegrationCategory,
        icon: Globe,
        iconBg: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
        description:
          "Rastreamento de conversões Google Ads (AW-XXXX), integração com Google Analytics 4 e Enhanced Conversions para páginas de captura.",
        connected: googleConfig.connected,
        statusText: googleConfig.connected ? "Conectado" : "Não Conectado",
        statusVariant: (googleConfig.connected ? "success" : "neutral") as any,
        badgeText: googleConfig.connected ? "Tag Ativa" : "Disponível",
        highlightInfo: googleConfig.connected
          ? `Tag: ${googleConfig.measurementId}`
          : "Requer ID de Medição",
        onConfigure: () => setSelectedConfigModal("google-ads"),
        onToggle: handleToggleGoogleConnected,
      },
      {
        id: "whatsapp",
        name: "WhatsApp Business",
        category: "mensageria" as IntegrationCategory,
        icon: MessageSquare,
        iconBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
        description:
          "Conexão com instâncias de WhatsApp para envio e recebimento de mensagens (WAHA quando configurado, ou simulador em ambiente de testes).",
        connected: instances.length > 0,
        statusText: instances.length > 0 ? "Instância Ativa" : "Aguardando",
        statusVariant: (instances.length > 0 ? "success" : "warning") as any,
        badgeText: instances.length > 0 ? `${instances.length} Instância(s)` : "Offline",
        highlightInfo: instances.length > 0
          ? `Linha: ${instances[0]?.phone || "Conectada"}`
          : "Nenhuma instância ativa",
        onConfigure: () => setSelectedConfigModal("whatsapp"),
        onToggle: () => setSelectedConfigModal("whatsapp"),
      },
      {
        id: "mercadopago",
        name: "Mercado Pago",
        category: "pagamentos" as IntegrationCategory,
        icon: Wallet,
        iconBg: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
        description:
          "Recebimento de pagamentos via PIX instantâneo, Cartão de Crédito e Boleto Bancário com baixa automática no fluxo financeiro do S.P.Y..",
        connected: paymentConfig.mercadoPago.connected,
        statusText: paymentConfig.mercadoPago.connected ? "Conectado" : "Não Conectado",
        statusVariant: (paymentConfig.mercadoPago.connected ? "success" : "neutral") as any,
        badgeText: paymentConfig.mercadoPago.connected ? paymentConfig.mercadoPago.environment.toUpperCase() : "Disponível",
        highlightInfo: paymentConfig.mercadoPago.connected
          ? `Ambiente: ${paymentConfig.mercadoPago.environment}`
          : "PIX & Cartão",
        onConfigure: () => setSelectedConfigModal("mercadopago"),
        onToggle: () => {
          setPaymentConfig((prev: any) => ({
            ...prev,
            mercadoPago: { ...prev.mercadoPago, connected: !prev.mercadoPago.connected },
          }));
          toast.success("Status do Mercado Pago atualizado.");
        },
      },
      {
        id: "stripe",
        name: "Stripe Gateway",
        category: "pagamentos" as IntegrationCategory,
        icon: CreditCard,
        iconBg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
        description:
          "Processamento global de pagamentos em moeda nacional e internacional, suporte a cobranças recorrentes, planos e faturas.",
        connected: paymentConfig.stripe.connected,
        statusText: paymentConfig.stripe.connected ? "Conectado" : "Não Conectado",
        statusVariant: (paymentConfig.stripe.connected ? "success" : "neutral") as any,
        badgeText: paymentConfig.stripe.connected ? paymentConfig.stripe.environment.toUpperCase() : "Disponível",
        highlightInfo: paymentConfig.stripe.connected
          ? `Status: Ativo (${paymentConfig.stripe.environment})`
          : "Checkout Global",
        onConfigure: () => setSelectedConfigModal("stripe"),
        onToggle: () => {
          setPaymentConfig((prev: any) => ({
            ...prev,
            stripe: { ...prev.stripe, connected: !prev.stripe.connected },
          }));
          toast.success("Status da Stripe atualizado.");
        },
      },
      {
        id: "asaas",
        name: "Asaas Cobranças",
        category: "pagamentos" as IntegrationCategory,
        icon: ShieldCheck,
        iconBg: "bg-purple-500/10 text-purple-400 border-purple-500/20",
        description:
          "Emissão automatizada de boletos registrados, cobranças PIX dinâmicas e gestão de faturamento integrada com CRM.",
        connected: paymentConfig.asaas.connected,
        statusText: paymentConfig.asaas.connected ? "Conectado" : "Não Conectado",
        statusVariant: (paymentConfig.asaas.connected ? "success" : "neutral") as any,
        badgeText: paymentConfig.asaas.connected ? "Ativo" : "Disponível",
        highlightInfo: paymentConfig.asaas.connected ? "Boletos & PIX Ativos" : "Gestão de Cobrança",
        onConfigure: () => setSelectedConfigModal("asaas"),
        onToggle: () => {
          setPaymentConfig((prev: any) => ({
            ...prev,
            asaas: { ...prev.asaas, connected: !prev.asaas.connected },
          }));
          toast.success("Status do Asaas atualizado.");
        },
      },
      {
        id: "maxdata",
        name: "Max Data — Notas fiscais",
        category: "dados" as IntegrationCategory,
        icon: Database,
        iconBg: "bg-violet-500/10 text-violet-400 border-violet-500/20",
        description:
          "API que recebe e valida as notas fiscais de entrada. A conexão fica pronta aqui (URL, chave e ID da base); o envio das notas ainda não está ligado — entra quando a API for mapeada.",
        connected: maxdataConfig.connected,
        statusText: maxdataConfig.connected ? "Conectado" : maxdataConfig.apiUrl ? "Credenciais Preenchidas" : "Não Conectado",
        statusVariant: (maxdataConfig.connected ? "success" : maxdataConfig.apiUrl ? "info" : "neutral") as any,
        badgeText: maxdataConfig.connected ? maxdataConfig.environment.toUpperCase() : "Disponível",
        highlightInfo: maxdataConfig.clientId ? `Base: ${maxdataConfig.clientId}` : "Requer URL, chave e ID da base",
        onConfigure: () => setSelectedConfigModal("maxdata"),
        onToggle: handleToggleMaxdataConnected,
      },
      {
        id: "maxdata-estoque",
        name: "Max Data — Estoque",
        category: "dados" as IntegrationCategory,
        icon: Database,
        iconBg: "bg-violet-500/10 text-violet-400 border-violet-500/20",
        description:
          "API de estoque: recebe a entrada dos produtos depois que a nota é validada. A conexão fica pronta aqui; a sincronização de estoque ainda não está ligada — entra quando a API for mapeada.",
        connected: maxdataEstoqueConfig.connected,
        statusText: maxdataEstoqueConfig.connected ? "Conectado" : maxdataEstoqueConfig.apiUrl ? "Credenciais Preenchidas" : "Não Conectado",
        statusVariant: (maxdataEstoqueConfig.connected ? "success" : maxdataEstoqueConfig.apiUrl ? "info" : "neutral") as any,
        badgeText: maxdataEstoqueConfig.connected ? maxdataEstoqueConfig.environment.toUpperCase() : "Disponível",
        highlightInfo: maxdataEstoqueConfig.clientId ? `Base: ${maxdataEstoqueConfig.clientId}` : "Requer URL, chave e ID da base",
        onConfigure: () => setSelectedConfigModal("maxdata-estoque"),
        onToggle: handleToggleMaxdataEstoqueConnected,
      },
      {
        id: "n8n",
        name: "n8n / Webhooks Globais",
        category: "automacoes" as IntegrationCategory,
        icon: Zap,
        iconBg: "bg-amber-500/10 text-amber-400 border-amber-500/20",
        description:
          "Endpoints HTTPS para orquestração com n8n ou qualquer automação externa. O disparo automático em eventos do CRM ainda não existe — hoje só o botão de teste manual envia uma requisição real.",
        connected: globalWebhooks.some((w: any) => w.active),
        statusText: globalWebhooks.length > 0 ? "Webhook(s) Cadastrado(s)" : "Nenhum Webhook",
        statusVariant: (globalWebhooks.length > 0 ? "info" : "neutral") as any,
        badgeText: globalWebhooks.length > 0 ? `${globalWebhooks.length} endpoint(s)` : "Disponível",
        highlightInfo: globalWebhooks.length > 0 ? "Disparo manual via teste" : "Nenhum endpoint cadastrado",
        onConfigure: () => navigate("/app/configuracoes/integracoes/webhooks"),
        onToggle: () => navigate("/app/configuracoes/integracoes/webhooks"),
      },
      {
        id: "smtp",
        name: "Servidores SMTP Transacional",
        category: "email" as IntegrationCategory,
        icon: Server,
        iconBg: "bg-rose-500/10 text-rose-400 border-rose-500/20",
        description:
          "Credenciais SMTP para validar conexão (AWS SES, G-Suite, SendGrid ou servidor dedicado). O envio real de propostas/contratos/notificações por e-mail ainda não usa essas credenciais — hoje elas só servem para o teste de conexão.",
        connected: Boolean(appSettings?.integracoes_smtp?.smtpServer && appSettings?.integracoes_smtp?.smtpUser),
        statusText: appSettings?.integracoes_smtp?.smtpServer ? "Credenciais Preenchidas" : "Não Configurado",
        statusVariant: (appSettings?.integracoes_smtp?.smtpServer ? "info" : "neutral") as any,
        badgeText: appSettings?.integracoes_smtp?.smtpServer ? "Aguarda Teste" : "Disponível",
        highlightInfo: appSettings?.integracoes_smtp?.smtpServer || "Nenhum servidor configurado",
        onConfigure: () => navigate("/app/configuracoes/integracoes/smtp"),
        onToggle: () => navigate("/app/configuracoes/integracoes/smtp"),
      },
    ];

    // Add custom integrations created by user
    const customList = customIntegrations.map((ci: any) => ({
      id: ci.id,
      name: ci.nome,
      category: "automacoes" as IntegrationCategory,
      icon: Zap,
      iconBg: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
      description: ci.descricao || "Integração customizada configurada pelo usuário.",
      connected: ci.ativo,
      statusText: ci.ativo ? "Conectado" : "Desativado",
      statusVariant: (ci.ativo ? "success" : "neutral") as any,
      badgeText: ci.tipo || "API REST",
      highlightInfo: ci.apiUrl ? `Endpoint: ${ci.apiUrl}` : "Configuração personalizada",
      onConfigure: () => setSelectedConfigModal(`custom-${ci.id}`),
      onToggle: () => {
        setCustomIntegrations((prev: any[]) =>
          prev.map((item) => (item.id === ci.id ? { ...item, ativo: !item.ativo } : item))
        );
        toast.success(`Integração '${ci.nome}' alterada.`);
      },
    }));

    const catalogList = INTEGRATION_CATALOG.map((def) => {
      const cfg = catalogConfig[def.id];
      const style = CATALOG_CATEGORY_STYLE[def.category];
      const missing = catalogMissingRequired(def, cfg);
      const hasAny = catalogHasAnyValue(def, cfg);
      const ready = !!cfg?.connected;
      return {
        id: `cat-${def.id}`,
        name: def.name,
        category: def.category as IntegrationCategory,
        icon: style.icon,
        iconBg: style.iconBg,
        description: def.description,
        connected: ready,
        credentialOnly: !def.live,
        statusText: ready ? (def.live ? "Conectada" : "Credenciais prontas") : hasAny ? "Incompleta" : "Não configurada",
        statusVariant: (ready ? "success" : hasAny ? "info" : "neutral") as any,
        badgeText: def.live ? "Sincroniza" : "Só credenciais",
        highlightInfo: def.live && cfg?.lastImportAt ? `Importado em ${new Date(cfg.lastImportAt).toLocaleDateString("pt-BR")}` : ready ? "Credenciais salvas" : missing.length > 0 ? `Falta: ${missing[0]}${missing.length > 1 ? ` +${missing.length - 1}` : ""}` : "Pronta para marcar",
        configureLabel: def.live ? "Conectar / Sincronizar" : "Configurar",
        toggleOnLabel: "Marcar pronta",
        toggleOffLabel: "Desmarcar",
        onConfigure: () => setSelectedConfigModal(`cat-${def.id}`),
        onToggle: () => toggleCatalogReady(def),
      };
    });

    return [...list, ...customList, ...catalogList] as any[];
  }, [metaConfig, googleConfig, instances, paymentConfig, maxdataConfig, maxdataEstoqueConfig, customIntegrations, globalWebhooks, appSettings, catalogConfig]);

  // Filtered integrations based on Category and Search Query
  const filteredIntegrations = useMemo(() => {
    return allIntegrations.filter((item) => {
      if (activeCategory !== "todas" && item.category !== activeCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allIntegrations, activeCategory, searchQuery]);

  const realIntegrations = allIntegrations.filter((i) => !i.credentialOnly);
  const connectedReal = realIntegrations.filter((i) => i.connected).length;
  const catalogTotal = allIntegrations.length - realIntegrations.length;
  const catalogReady = allIntegrations.filter((i) => i.credentialOnly && i.connected).length;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--color-text-primary)] flex items-center gap-2.5">
            Central de Integrações
            <span className="w-2 h-2 rounded-full bg-[var(--color-primary-blue)] animate-pulse hidden sm:inline-block"></span>
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Conecte canais de anúncios, mensageria, gateways de pagamento, APIs e webhooks para potencializar o S.P.Y..
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Button
            onClick={() => setIsNovaIntegracaoModalOpen(true)}
            className="font-bold gap-2 text-xs h-10 shadow-sm"
          >
            <Plus className="w-4 h-4" /> Nova Integração Personalizada
          </Button>
        </div>
      </div>

      {/* Resumo: integrações REAIS conectadas x catálogo de credenciais */}
      <div className="rounded-[var(--radius-panel)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] p-4 space-y-3">
        <div>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="font-semibold text-[var(--color-text-primary)]">Integrações conectadas</span>
            <span className="tabular-nums font-bold text-[var(--color-text-primary)]">{connectedReal} de {realIntegrations.length}</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-[var(--color-surface-sunken)] overflow-hidden">
            <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${realIntegrations.length === 0 ? 0 : Math.round((connectedReal / realIntegrations.length) * 100)}%` }} />
          </div>
        </div>
        <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
          Catálogo com <strong>{catalogTotal} serviços</strong> ({catalogReady} com credenciais prontas). Os marcados como
          <span className="mx-1 px-1.5 py-0.5 rounded bg-[var(--color-surface-sunken)] border border-[var(--color-border-subtle)] text-[10px] font-bold uppercase text-[var(--color-text-faint)]">Só credenciais</span>
          guardam o cadastro com segurança, mas <strong>ainda não sincronizam dados</strong> — cada conexão é ligada de verdade integração por integração.
        </p>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--color-surface-elevated)] p-2 rounded-[var(--radius-panel)] border border-[var(--color-border-default)] shadow-[var(--shadow-control)]">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {[
            { id: "todas", label: "Todas" },
            { id: "anuncios", label: "Tráfego & Anúncios" },
            { id: "mensageria", label: "Mensageria & WhatsApp" },
            { id: "pagamentos", label: "Pagamentos & Checkout" },
            { id: "automacoes", label: "Automações & Webhooks" },
            { id: "email", label: "E-mail & SMTP" },
            { id: "dados", label: "Dados & Bases" },
            { id: "crm", label: "CRM & Marketing" },
            { id: "erp", label: "ERP & Fiscal" },
            { id: "ecommerce", label: "E-commerce" },
            { id: "produtividade", label: "Produtividade" },
            { id: "logistica", label: "Logística" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveCategory(tab.id as IntegrationCategory)}
              className={`px-3 py-1.5 rounded-[var(--radius-control)] text-xs font-bold transition-all shrink-0 cursor-pointer ${
                activeCategory === tab.id
                  ? "bg-[var(--color-primary-blue)] !text-white shadow-sm"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-sunken)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-faint)]" />
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar integração..."
            className="pl-9 h-8 text-xs"
          />
        </div>
      </div>

      {/* Integrations Grid */}
      {filteredIntegrations.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="Nenhuma integração encontrada"
          description="Nenhuma ferramenta corresponde aos critérios de pesquisa ou categoria selecionada."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setActiveCategory("todas");
                setSearchQuery("");
              }}
            >
              Limpar Filtros
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredIntegrations.map((item) => {
            const IconComp = item.icon;
            return (
              <Card
                key={item.id}
                className={`p-5 flex flex-col justify-between transition-all duration-200 hover:border-[var(--color-primary-blue)]/40 hover:shadow-md ${
                  item.connected ? "border-[var(--color-border-default)]" : "border-[var(--color-border-subtle)] opacity-90"
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3.5">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center border shrink-0 ${item.iconBg}`}
                    >
                      <IconComp className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge variant={item.statusVariant} dot dotPulse={item.connected}>
                        {item.statusText}
                      </Badge>
                      <span className="text-[10px] font-bold text-[var(--color-text-faint)] uppercase tracking-wider">
                        {item.badgeText}
                      </span>
                    </div>
                  </div>

                  <h3 className="font-bold text-[var(--color-text-primary)] text-base tracking-tight mb-1.5 flex items-center gap-1.5">
                    {item.name}
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)] line-clamp-3 leading-relaxed mb-4">
                    {item.description}
                  </p>
                </div>

                <div className="pt-3.5 border-t border-[var(--color-border-subtle)] flex flex-col gap-2.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-[var(--color-text-faint)] font-medium">Status</span>
                    <span className="font-mono text-xs font-semibold text-[var(--color-text-primary)] truncate max-w-[170px]">
                      {item.highlightInfo}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant={item.connected ? "default" : "outline"}
                      size="sm"
                      onClick={item.onConfigure}
                      className="flex-1 text-xs font-bold gap-1.5"
                    >
                      <Settings className="w-3.5 h-3.5" />
                      {(item as any).configureLabel || "Configurar & Testar"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={item.onToggle}
                      className={`text-xs px-2.5 ${
                        item.connected
                          ? "text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
                          : "text-[var(--color-primary-blue)] hover:bg-[var(--color-primary-blue)]/10"
                      }`}
                    >
                      {item.connected ? (item as any).toggleOffLabel || "Desconectar" : (item as any).toggleOnLabel || "Conectar"}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL DEDICADO: META ADS, PIXEL & CONVERSIONS API (CAPI) */}
      {/* ========================================================================= */}
      {selectedConfigModal === "meta-ads" && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedConfigModal(null)}
          maxWidth="max-w-2xl"
          title={
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/10 border border-blue-500/20 flex items-center justify-center">
                <Facebook className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--color-text-primary)]">
                  Configuração Meta Ads & Pixel / CAPI
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Gerenciamento de Pixel, rastreamento de eventos e API de Conversões
                </p>
              </div>
            </div>
          }
          footer={
            <div className="flex justify-between items-center w-full">
              <div className="flex items-center gap-2">
                <Badge
                  variant={metaConfig.connected ? "success" : "neutral"}
                  dot
                  dotPulse={metaConfig.connected}
                >
                  {metaConfig.connected ? "Conta Conectada" : "Desconectada"}
                </Badge>
                {metaConfig.lastTestPing && (
                  <span className="text-[11px] text-[var(--color-text-muted)] font-mono">
                    Último Ping: {metaConfig.lastTestPing.timestamp} ({metaConfig.lastTestPing.latency}ms)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setSelectedConfigModal(null)}
                >
                  Fechar
                </Button>
                <Button
                  onClick={() => {
                    toast.success("Configurações do Meta Ads e Pixel salvas!");
                    setSelectedConfigModal(null);
                  }}
                >
                  Salvar Alterações
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-6">
            <Alert
              variant={metaConfig.connected ? "success" : "info"}
              title="Status do Rastreamento Meta"
            >
              {metaConfig.connected
                ? "Sua conta comercial Meta está conectada. O Pixel e a Conversions API (CAPI) estão sincronizados para rastrear conversões em formulários, landing pages e estágios do CRM."
                : "Conecte sua conta para começar a rastrear visitantes, atribuir origem de leads com precisão e alimentar os algoritmos de tráfego do Facebook e Instagram."}
            </Alert>

            <Tabs defaultValue="pixel" className="w-full">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="pixel">Pixel & CAPI</TabsTrigger>
                <TabsTrigger value="eventos">Eventos & Tracking</TabsTrigger>
                <TabsTrigger value="teste">Teste de Ping ao Vivo</TabsTrigger>
              </TabsList>

              {/* TAB 1: Pixel & CAPI Settings */}
              <TabsContent value="pixel" className="space-y-4 pt-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField label="ID do Pixel Meta" required hint="Encontrado no Gerenciador de Eventos da Meta">
                    <Input
                      type="text"
                      value={metaConfig.pixelId}
                      onChange={(e) =>
                        setMetaConfig((prev: any) => ({ ...prev, pixelId: e.target.value }))
                      }
                      placeholder="Ex: 10293847568291"
                    />
                  </FormField>

                  <FormField label="Dataset / Conjunto de Dados ID" hint="Identificador de dataset da Meta">
                    <Input
                      type="text"
                      value={metaConfig.datasetId}
                      onChange={(e) =>
                        setMetaConfig((prev: any) => ({ ...prev, datasetId: e.target.value }))
                      }
                      placeholder="Ex: ds_984729104"
                    />
                  </FormField>
                </div>

                <FormField
                  label="Token de Acesso Conversions API (CAPI)"
                  hint="Token gerado na aba Configurações do Gerenciador de Eventos"
                >
                  <Input
                    type="password"
                    value={metaConfig.capiToken}
                    onChange={(e) =>
                      setMetaConfig((prev: any) => ({ ...prev, capiToken: e.target.value }))
                    }
                    placeholder="EAAQZBz..."
                  />
                </FormField>

                <div className="p-4 rounded-[var(--radius-panel)] border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]/60 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-bold text-[var(--color-text-primary)] block">
                      Rastreamento Automático Ativo
                    </span>
                    <span className="text-[11px] text-[var(--color-text-muted)] block">
                      Injetar script do Pixel e disparar eventos CAPI em todas as páginas de captura
                    </span>
                  </div>
                  <Switch
                    checked={metaConfig.trackingActive}
                    onCheckedChange={(checked) =>
                      setMetaConfig((prev: any) => ({ ...prev, trackingActive: checked }))
                    }
                  />
                </div>
              </TabsContent>

              {/* TAB 2: Event Mapping & Toggles */}
              <TabsContent value="eventos" className="space-y-4 pt-3">
                <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                  Selecione quais eventos padrão da Meta serão disparados automaticamente quando o usuário realizar ações no sistema:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { key: "PageView", label: "PageView", desc: "Abertura de Landing Pages & Formulários" },
                    { key: "Lead", label: "Lead", desc: "Formulário enviado ou lead cadastrado no CRM" },
                    { key: "Schedule", label: "Schedule", desc: "Reunião de qualificação agendada no SDR" },
                    { key: "Purchase", label: "Purchase", desc: "Negócio marcado como 'Ganho' no Pipeline" },
                    { key: "ViewContent", label: "ViewContent", desc: "Visualização do catálogo de produtos" },
                    { key: "Contact", label: "Contact", desc: "Clique para iniciar conversa no WhatsApp" },
                  ].map((evt) => (
                    <div
                      key={evt.key}
                      className="p-3.5 rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] flex items-center justify-between"
                    >
                      <div className="space-y-0.5 pr-2">
                        <span className="text-xs font-black text-[var(--color-text-primary)] block font-mono">
                          {evt.label}
                        </span>
                        <span className="text-[10px] text-[var(--color-text-muted)] block leading-tight">
                          {evt.desc}
                        </span>
                      </div>
                      <Switch
                        size="sm"
                        checked={metaConfig.trackedEvents?.[evt.key] ?? true}
                        onCheckedChange={(checked) =>
                          setMetaConfig((prev: any) => ({
                            ...prev,
                            trackedEvents: { ...prev.trackedEvents, [evt.key]: checked },
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* TAB 3: Live Test Ping Tool */}
              <TabsContent value="teste" className="space-y-4 pt-3">
                <div className="p-4 rounded-[var(--radius-panel)] border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]/50 space-y-4">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-primary-blue)] mb-1">
                      Disparador de Evento de Teste (Pixel & CAPI)
                    </h4>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      Envia um evento de teste de verdade para a Conversions API da Meta (chamada HTTP real) para confirmar que o Pixel ID e o token estão corretos. Não há hoje disparo automático nos eventos do CRM (novo lead, negócio ganho) — só este teste manual.
                    </p>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-3">
                    <select
                      value={selectedMetaTestEvent}
                      onChange={(e) => setSelectedMetaTestEvent(e.target.value)}
                      className="w-full sm:w-48 bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs font-bold text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-blue)]"
                    >
                      <option value="Lead">Evento: Lead</option>
                      <option value="PageView">Evento: PageView</option>
                      <option value="Schedule">Evento: Schedule</option>
                      <option value="Purchase">Evento: Purchase</option>
                      <option value="Contact">Evento: Contact</option>
                    </select>

                    <Button
                      onClick={handleTestMetaPixel}
                      loading={isTestingMeta}
                      className="w-full sm:w-auto font-bold text-xs gap-2"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" /> Disparar Teste de Rastreamento
                    </Button>
                  </div>

                  {metaConfig.lastTestPing && (
                    <div className={`p-3.5 rounded-[var(--radius-control)] border space-y-2 text-xs ${metaConfig.lastTestPing.ok ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
                      <div className={`flex items-center justify-between font-bold ${metaConfig.lastTestPing.ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        <span className="flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4" /> {metaConfig.lastTestPing.ok ? `HTTP ${metaConfig.lastTestPing.status} — Evento aceito pela Graph API` : `HTTP ${metaConfig.lastTestPing.status || "?"} — Graph API recusou o evento`}
                        </span>
                        <span className="font-mono text-[10px]">
                          {metaConfig.lastTestPing.timestamp} • {metaConfig.lastTestPing.latency}ms
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--color-text-muted)]">
                        Evento '{metaConfig.lastTestPing.event}' enviado de verdade ao endpoint /events da Graph API com o Pixel ID e token informados acima — esta é a resposta real da Meta, não uma simulação.
                      </p>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL DEDICADO: GOOGLE ADS & ANALYTICS */}
      {/* ========================================================================= */}
      {selectedConfigModal?.startsWith("cat-") && (() => {
        const def = INTEGRATION_CATALOG.find((c) => `cat-${c.id}` === selectedConfigModal);
        return def ? (
          <CatalogIntegrationModal
            def={def}
            values={catalogConfig[def.id] || {}}
            onChange={(patch) => updateCatalog(def.id, patch)}
            onClose={() => setSelectedConfigModal(null)}
            onToggleReady={() => toggleCatalogReady(def)}
            tenantId={activeTenantId}
          />
        ) : null;
      })()}

      {selectedConfigModal === "maxdata" && (
        <MaxDataConnectionModal
          title="Max Data — Notas fiscais"
          subtitle="API que recebe e valida as notas fiscais de entrada"
          which="notas"
          tenantId={activeTenantId}
          config={maxdataConfig}
          setConfig={setMaxdataConfig}
          onClose={() => setSelectedConfigModal(null)}
          onToggleConnected={handleToggleMaxdataConnected}
        />
      )}

      {selectedConfigModal === "maxdata-estoque" && (
        <MaxDataConnectionModal
          title="Max Data — Estoque"
          subtitle="API de estoque: recebe a entrada dos produtos"
          which="estoque"
          tenantId={activeTenantId}
          config={maxdataEstoqueConfig}
          setConfig={setMaxdataEstoqueConfig}
          onClose={() => setSelectedConfigModal(null)}
          onToggleConnected={handleToggleMaxdataEstoqueConnected}
        />
      )}

      {selectedConfigModal === "google-ads" && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedConfigModal(null)}
          maxWidth="max-w-xl"
          title={
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <Globe className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--color-text-primary)]">
                  Configuração Google Ads & G-Tag
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Acompanhamento de conversões e Google Analytics 4
                </p>
              </div>
            </div>
          }
          footer={
            <div className="flex justify-end gap-2 w-full">
              <Button variant="outline" onClick={() => setSelectedConfigModal(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => {
                  toast.success("Configuração do Google Ads/Analytics salva.");
                  setSelectedConfigModal(null);
                }}
              >
                Fechar
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
              Os campos abaixo já são salvos automaticamente conforme você digita. O teste de validação usa o
              endpoint de depuração do Measurement Protocol do GA4 (requer Measurement ID + API Secret) — a
              validação de conversão do Google Ads em si (via OAuth/Google Ads API) não está implementada.
            </p>
            <FormField label="ID de Medição GA4" required hint="Ex: G-XXXXXXXXXX (Admin > Fluxos de dados)">
              <Input
                type="text"
                value={googleConfig.measurementId}
                onChange={(e) =>
                  setGoogleConfig((prev: any) => ({ ...prev, measurementId: e.target.value }))
                }
                placeholder="G-XXXXXXXXXX"
              />
            </FormField>

            <FormField label="API Secret (Measurement Protocol)" hint="Gerado em Admin > Fluxos de dados > Measurement Protocol API secrets">
              <Input
                type="password"
                value={googleConfig.apiSecret}
                onChange={(e) =>
                  setGoogleConfig((prev: any) => ({ ...prev, apiSecret: e.target.value }))
                }
                placeholder="••••••••••••"
              />
            </FormField>

            <FormField label="Rótulo de Conversão Google Ads (opcional)" hint="Ex: AW-1029482910/XyZ_Lead — apenas armazenado, ainda não usado em nenhuma chamada real">
              <Input
                type="text"
                value={googleConfig.conversionLabel}
                onChange={(e) =>
                  setGoogleConfig((prev: any) => ({ ...prev, conversionLabel: e.target.value }))
                }
                placeholder="AW-1029482910/XyZ_Lead"
              />
            </FormField>

            <div className="p-3.5 rounded-[var(--radius-panel)] border border-[var(--color-border-default)] bg-[var(--color-surface-sunken)]/60 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-[var(--color-text-primary)] block">
                  Enhanced Conversions (Conversões Aprimoradas)
                </span>
                <span className="text-[11px] text-[var(--color-text-muted)] block">
                  Enviar dados criptografados (SHA256) de e-mail e telefone para maximizar correspondência
                </span>
              </div>
              <Switch
                checked={googleConfig.enhancedConversions}
                onCheckedChange={(checked) =>
                  setGoogleConfig((prev: any) => ({ ...prev, enhancedConversions: checked }))
                }
              />
            </div>

            <div className="pt-2 space-y-3">
              <Button
                variant="outline"
                onClick={handleTestGoogleTag}
                loading={isTestingGoogle}
                className="w-full text-xs font-bold gap-2"
              >
                <Activity className="w-3.5 h-3.5 text-emerald-500" /> Validar via GA4 Measurement Protocol
              </Button>
              {googleConfig.lastTestPing && (
                <div className={`p-3 rounded-[var(--radius-control)] border text-xs ${googleConfig.lastTestPing.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                  {googleConfig.lastTestPing.ok
                    ? `HTTP ${googleConfig.lastTestPing.status} — payload aceito pelo GA4 (${googleConfig.lastTestPing.timestamp})`
                    : `HTTP ${googleConfig.lastTestPing.status || "?"} — GA4 rejeitou o payload (${googleConfig.lastTestPing.timestamp})`}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL DEDICADO: WHATSAPP (WAHA OU SIMULADOR) */}
      {/* ========================================================================= */}
      {selectedConfigModal === "whatsapp" && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedConfigModal(null)}
          maxWidth="max-w-2xl"
          title={
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--color-text-primary)]">
                  Mensageria WhatsApp
                </h3>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {whatsappProviderStatus?.provider === "waha"
                    ? "Conectado ao WAHA — mensagens reais."
                    : "Modo Simulador — nenhuma conexão real com WhatsApp ainda. Configure WAHA_API_URL (e WAHA_API_KEY, se seu servidor exigir) para produção."}
                </p>
              </div>
            </div>
          }
          footer={
            <div className="flex justify-end gap-2 w-full">
              <Button variant="outline" onClick={() => setSelectedConfigModal(null)}>
                Fechar
              </Button>
            </div>
          }
        >
          <div className="space-y-5">
            {/* Instance details */}
            <div className="p-4 rounded-[var(--radius-panel)] border border-[var(--color-border-default)] bg-[var(--color-surface-elevated)] space-y-3">
              <div className="flex items-center justify-between">
                <Badge variant={instances.some((i) => i.status === "CONNECTED") ? "success" : "warning"} dot dotPulse>
                  {instances.some((i) => i.status === "CONNECTED") ? "Instância Conectada" : instances.length > 0 ? "Instância Desconectada" : "Sem Instância"}
                </Badge>
              </div>

              {instances.map((inst) => (
                <div key={inst.id} className="grid grid-cols-1 gap-2 text-xs font-mono border-b border-[var(--color-border-subtle)] pb-2 last:border-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                    <div className="text-[var(--color-text-muted)]">
                      {inst.name} — 📞 <span className="font-bold text-[var(--color-text-primary)]">{inst.phone || "sem número"}</span>
                    </div>
                    <div className="text-[var(--color-text-muted)] flex items-center justify-between">
                      🌐 Status: <span className={inst.status === "CONNECTED" ? "text-emerald-500 font-bold" : "text-amber-500 font-bold"}>{inst.status}</span>
                      {inst.status !== "CONNECTED" && (
                        <Button size="sm" onClick={() => handleConnectInstance(inst.id)} loading={connectingInstanceId === inst.id} className="h-7 text-[10px] px-2.5">
                          Conectar
                        </Button>
                      )}
                    </div>
                  </div>
                  {inst.webhookUrl && (
                    <div className="text-[10px] text-[var(--color-text-faint)] truncate" title={inst.webhookUrl}>
                      🔗 Webhook (gerado automaticamente): {inst.webhookUrl}
                    </div>
                  )}
                </div>
              ))}

              <div className="flex gap-2 pt-2 border-t border-[var(--color-border-subtle)]">
                <Input
                  type="text"
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value)}
                  placeholder="Nome da nova instância (ex: Comercial)"
                  className="font-mono text-xs"
                />
                <Button onClick={handleCreateInstance} loading={creatingInstance} className="shrink-0">
                  + Instância
                </Button>
              </div>
              <p className="text-[10px] text-[var(--color-text-faint)]">
                A URL de webhook é gerada e registrada automaticamente no WAHA ao criar a instância — nada pra configurar manualmente.
              </p>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAIS DE PAGAMENTO: MERCADO PAGO, STRIPE, ASAAS */}
      {/* ========================================================================= */}
      {(selectedConfigModal === "mercadopago" ||
        selectedConfigModal === "stripe" ||
        selectedConfigModal === "asaas") && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedConfigModal(null)}
          maxWidth="max-w-lg"
          title={`Configuração ${
            selectedConfigModal === "mercadopago"
              ? "Mercado Pago"
              : selectedConfigModal === "stripe"
              ? "Stripe"
              : "Asaas"
          }`}
          footer={
            <div className="flex justify-end gap-2 w-full">
              <Button variant="outline" onClick={() => setSelectedConfigModal(null)}>
                Cancelar
              </Button>
              <Button onClick={handleSavePaymentCredentials}>
                Salvar Credenciais
              </Button>
            </div>
          }
        >
          <div className="space-y-4">
            <p className="text-[11px] text-[var(--color-text-muted)] leading-relaxed">
              Nenhuma cobrança é processada por este painel ainda — estas credenciais só são usadas para o teste de
              conexão abaixo (uma chamada real à API do gateway para confirmar que a chave é válida).
            </p>
            <FormField label="Ambiente de Operação">
              <select
                value={paymentDraft.environment}
                onChange={(e) => setPaymentDraft((prev) => ({ ...prev, environment: e.target.value as "sandbox" | "production" }))}
                className="w-full bg-[var(--color-surface-elevated)] border border-[var(--color-border-default)] rounded-[var(--radius-control)] px-3 py-2 text-xs font-bold text-[var(--color-text-primary)]"
              >
                <option value="sandbox">Sandbox (Ambiente de Testes)</option>
                <option value="production">Produção (Live Real)</option>
              </select>
            </FormField>

            {selectedConfigModal !== "asaas" && (
              <FormField label="Chave Pública (Public Key)" required>
                <Input
                  type="text"
                  placeholder="Ex: APP_USR-xxxx / pk_test_xxxx"
                  value={paymentDraft.publicKey}
                  onChange={(e) => setPaymentDraft((prev) => ({ ...prev, publicKey: e.target.value }))}
                />
              </FormField>
            )}

            <FormField label={selectedConfigModal === "asaas" ? "API Key" : "Chave Secreta / Access Token"} required>
              <Input
                type="password"
                placeholder="Ex: APP_USR-xxxx / sk_test_xxxx"
                value={paymentDraft.secretKey}
                onChange={(e) => setPaymentDraft((prev) => ({ ...prev, secretKey: e.target.value }))}
              />
            </FormField>

            <Button
              variant="outline"
              size="sm"
              onClick={handleTestPaymentGateway}
              loading={testingPayment}
              className="w-full text-xs font-bold gap-2 mt-2"
            >
              <Activity className="w-3.5 h-3.5 text-cyan-500" /> Testar Comunicação com o Gateway
            </Button>

            {paymentTestResult && (
              <div className={`p-3 rounded-[var(--radius-control)] border text-xs ${paymentTestResult.ok ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"}`}>
                {paymentTestResult.detail}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL: NOVA INTEGRAÇÃO CUSTOMIZADA */}
      {/* ========================================================================= */}
      <NovaIntegracaoModal
        isOpen={isNovaIntegracaoModalOpen}
        onClose={() => setIsNovaIntegracaoModalOpen(false)}
        onSave={(data) => {
          setCustomIntegrations((prev: any[]) => [
            ...prev,
            { id: Date.now().toString(), ...data },
          ]);
          toast.success(`Integração '${data.nome}' criada com sucesso!`);
          setIsNovaIntegracaoModalOpen(false);
        }}
      />
    </div>
  );
}
