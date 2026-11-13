/**
 * Nó "Salvar dados" do chatbot — executa a ação `save_data` que o motor (n8n) devolve.
 *
 * O workflow n8n chama POST /api/chatbot/save-data com o MESMO segredo de webhook da sessão do bot
 * (X-Webhook-Secret = whatsapp_instances.webhook_secret). O segredo identifica a sessão e, por ela,
 * o tenant: nada de tenant/registro vem do corpo da requisição.
 *
 * Gravadores por destino em SAVERS — para um destino novo: escreva o gravador aqui e liste os
 * campos em src/lib/chatbot/saveTargets.ts.
 *
 * Regras do destino "implementation": acha a implementação pelo número do contato (dentro do tenant
 * do bot); só preenche campo VAZIO (nunca sobrescreve); valor inválido é recusado e reportado;
 * a escrita só vale se ninguém alterou a implementação no meio (senão relê e refaz).
 */
import crypto from "node:crypto";
import type { Express, RequestHandler } from "express";
import { allFields, applyPatch, type ImplData } from "../src/lib/implementationForm.js";
import { isEmpty, validateField } from "../src/lib/chatbot/validateValue.js";
import { phoneKey } from "../src/lib/funnelIds.js";

type Sb = any;
interface MapEntry { field: string; variable: string }
interface SaveInput { tenantId: string; session: string; phone: string; map: MapEntry[]; vars: Record<string, string> }
interface SaveResult { ok: boolean; reason?: string; implementationId?: string; saved?: string[]; skipped?: string[]; rejected?: { field: string; reason: string }[] }

const safeEqual = (a: string, b: string) => {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

async function saveToImplementation(sb: Sb, a: SaveInput): Promise<SaveResult> {
  const key = phoneKey(a.phone);
  if (key.length < 8) return { ok: false, reason: "telefone_invalido" };

  // Implementações do tenant cujo cliente/contato/formulário usa esse número.
  const [{ data: impls }, { data: clientes }, { data: contatos }] = await Promise.all([
    sb.from("implementations").select("id, cliente_id, status, data").eq("tenant_id", a.tenantId).limit(5000),
    sb.from("clientes").select("id, phone").eq("tenant_id", a.tenantId).limit(5000),
    sb.from("cliente_contatos").select("cliente_id, telefone, whatsapp").eq("tenant_id", a.tenantId).limit(5000),
  ]);
  const clienteIds = new Set<string>();
  for (const c of clientes || []) if (c.phone && phoneKey(c.phone) === key) clienteIds.add(c.id);
  for (const c of contatos || []) if ((c.whatsapp && phoneKey(c.whatsapp) === key) || (c.telefone && phoneKey(c.telefone) === key)) clienteIds.add(c.cliente_id);
  const matches = (impls || []).filter((i: any) => clienteIds.has(i.cliente_id) || phoneKey(i.data?.resp_whatsapp) === key || phoneKey(i.data?.whats_numero) === key);
  const open = matches.filter((i: any) => i.status !== "Concluída");
  const pool = open.length ? open : matches;
  if (pool.length === 0) return { ok: false, reason: "implementacao_nao_encontrada" };
  if (pool.length > 1) return { ok: false, reason: "mais_de_uma_implementacao" };
  const implId = pool[0].id as string;

  const fields = new Map(allFields().map((f) => [f.id, f]));
  const saved: string[] = [], skipped: string[] = [], rejected: { field: string; reason: string }[] = [];

  for (let attempt = 0; attempt < 3; attempt++) {
    saved.length = 0; skipped.length = 0; rejected.length = 0;
    const { data: impl } = await sb.from("implementations").select("id, data, updated_at").eq("id", implId).eq("tenant_id", a.tenantId).maybeSingle();
    if (!impl) return { ok: false, reason: "implementacao_nao_encontrada" };
    const current: ImplData = impl.data || {};
    const patch: Record<string, any> = {};
    for (const m of a.map) {
      const field = fields.get(m.field);
      const raw = a.vars[m.variable];
      if (!field) { rejected.push({ field: m.field, reason: "campo desconhecido" }); continue; }
      if (isEmpty(raw)) continue; // variável não coletada
      if (!isEmpty(current[field.id])) { skipped.push(field.id); continue; } // nunca sobrescreve
      const v = validateField(field, raw);
      if (v.ok === false) { rejected.push({ field: field.id, reason: v.reason }); continue; }
      if (v.value !== undefined) patch[field.id] = v.value;
    }
    if (Object.keys(patch).length === 0) return { ok: true, implementationId: implId, saved: [], skipped, rejected };

    const upd = await sb.from("implementations").update({ data: applyPatch(current, patch) }).eq("id", implId).eq("tenant_id", a.tenantId).eq("updated_at", impl.updated_at).select("id");
    if (upd.error) return { ok: false, reason: "erro_ao_gravar" };
    if (!upd.data || upd.data.length === 0) continue; // alguém salvou no meio: relê e refaz
    saved.push(...Object.keys(patch));
    await sb.from("implementation_field_changes").insert(saved.map((id) => ({
      tenant_id: a.tenantId, implementation_id: implId, field_id: id, old_value: null, new_value: patch[id], source: "chatbot", chatbot_session: a.session,
    })));
    return { ok: true, implementationId: implId, saved, skipped, rejected };
  }
  return { ok: false, reason: "edicao_concorrente" };
}

const SAVERS: Record<string, (sb: Sb, a: SaveInput) => Promise<SaveResult>> = {
  implementation: saveToImplementation,
};

export function registerChatbotSaveRoutes(app: Express, { limiter, supabaseService }: { limiter: RequestHandler; supabaseService: Sb }) {
  app.post("/api/chatbot/save-data", limiter, async (req: any, res) => {
    try {
      if (!supabaseService) return res.status(503).json({ error: "Serviço indisponível." });
      const headerSecret = req.headers["x-webhook-secret"];
      const secret = typeof headerSecret === "string" ? headerSecret : "";
      const { session, target, map, vars, phone } = req.body ?? {};
      if (!secret || typeof session !== "string" || !session) return res.status(403).json({ error: "Não autorizado." });

      const { data: inst } = await supabaseService.from("whatsapp_instances").select("tenant_id, webhook_secret").eq("name", session).maybeSingle();
      if (!inst?.webhook_secret || !safeEqual(secret, inst.webhook_secret)) return res.status(403).json({ error: "Não autorizado." });

      const saver = typeof target === "string" ? SAVERS[target] : undefined;
      if (!saver) return res.status(400).json({ error: "Destino desconhecido." });
      if (!Array.isArray(map) || map.length === 0 || map.length > 60) return res.status(400).json({ error: "Mapeamento inválido." });
      const cleanVars: Record<string, string> = {};
      for (const [k, v] of Object.entries(vars && typeof vars === "object" ? vars : {})) if (typeof v === "string") cleanVars[k] = v.slice(0, 2000);
      const cleanMap: MapEntry[] = map.filter((m: any) => m && typeof m.field === "string" && typeof m.variable === "string").map((m: any) => ({ field: m.field, variable: m.variable }));

      const result = await saver(supabaseService, { tenantId: inst.tenant_id, session, phone: String(phone || cleanVars.telefone || ""), map: cleanMap, vars: cleanVars });
      if (!result.ok) console.warn("[chatbot/save-data]", session, result.reason);
      // 200 mesmo quando não gravou: o fluxo do bot segue; o motivo vai no corpo (n8n não precisa repetir).
      res.json(result);
    } catch (err: any) {
      console.error("[chatbot/save-data]", err?.message);
      res.status(500).json({ ok: false, reason: "erro_interno" });
    }
  });
}
