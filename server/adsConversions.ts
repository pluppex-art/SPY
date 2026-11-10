import crypto from "node:crypto";
import type { Express } from "express";

// Conversões do CRM para a Meta (Conversions API), por empresa e sem enviar nada que a empresa não ligou.
// O banco avisa (trigger trg_ads_conversion) quando um lead fecha ou muda de etapa; aqui o servidor decide o evento:
//   - lead fechado            -> "Purchase" (com valor, BRL)
//   - lead chegou numa etapa "qualificada" -> "QualifiedLead" (nome configurável)
// Cada lead manda cada evento UMA vez (tabela ads_conversion_events, única por tenant+lead+plataforma+evento), com
// event_id estável para a Meta também deduplicar. Só vão dados de contato com hash SHA-256 (e-mail, telefone, nome...).
// O Google Ads recebe pelos webhooks de saída já existentes (n8n) — não há envio nativo ao Google nesta versão.

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const GRAPH = "https://graph.facebook.com/v19.0";

// Nomes das etapas dos funis padrão (usados quando a empresa nunca gravou funis).
const DEFAULT_STAGES: Record<string, string[]> = {
  "funil-comercial-default": ["Prospecção", "Qualificação", "Apresentação", "Negociação", "Fechamento", "Ganho", "Perdido", "Desqualificado"],
  "funil-sdr-ia-default": ["Triagem SDR", "Contato Efetuado", "Qualificação SDR", "Reunião Agendada", "Promovido Closer", "Ganho", "Perdido", "Desqualificado"],
};
const DEFAULT_SDR_HANDOFF = "Promovido Closer";

export interface CrmSyncCfg { enabled?: boolean; qualificado?: boolean; venda?: boolean; eventoQualificado?: string; etapasQualificadas?: string[]; testEventCode?: string }

const sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
const low = (v: unknown) => String(v ?? "").trim().toLowerCase();

export function normPhone(raw: unknown): string {
  let d = String(raw ?? "").replace(/\D/g, "").replace(/^0+/, "");
  if (d.length < 8 || d.length > 15) return "";
  if (d.length === 10 || d.length === 11) d = "55" + d;
  return d;
}

/** Etapa "qualificada": a escolhida pela empresa; senão a de entrega do funil SDR; senão pelo nome (Qualificado, Promovido, Reunião agendada). */
export function isQualifiedStage(stageName: string, funilTipo: string | null, sdrHandoff: string | null, custom: string[] = []): boolean {
  const n = low(stageName);
  if (!n) return false;
  const lista = (custom || []).map(low).filter(Boolean);
  if (lista.length) return lista.includes(n);
  if (funilTipo === "sdr_ia" && low(sdrHandoff) && low(sdrHandoff) === n) return true;
  if (/desqualific/.test(n)) return false;
  return /^qualificad[oa]s?\b/.test(n) || /promovido/.test(n) || /reuni[aã]o agendada/.test(n);
}

export function buildMetaEvent(lead: any, eventName: string, eventTimeMs: number): any | null {
  const em = low(lead.email).includes("@") ? low(lead.email) : "";
  const ph = normPhone(lead.mobile_wa) || normPhone(lead.phone);
  if (!em && !ph) return null; // a Meta não consegue ligar o evento a ninguém
  const nome = String(lead.name ?? "").trim().split(/\s+/);
  const user_data: Record<string, any> = { external_id: [sha(String(lead.id))], country: [sha("br")] };
  if (em) user_data.em = [sha(em)];
  if (ph) user_data.ph = [sha(ph)];
  if (nome[0]) user_data.fn = [sha(low(nome[0]))];
  if (nome.length > 1) user_data.ln = [sha(low(nome[nome.length - 1]))];
  if (lead.city) user_data.ct = [sha(low(lead.city).replace(/[^\p{L}\p{N}]/gu, ""))];
  if (/^[a-zA-Z]{2}$/.test(String(lead.state ?? "").trim())) user_data.st = [sha(low(lead.state))];
  const cf = lead.customFields || {};
  if (typeof cf.fbc === "string" && cf.fbc) user_data.fbc = cf.fbc;
  if (typeof cf.fbp === "string" && cf.fbp) user_data.fbp = cf.fbp;
  const custom_data: Record<string, any> = { event_source: "crm", lead_event_source: "S.P.Y. CRM" };
  if (eventName === "Purchase") { custom_data.value = Number(lead.value) || 0; custom_data.currency = "BRL"; }
  return {
    event_name: eventName,
    event_time: Math.floor(eventTimeMs / 1000),
    event_id: `${lead.id}:${eventName}`,
    action_source: "system_generated",
    user_data,
    custom_data,
  };
}

interface Deps { supabaseService: any; requireUser: any; resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>; limiter: any }

