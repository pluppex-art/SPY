/**
 * Liga e desliga, separadamente, os dois Agentes Secretos de uma pessoa. Os dois usam a mesma sessão de WhatsApp:
 * desligar tira só a entrega de mensagens daquele agente (o webhook dele), sem derrubar o login nem mexer no outro.
 * Ao desligar o de Vendas, o webhook retirado é guardado em app_settings para voltar igual; sem ele, copia de uma sessão modelo da empresa.
 */
import type express from "express";
import { comWebhookInterno, comWebhookVendas, semWebhookInterno, semWebhookVendas, temWebhookInterno, urlWebhookInterno, webhooksVendas } from "./sessaoAgentes.js";
import { sessoesModelo } from "./agenteSecretoModelo.js";
import { isVendedorColab } from "../src/lib/sellers.js";

export type Agente = "vendas" | "interno";
/** Prefixo "integracoes_": a regra do banco trata como configuração de integração. */
export const chaveVendasDesligado = (instanceId: string) => `integracoes_agente_vendas_off_${instanceId}`;

export interface Pedido {
  db: any; service: any; provider: any; appUrl: string;
  tenant: { id: string; modules?: Record<string, unknown> | null };
  colab: { id: string; [k: string]: unknown };
  instancia: { id: string; name: string; webhook_url?: string | null; webhook_secret: string };
  agente: Agente; ligado: boolean;
}
export type Resultado = { ok: true; mudou: boolean } | { ok: false; status: number; erro: string };

async function webhooksParaLigar(p: Pedido): Promise<any[]> {
  const { data: guardado } = await p.service.from("app_settings").select("value").eq("tenant_id", p.tenant.id).eq("key", chaveVendasDesligado(p.instancia.id)).maybeSingle();
  if (Array.isArray(guardado?.value?.webhooks) && guardado.value.webhooks.length) return guardado.value.webhooks;
  const { data: sessoes } = await p.db.from("whatsapp_instances").select("name, webhook_url, colaborador_id").eq("tenant_id", p.tenant.id).eq("finalidade", "vendas").limit(60);
  for (const m of sessoesModelo((sessoes || []).filter((s: any) => s.name !== p.instancia.name))) {
    try {
      const achados = webhooksVendas(await p.provider.getSessionConfig(m.name));
      if (achados.length) return achados;
    } catch { /* tenta o próximo modelo */ }
  }
  return p.instancia.webhook_url ? [{ url: p.instancia.webhook_url }] : [];
}

export async function ligarOuDesligarAgente(p: Pedido): Promise<Resultado> {
  const { agente, ligado, instancia, provider } = p;
  if (ligado) {
    const modulo = agente === "interno" ? "agente_interno" : "agente_secreto";
    if (p.tenant.modules?.[modulo] !== true) return { ok: false, status: 403, erro: `O Agente Secreto ${agente === "interno" ? "Interno" : "de Vendas"} não está contratado para esta empresa.` };
    if (agente === "vendas" && !isVendedorColab(p.colab as any)) return { ok: false, status: 409, erro: "O Agente Secreto de Vendas vale só para quem é de vendas (vendedor, closer, SDR, comercial)." };
  }
  const atual = await provider.getSessionConfig(instancia.name);
  if (!atual) return { ok: false, status: 502, erro: "Não consegui ler a configuração desta sessão. Nada foi alterado." };
  const estaLigado = agente === "interno" ? temWebhookInterno(atual, instancia.id) : webhooksVendas(atual).length > 0;
  if (estaLigado === ligado) return { ok: true, mudou: false };

  let nova: Record<string, any>;
  if (agente === "interno") {
    nova = ligado ? comWebhookInterno(atual, urlWebhookInterno(p.appUrl, instancia.id, instancia.webhook_secret), instancia.id) : semWebhookInterno(atual, instancia.id);
  } else if (ligado) {
    const doN8n = await webhooksParaLigar(p);
    if (!doN8n.length) return { ok: false, status: 409, erro: "Não encontrei o webhook do Agente Secreto de Vendas desta empresa para religar." };
    nova = comWebhookVendas(atual, doN8n);
  } else {
    // Guarda antes de tirar: se não der para guardar, não desliga (para nunca perder o webhook).
    const { error } = await p.service.from("app_settings").upsert(
      { tenant_id: p.tenant.id, key: chaveVendasDesligado(instancia.id), value: { webhooks: webhooksVendas(atual), desligadoEm: new Date().toISOString() } },
      { onConflict: "tenant_id,key" },
    );
    if (error) { console.error("[agente-secreto/ligar] guardar webhook", error.message); return { ok: false, status: 500, erro: "Não foi possível desligar agora. Nada foi alterado." }; }
    nova = semWebhookVendas(atual);
  }
  await provider.updateSessionConfig(instancia.name, nova);
  return { ok: true, mudou: true };
}

type Deps = { requireUser: any; limiter: any; supabaseService: any; appUrl: string; provider: () => any; configurado: () => boolean; ehAdmin: (req: any) => Promise<boolean> };

export function registrarRotasLigarAgentes(app: express.Express, d: Deps) {
  app.post("/api/agente-secreto/sessoes/:colaboradorId/agente", d.requireUser, d.limiter, async (req: any, res) => {
    const colaboradorId = String(req.params.colaboradorId || "");
    const agente = req.body?.agente, ligado = req.body?.ligado;
    if (!/^[\w-]{1,64}$/.test(colaboradorId)) return res.status(400).json({ error: "colaboradorId inválido." });
    if ((agente !== "vendas" && agente !== "interno") || typeof ligado !== "boolean") return res.status(400).json({ error: "Pedido inválido." });
    try {
      if (!(await d.ehAdmin(req))) return res.status(403).json({ error: "Apenas administradores podem ligar ou desligar os Agentes Secretos." });
      const provider = d.provider();
      if (!d.configurado() || !provider.getSessionConfig || !provider.updateSessionConfig) return res.status(503).json({ error: "WhatsApp (WAHA) não está configurado neste ambiente." });
      if (!d.supabaseService) return res.status(503).json({ error: "Servidor sem acesso ao banco." });
      // Colaborador e sessão lidos com o acesso do próprio usuário: a regra do banco limita à empresa dele.
      const { data: colab } = await req.supabase.from("colaboradores").select("id, nome, tenant_id, departamento, cargo, cargos, status").eq("id", colaboradorId).maybeSingle();
      if (!colab) return res.status(404).json({ error: "Colaborador não encontrado." });
      const { data: tenant } = await req.supabase.from("tenants").select("id, modules").eq("id", colab.tenant_id).maybeSingle();
      if (!tenant) return res.status(404).json({ error: "Empresa não encontrada." });
      const { data: inst } = await req.supabase.from("whatsapp_instances").select("id, name, webhook_url, webhook_secret").eq("colaborador_id", colab.id).eq("finalidade", "vendas").limit(1);
      if (!inst?.[0]) return res.status(404).json({ error: "Esta pessoa ainda não tem sessão de WhatsApp." });
      const r = await ligarOuDesligarAgente({ db: req.supabase, service: d.supabaseService, provider, appUrl: d.appUrl, tenant, colab, instancia: inst[0], agente, ligado });
      if (r.ok === false) return res.status(r.status).json({ error: r.erro });
      res.json({ ok: true, mudou: r.mudou, agente, ligado });
    } catch (e: any) {
      console.error("[agente-secreto/ligar]", e?.response?.status, e?.message);
      res.status(502).json({ error: "Não foi possível ligar ou desligar o agente agora." });
    }
  });
}
