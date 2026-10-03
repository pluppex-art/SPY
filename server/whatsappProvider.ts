// Abstração de provider de WhatsApp — Simulador vs. WAHA (WhatsApp HTTP API) real.
//
// Contexto: até uma correção anterior, TODO o fluxo de WhatsApp (instâncias, QR
// code, conexão, envio de mensagem) era um simulador em memória — nenhuma
// chamada real a nenhum gateway de WhatsApp existia em lugar nenhum do
// backend, mas a UI descrevia esse simulador como se fosse uma conexão real.
// Isso foi corrigido implementando um provider real por trás da mesma
// interface — só que o provider real oficial deste projeto é o WAHA
// (https://waha.devlike.pro), não Evolution API. Não criar EvolutionProvider
// neste arquivo — decisão explícita do projeto.
//
// O WAHAProvider só entra em uso se o ambiente tiver WAHA_API_URL configurada
// (WAHA_API_KEY é opcional — só obrigatória se o servidor WAHA exigir
// autenticação). Sem isso, o sistema cai no SimulatorProvider — e a UI precisa
// deixar claro qual dos dois está ativo (ver GET /api/whatsapp/provider-status
// em server.ts).
//
// IMPORTANTE: o WAHAProvider nunca foi exercitado contra um servidor WAHA real
// neste ambiente (não há credencial/instância disponível aqui) — o contrato
// HTTP implementado é o documentado publicamente pelo projeto WAHA (endpoints
// de sessions e sendText), mas isso deve ser tratado como "Não testado —
// requer ambiente/credencial externa" até alguém validar contra uma instância
// real.

import axios from "axios";

export type WhatsAppProviderName = "simulator" | "waha";

export interface ProviderInstanceResult {
  providerInstanceId: string; // nome da sessão no WAHA (== session name)
  apiKey: string;
  webhookUrl: string;
}

export interface ProviderQrResult {
  status: "CONNECTING";
  qrcode: string; // base64 (data URL) pronto pra <img src=...> quando for WAHA real
}

export interface ProviderConnectResult {
  status: "CONNECTED" | "CONNECTING" | "DISCONNECTED";
  phone?: string;
}

export interface ProviderChat {
  chatId: string; // ex.: 5511999999999@c.us
  phone: string;
  name: string;
}

export interface ProviderMessage {
  id?: string;
  phone: string;
  text: string;
  fromMe: boolean;
  timestamp: number; // epoch segundos
}

export interface WhatsAppProvider {
  readonly name: WhatsAppProviderName;
  createInstance(instanceName: string, webhookUrl: string): Promise<ProviderInstanceResult>;
  getQrCode(providerInstanceId: string): Promise<ProviderQrResult>;
  getConnectionState(providerInstanceId: string): Promise<ProviderConnectResult>;
  deleteInstance(providerInstanceId: string): Promise<void>;
  sendTextMessage(providerInstanceId: string, phone: string, text: string): Promise<{ id: string }>;
  /** Backfill: conversas já existentes na sessão antes de conectar ao SPY (o
   * webhook só vê mensagens que chegam DEPOIS de conectado). Provider que não
   * suporta (ex.: Simulador) devolve lista vazia — nunca lança. */
  listChats(providerInstanceId: string): Promise<ProviderChat[]>;
  /** Histórico de uma conversa, mais recentes primeiro, até `limit`. */
  getChatMessages(providerInstanceId: string, chatId: string, limit: number): Promise<ProviderMessage[]>;
}

// ── Config ───────────────────────────────────────────────────────────────
// Globais de ambiente por enquanto (um único gateway WAHA pro deployment
// inteiro, com uma sessão por instância criada no CRM) — não uma credencial
// por tenant. Se no futuro cada tenant precisar do seu próprio gateway, isso
// vira uma leitura de app_settings por tenant em vez de process.env; a
// interface acima já é agnóstica a isso.
const WAHA_API_URL = (process.env.WAHA_API_URL || "").replace(/\/+$/, "");
const WAHA_API_KEY = process.env.WAHA_API_KEY || "";

export function isWahaConfigured(): boolean {
  return Boolean(WAHA_API_URL);
}

