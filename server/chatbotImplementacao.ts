/**
 * "Iniciar implementação" pelo chatbot — caminho comercial. A EQUIPE informa o WhatsApp do cliente e o nome da
 * empresa; o servidor cadastra o cliente + a implementação (se ainda não existirem), manda a abertura pelo número
 * exclusivo do chatbot e deixa a conversa pronta: quando o cliente responder, o motor (n8n) segue de onde parou.
 *
 * Por que só a equipe inicia: o nó "Salvar dados" só grava (e só cria o ambiente) para um número que já tem
 * implementação cadastrada. Assim, ninguém que descubra o número do chatbot consegue criar empresa sozinho.
 *
 * Segurança: só admin do tenant ou master; o bot, o cliente e a implementação são lidos/gravados com o client do
 * usuário (RLS por tenant); a sessão WhatsApp vem do bot (nunca do corpo da requisição).
 */
import { randomUUID } from "node:crypto";
import type { Express, RequestHandler } from "express";
import { runChatbot } from "../src/lib/chatbot/engine.js";
import { normalizePhone } from "../src/lib/chatbot/validateValue.js";
import { findImplementation, buildContextVars } from "./chatbotSave.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ProviderLike {
  getConnectionState(session: string): Promise<{ status: string }>;
  sendTextMessage(session: string, phone: string, text: string): Promise<unknown>;
}
export interface StartDeps {
  requireUser: RequestHandler;
  limiter: RequestHandler;
  supabaseService: any;
  wahaConfigured: () => boolean;
  getProvider: () => ProviderLike;
}

