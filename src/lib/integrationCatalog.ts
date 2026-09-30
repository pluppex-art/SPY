/**
 * Catálogo de integrações de terceiros (Configurações > Integrações). Cada uma
 * é um CADASTRO DE CREDENCIAIS: guarda com segurança o que o serviço pede pra
 * conectar. A sincronização/chamadas ao serviço NÃO estão implementadas — a
 * tela marca todas como "Só credenciais" pra ninguém achar que dados fluem.
 * Ligar uma de verdade = construir o conector dela e, então, tirar o rótulo.
 *
 * Os campos seguem o que cada serviço costuma exigir (chave/token/ID); quando
 * a documentação do provedor pede algo a mais, o campo "Observações" da tela
 * cobre. Segredos (kind "secret") aparecem mascarados na tela.
 */

export type CatalogCategory =
  | "anuncios" | "mensageria" | "pagamentos" | "email" | "crm" | "erp" | "ecommerce" | "produtividade" | "logistica";

export type CatalogFieldKind = "text" | "secret" | "url" | "select";

export interface CatalogField {
  prop: string;
  label: string;
  kind: CatalogFieldKind;
  options?: string[];
  required?: boolean;
  help?: string;
  placeholder?: string;
}

export interface CatalogIntegration {
  id: string;
  name: string;
  category: CatalogCategory;
  description: string;
  fields: CatalogField[];
  /** Conector real implementado no servidor (teste de conexão + importação): tira o rótulo "Só credenciais". */
  live?: boolean;
}

const ENV = ["Produção", "Sandbox / testes"];
const env: CatalogField = { prop: "ambiente", label: "Ambiente", kind: "select", options: ENV };
const t = (prop: string, label: string, required = false, help?: string, placeholder?: string): CatalogField => ({ prop, label, kind: "text", required, help, placeholder });
const sec = (prop: string, label: string, required = true, help?: string): CatalogField => ({ prop, label, kind: "secret", required, help });
const url = (prop: string, label: string, required = true, help?: string, placeholder?: string): CatalogField => ({ prop, label, kind: "url", required, help, placeholder });

export const CATALOG_CATEGORY_LABELS: Record<CatalogCategory, string> = {
  anuncios: "Tráfego & Anúncios",
  mensageria: "Mensageria & WhatsApp",
  pagamentos: "Pagamentos & Checkout",
  email: "E-mail & SMTP",
  crm: "CRM & Marketing",
  erp: "ERP & Fiscal",
  ecommerce: "E-commerce & Infoprodutos",
  produtividade: "Produtividade & Automação",
  logistica: "Logística & Frete",
};

const d = (nome: string, extra = "") => `Guarda as credenciais do ${nome}.${extra ? " " + extra : ""} A sincronização automática ainda não está ligada.`;