export function getActiveProviderName(): WhatsAppProviderName {
  return isWahaConfigured() ? "waha" : "simulator";
}

// ── Simulador (dev/demo — nunca deve ser apresentado como conexão real) ────
// Mantém exatamente o comportamento anterior (QR fake, conexão instantânea
// com número gerado, envio "sempre bem-sucedido"), só que agora nomeado e
// isolado atrás da mesma interface — o chamador (server.ts) não sabe nem
// precisa saber que é fake, mas a UI é informada via provider-status e deve
// deixar isso visível ao usuário.
export class SimulatorProvider implements WhatsAppProvider {
  readonly name: WhatsAppProviderName = "simulator";

  async createInstance(instanceName: string): Promise<ProviderInstanceResult> {
    return {
      providerInstanceId: "sim_inst_" + Math.random().toString(36).substring(2, 9),
      apiKey: "sim_apikey_" + Math.random().toString(36).substring(2, 12),
      webhookUrl: "",
    };
  }

  async getQrCode(): Promise<ProviderQrResult> {
    return {
      status: "CONNECTING",
      qrcode: "SIMULADOR — sem QR code real. Clique em Conectar para simular o pareamento.",
    };
  }

  async getConnectionState(): Promise<ProviderConnectResult> {
    return {
      status: "CONNECTED",
      phone: "+55 11 9" + Math.floor(1000 + Math.random() * 9000) + "-" + Math.floor(1000 + Math.random() * 9000),
    };
  }

  async deleteInstance(): Promise<void> {
    // Nada a fazer — não existe recurso externo pra liberar.
  }

  async sendTextMessage(_providerInstanceId: string, _phone: string, _text: string): Promise<{ id: string }> {
    return { id: "sim_msg_" + Math.random().toString(36).substring(2, 9) };
  }

  async listChats(): Promise<ProviderChat[]> {
    return []; // Simulador não tem histórico de verdade pra trazer.
  }

  async getChatMessages(): Promise<ProviderMessage[]> {
    return [];
  }
}

// ── WAHA real ────────────────────────────────────────────────────────────
// Contrato REST do projeto open-source WAHA (WhatsApp HTTP API). Não testado
// contra servidor real neste ambiente — ver aviso no topo do arquivo.
//
// Referência dos endpoints usados (documentação pública do WAHA):
//  - POST   /api/sessions                          → cria e inicia uma sessão
//  - GET    /api/sessions/{session}                 → status da sessão (me, status)
//  - GET    /api/{session}/auth/qr?format=raw        → QR code em base64
//  - DELETE /api/sessions/{session}                  → remove a sessão
//  - POST   /api/sendText                            → envia mensagem de texto
export class WAHAProvider implements WhatsAppProvider {
  readonly name: WhatsAppProviderName = "waha";

  private headers() {
    const h: Record<string, string> = { "Content-Type": "application/json" };
    if (WAHA_API_KEY) h["X-Api-Key"] = WAHA_API_KEY;
    return h;
  }

  async createInstance(instanceName: string, webhookUrl: string): Promise<ProviderInstanceResult> {
    const config: Record<string, any> = {};
    if (webhookUrl) config.webhooks = [{ url: webhookUrl, events: ["message", "session.status"] }];
    await axios.post(
      `${WAHA_API_URL}/api/sessions`,
      { name: instanceName, start: true, config },
      { headers: this.headers(), timeout: 20000 }
    );
    return { providerInstanceId: instanceName, apiKey: "", webhookUrl };
  }

  async getQrCode(providerInstanceId: string): Promise<ProviderQrResult> {
    const { data } = await axios.get(
      `${WAHA_API_URL}/api/${encodeURIComponent(providerInstanceId)}/auth/qr?format=raw`,
      { headers: this.headers(), timeout: 20000 }
    );
    const qrcode = data?.value || data?.qr || "";
    if (!qrcode) throw new Error("WAHA não retornou QR code.");
    return { status: "CONNECTING", qrcode };
  }

