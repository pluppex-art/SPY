/**
 * Definição ÚNICA das integrações que ficam em app_settings (Configurações >
 * Integrações) — usada pela própria página, pelo painel "configurar de fora" da
 * Implementação e pelo servidor. Antes cada tela tinha seus defaults; com um
 * gravador remoto isso vira risco: gravar uma config PARCIAL faz a tela do
 * cliente quebrar ao ler `metaConfig.trackedEvents.PageView` de um objeto que
 * não tem `trackedEvents`. Por isso todo gravador parte destes defaults.
 *
 * SEGREDOS (kind "secret"): nunca saem do servidor. `maskedView` devolve só
 * "definido / não definido"; e ao regravar, segredo vazio MANTÉM o existente.
 */

export type IntegrationId = "maxdata" | "maxdata_estoque" | "meta" | "google" | "mercadopago" | "stripe" | "asaas";
export type IntegrationFieldKind = "text" | "secret" | "url" | "select";

export interface IntegrationField {
  prop: string;
  label: string;
  kind: IntegrationFieldKind;
  options?: string[];
  help?: string;
  placeholder?: string;
  required?: boolean;
  /** Só dígitos (ids numéricos de outro sistema). */
  numeric?: boolean;
}

export interface IntegrationDef {
  id: IntegrationId;
  label: string;
  settingsKey: string;
  /** Sub-chave dentro do setting (pagamentos guardam os 3 gateways num só registro). */
  nested?: "mercadoPago" | "stripe" | "asaas";
  fields: IntegrationField[];
}

export const DEFAULT_META_CONFIG = {
  connected: false,
  accountName: "",
  accountId: "",
  pixelId: "",
  pixelStatus: "disconnected" as "active" | "pending" | "disconnected",
  capiToken: "",
  datasetId: "",
  trackingActive: false,
  trackedEvents: {
    PageView: true, Lead: true, Schedule: true, Purchase: true, ViewContent: true, Contact: true, CompleteRegistration: true,
  },
  lastTestPing: null as { event: string; timestamp: string; status: number; latency: number; ok: boolean } | null,
};

export const DEFAULT_GOOGLE_CONFIG = {
  connected: false,
  accountName: "",
  customerId: "",
  measurementId: "",
  apiSecret: "",
  conversionLabel: "",
  enhancedConversions: false,
  tagStatus: "disconnected" as "active" | "pending" | "disconnected",
  lastTestPing: null as { event: string; timestamp: string; status: number; latency: number; ok: boolean } | null,
};

export const DEFAULT_PAYMENT_CONFIG = {
  mercadoPago: { connected: false, environment: "sandbox" as "sandbox" | "production", publicKey: "", accessToken: "", webhookUrl: "" },
  stripe: { connected: false, environment: "sandbox" as "sandbox" | "production", publishableKey: "", secretKey: "", webhookSecret: "" },
  asaas: { connected: false, environment: "sandbox" as "sandbox" | "production", apiKey: "", webhookToken: "" },
};

/** Max Data — base de dados de clientes. Conexão pronta (URL/chave/ID); o comportamento de importação/enriquecimento entra quando a API estiver definida. */
export const DEFAULT_MAXDATA_CONFIG = {
  connected: false,
  apiUrl: "",
  /** application_key (segredo). */
  apiKey: "",
  /** application_name. */
  clientId: "",
  applicationDescription: "",
  terminal: "",
  empId: "",
  idUser: "0",
  environment: "production" as "sandbox" | "production",
  notes: "",
};

const ENV = ["sandbox", "production"];

/** Login da MaxAPI: POST /auth com application_name/key/description nos headers e {terminal, empId, idUser} no corpo. */
const MAXDATA_FIELDS: IntegrationField[] = [
  { prop: "apiUrl", label: "URL base da API", kind: "url", required: true, placeholder: "https://…", help: "Endereço da MaxAPI deste cliente (a documentação não traz — pedir à Max Data)." },
  { prop: "clientId", label: "Nome da aplicação (application_name)", kind: "text", required: true },
  { prop: "apiKey", label: "Chave da aplicação (application_key)", kind: "secret", required: true },
  { prop: "applicationDescription", label: "Descrição da aplicação (application_description)", kind: "text", required: true, placeholder: "EMPRESA_SPYCRM" },
  { prop: "terminal", label: "Terminal", kind: "text", required: true, help: "Identificador do terminal usado no login (ex.: PDV01)." },
  { prop: "empId", label: "ID da empresa no Max (empId)", kind: "text", required: true, numeric: true },
  { prop: "idUser", label: "ID do usuário no Max (idUser)", kind: "text", numeric: true, help: "Deixe 0 se não houver." },
  { prop: "environment", label: "Ambiente", kind: "select", options: ENV },
];