export const INTEGRATION_CATALOG: CatalogIntegration[] = [
  // ── Tráfego & Anúncios
  { id: "tiktok-ads", name: "TikTok Ads", category: "anuncios", description: d("TikTok Ads", "Pixel e conta de anúncios."), fields: [t("pixelId", "Pixel ID", true), sec("accessToken", "Access Token"), t("advertiserId", "Advertiser ID")] },
  { id: "linkedin-ads", name: "LinkedIn Ads", category: "anuncios", description: d("LinkedIn Ads", "Insight Tag e conta."), fields: [t("partnerId", "Partner ID (Insight Tag)", true), sec("accessToken", "Access Token", false), t("accountId", "ID da conta de anúncios")] },

  // ── Mensageria
  { id: "telegram", name: "Telegram Bot", category: "mensageria", description: d("bot do Telegram"), fields: [sec("botToken", "Bot Token"), t("chatId", "Chat / canal padrão (ID)")] },
  { id: "twilio", name: "Twilio (SMS / WhatsApp)", category: "mensageria", description: d("Twilio"), fields: [t("accountSid", "Account SID", true), sec("authToken", "Auth Token"), t("fromNumber", "Número remetente", false, "No formato internacional, ex.: +5511999999999")] },
  { id: "zenvia", name: "Zenvia", category: "mensageria", description: d("Zenvia", "SMS e mensageria."), fields: [sec("apiToken", "API Token"), t("sender", "Remetente / canal")] },
  { id: "slack", name: "Slack", category: "mensageria", description: d("Slack", "Avisos em canais."), fields: [url("webhookUrl", "Incoming Webhook URL", true, undefined, "https://hooks.slack.com/…"), t("channel", "Canal padrão")] },

  // ── Pagamentos
  { id: "pagbank", name: "PagBank (PagSeguro)", category: "pagamentos", description: d("PagBank"), fields: [sec("token", "Token"), env] },
  { id: "pagarme", name: "Pagar.me", category: "pagamentos", description: d("Pagar.me"), fields: [sec("secretKey", "Chave secreta (API Key)"), t("publicKey", "Chave pública"), env] },
  { id: "iugu", name: "Iugu", category: "pagamentos", description: d("Iugu"), fields: [sec("apiToken", "API Token"), t("accountId", "ID da conta")] },
  { id: "vindi", name: "Vindi", category: "pagamentos", description: d("Vindi", "Cobrança recorrente."), fields: [sec("apiKey", "Chave de API privada"), env] },
  { id: "efi", name: "Efí Bank (Gerencianet)", category: "pagamentos", description: d("Efí", "Pix e boleto."), fields: [t("clientId", "Client ID", true), sec("clientSecret", "Client Secret"), t("pixKey", "Chave Pix"), env] },
  { id: "cielo", name: "Cielo eCommerce", category: "pagamentos", description: d("Cielo"), fields: [t("merchantId", "MerchantId", true), sec("merchantKey", "MerchantKey"), env] },
  { id: "paypal", name: "PayPal", category: "pagamentos", description: d("PayPal"), fields: [t("clientId", "Client ID", true), sec("secret", "Secret"), env] },

  // ── E-mail
  { id: "sendgrid", name: "SendGrid", category: "email", description: d("SendGrid"), fields: [sec("apiKey", "API Key"), t("fromEmail", "E-mail remetente")] },
  { id: "mailgun", name: "Mailgun", category: "email", description: d("Mailgun"), fields: [sec("apiKey", "API Key"), t("domain", "Domínio", true), { prop: "region", label: "Região", kind: "select", options: ["US", "EU"] }] },
  { id: "resend", name: "Resend", category: "email", description: d("Resend"), fields: [sec("apiKey", "API Key"), t("fromEmail", "E-mail remetente")] },
  { id: "amazon-ses", name: "Amazon SES", category: "email", description: d("Amazon SES", "Envio pela API da AWS."), fields: [t("accessKeyId", "Access Key ID", true), sec("secretAccessKey", "Secret Access Key"), t("region", "Região", true, undefined, "sa-east-1")] },
  { id: "mailchimp", name: "Mailchimp", category: "email", description: d("Mailchimp", "Listas e campanhas."), fields: [sec("apiKey", "API Key"), t("serverPrefix", "Prefixo do servidor", true, "Ex.: us21 (final da API Key)"), t("audienceId", "Audience ID")] },

  // ── CRM & Marketing
  { id: "rd-station", name: "RD Station Marketing", category: "crm", description: d("RD Station Marketing"), fields: [t("clientId", "Client ID", true), sec("clientSecret", "Client Secret"), sec("refreshToken", "Refresh Token", false)] },
  { id: "hubspot", name: "HubSpot", category: "crm", description: d("HubSpot", "Private App."), fields: [sec("accessToken", "Private App Access Token"), t("portalId", "Portal ID")] },
  { id: "pipedrive", name: "Pipedrive", category: "crm", description: d("Pipedrive"), fields: [sec("apiToken", "API Token"), t("domain", "Domínio da empresa", true, "Ex.: suaempresa (de suaempresa.pipedrive.com)")] },
  { id: "activecampaign", name: "ActiveCampaign", category: "crm", description: d("ActiveCampaign"), fields: [url("apiUrl", "URL da conta", true, undefined, "https://suaconta.api-us1.com"), sec("apiKey", "API Key")] },
  { id: "kommo", name: "Kommo", category: "crm", live: true, description: "Conecta a Kommo ao SPY: importa funis, etapas, leads, contatos e empresas (somente leitura, sem duplicar ao reimportar).", fields: [t("subdomain", "Subdomínio", true, "Ex.: suaempresa (de suaempresa.kommo.com)", "suaempresa"), sec("accessToken", "Token de Longa Duração (long-lived token)", true, "Na Kommo: Configurações → Integrações → sua integração → Chaves e escopos → \"Gerar token de longa duração\".")] },

  // ── ERP & Fiscal
  { id: "bling", name: "Bling", category: "erp", description: d("Bling", "API v3."), fields: [t("clientId", "Client ID", true), sec("clientSecret", "Client Secret")] },
  { id: "tiny", name: "Tiny ERP", category: "erp", description: d("Tiny"), fields: [sec("token", "Token da API")] },
  { id: "omie", name: "Omie", category: "erp", description: d("Omie"), fields: [t("appKey", "App Key", true), sec("appSecret", "App Secret")] },
  { id: "conta-azul", name: "Conta Azul", category: "erp", description: d("Conta Azul"), fields: [t("clientId", "Client ID", true), sec("clientSecret", "Client Secret")] },
  { id: "focus-nfe", name: "Focus NFe", category: "erp", description: d("Focus NFe", "Emissão de notas fiscais."), fields: [sec("token", "Token"), env] },
  { id: "nuvem-fiscal", name: "Nuvem Fiscal", category: "erp", description: d("Nuvem Fiscal", "Emissão de notas fiscais."), fields: [t("clientId", "Client ID", true), sec("clientSecret", "Client Secret"), env] },
  { id: "enotas", name: "eNotas", category: "erp", description: d("eNotas", "Emissão de notas fiscais."), fields: [sec("apiKey", "API Key"), t("empresaId", "ID da empresa")] },
  { id: "webmania", name: "WebmaniaBR", category: "erp", description: d("WebmaniaBR", "Emissão de notas fiscais."), fields: [t("consumerKey", "Consumer Key", true), sec("consumerSecret", "Consumer Secret"), t("accessToken", "Access Token", true), sec("accessTokenSecret", "Access Token Secret")] },

  // ── E-commerce & Infoprodutos
  { id: "shopify", name: "Shopify", category: "ecommerce", description: d("Shopify"), fields: [t("shopDomain", "Domínio da loja", true, "Ex.: minhaloja.myshopify.com"), sec("accessToken", "Admin API Access Token")] },
  { id: "nuvemshop", name: "Nuvemshop", category: "ecommerce", description: d("Nuvemshop"), fields: [t("storeId", "Store ID", true), sec("accessToken", "Access Token")] },
  { id: "woocommerce", name: "WooCommerce", category: "ecommerce", description: d("WooCommerce"), fields: [url("storeUrl", "URL da loja", true, undefined, "https://minhaloja.com.br"), t("consumerKey", "Consumer Key", true), sec("consumerSecret", "Consumer Secret")] },
  { id: "mercado-livre", name: "Mercado Livre", category: "ecommerce", description: d("Mercado Livre"), fields: [t("appId", "App ID", true), sec("clientSecret", "Client Secret"), t("sellerId", "Seller ID")] },
  { id: "hotmart", name: "Hotmart", category: "ecommerce", description: d("Hotmart"), fields: [t("clientId", "Client ID", true), sec("clientSecret", "Client Secret"), sec("hottok", "Hottok (token de webhook)", false)] },
  { id: "kiwify", name: "Kiwify", category: "ecommerce", description: d("Kiwify"), fields: [t("clientId", "Client ID", true), sec("clientSecret", "Client Secret"), t("accountId", "Account ID")] },
  { id: "eduzz", name: "Eduzz", category: "ecommerce", description: d("Eduzz"), fields: [t("publicKey", "Public Key", true), sec("apiKey", "API Key")] },

  // ── Produtividade & Automação
  { id: "zapier", name: "Zapier", category: "produtividade", description: d("Zapier", "Webhook de entrada (Catch Hook)."), fields: [url("webhookUrl", "Webhook URL", true, undefined, "https://hooks.zapier.com/…")] },
  { id: "make", name: "Make (Integromat)", category: "produtividade", description: d("Make", "Webhook de entrada."), fields: [url("webhookUrl", "Webhook URL", true, undefined, "https://hook.make.com/…")] },
  { id: "notion", name: "Notion", category: "produtividade", description: d("Notion"), fields: [sec("token", "Integration Token"), t("databaseId", "Database ID")] },
  { id: "airtable", name: "Airtable", category: "produtividade", description: d("Airtable"), fields: [sec("token", "Personal Access Token"), t("baseId", "Base ID", true)] },
  { id: "trello", name: "Trello", category: "produtividade", description: d("Trello"), fields: [t("apiKey", "API Key", true), sec("token", "Token"), t("boardId", "Board ID")] },
  { id: "clickup", name: "ClickUp", category: "produtividade", description: d("ClickUp"), fields: [sec("apiToken", "API Token"), t("workspaceId", "Workspace (Team) ID")] },
  { id: "calendly", name: "Calendly", category: "produtividade", description: d("Calendly"), fields: [sec("token", "Personal Access Token")] },
  { id: "typeform", name: "Typeform", category: "produtividade", description: d("Typeform"), fields: [sec("token", "Personal Access Token"), t("formId", "Form ID")] },

  // ── Logística & Frete
  { id: "melhor-envio", name: "Melhor Envio", category: "logistica", description: d("Melhor Envio", "Cotação e etiquetas."), fields: [sec("token", "Token"), env] },
  { id: "correios", name: "Correios (CWS)", category: "logistica", description: d("Correios"), fields: [t("usuario", "Usuário (ID Correios)", true), sec("codigoAcesso", "Código de acesso à API"), t("cartaoPostagem", "Cartão de postagem"), t("contrato", "Contrato")] },
  { id: "frenet", name: "Frenet", category: "logistica", description: d("Frenet", "Cotação de frete."), fields: [sec("token", "Token")] },
];

export type CatalogValues = { connected?: boolean; notes?: string; [prop: string]: any };

export function catalogMissingRequired(def: CatalogIntegration, values: CatalogValues | undefined): string[] {
  return def.fields
    .filter((f) => f.required && !(typeof values?.[f.prop] === "string" && values[f.prop].trim() !== ""))
    .map((f) => f.label);
}

export function catalogHasAnyValue(def: CatalogIntegration, values: CatalogValues | undefined): boolean {
  return def.fields.some((f) => f.kind !== "select" && typeof values?.[f.prop] === "string" && values[f.prop].trim() !== "");
}
