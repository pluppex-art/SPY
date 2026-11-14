/**
 * Endereço (webhook do n8n) do chatbot de cada cliente. Como os outros agentes, o chatbot passa a ser criado pelo
 * agente de implementação na pasta do cliente; quando o n8n termina de criá-lo, registra o endereço dele aqui
 * (POST /api/chatbot/registrar-agente). Enquanto não houver endereço registrado, vale o motor compartilhado.
 */
export const CHATBOT_WEBHOOK_PADRAO = process.env.N8N_CHATBOT_WEBHOOK_URL || "https://n8n.spycrm.com.br/webhook/spy-chatbot";
const CHAVE = "chatbot_webhook_url";

/** Só aceita endereço https no mesmo servidor n8n do motor padrão (nunca um destino arbitrário). */
export function webhookPermitido(raw: unknown): string | null {
  try {
    const u = new URL(String(raw ?? ""));
    const base = new URL(CHATBOT_WEBHOOK_PADRAO);
    if (u.protocol !== "https:" || u.hostname !== base.hostname || u.username || u.password) return null;
    return u.toString().slice(0, 500);
  } catch { return null; }
}

export async function webhookDoChatbot(db: any, tenantId: string): Promise<string> {
  try {
    const { data } = await db.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", CHAVE).maybeSingle();
    return webhookPermitido(data?.value?.url) ?? CHATBOT_WEBHOOK_PADRAO;
  } catch { return CHATBOT_WEBHOOK_PADRAO; }
}

export async function registrarWebhookDoChatbot(db: any, tenantId: string, url: string): Promise<boolean> {
  const { data: atual } = await db.from("app_settings").select("tenant_id").eq("tenant_id", tenantId).eq("key", CHAVE).maybeSingle();
  const r = atual
    ? await db.from("app_settings").update({ value: { url } }).eq("tenant_id", tenantId).eq("key", CHAVE)
    : await db.from("app_settings").insert({ tenant_id: tenantId, key: CHAVE, value: { url } });
  return !r.error;
}
