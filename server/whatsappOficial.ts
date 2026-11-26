/**
 * API oficial do WhatsApp Business (Cloud API da Meta), por empresa.
 *
 * - Conexão: a empresa informa ID do número, ID da conta (WABA) e token; o servidor confere na Meta, grava (o token
 *   só existe no servidor) e CONFIGURA O WEBHOOK SOZINHO (POST /{waba}/subscribed_apps com override_callback_uri).
 * - Recebimento: a Meta chama /api/whatsapp-oficial/webhook/<empresa>/<chave>; as mensagens entram no Chat.
 * - Envio: o Chat usa enviarTextoOficial para as instâncias com provider 'cloud_api'.
 *
 * O webhook vale por conta (WABA): números da mesma conta compartilham a mesma chave e o mesmo token de verificação.
 */
import type { Express, RequestHandler } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import axios from "axios";

type Db = any;
const GRAPH = "https://graph.facebook.com/v21.0";
const TABELA = "whatsapp_oficial_numeros";

export interface DepsWhatsAppOficial {
  requireUser: RequestHandler;
  limiter: RequestHandler;
  supabaseService: Db;
  resolveTenant: (req: any, res: any) => Promise<string | null>;
  ehAdmin: (req: any) => Promise<boolean>;
  urlPublica: string;
}

const soDigitos = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const igual = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };
const erroMeta = (e: any) => String(e?.response?.data?.error?.error_user_msg || e?.response?.data?.error?.message || e?.message || "falha ao falar com a Meta").slice(0, 300);
const auth = (token: string) => ({ headers: { Authorization: `Bearer ${token}` }, timeout: 20_000 });
const urlWebhook = (base: string, tenantId: string, chave: string) => `${base.replace(/\/+$/, "")}/api/whatsapp-oficial/webhook/${tenantId}/${chave}`;

/** O que vai para o navegador: nunca o token, o segredo do app ou as chaves do webhook. */
const paraTela = (r: any) => ({
  id: r.id, apelido: r.apelido, phoneNumberId: r.phone_number_id, wabaId: r.waba_id, telefone: r.telefone, nomeVerificado: r.nome_verificado,
  qualidade: r.qualidade, webhookAtivo: !!r.webhook_ativo, ultimoErro: r.ultimo_erro, ultimaMensagemEm: r.ultima_mensagem_em, criadoEm: r.created_at,
});

/** Pede à Meta para entregar as mensagens desta conta no nosso endereço (webhook automático). */
async function assinarWebhook(db: Db, base: string, numero: any): Promise<{ ok: boolean; erro?: string }> {
  try {
    await axios.post(`${GRAPH}/${numero.waba_id}/subscribed_apps`,
      { override_callback_uri: urlWebhook(base, numero.tenant_id, numero.webhook_key), verify_token: numero.verify_token }, auth(numero.access_token));
    await db.from(TABELA).update({ webhook_ativo: true, ultimo_erro: null, updated_at: new Date().toISOString() }).eq("tenant_id", numero.tenant_id).eq("waba_id", numero.waba_id);
    return { ok: true };
  } catch (e: any) {
    const erro = erroMeta(e);
    await db.from(TABELA).update({ webhook_ativo: false, ultimo_erro: erro, updated_at: new Date().toISOString() }).eq("id", numero.id);
    return { ok: false, erro };
  }
}

/** Envia um texto pela API oficial usando o número ligado à instância. Lança em caso de erro. */
export async function enviarTextoOficial(db: Db, instanceId: string, telefone: string, texto: string): Promise<string | null> {
  const { data: n } = await db.from(TABELA).select("phone_number_id, access_token").eq("instance_id", instanceId).maybeSingle();
  if (!n) throw new Error("Este número oficial foi desconectado. Conecte de novo na Central de Integrações.");
  try {
    const { data } = await axios.post(`${GRAPH}/${n.phone_number_id}/messages`,
      { messaging_product: "whatsapp", recipient_type: "individual", to: soDigitos(telefone), type: "text", text: { body: texto } }, auth(n.access_token));
    return data?.messages?.[0]?.id ?? null;
  } catch (e: any) {
    // Código 131047: passou da janela de 24 h desde a última mensagem do cliente; só modelo aprovado é aceito.
    if (e?.response?.data?.error?.code === 131047) throw new Error("A Meta só permite texto livre até 24 horas depois da última mensagem do cliente.");
    throw new Error(erroMeta(e));
  }
}