  async getConnectionState(providerInstanceId: string): Promise<ProviderConnectResult> {
    const { data } = await axios.get(
      `${WAHA_API_URL}/api/sessions/${encodeURIComponent(providerInstanceId)}`,
      { headers: this.headers(), timeout: 20000 }
    );
    const state = data?.status;
    const status: ProviderConnectResult["status"] =
      state === "WORKING" ? "CONNECTED" : (state === "SCAN_QR_CODE" || state === "STARTING") ? "CONNECTING" : "DISCONNECTED";
    const rawPhone: string | undefined = data?.me?.id;
    const phone = rawPhone ? rawPhone.replace(/@c\.us$/, "").replace(/@s\.whatsapp\.net$/, "") : undefined;
    return { status, phone };
  }

  async deleteInstance(providerInstanceId: string): Promise<void> {
    await axios.delete(
      `${WAHA_API_URL}/api/sessions/${encodeURIComponent(providerInstanceId)}`,
      { headers: this.headers(), timeout: 20000 }
    );
  }

  async sendTextMessage(providerInstanceId: string, phone: string, text: string): Promise<{ id: string }> {
    const number = phone.replace(/\D/g, "");
    const { data } = await axios.post(
      `${WAHA_API_URL}/api/sendText`,
      { session: providerInstanceId, chatId: `${number}@c.us`, text },
      { headers: this.headers(), timeout: 20000 }
    );
    return { id: data?.id?._serialized || data?.id || "waha_msg_" + Date.now() };
  }

  // Backfill — não testado contra servidor real (mesmo aviso do topo do
  // arquivo). Endpoints documentados publicamente pelo WAHA:
  //  - GET /api/{session}/chats                                  → lista de conversas
  //  - GET /api/{session}/chats/{chatId}/messages?limit=N         → histórico de uma conversa
  async listChats(providerInstanceId: string): Promise<ProviderChat[]> {
    const { data } = await axios.get(
      `${WAHA_API_URL}/api/${encodeURIComponent(providerInstanceId)}/chats`,
      { headers: this.headers(), timeout: 30000 }
    );
    const list: any[] = Array.isArray(data) ? data : [];
    return list
      .map((c) => {
        const rawId: string = c?.id?._serialized || c?.id || "";
        if (!rawId.endsWith("@c.us")) return null; // ignora grupos (@g.us) — mesmo escopo do webhook, que só trata 1:1.
        const phone = rawId.replace(/@c\.us$/, "");
        if (!phone) return null;
        return { chatId: rawId, phone, name: c?.name || c?.formattedTitle || phone };
      })
      .filter((c): c is ProviderChat => c !== null);
  }

  async getChatMessages(providerInstanceId: string, chatId: string, limit: number): Promise<ProviderMessage[]> {
    const { data } = await axios.get(
      `${WAHA_API_URL}/api/${encodeURIComponent(providerInstanceId)}/chats/${encodeURIComponent(chatId)}/messages`,
      { headers: this.headers(), timeout: 30000, params: { limit, downloadMedia: false } }
    );
    const list: any[] = Array.isArray(data) ? data : [];
    return list
      .map((m): ProviderMessage | null => {
        const rawFrom: string = m?.fromMe ? (m?.to || chatId) : (m?.from || chatId);
        const phone = String(rawFrom).replace(/@c\.us$/, "").replace(/@s\.whatsapp\.net$/, "");
        const text: string = m?.body || m?.text || "";
        if (!phone || !text) return null;
        return {
          id: m?.id?._serialized || m?.id || undefined,
          phone, text, fromMe: !!m?.fromMe,
          timestamp: Number(m?.timestamp) || Math.floor(Date.now() / 1000),
        };
      })
      .filter((m): m is ProviderMessage => m !== null);
  }
}

let cachedProvider: WhatsAppProvider | null = null;
let cachedProviderName: WhatsAppProviderName | null = null;

// Reavalia a cada chamada se a env mudou (ex.: configurado em runtime num
// ambiente serverless que recicla process.env entre invocações) — o cache só
// evita recriar a instância do provider repetidamente no caminho comum.
export function getWhatsAppProvider(): WhatsAppProvider {
  const name = getActiveProviderName();
  if (cachedProvider && cachedProviderName === name) return cachedProvider;
  cachedProvider = name === "waha" ? new WAHAProvider() : new SimulatorProvider();
  cachedProviderName = name;
  return cachedProvider;
}
