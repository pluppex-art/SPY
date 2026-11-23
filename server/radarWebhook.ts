/**
 * Webhook do Radar por empresa. Cada empresa tem o SEU endereço de busca do Radar no n8n (um clone do workflow
 * "Radar" com caminho próprio), guardado em app_settings (chave "radar_webhook", só o endereço: o segredo do
 * cabeçalho fica no servidor, nunca no banco nem no navegador). Assim criar uma empresa nova não exige mexer em
 * variável de ambiente nem fazer novo deploy: o endereço é criado e salvo automaticamente.
 *
 * Variáveis (servidor): N8N_API_URL e N8N_API_KEY (API do n8n), RADAR_BUSCA_WEBHOOK_SECRET e
 * RADAR_BUSCA_WEBHOOK_HEADER (autenticação do webhook), RADAR_MASTER_WORKFLOW_ID (modelo a clonar; padrão: o Radar),
 * N8N_WEBHOOK_BASE (padrão https://n8n.spycrm.com.br/webhook).
 */
import axios from "axios";

type Db = any;
const CHAVE = "radar_webhook";
const MESTRE_PADRAO = "X25VZukPX62cAfli";
const BASE_PADRAO = "https://n8n.spycrm.com.br/webhook";
const URL_GLOBAL_PADRAO = `${BASE_PADRAO}/radar-busca-direta`;

export interface RadarWebhook { url: string; header: string; secret: string | null; propria: boolean }

/** Endereço de busca do Radar desta empresa (o dela, se já foi criado; senão o geral). */
export async function radarWebhookDaEmpresa(db: Db, tenantId: string): Promise<RadarWebhook> {
  const { data } = await db.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", CHAVE).maybeSingle();
  const propria = typeof data?.value?.url === "string" && /^https:\/\//.test(data.value.url);
  return {
    url: propria ? data.value.url : (process.env.RADAR_BUSCA_WEBHOOK_URL || URL_GLOBAL_PADRAO),
    header: process.env.RADAR_BUSCA_WEBHOOK_HEADER || "X-Webhook-Secret",
    secret: process.env.RADAR_BUSCA_WEBHOOK_SECRET || null,
    propria,
  };
}

export interface ResultadoProvisao { ok: boolean; url?: string; jaExistia?: boolean; workflowId?: string; motivo?: string }

/**
 * Cria (uma única vez) o webhook de busca do Radar da empresa: clona o workflow modelo no n8n com caminhos de
 * webhook próprios, ativa e salva o endereço. Idempotente: se a empresa já tem endereço, não cria outro.
 * Nunca lança: devolve { ok:false, motivo } para quem chamou registrar o aviso (criar empresa não pode falhar por isso).
 */