export const INTEGRATION_DEFS: IntegrationDef[] = [
  {
    id: "maxdata", label: "Max Data — Notas fiscais", settingsKey: "integracoes_maxdata",
    fields: MAXDATA_FIELDS,
  },
  {
    id: "maxdata_estoque", label: "Max Data — Estoque", settingsKey: "integracoes_maxdata_estoque",
    fields: MAXDATA_FIELDS,
  },
  {
    id: "meta", label: "Meta Ads", settingsKey: "integracoes_meta_ads",
    fields: [
      { prop: "accountName", label: "Nome da conta", kind: "text" },
      { prop: "accountId", label: "ID da conta de anúncios", kind: "text" },
      { prop: "pixelId", label: "ID do Pixel", kind: "text", required: true },
      { prop: "capiToken", label: "Token de acesso CAPI", kind: "secret", required: true },
      { prop: "datasetId", label: "Dataset ID", kind: "text" },
    ],
  },
  {
    id: "google", label: "Google Ads / GA4", settingsKey: "integracoes_google_ads",
    fields: [
      { prop: "accountName", label: "Nome da conta", kind: "text" },
      { prop: "customerId", label: "ID da conta Google Ads", kind: "text" },
      { prop: "measurementId", label: "ID de medição GA4", kind: "text", required: true, placeholder: "G-XXXXXXXXXX" },
      { prop: "apiSecret", label: "API Secret (Measurement Protocol)", kind: "secret", required: true },
      { prop: "conversionLabel", label: "Rótulo de conversão", kind: "text" },
    ],
  },
  {
    id: "mercadopago", label: "Mercado Pago", settingsKey: "integracoes_payments", nested: "mercadoPago",
    fields: [
      { prop: "environment", label: "Ambiente", kind: "select", options: ENV },
      { prop: "publicKey", label: "Chave pública", kind: "text" },
      { prop: "accessToken", label: "Access Token", kind: "secret", required: true },
    ],
  },
  {
    id: "stripe", label: "Stripe", settingsKey: "integracoes_payments", nested: "stripe",
    fields: [
      { prop: "environment", label: "Ambiente", kind: "select", options: ENV },
      { prop: "publishableKey", label: "Chave publicável", kind: "text" },
      { prop: "secretKey", label: "Chave secreta", kind: "secret", required: true },
      { prop: "webhookSecret", label: "Webhook secret", kind: "secret" },
    ],
  },
  {
    id: "asaas", label: "Asaas", settingsKey: "integracoes_payments", nested: "asaas",
    fields: [
      { prop: "environment", label: "Ambiente", kind: "select", options: ENV },
      { prop: "apiKey", label: "API Key", kind: "secret", required: true },
      { prop: "webhookToken", label: "Webhook token", kind: "secret" },
    ],
  },
];

export const INTEGRATION_SETTING_KEYS = Array.from(new Set(INTEGRATION_DEFS.map(d => d.settingsKey)));

export const getIntegrationDef = (id: string) => INTEGRATION_DEFS.find(d => d.id === id);

const asObject = (v: any): Record<string, any> => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

function defaultConfigFor(def: IntegrationDef): Record<string, any> {
  switch (def.id) {
    case "maxdata":
    case "maxdata_estoque": return { ...DEFAULT_MAXDATA_CONFIG };
    case "meta": return { ...DEFAULT_META_CONFIG, trackedEvents: { ...DEFAULT_META_CONFIG.trackedEvents } };
    case "google": return { ...DEFAULT_GOOGLE_CONFIG };
    default: return { ...DEFAULT_PAYMENT_CONFIG[def.nested!] };
  }
}

/** Config atual (defaults + o que está salvo). `setting` é o valor bruto de app_settings[settingsKey]. */
export function getIntegrationConfig(def: IntegrationDef, setting: any): Record<string, any> {
  const saved = def.nested ? asObject(asObject(setting)[def.nested]) : asObject(setting);
  return { ...defaultConfigFor(def), ...saved };
}

