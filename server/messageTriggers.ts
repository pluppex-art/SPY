/**
 * Gatilhos de mensagem em linguagem natural (Fase 4 da customização de agentes, 2026-09-30).
 *
 * A interpretação (IA lendo a descrição e montando a lista de leads + mensagem sugerida) e a
 * execução (Júlia mandando as mensagens de verdade) rodam no n8n — este arquivo só é a ponte
 * autenticada entre o SPY e os dois webhooks correspondentes, igual ao padrão já usado em
 * server/tableComparisonN8n.ts. Nenhuma chave de IA nem lógica de negócio vive aqui.
 *
 * REGRA DE OURO (não mexer sem entender por quê): a linha só é processada de verdade pelo n8n
 * quando o status já é 'aprovado' — e só um admin do tenant consegue mudar o status pra isso
 * (RLS de tenant_message_triggers). Nenhuma mensagem real sai sem esse passo humano explícito.
 *
 * Config (segredos, nunca vão para o frontend nem para logs):
 *   N8N_INTERPRETAR_GATILHO_WEBHOOK_URL, N8N_EXECUTAR_GATILHO_WEBHOOK_URL, N8N_AGENT_WEBHOOK_KEY
 * Sem essas variáveis, as rotas abaixo respondem 503.
 */
import type { Express, RequestHandler } from "express";

interface Deps {
  requireUser: RequestHandler;
}

const TIMEOUT_MS = 60_000;

async function callN8nWebhook(url: string, key: string, payload: Record<string, unknown>): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-key": key },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`n8n respondeu HTTP ${res.status}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Confere, via o client RLS-escopado do próprio usuário, que ele enxerga esse gatilho antes de
 * acionar o n8n — não adianta bloquear só aqui (o n8n reconfirma tudo do lado dele também), mas
 * evita disparar processamento pra um id que esse usuário nem deveria conseguir ver. */
async function loadVisibleTrigger(supabase: any, id: string) {
  const { data, error } = await supabase
    .from("tenant_message_triggers")
    .select("id, status")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as { id: string; status: string };
}

export function registerMessageTriggerRoutes(app: Express, { requireUser }: Deps) {
  app.post("/api/message-triggers/:id/interpretar", requireUser, async (req: any, res) => {
    try {
      const trigger = await loadVisibleTrigger(req.supabase, req.params.id);
      if (!trigger) return res.status(404).json({ error: "Gatilho não encontrado." });

      const url = process.env.N8N_INTERPRETAR_GATILHO_WEBHOOK_URL;
      const key = process.env.N8N_AGENT_WEBHOOK_KEY;
      if (!url || !key) return res.status(503).json({ error: "Integração com o n8n não configurada." });

      await callN8nWebhook(url, key, { trigger_id: req.params.id });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[message-triggers/interpretar]", err?.message);
      res.status(502).json({ error: "Não foi possível interpretar o gatilho agora. Tente de novo em instantes." });
    }
  });

  app.post("/api/message-triggers/:id/executar", requireUser, async (req: any, res) => {
    try {
      const trigger = await loadVisibleTrigger(req.supabase, req.params.id);
      if (!trigger) return res.status(404).json({ error: "Gatilho não encontrado." });
      if (trigger.status !== "aprovado") {
        return res.status(409).json({ error: "Esse gatilho ainda não foi aprovado — aprove antes de executar." });
      }

      const url = process.env.N8N_EXECUTAR_GATILHO_WEBHOOK_URL;
      const key = process.env.N8N_AGENT_WEBHOOK_KEY;
      if (!url || !key) return res.status(503).json({ error: "Integração com o n8n não configurada." });

      await callN8nWebhook(url, key, { trigger_id: req.params.id });
      res.json({ ok: true });
    } catch (err: any) {
      console.error("[message-triggers/executar]", err?.message);
      res.status(502).json({ error: "Não foi possível executar o gatilho agora. Tente de novo em instantes." });
    }
  });
}
