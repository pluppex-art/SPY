/**
 * Mensagens dos GRUPOS do WhatsApp (WAHA) para o Agente Secreto interno, que roda no n8n.
 * O webhook do WAHA chega no SPY (POST /api/whatsapp/webhook/:instanceId); mensagem cujo chat termina em "@g.us" é
 * encaminhada, como está, para o webhook "agente-secreto-interno-grupos" do n8n, com o mesmo cabeçalho de autenticação do Radar.
 * Variáveis (servidor): AGENTE_SECRETO_GRUPOS_WEBHOOK_URL (padrão: <N8N_WEBHOOK_BASE>/agente-secreto-interno-grupos),
 * AGENTE_SECRETO_GRUPOS_WEBHOOK_HEADER / _SECRET (se faltarem, valem RADAR_BUSCA_WEBHOOK_HEADER / _SECRET).
 */
import axios from "axios";

const BASE_PADRAO = "https://n8n.spycrm.com.br/webhook";

export const ehGrupo = (id: unknown): boolean => typeof id === "string" && id.endsWith("@g.us");

export interface DestinoGrupos { url: string; header: string; secret: string | null }

export function destinoDosGrupos(env: NodeJS.ProcessEnv = process.env): DestinoGrupos {
  const base = (env.N8N_WEBHOOK_BASE || BASE_PADRAO).replace(/\/+$/, "");
  return {
    url: env.AGENTE_SECRETO_GRUPOS_WEBHOOK_URL || `${base}/agente-secreto-interno-grupos`,
    header: env.AGENTE_SECRETO_GRUPOS_WEBHOOK_HEADER || env.RADAR_BUSCA_WEBHOOK_HEADER || "X-Webhook-Secret",
    secret: env.AGENTE_SECRETO_GRUPOS_WEBHOOK_SECRET || env.RADAR_BUSCA_WEBHOOK_SECRET || null,
  };
}

/** Evento do WAHA (event "message" ou "message.any") que veio de um grupo e não é eco do que o próprio número enviou. */
export function mensagemDeGrupo(body: any): boolean {
  const ev = body?.event;
  if (ev !== "message" && ev !== "message.any") return false;
  const p = body?.payload ?? {};
  if (p.fromMe) return false;
  return ehGrupo(p.from) || ehGrupo(p.chatId) || ehGrupo(p._data?.id?.remote);
}

export interface EnvioGrupo { tenantId: string; instanceId: string; session: string | null; event: string; payload: any; recebidoEm: string }

export function montarEnvio(body: any, inst: { id: string; tenant_id: string }, agora = new Date()): EnvioGrupo {
  return { tenantId: inst.tenant_id, instanceId: inst.id, session: typeof body?.session === "string" ? body.session : null, event: String(body?.event), payload: body?.payload ?? {}, recebidoEm: agora.toISOString() };
}

type Postar = (url: string, corpo: unknown, cfg: { headers: Record<string, string>; timeout: number }) => Promise<unknown>;

/** Nunca lança: devolve se entregou, para quem chamou só registrar. Sem segredo configurado não envia (o n8n recusaria). */
export async function encaminharMensagemDeGrupo(body: any, inst: { id: string; tenant_id: string }, opcoes: { env?: NodeJS.ProcessEnv; postar?: Postar } = {}): Promise<{ ok: boolean; motivo?: string }> {
  const d = destinoDosGrupos(opcoes.env);
  if (!d.secret) return { ok: false, motivo: "segredo do webhook de grupos não configurado" };
  try {
    await (opcoes.postar ?? ((u, c, cfg) => axios.post(u, c, cfg)))(d.url, montarEnvio(body, inst), { headers: { [d.header]: d.secret, "Content-Type": "application/json" }, timeout: 10_000 });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, motivo: String(e?.response?.status ? `n8n respondeu ${e.response.status}` : e?.message || "falha ao chamar o n8n").slice(0, 160) };
  }
}

/** Id do grupo da mensagem do WAHA (o mesmo critério de mensagemDeGrupo). */
export function idDoGrupo(body: any): string {
  const p = body?.payload ?? {};
  return [p.from, p.chatId, p._data?.id?.remote].find((x) => ehGrupo(x)) as string || "";
}

export interface DestinoRadar { url: string | null; header: string; secret: string | null }

/**
 * Webhook de GRUPOS do Radar desta empresa: o mesmo caminho do webhook de busca dela (…/radar-busca-direta-<sufixo>) trocando o prefixo
 * (…/radar-whatsapp-grupos-<sufixo>). Cabeçalho e segredo próprios (RADAR_GRUPOS_WEBHOOK_HEADER / _SECRET): são produtos separados do Agente Interno.
 */
export function destinoRadarGrupos(urlBusca: string | null | undefined, env: NodeJS.ProcessEnv = process.env): DestinoRadar {
  const url = typeof urlBusca === "string" && /\/radar-busca-direta(-[a-z0-9]+)?$/.test(urlBusca) ? urlBusca.replace(/\/radar-busca-direta/, "/radar-whatsapp-grupos") : null;
  return { url, header: env.RADAR_GRUPOS_WEBHOOK_HEADER || "X-Radar-Grupos-Secret", secret: env.RADAR_GRUPOS_WEBHOOK_SECRET || null };
}

/**
 * Decide para qual agente vai a mensagem de grupo: grupo cadastrado e ativo no Radar desta empresa vai para o Radar dela;
 * qualquer outro vai para o Agente Secreto interno (que descarta o que não for de grupo cadastrado). Nunca lança.
 */
export async function rotearMensagemDeGrupo(
  db: any, body: any, inst: { id: string; tenant_id: string },
  opcoes: { env?: NodeJS.ProcessEnv; postar?: Postar } = {},
): Promise<{ ok: boolean; destino: "radar" | "interno" | "nenhum"; motivo?: string }> {
  const chat = idDoGrupo(body);
  let doRadar = false;
  try {
    const { data } = await db.from("radar_grupos_monitorados").select("id").eq("tenant_id", inst.tenant_id).eq("group_chat_id", chat).eq("ativo", true).limit(1);
    doRadar = Array.isArray(data) && data.length > 0;
  } catch { /* sem consulta, segue para o interno (que ignora o que não conhece) */ }
  if (!doRadar) { const r = await encaminharMensagemDeGrupo(body, inst, opcoes); return { ...r, destino: "interno" }; }

  try {
    const { data: cfg } = await db.from("app_settings").select("value").eq("tenant_id", inst.tenant_id).eq("key", "radar_webhook").maybeSingle();
    const d = destinoRadarGrupos(cfg?.value?.url, opcoes.env);
    if (!d.url) return { ok: false, destino: "radar", motivo: "empresa sem webhook próprio do Radar" };
    if (!d.secret) return { ok: false, destino: "radar", motivo: "segredo do webhook de grupos do Radar não configurado" };
    await (opcoes.postar ?? ((u, c, cfg2) => axios.post(u, c, cfg2)))(d.url, body, { headers: { [d.header]: d.secret, "Content-Type": "application/json" }, timeout: 10_000 });
    return { ok: true, destino: "radar" };
  } catch (e: any) {
    return { ok: false, destino: "radar", motivo: String(e?.response?.status ? `n8n respondeu ${e.response.status}` : e?.message || "falha ao chamar o n8n").slice(0, 160) };
  }
}
