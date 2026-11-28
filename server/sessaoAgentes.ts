/**
 * Uma sessão de WhatsApp por pessoa serve aos dois Agentes Secretos (produtos separados):
 *  - Vendas: o webhook do n8n (copiado de uma sessão modelo da empresa) acompanha as conversas de venda;
 *  - Interno: um segundo webhook, do próprio SPY, recebe as mensagens de GRUPO e as repassa ao n8n (conversas privadas nunca entram no SPY).
 * Para o Interno ver grupos, a sessão não pode ignorá-los; o fluxo de vendas descarta mensagem de grupo sozinho.
 */
type Cfg = Record<string, any> | null | undefined;

export const urlWebhookInterno = (appUrl: string, instanceId: string, secret: string) => `${appUrl.replace(/\/+$/, "")}/api/whatsapp/webhook/${instanceId}?secret=${secret}`;

/** A sessão já entrega mensagens ao webhook do SPY desta linha? */
export function temWebhookInterno(cfg: Cfg, instanceId: string): boolean {
  return Array.isArray(cfg?.webhooks) && cfg!.webhooks.some((w: any) => typeof w?.url === "string" && w.url.includes(`/api/whatsapp/webhook/${instanceId}`));
}

/** Config com o webhook do SPY acrescentado e os grupos liberados; o resto (outros webhooks, demais "ignore", gows) fica como estava. */
export function comWebhookInterno(cfg: Cfg, url: string, instanceId: string): Record<string, any> {
  const base = cfg && typeof cfg === "object" ? cfg : {};
  const webhooks = Array.isArray(base.webhooks) ? base.webhooks : [];
  return {
    ...base,
    webhooks: temWebhookInterno(base, instanceId) ? webhooks : [...webhooks, { url, events: ["message.any"] }],
    ignore: { ...(base.ignore && typeof base.ignore === "object" ? base.ignore : {}), groups: false },
  };
}

const ehDoSpy = (w: any) => String(w?.url || "").includes("/api/whatsapp/webhook/");
const listaDeWebhooks = (cfg: Cfg): any[] => (Array.isArray(cfg?.webhooks) ? cfg!.webhooks : []);

/** Webhooks do Agente Secreto de Vendas: todos os que não são do próprio SPY (o do n8n). */
export const webhooksVendas = (cfg: Cfg): any[] => listaDeWebhooks(cfg).filter((w) => !ehDoSpy(w) && typeof w?.url === "string" && w.url);

/** Vendas desligado: a sessão deixa de entregar ao n8n; o webhook do SPY (Interno) e o resto ficam como estavam. */
export function semWebhookVendas(cfg: Cfg): Record<string, any> {
  const base = cfg && typeof cfg === "object" ? cfg : {};
  return { ...base, webhooks: listaDeWebhooks(base).filter(ehDoSpy) };
}

/** Vendas ligado: devolve os webhooks do n8n, só com o evento message.any, sem repetir URL. */
export function comWebhookVendas(cfg: Cfg, doN8n: any[]): Record<string, any> {
  const base = cfg && typeof cfg === "object" ? cfg : {};
  const atuais = listaDeWebhooks(base);
  const urls = new Set(atuais.map((w: any) => w?.url));
  return { ...base, webhooks: [...doN8n.filter((w) => w?.url && !urls.has(w.url)).map((w) => ({ ...w, events: ["message.any"] })), ...atuais] };
}

/** Interno desligado: sai o webhook do SPY desta linha e a sessão volta a ignorar grupos; o webhook de Vendas fica. */
export function semWebhookInterno(cfg: Cfg, instanceId: string): Record<string, any> {
  const base = cfg && typeof cfg === "object" ? cfg : {};
  return {
    ...base,
    webhooks: listaDeWebhooks(base).filter((w: any) => !String(w?.url || "").includes(`/api/whatsapp/webhook/${instanceId}`)),
    ignore: { ...(base.ignore && typeof base.ignore === "object" ? base.ignore : {}), groups: true },
  };
}

/**
 * Na sessão PESSOAL de alguém, só saem do SPY as mensagens de grupos que a empresa cadastrou (Agente Interno ou Radar).
 * Grupo particular da pessoa (família, amigos) é descartado aqui mesmo e nunca chega ao n8n. Na dúvida (erro na consulta), descarta.
 */
export async function grupoCadastradoNaEmpresa(db: any, tenantId: string, chatId: string): Promise<boolean> {
  if (!chatId) return false;
  try {
    const { data: cfg } = await db.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "agente_interno_grupos").maybeSingle();
    if (Array.isArray(cfg?.value?.grupos) && cfg.value.grupos.some((g: any) => g?.group_chat_id === chatId && g.ativo !== false)) return true;
    const { data: radar } = await db.from("radar_grupos_monitorados").select("id").eq("tenant_id", tenantId).eq("group_chat_id", chatId).eq("ativo", true).limit(1);
    return Array.isArray(radar) && radar.length > 0;
  } catch { return false; }
}