export interface MaskedIntegration {
  id: IntegrationId;
  connected: boolean;
  /** Só campos NÃO secretos. */
  values: Record<string, string>;
  /** Para segredos: apenas se já existe valor — nunca o valor. */
  secretsSet: Record<string, boolean>;
}

export function maskedView(def: IntegrationDef, setting: any): MaskedIntegration {
  const cfg = getIntegrationConfig(def, setting);
  const values: Record<string, string> = {};
  const secretsSet: Record<string, boolean> = {};
  for (const f of def.fields) {
    if (f.kind === "secret") secretsSet[f.prop] = typeof cfg[f.prop] === "string" && cfg[f.prop].trim() !== "";
    else values[f.prop] = typeof cfg[f.prop] === "string" ? cfg[f.prop] : "";
  }
  return { id: def.id, connected: !!cfg.connected, values, secretsSet };
}

const MAX_LEN = 500;

export function validateIntegrationValues(def: IntegrationDef, values: Record<string, any>): { clean: Record<string, string>; errors: string[] } {
  const clean: Record<string, string> = {};
  const errors: string[] = [];
  const byProp = new Map(def.fields.map(f => [f.prop, f]));
  for (const [prop, raw] of Object.entries(values || {})) {
    const f = byProp.get(prop);
    if (!f) { errors.push(`Campo não permitido: ${prop}`); continue; }
    if (raw === undefined || raw === null) continue;
    const v = String(raw).trim();
    if (v.length > MAX_LEN) { errors.push(`"${f.label}" passou de ${MAX_LEN} caracteres.`); continue; }
    if (f.numeric && v !== "" && !/^\d+$/.test(v)) { errors.push(`"${f.label}" precisa ser numérico.`); continue; }
    if (f.kind === "select" && v !== "" && !f.options?.includes(v)) { errors.push(`"${f.label}" aceita: ${f.options?.join(", ")}.`); continue; }
    if (f.kind === "url" && v !== "") {
      try {
        const u = new URL(v);
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("proto");
      } catch { errors.push(`"${f.label}" precisa ser uma URL válida (https://…).`); continue; }
    }
    clean[prop] = v;
  }
  return { clean, errors };
}

/**
 * Aplica uma edição sobre o setting atual e devolve o valor COMPLETO a gravar.
 * - segredo vazio/ausente = mantém o existente (regravar não apaga chave);
 * - campo comum vazio = limpa;
 * - `connected` só vira true se todos os obrigatórios estiverem preenchidos;
 * - pagamentos: preserva os outros gateways e completa os que faltam com defaults.
 */
export function applyIntegrationUpdate(
  def: IntegrationDef,
  currentSetting: any,
  values: Record<string, string>,
  connected?: boolean
): { settingValue: any; missingRequired: string[]; connected: boolean } {
  const cfg = getIntegrationConfig(def, currentSetting);
  for (const f of def.fields) {
    const incoming = values[f.prop];
    if (incoming === undefined) continue;
    if (f.kind === "secret") { if (incoming !== "") cfg[f.prop] = incoming; }
    else cfg[f.prop] = incoming;
  }
  const missingRequired = def.fields
    .filter(f => f.required && !(typeof cfg[f.prop] === "string" && cfg[f.prop].trim() !== ""))
    .map(f => f.label);
  if (connected !== undefined) cfg.connected = connected && missingRequired.length === 0;
  if (cfg.connected) {
    if (def.id === "meta") { cfg.trackingActive = true; if (cfg.pixelStatus === "disconnected") cfg.pixelStatus = "pending"; }
    if (def.id === "google" && cfg.tagStatus === "disconnected") cfg.tagStatus = "pending";
  }

  if (!def.nested) return { settingValue: cfg, missingRequired, connected: !!cfg.connected };
  const current = asObject(currentSetting);
  const settingValue: Record<string, any> = {
    ...current,
    mercadoPago: { ...DEFAULT_PAYMENT_CONFIG.mercadoPago, ...asObject(current.mercadoPago) },
    stripe: { ...DEFAULT_PAYMENT_CONFIG.stripe, ...asObject(current.stripe) },
    asaas: { ...DEFAULT_PAYMENT_CONFIG.asaas, ...asObject(current.asaas) },
  };
  settingValue[def.nested] = cfg;
  return { settingValue, missingRequired, connected: !!cfg.connected };
}
