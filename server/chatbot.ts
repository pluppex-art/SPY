/**
 * Conexão de WhatsApp do chatbot por regras (sem IA) — cada bot tem uma sessão WAHA DEDICADA cujo
 * webhook aponta para o motor compartilhado no n8n ("[SPY] Chatbot - Motor (multi-tenant)",
 * webhook `spy-chatbot`).
 *
 * Segurança:
 * - O nome da sessão nunca vem do cliente: sai de `chatbots.whatsapp_session`, lido via client
 *   RLS-escopado do usuário (só enxerga bots do próprio tenant).
 * - Criar a sessão exige poder editar o bot (RLS de `chatbots`: admin do tenant ou master). A
 *   escrita em `chatbots` é feita ANTES de tocar no WAHA, com o client do usuário, justamente para
 *   a RLS barrar quem não é admin sem efeito colateral externo.
 * - Cada sessão ganha um segredo próprio (`whatsapp_instances.webhook_secret`) enviado pelo WAHA no
 *   header `X-Webhook-Secret`; o motor só processa a mensagem se o header bater. Sem isso, qualquer
 *   um que soubesse a URL do webhook poderia fazer o bot enviar mensagens a números arbitrários.
 * - O segredo nunca é devolvido ao frontend nem logado.
 */
import crypto from "node:crypto";
import type { Express, RequestHandler } from "express";
import { getWhatsAppProvider, isWahaConfigured } from "./whatsappProvider.js";

interface Deps {
  requireUser: RequestHandler;
  limiter: RequestHandler;
  supabaseService: any;
}

const CHATBOT_WEBHOOK_URL = process.env.N8N_CHATBOT_WEBHOOK_URL || "https://n8n.spycrm.com.br/webhook/spy-chatbot";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadVisibleBot(req: any, id: string) {
  if (!UUID.test(id)) return null;
  const { data, error } = await req.supabase
    .from("chatbots")
    .select("id, tenant_id, name, whatsapp_session")
    .eq("id", id)
    .maybeSingle();
  return error || !data ? null : data;
}