const textoDaMensagem = (m: any): string => {
  if (m?.type === "text") return String(m.text?.body || "");
  if (m?.type === "button") return String(m.button?.text || "");
  if (m?.type === "interactive") return String(m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "");
  const rotulos: Record<string, string> = { image: "Imagem", audio: "Áudio", video: "Vídeo", document: "Documento", sticker: "Figurinha", location: "Localização", contacts: "Contato" };
  const rotulo = rotulos[m?.type] || "Mensagem";
  const legenda = m?.[m?.type]?.caption || m?.document?.filename || "";
  return `[${rotulo}]${legenda ? ` ${legenda}` : ""}`;
};

async function processarEvento(db: Db, tenantId: string, numeros: any[], corpo: any) {
  for (const entrada of corpo?.entry || []) {
    for (const mudanca of entrada?.changes || []) {
      const v = mudanca?.value;
      const numero = numeros.find((n) => n.phone_number_id === v?.metadata?.phone_number_id);
      if (!numero?.instance_id) continue;

      // Entrega e leitura das mensagens que saíram pelo SPY.
      for (const s of v.statuses || []) {
        if (s?.id && s?.status) await db.from("chat_messages").update({ status: String(s.status) }).eq("tenant_id", tenantId).eq("wa_message_id", s.id);
      }

      for (const m of v.messages || []) {
        const telefone = soDigitos(m.from);
        const texto = textoDaMensagem(m);
        if (!telefone || !texto) continue;
        const nome = (v.contacts || []).find((c: any) => soDigitos(c.wa_id) === telefone)?.profile?.name || telefone;
        const quando = m.timestamp ? new Date(Number(m.timestamp) * 1000).toISOString() : new Date().toISOString();
        const { data: contato, error: erroContato } = await db.from("chat_contacts")
          .upsert({ tenant_id: tenantId, whatsapp_instance_id: numero.instance_id, phone: telefone, name: nome, last_message: texto, last_message_at: quando }, { onConflict: "whatsapp_instance_id,phone" })
          .select().maybeSingle();
        if (erroContato || !contato) { console.error("[whatsapp-oficial] contato:", erroContato?.message); continue; }
        const { error } = await db.from("chat_messages")
          .insert({ tenant_id: tenantId, contact_id: contato.id, whatsapp_instance_id: numero.instance_id, text: texto, sender: "contact", status: "received", wa_message_id: m.id || null });
        if (error) { if (error.code !== "23505") console.error("[whatsapp-oficial] mensagem:", error.message); continue; }
        await db.from("chat_contacts").update({ unread_count: (contato.unread_count || 0) + 1 }).eq("id", contato.id);
        await db.from(TABELA).update({ ultima_mensagem_em: quando }).eq("id", numero.id);
      }
    }
  }
}

/** Webhook público da Meta. Precisa ser registrado ANTES do json() global para poder conferir a assinatura. */
export function registrarWebhookWhatsAppOficial(app: Express, db: Db, limiter: RequestHandler, corpoBruto: RequestHandler) {
  const rota = "/api/whatsapp-oficial/webhook/:tenantId/:chave";
  const carregar = async (tenantId: string, chave: string) => {
    if (!db || !/^[0-9a-f-]{36}$/i.test(tenantId) || !/^[0-9a-f]{32,80}$/i.test(chave)) return [];
    const { data } = await db.from(TABELA).select("*").eq("tenant_id", tenantId);
    return (data || []).filter((n: any) => igual(String(n.webhook_key), chave));
  };

  // Verificação feita pela Meta ao registrar o endereço.
  app.get(rota, limiter, async (req: any, res) => {
    const numeros = await carregar(req.params.tenantId, req.params.chave);
    const token = String(req.query["hub.verify_token"] || "");
    if (req.query["hub.mode"] === "subscribe" && numeros.some((n: any) => igual(String(n.verify_token), token))) {
      return res.status(200).type("text/plain").send(String(req.query["hub.challenge"] || ""));
    }
    return res.status(403).send("forbidden");
  });

  app.post(rota, limiter, corpoBruto, async (req: any, res) => {
    const numeros = await carregar(req.params.tenantId, req.params.chave);
    if (numeros.length === 0) return res.status(403).json({ error: "Webhook desconhecido." });
    const bruto = Buffer.isBuffer(req.body) ? req.body : null;
    // Assinatura da Meta: conferida quando há o segredo do app e o corpo bruto (a chave secreta do endereço vale sempre).
    const segredo = numeros.find((n: any) => n.app_secret)?.app_secret;
    if (segredo && bruto) {
      const esperado = "sha256=" + createHmac("sha256", segredo).update(bruto).digest("hex");
      if (!igual(String(req.headers["x-hub-signature-256"] || ""), esperado)) return res.status(403).json({ error: "Assinatura inválida." });
    }
    try {
      const corpo = bruto ? JSON.parse(bruto.toString("utf8")) : req.body;
      // Processa antes de responder: em hospedagem sem servidor fixo, o que roda depois da resposta pode ser cortado.
      await processarEvento(db, req.params.tenantId, numeros, corpo);
    } catch (e: any) {
      console.error("[whatsapp-oficial] webhook:", e?.message);
    }
    return res.status(200).json({ received: true });
  });
}