export function registerAdsConversionRoutes(app: Express, { supabaseService, requireUser, resolveRequestedTenantId, limiter }: Deps) {
  // Chamada interna do trigger do banco (mesmo segredo compartilhado das automações, no Vault).
  app.post("/api/ads/conversion", async (req: any, res: any) => {
    if (!supabaseService) return res.status(503).json({ error: "Serviço indisponível." });
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const { data: expectedRaw } = await supabaseService.rpc("get_automation_internal_secret" as any);
    const a = Buffer.from(token), b = Buffer.from(String(expectedRaw || ""));
    if (!b.length || a.length !== b.length || !crypto.timingSafeEqual(a, b)) return res.status(401).json({ error: "Não autorizado." });

    const { tenantId, leadId, kind } = req.body || {};
    if (!UUID.test(String(tenantId)) || !UUID.test(String(leadId)) || (kind !== "closed" && kind !== "stage")) return res.status(400).json({ error: "Dados inválidos." });
    const skip = (reason: string) => res.json({ ok: true, skipped: reason });

    try {
      const { data: setting } = await supabaseService.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", "integracoes_meta_ads").maybeSingle();
      const meta = setting?.value || {};
      const cfg: CrmSyncCfg = meta.crmSync || {};
      if (cfg.enabled !== true) return skip("desligado");
      const pixelId = String(meta.pixelId || "").trim(), accessToken = String(meta.capiToken || "").trim();
      if (!/^\d{5,20}$/.test(pixelId) || !accessToken) return skip("pixel ou token ausente");

      const { data: lead } = await supabaseService.from("leads")
        .select("id, tenant_id, name, email, phone, mobile_wa, city, state, value, status, stageId, closed_at, customFields")
        .eq("id", leadId).eq("tenant_id", tenantId).is("deleted_at", null).maybeSingle();
      if (!lead) return skip("lead não encontrado");

      let eventName: string | null = null;
      let when = Date.now();
      if (kind === "closed") {
        if (cfg.venda === false || lead.status !== "Fechado") return skip("venda desligada");
        eventName = "Purchase";
        if (lead.closed_at) when = Date.parse(lead.closed_at) || when;
      } else {
        if (cfg.qualificado === false || lead.status === "Fechado") return skip("qualificação desligada");
        const { data: funis } = await supabaseService.from("crm_funis").select("id, tipo, etapas, sdr_etapa_handoff").eq("tenant_id", tenantId);
        const lista: any[] = funis && funis.length ? funis : Object.entries(DEFAULT_STAGES).map(([id, etapas]) => ({ id, tipo: id.includes("sdr") ? "sdr_ia" : "comercial", etapas, sdr_etapa_handoff: id.includes("sdr") ? DEFAULT_SDR_HANDOFF : null }));
        let stageName = "", tipo: string | null = null, handoff: string | null = null;
        for (const f of lista) {
          const etapas: string[] = Array.isArray(f.etapas) ? f.etapas : [];
          for (let i = 0; i < etapas.length; i++) {
            const id = f.id === "funil-comercial-default" ? String(i + 1) : f.id === "funil-sdr-ia-default" ? `sdr-${i + 1}` : `${f.id}-${i}`;
            if (id === lead.stageId) { stageName = etapas[i]; tipo = f.tipo; handoff = f.sdr_etapa_handoff; }
          }
        }
        if (!isQualifiedStage(stageName, tipo, handoff, cfg.etapasQualificadas)) return skip("etapa não é de qualificação");
        eventName = String(cfg.eventoQualificado || "QualifiedLead").replace(/[^A-Za-z0-9_]/g, "").slice(0, 50) || "QualifiedLead";
      }

      const ev = buildMetaEvent(lead, eventName, when);
      if (!ev) { await claim(supabaseService, tenantId, leadId, eventName, "skipped", "lead sem e-mail nem telefone"); return skip("lead sem e-mail nem telefone"); }

      // Reserva o envio (uma vez por lead e evento). Falhas anteriores podem ser reenviadas.
      const reserved = await claim(supabaseService, tenantId, leadId, eventName, "sending", null, true);
      if (!reserved) return skip("já enviado");

      const payload: any = { data: [ev] };
      if (cfg.testEventCode) payload.test_event_code = String(cfg.testEventCode).slice(0, 40);
      let status = "sent", detail: string | null = null;
      try {
        const r = await fetch(`${GRAPH}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10_000),
        });
        const j: any = await r.json().catch(() => ({}));
        if (!r.ok) { status = "failed"; detail = String(j?.error?.message || `HTTP ${r.status}`).replace(accessToken, "***").slice(0, 300); }
        else detail = `events_received=${j?.events_received ?? "?"}`;
      } catch (e: any) { status = "failed"; detail = String(e?.message || e).replace(accessToken, "***").slice(0, 300); }
      await supabaseService.from("ads_conversion_events").update({ status, detail, updated_at: new Date().toISOString() })
        .eq("tenant_id", tenantId).eq("lead_id", leadId).eq("platform", "meta").eq("event_name", eventName);
      return res.json({ ok: status === "sent", event: eventName, status });
    } catch (e: any) {
      console.error("[ads/conversion]", e?.message);
      return res.status(500).json({ error: "Falha ao processar a conversão." });
    }
  });

  // Últimos envios da empresa (transparência na tela de integração).
  app.get("/api/ads/conversion-log", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return res.status(503).json({ error: "Serviço indisponível." });
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const { data } = await supabaseService.from("ads_conversion_events").select("lead_id, event_name, status, detail, created_at")
      .eq("tenant_id", tenantId).eq("platform", "meta").order("created_at", { ascending: false }).limit(20);
    const count = async (status: string) => (await supabaseService.from("ads_conversion_events").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("platform", "meta").eq("status", status)).count || 0;
    const [sent, failed] = await Promise.all([count("sent"), count("failed")]);
    res.json({ sent, failed, recent: data || [] });
  });
}

/** Grava/reserva o evento do lead. Com `takeOver`, retoma uma linha 'failed' (reenvio); devolve false se já foi enviado/está enviando. */
async function claim(db: any, tenantId: string, leadId: string, eventName: string, status: string, detail: string | null, takeOver = false): Promise<boolean> {
  const row = { tenant_id: tenantId, lead_id: leadId, platform: "meta", event_name: eventName, status, detail };
  const { error } = await db.from("ads_conversion_events").insert(row);
  if (!error) return true;
  if (!takeOver) return false;
  const { data } = await db.from("ads_conversion_events").update({ status, detail, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId).eq("lead_id", leadId).eq("platform", "meta").eq("event_name", eventName).in("status", ["failed", "skipped"]).select("id");
  return !!data?.length;
}