export function registerChatbotRoutes(app: Express, { requireUser, limiter, supabaseService }: Deps) {
  const syncStatus = async (session: string, status: string, phone?: string | null) => {
    if (!supabaseService || !["CONNECTED", "CONNECTING", "DISCONNECTED"].includes(status)) return;
    try {
      await supabaseService
        .from("whatsapp_instances")
        .update({ status, ...(status === "CONNECTED" && phone ? { phone } : {}), updated_at: new Date().toISOString() })
        .eq("name", session)
        .neq("status", status);
    } catch (err: any) {
      console.error("[chatbot/sync-status]", err?.message);
    }
  };

  // Cria (uma vez) a sessão WAHA dedicada do bot. Idempotente: se já existe, só devolve o nome.
  app.post("/api/chatbots/:id/whatsapp", requireUser, limiter, async (req: any, res) => {
    try {
      if (!isWahaConfigured()) return res.status(503).json({ error: "WhatsApp (WAHA) não está configurado neste ambiente." });
      if (!supabaseService) return res.status(503).json({ error: "Serviço indisponível." });
      const bot = await loadVisibleBot(req, req.params.id);
      if (!bot) return res.status(404).json({ error: "Chatbot não encontrado." });
      if (bot.whatsapp_session) return res.json({ session: bot.whatsapp_session, created: false });

      const provider = getWhatsAppProvider();
      if (!provider.createSessionWithConfig) return res.status(501).json({ error: "O provedor de WhatsApp atual não suporta sessões dedicadas." });

      const session = `chatbot-${bot.id.replace(/-/g, "").slice(0, 12)}`;
      const secret = crypto.randomBytes(32).toString("hex");

      // 1) Reserva o nome com o client do usuário: a RLS barra quem não é admin, sem tocar no WAHA.
      const { data: reserved, error: reserveErr } = await req.supabase
        .from("chatbots")
        .update({ whatsapp_session: session })
        .eq("id", bot.id)
        .is("whatsapp_session", null)
        .select("id");
      if (reserveErr || !reserved?.length) return res.status(403).json({ error: "Só o administrador da empresa pode conectar o WhatsApp do chatbot." });

      const rollback = async () => {
        await req.supabase.from("chatbots").update({ whatsapp_session: null }).eq("id", bot.id);
      };

      // 2) Linha em whatsapp_instances (o motor busca o segredo aqui) e 3) sessão no WAHA.
      const { error: instErr } = await supabaseService.from("whatsapp_instances").insert({
        tenant_id: bot.tenant_id,
        name: session,
        provider: "waha",
        status: "CONNECTING",
        webhook_secret: secret,
        webhook_url: CHATBOT_WEBHOOK_URL,
        ia_agent: "chatbot",
      });
      if (instErr) {
        console.error("[chatbot/whatsapp] insert instance", instErr.message);
        await rollback();
        return res.status(500).json({ error: "Não foi possível registrar a conexão do WhatsApp." });
      }

      try {
        await provider.createSessionWithConfig(session, {
          ignore: { status: true, groups: true, channels: true, broadcast: true },
          webhooks: [
            {
              url: CHATBOT_WEBHOOK_URL,
              events: ["message.any"],
              hmac: { key: null },
              retries: { delaySeconds: 2, attempts: 15, policy: "exponential" },
              customHeaders: [{ name: "X-Webhook-Secret", value: secret }],
            },
          ],
        });
      } catch (err: any) {
        console.error("[chatbot/whatsapp] waha create", err?.message);
        await supabaseService.from("whatsapp_instances").delete().eq("name", session);
        await rollback();
        return res.status(502).json({ error: "Não foi possível criar a conexão no WhatsApp agora. Tente de novo em instantes." });
      }

      res.status(201).json({ session, created: true });
    } catch (err: any) {
      console.error("[chatbot/whatsapp]", err?.message);
      res.status(500).json({ error: "Erro ao conectar o WhatsApp do chatbot." });
    }
  });

  app.get("/api/chatbots/:id/whatsapp", requireUser, limiter, async (req: any, res) => {
    try {
      const bot = await loadVisibleBot(req, req.params.id);
      if (!bot) return res.status(404).json({ error: "Chatbot não encontrado." });
      if (!bot.whatsapp_session) return res.json({ session: null });
      if (!isWahaConfigured()) return res.json({ session: bot.whatsapp_session, status: "UNKNOWN" });
      try {
        const state = await getWhatsAppProvider().getConnectionState(bot.whatsapp_session);
        await syncStatus(bot.whatsapp_session, state.status, state.phone);
        return res.json({ session: bot.whatsapp_session, status: state.status, phone: state.phone || null });
      } catch (err: any) {
        console.error("[chatbot/whatsapp] status", err?.message);
        return res.json({ session: bot.whatsapp_session, status: "UNKNOWN" });
      }
    } catch (err: any) {
      console.error("[chatbot/whatsapp] get", err?.message);
      res.status(500).json({ error: "Erro ao consultar o WhatsApp do chatbot." });
    }
  });

  app.post("/api/chatbots/:id/whatsapp/qr", requireUser, limiter, async (req: any, res) => {
    try {
      if (!isWahaConfigured()) return res.status(503).json({ error: "WhatsApp (WAHA) não está configurado neste ambiente." });
      const bot = await loadVisibleBot(req, req.params.id);
      if (!bot?.whatsapp_session) return res.status(404).json({ error: "Este chatbot ainda não tem uma conexão de WhatsApp." });
      const provider = getWhatsAppProvider();
      const state = await provider.getConnectionState(bot.whatsapp_session);
      await syncStatus(bot.whatsapp_session, state.status, state.phone);
      if (state.status === "CONNECTED") return res.json({ status: "CONNECTED", qrcode: "" });
      if (state.status === "DISCONNECTED" && provider.restartSession) {
        await provider.restartSession(bot.whatsapp_session);
        return res.status(202).json({ status: "CONNECTING", qrcode: "", retry: true });
      }
      res.json(await provider.getQrCode(bot.whatsapp_session));
    } catch (err: any) {
      console.error("[chatbot/whatsapp/qr]", err?.message);
      res.status(502).json({ error: "Não foi possível gerar o QR code agora. Tente de novo em alguns segundos." });
    }
  });
}