/** Rotas usadas pela Central de Integrações. */
export function registrarRotasWhatsAppOficial(app: Express, deps: DepsWhatsAppOficial) {
  const { requireUser, limiter, supabaseService: db, resolveTenant, ehAdmin, urlPublica } = deps;

  const contexto = async (req: any, res: any, exigirAdmin: boolean): Promise<string | null> => {
    if (!db) { res.status(503).json({ error: "Serviço indisponível." }); return null; }
    if (exigirAdmin && !(await ehAdmin(req))) { res.status(403).json({ error: "Apenas administradores podem gerenciar o WhatsApp oficial." }); return null; }
    return resolveTenant(req, res);
  };
  const doTenant = async (req: any, res: any, tenantId: string) => {
    const { data } = await db.from(TABELA).select("*").eq("tenant_id", tenantId).eq("id", req.params.id).maybeSingle();
    if (!data) res.status(404).json({ error: "Número não encontrado." });
    return data;
  };

  app.get("/api/whatsapp-oficial/numeros", requireUser, async (req: any, res) => {
    const tenantId = await contexto(req, res, false);
    if (!tenantId) return;
    const { data, error } = await db.from(TABELA).select("*").eq("tenant_id", tenantId).order("created_at");
    if (error) return res.status(500).json({ error: "Erro ao carregar os números." });
    res.json({ numeros: (data || []).map(paraTela) });
  });

  app.post("/api/whatsapp-oficial/numeros", requireUser, limiter, async (req: any, res) => {
    const tenantId = await contexto(req, res, true);
    if (!tenantId) return;
    const apelido = String(req.body?.apelido || "").trim().slice(0, 60);
    const phoneNumberId = String(req.body?.phoneNumberId || "").trim();
    const wabaId = String(req.body?.wabaId || "").trim();
    const token = String(req.body?.accessToken || "").trim();
    const appSecret = String(req.body?.appSecret || "").trim() || null;
    if (!/^\d{5,25}$/.test(phoneNumberId) || !/^\d{5,25}$/.test(wabaId)) return res.status(400).json({ error: "O ID do número e o ID da conta são só números (copie do painel da Meta)." });
    if (token.length < 30) return res.status(400).json({ error: "Informe o token de acesso (de preferência um token permanente de usuário do sistema)." });

    // 1) Confere na Meta: o token vale, o número existe e pertence à conta informada.
    let info: any;
    try {
      info = (await axios.get(`${GRAPH}/${phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`, auth(token))).data;
      const lista = (await axios.get(`${GRAPH}/${wabaId}/phone_numbers?fields=id&limit=100`, auth(token))).data?.data || [];
      if (!lista.some((p: any) => String(p.id) === phoneNumberId)) return res.status(400).json({ error: "Esse número não pertence à conta do WhatsApp Business (WABA) informada." });
    } catch (e: any) {
      return res.status(400).json({ error: `A Meta recusou os dados: ${erroMeta(e)}` });
    }

    // 2) Um número (e uma conta) só pode estar ligado a uma empresa.
    const { data: doNumero } = await db.from(TABELA).select("*").eq("phone_number_id", phoneNumberId).maybeSingle();
    if (doNumero && doNumero.tenant_id !== tenantId) return res.status(409).json({ error: "Este número já está conectado em outra empresa." });
    const { data: daConta } = await db.from(TABELA).select("tenant_id, webhook_key, verify_token").eq("waba_id", wabaId).limit(1);
    if (daConta?.[0] && daConta[0].tenant_id !== tenantId) return res.status(409).json({ error: "Esta conta do WhatsApp Business já está conectada em outra empresa." });

    // 3) Instância do Chat (reaproveita a antiga do mesmo número, para não perder o histórico).
    const nomeInstancia = `Oficial: ${apelido || info.verified_name || info.display_phone_number || phoneNumberId}`.slice(0, 80);
    const telefone = String(info.display_phone_number || "");
    let instanceId: string | null = doNumero?.instance_id ?? null;
    if (!instanceId) {
      const { data: antiga } = await db.from("whatsapp_instances").select("id").eq("tenant_id", tenantId).eq("provider", "cloud_api").eq("phone", telefone).limit(1);
      instanceId = antiga?.[0]?.id ?? null;
    }
    if (instanceId) {
      await db.from("whatsapp_instances").update({ name: nomeInstancia, phone: telefone, status: "CONNECTED", updated_at: new Date().toISOString() }).eq("id", instanceId).eq("tenant_id", tenantId);
    } else {
      const { data: nova, error } = await db.from("whatsapp_instances").insert({ tenant_id: tenantId, name: nomeInstancia, phone: telefone, status: "CONNECTED", provider: "cloud_api" }).select("id").maybeSingle();
      if (error || !nova) { console.error("[whatsapp-oficial] instância:", error?.message); return res.status(500).json({ error: "Não foi possível criar a instância do número." }); }
      instanceId = nova.id;
    }

    const linha = {
      tenant_id: tenantId, instance_id: instanceId, apelido: apelido || null, phone_number_id: phoneNumberId, waba_id: wabaId, access_token: token,
      app_secret: appSecret, telefone, nome_verificado: info.verified_name ?? null, qualidade: info.quality_rating ?? null,
      webhook_key: daConta?.[0]?.webhook_key ?? randomBytes(24).toString("hex"), verify_token: daConta?.[0]?.verify_token ?? randomBytes(24).toString("hex"),
      updated_at: new Date().toISOString(),
    };
    const gravacao = doNumero
      ? await db.from(TABELA).update(linha).eq("id", doNumero.id).select().maybeSingle()
      : await db.from(TABELA).insert(linha).select().maybeSingle();
    if (gravacao.error || !gravacao.data) { console.error("[whatsapp-oficial] gravar:", gravacao.error?.message); return res.status(500).json({ error: "Não foi possível salvar o número." }); }

    // 4) Webhook automático.
    const wh = await assinarWebhook(db, urlPublica, gravacao.data);
    const { data: final } = await db.from(TABELA).select("*").eq("id", gravacao.data.id).maybeSingle();
    res.json({ numero: paraTela(final), aviso: wh.ok ? null : `Número salvo, mas a Meta não aceitou o webhook automático: ${wh.erro}` });
  });

  app.post("/api/whatsapp-oficial/numeros/:id/webhook", requireUser, limiter, async (req: any, res) => {
    const tenantId = await contexto(req, res, true);
    if (!tenantId) return;
    const numero = await doTenant(req, res, tenantId);
    if (!numero) return;
    const wh = await assinarWebhook(db, urlPublica, numero);
    if (!wh.ok) return res.status(502).json({ error: `A Meta não aceitou o webhook: ${wh.erro}` });
    res.json({ ok: true });
  });

  app.delete("/api/whatsapp-oficial/numeros/:id", requireUser, limiter, async (req: any, res) => {
    const tenantId = await contexto(req, res, true);
    if (!tenantId) return;
    const numero = await doTenant(req, res, tenantId);
    if (!numero) return;
    const { data: outros } = await db.from(TABELA).select("id").eq("waba_id", numero.waba_id).neq("id", numero.id).limit(1);
    // Só cancela a entrega da conta quando este era o último número dela. Falha na Meta não impede remover aqui.
    if (!outros?.length) await axios.delete(`${GRAPH}/${numero.waba_id}/subscribed_apps`, auth(numero.access_token)).catch((e) => console.warn("[whatsapp-oficial] cancelar assinatura:", erroMeta(e)));
    const { error } = await db.from(TABELA).delete().eq("id", numero.id);
    if (error) return res.status(500).json({ error: "Erro ao remover o número." });
    // A instância fica desconectada (não é apagada): apagar levaria junto o histórico das conversas.
    if (numero.instance_id) await db.from("whatsapp_instances").update({ status: "DISCONNECTED", updated_at: new Date().toISOString() }).eq("id", numero.instance_id).eq("tenant_id", tenantId);
    res.json({ ok: true });
  });
}