export function registerChatbotImplementationStart(app: Express, deps: StartDeps) {
  const { requireUser, limiter, supabaseService } = deps;

  app.post("/api/chatbots/:id/iniciar-implementacao", requireUser, limiter, async (req: any, res) => {
    try {
      if (!supabaseService) return res.status(503).json({ error: "Serviço indisponível." });
      if (!UUID.test(req.params.id)) return res.status(404).json({ error: "Chatbot não encontrado." });
      const { data: caller } = await req.supabase.from("users").select("is_master, is_tenant_admin").eq("id", req.user.id).maybeSingle();
      if (!caller?.is_master && !caller?.is_tenant_admin) return res.status(403).json({ error: "Só administradores podem iniciar uma implementação." });

      const { data: bot } = await req.supabase.from("chatbots").select("id, tenant_id, name, active, whatsapp_session, flow, settings").eq("id", req.params.id).maybeSingle();
      if (!bot) return res.status(404).json({ error: "Chatbot não encontrado." });
      const temSalvar = Object.values<any>(bot.flow?.nodes ?? {}).some((n) => n?.type === "save_data" && n?.target === "implementation");
      if (!temSalvar) return res.status(400).json({ error: "Este chatbot não tem o passo \"Salvar dados\" da implementação." });
      if (!bot.whatsapp_session) return res.status(409).json({ error: "Conecte o WhatsApp deste chatbot antes de iniciar." });
      if (!bot.active) return res.status(409).json({ error: "Ative o chatbot antes de iniciar uma implementação — senão ele não responde ao cliente." });

      const phone = normalizePhone(String(req.body?.whatsapp ?? ""));
      if (!phone) return res.status(400).json({ error: "WhatsApp inválido. Informe com DDD (ex.: 63 99999-8888)." });
      const empresa = String(req.body?.empresa ?? "").trim().slice(0, 200);

      if (!deps.wahaConfigured()) return res.status(503).json({ error: "WhatsApp (WAHA) não está configurado neste ambiente." });
      const provider = deps.getProvider();
      const state = await provider.getConnectionState(bot.whatsapp_session);
      if (state.status !== "CONNECTED") return res.status(409).json({ error: "O WhatsApp deste chatbot não está conectado. Conecte pelo QR code nas configurações do chatbot." });

      // Conversa já em andamento com esse número: não abre outra por cima.
      const { data: sess } = await supabaseService.from("chatbot_sessions").select("id, status").eq("chatbot_id", bot.id).eq("tenant_id", bot.tenant_id).eq("phone_digits", phone).maybeSingle();
      if (sess?.status === "active") return res.status(409).json({ error: "Já existe uma conversa em andamento com esse número." });
      if (sess?.status === "handoff") return res.status(409).json({ error: "Um atendente assumiu a conversa com esse número." });

      // Cliente + implementação: reaproveita o que existir (por telefone), senão cadastra agora.
      let implementationId: string; let criado = false; let clienteCriado: string | null = null;
      const found = await findImplementation(req.supabase, bot.tenant_id, phone);
      if (found.ok) {
        const { data: impl } = await req.supabase.from("implementations").select("id, linked_tenant_id").eq("id", found.id).eq("tenant_id", bot.tenant_id).maybeSingle();
        if (!impl) return res.status(404).json({ error: "Implementação não encontrada." });
        if (impl.linked_tenant_id) return res.status(409).json({ error: "Este cliente já tem ambiente criado — não precisa implementar de novo." });
        implementationId = impl.id;
      } else if ((found as { reason: string }).reason === "mais_de_uma_implementacao") {
        return res.status(409).json({ error: "Há mais de uma implementação com esse número. Resolva a duplicidade em Implementações antes de iniciar." });
      } else if ((found as { reason: string }).reason === "implementacao_nao_encontrada") {
        if (empresa.length < 2) return res.status(400).json({ error: "Número novo: informe o nome da empresa para cadastrar o cliente." });
        const clienteId = randomUUID();
        const { error: cErr } = await req.supabase.from("clientes").insert({ id: clienteId, tenant_id: bot.tenant_id, name: empresa, phone, status: "Em Implantação" });
        if (cErr) { console.error("[chatbot/iniciar] cliente:", cErr.message); return res.status(500).json({ error: "Não foi possível cadastrar o cliente." }); }
        clienteCriado = clienteId;
        const { data: nova, error: iErr } = await req.supabase.from("implementations").insert({
          tenant_id: bot.tenant_id, cliente_id: clienteId, status: "Em andamento", responsavel: bot.name,
          data: { nome_fantasia: empresa, resp_whatsapp: phone },
        }).select("id").maybeSingle();
        if (iErr || !nova) {
          console.error("[chatbot/iniciar] implementação:", iErr?.message);
          await req.supabase.from("clientes").delete().eq("id", clienteId).eq("tenant_id", bot.tenant_id);
          return res.status(500).json({ error: "Não foi possível criar a implementação." });
        }
        implementationId = nova.id; criado = true;
      } else {
        return res.status(400).json({ error: "WhatsApp inválido." });
      }

      // Abertura: roda o MESMO motor do n8n a partir do zero, já sabendo o que o SPY tem do cliente.
      const seed = await buildContextVars(supabaseService, bot.tenant_id, bot.name, phone);
      const first = runChatbot({ flow: bot.flow, settings: bot.settings, session: null, text: "oi", phone, now: Date.now(), seed });
      const textos = first.actions.filter((a) => a.kind === "send_text").map((a: any) => String(a.text));
      if (textos.length === 0) return res.status(400).json({ error: "O fluxo do chatbot não tem mensagem inicial." });
      try {
        for (const t of textos) await provider.sendTextMessage(bot.whatsapp_session, phone, t);
      } catch (err: any) {
        console.error("[chatbot/iniciar] envio:", err?.message);
        return res.status(502).json({ error: "Não consegui enviar a mensagem pelo WhatsApp agora. O cliente ficou cadastrado; tente iniciar de novo em instantes.", implementationId });
      }

      const row = {
        tenant_id: bot.tenant_id, chatbot_id: bot.id, phone_digits: phone, chat_id: `${phone}@c.us`,
        current_node: first.session.current_node, vars: first.session.vars, status: first.session.status, last_input_at: new Date().toISOString(),
      };
      const { error: sErr } = sess
        ? await supabaseService.from("chatbot_sessions").update(row).eq("id", sess.id).eq("tenant_id", bot.tenant_id)
        : await supabaseService.from("chatbot_sessions").insert(row);
      if (sErr) console.error("[chatbot/iniciar] sessão:", sErr.message); // a mensagem já foi; se a sessão falhar, o cliente reinicia o fluxo ao responder

      res.status(201).json({ ok: true, implementationId, clienteCriado: !!clienteCriado, implementacaoCriada: criado, mensagensEnviadas: textos.length });
    } catch (err: any) {
      console.error("[chatbot/iniciar]", err?.message);
      res.status(500).json({ error: "Não foi possível iniciar a implementação agora." });
    }
  });
}