export async function provisionarRadarDaEmpresa(db: Db, tenantId: string, nomeEmpresa: string): Promise<ResultadoProvisao> {
  try {
    const { data: existente } = await db.from("app_settings").select("id, value").eq("tenant_id", tenantId).eq("key", CHAVE).maybeSingle();
    if (existente?.value?.url) return { ok: true, url: existente.value.url, jaExistia: true, workflowId: existente.value.workflowId };

    const api = (process.env.N8N_API_URL || "").replace(/\/+$/, "");
    const chave = process.env.N8N_API_KEY || "";
    if (!api || !chave) return { ok: false, motivo: "API do n8n não configurada (N8N_API_URL / N8N_API_KEY)." };
    const headers = { "X-N8N-API-KEY": chave };
    const mestreId = process.env.RADAR_MASTER_WORKFLOW_ID || MESTRE_PADRAO;
    const base = (process.env.N8N_WEBHOOK_BASE || BASE_PADRAO).replace(/\/+$/, "");
    const sufixo = tenantId.replace(/-/g, "").slice(0, 10);

    const { data: modelo } = await axios.get(`${api}/workflows/${mestreId}`, { headers, timeout: 20_000 });
    let caminhoBusca = "";
    const nodes = (modelo.nodes || []).map((n: any) => {
      const copia = { ...n };
      if (typeof n.type === "string" && n.type.endsWith(".webhook") && n.parameters?.path) {
        const caminho = `${n.parameters.path}-${sufixo}`;
        if (String(n.parameters.path) === "radar-busca-direta") caminhoBusca = caminho;
        copia.parameters = { ...n.parameters, path: caminho };
        delete copia.webhookId; // o n8n gera um novo
      }
      return copia;
    });
    if (!caminhoBusca) return { ok: false, motivo: "O workflow modelo não tem o webhook radar-busca-direta." };

    const corpo = {
      name: `[SPY] Radar: ${String(nomeEmpresa || tenantId).slice(0, 80)}`,
      nodes,
      connections: modelo.connections || {},
      settings: modelo.settings && typeof modelo.settings === "object" ? { executionOrder: modelo.settings.executionOrder ?? "v1" } : { executionOrder: "v1" },
    };
    const { data: criado } = await axios.post(`${api}/workflows`, corpo, { headers, timeout: 30_000 });
    await axios.post(`${api}/workflows/${criado.id}/activate`, {}, { headers, timeout: 20_000 });

    const url = `${base}/${caminhoBusca}`;
    const valor = { url, workflowId: criado.id, criadoEm: new Date().toISOString() };
    if (existente?.id) await db.from("app_settings").update({ value: valor }).eq("id", existente.id);
    else await db.from("app_settings").insert({ tenant_id: tenantId, key: CHAVE, value: valor });
    return { ok: true, url, workflowId: criado.id };
  } catch (e: any) {
    return { ok: false, motivo: String(e?.response?.data?.message || e?.message || "falha ao criar o Radar da empresa").slice(0, 200) };
  }
}

export interface ResultadoSync { empresa: string; ok: boolean; motivo?: string }

/**
 * Leva as mudanças do workflow modelo do Radar para a cópia de cada empresa (mantendo o caminho próprio dos
 * webhooks de cada uma). Roda sob demanda pela equipe interna, depois de alterar o Radar original no n8n.
 */
export async function sincronizarRadarDasEmpresas(db: Db): Promise<ResultadoSync[]> {
  const api = (process.env.N8N_API_URL || "").replace(/\/+$/, "");
  const chave = process.env.N8N_API_KEY || "";
  if (!api || !chave) return [{ empresa: "-", ok: false, motivo: "API do n8n não configurada (N8N_API_URL / N8N_API_KEY)." }];
  const headers = { "X-N8N-API-KEY": chave };
  const mestreId = process.env.RADAR_MASTER_WORKFLOW_ID || MESTRE_PADRAO;
  const { data: modelo } = await axios.get(`${api}/workflows/${mestreId}`, { headers, timeout: 20_000 });
  const { data: linhas } = await db.from("app_settings").select("tenant_id, value, tenants(name)").eq("key", CHAVE);
  const saida: ResultadoSync[] = [];
  for (const l of (linhas || []) as any[]) {
    const empresa = l.tenants?.name || l.tenant_id;
    const workflowId = l.value?.workflowId;
    if (!workflowId) { saida.push({ empresa, ok: false, motivo: "sem workflow próprio (usa o geral)" }); continue; }
    try {
      const sufixo = String(l.tenant_id).replace(/-/g, "").slice(0, 10);
      const nodes = (modelo.nodes || []).map((n: any) => {
        const copia = { ...n };
        if (typeof n.type === "string" && n.type.endsWith(".webhook") && n.parameters?.path) {
          copia.parameters = { ...n.parameters, path: `${n.parameters.path}-${sufixo}` };
          delete copia.webhookId;
        }
        return copia;
      });
      const { data: atual } = await axios.get(`${api}/workflows/${workflowId}`, { headers, timeout: 20_000 });
      await axios.put(`${api}/workflows/${workflowId}`, {
        name: atual.name, nodes, connections: modelo.connections || {},
        settings: { executionOrder: modelo.settings?.executionOrder ?? "v1" },
      }, { headers, timeout: 30_000 });
      saida.push({ empresa, ok: true });
    } catch (e: any) {
      saida.push({ empresa, ok: false, motivo: String(e?.response?.data?.message || e?.message || "falha").slice(0, 160) });
    }
  }
  return saida;
}
