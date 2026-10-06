// Central de Conexões — rotas do Google (Calendar + Tasks) sobre a conexão OAuth já existente
// (/api/google-calendar/connect/start e /oauth/callback seguem sendo a porta de entrada do login).
//
//   GET  /api/integrations/google/status      estado de cada serviço (nunca devolve token)
//   GET  /api/integrations/google/calendars   calendários da conta (identifica o principal)
//   POST /api/integrations/google/sync        sincroniza calendar e/ou tasks agora
//   GET  /api/integrations/google/runs        histórico das últimas sincronizações
//
// tenant vem de resolveTenantId (nunca do corpo da requisição) e user de req.user.id.
import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getValidAccessToken, resolveTenantId, NotConnectedError, ReauthRequiredError } from "./googleCalendar.js";
import { GOOGLE_PROVIDER, registerGoogleServices, type GoogleService } from "./integrationsRegistry.js";
import { listGoogleCalendars, syncGoogleCalendar, syncGoogleTasks, type IntegrationRow, type SyncResult, type SyncTrigger } from "./googleSync.js";

const SERVICES: GoogleService[] = ["calendar", "tasks"];
const RUNNING_STALE_MS = 5 * 60 * 1000; // uma sync "running" há mais que isso é considerada travada

export interface ServiceOutcome {
  service: GoogleService;
  ok: boolean;
  skipped?: string;
  result?: SyncResult;
  error?: string;
}

/** Sincroniza os serviços pedidos de UM usuário. Um serviço falhar não impede os outros. */
export async function runGoogleSync(
  supabase: SupabaseClient, tenantId: string, userId: string, services: GoogleService[], trigger: SyncTrigger,
): Promise<ServiceOutcome[]> {
  const { data: rows } = await supabase.from("integrations").select("*")
    .eq("tenant_id", tenantId).eq("user_id", userId).eq("provider", GOOGLE_PROVIDER).in("service", services);
  const byService = new Map<string, any>((rows ?? []).map((r: any) => [r.service, r]));
  const outcomes: ServiceOutcome[] = [];

  for (const service of services) {
    const integ = byService.get(service) as (IntegrationRow & { status: string; last_sync_status: string | null; updated_at: string }) | undefined;
    if (!integ) { outcomes.push({ service, ok: false, skipped: "not_connected" }); continue; }
    if (integ.status === "disconnected") { outcomes.push({ service, ok: false, skipped: "disconnected" }); continue; }
    if (integ.last_sync_status === "running" && Date.now() - new Date(integ.updated_at).getTime() < RUNNING_STALE_MS) {
      outcomes.push({ service, ok: false, skipped: "sync_in_progress" });
      continue;
    }
    try {
      const deps = {
        supabase,
        getToken: async () => {
          const { token, connection } = await getValidAccessToken(supabase, tenantId, userId);
          return { token, calendarId: connection.calendar_id || "primary" };
        },
      };
      const result = service === "calendar"
        ? await syncGoogleCalendar(deps, integ, trigger)
        : await syncGoogleTasks(deps, integ, trigger);
      outcomes.push({ service, ok: true, result });
    } catch (err: any) {
      const reauth = err instanceof ReauthRequiredError;
      outcomes.push({ service, ok: false, error: reauth ? "reauth_required" : String(err?.message ?? err).slice(0, 300) });
    }
  }
  return outcomes;
}

/** Gancho do callback OAuth: sincronização inicial dos serviços recém-conectados. */
export function makeInitialSync(supabase: SupabaseClient | null) {
  return async ({ tenantId, userId, services }: { tenantId: string; userId: string; services: string[] }) => {
    if (!supabase) return;
    const outcomes = await runGoogleSync(supabase, tenantId, userId, services.filter((s): s is GoogleService => (SERVICES as string[]).includes(s)), "connect");
    for (const o of outcomes) if (!o.ok) console.warn(`[google-sync] inicial ${o.service}:`, o.skipped ?? o.error);
  };
}

/**
 * Job agendado (sem usuário logado): para cada conexão Google ativa, renova o token de forma proativa
 * (mantém o refresh token "vivo" e detecta revogação cedo) e sincroniza Calendar + Tasks.
 * Processa em lotes limitados e respeita um orçamento de tempo para caber na função serverless.
 */
export async function runScheduledGoogleSync(supabase: SupabaseClient, budgetMs = 50_000) {
  const started = Date.now();
  const { data: conns } = await supabase.from("google_calendar_connections")
    .select("tenant_id, user_id, status").neq("status", "disconnected").neq("status", "requires_reauth")
    .order("updated_at", { ascending: true }).limit(200);
  const summary = { users: 0, ok: 0, failed: 0, reauth: 0, skippedByBudget: 0 };
  for (const c of conns ?? []) {
    if (Date.now() - started > budgetMs) { summary.skippedByBudget++; continue; }
    summary.users++;
    try {
      await getValidAccessToken(supabase, c.tenant_id, c.user_id); // renova se perto de expirar
      const outcomes = await runGoogleSync(supabase, c.tenant_id, c.user_id, SERVICES, "scheduled");
      if (outcomes.some(o => o.error === "reauth_required")) summary.reauth++;
      else if (outcomes.some(o => !o.ok && !o.skipped)) summary.failed++;
      else summary.ok++;
    } catch (err: any) {
      if (err instanceof ReauthRequiredError) summary.reauth++; else summary.failed++;
    }
  }
  return summary;
}

export function createGoogleIntegrationsRouter({ requireUser, supabaseService }: { requireUser: (req: any, res: any, next: any) => any; supabaseService: SupabaseClient | null }) {
  const router = Router();

  // Chamado pelo agendador (Vercel Cron envia "Authorization: Bearer $CRON_SECRET"). Sem segredo configurado, fica desligado.
  router.get("/cron", async (req: any, res) => {
    const secret = process.env.CRON_SECRET;
    if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: "unauthorized" });
    if (!supabaseService) return res.status(503).json({ error: "not_configured" });
    res.json(await runScheduledGoogleSync(supabaseService));
  });

  const ctx = async (req: any, res: any): Promise<{ tenantId: string; userId: string } | null> => {
    if (!supabaseService) { res.status(503).json({ error: "Integrações não configuradas no servidor." }); return null; }
    const t = await resolveTenantId(req);
    if ("error" in t) { res.status(t.status).json({ error: t.error }); return null; }
    if (!req.user?.id) { res.status(401).json({ error: "Não autenticado." }); return null; }
    return { tenantId: t.tenantId, userId: req.user.id };
  };

  router.get("/status", requireUser, async (req: any, res) => {
    const c = await ctx(req, res);
    if (!c) return;
    const { tenantId, userId } = c;
    try {
      // Quem conectou o Google ANTES desta central existir ainda não tem linha em `integrations`:
      // cria a do Calendar a partir da conexão existente (uma vez), sem pedir nada ao usuário.
      const { data: conn } = await supabaseService!.from("google_calendar_connections")
        .select("id, google_email, scope, status").eq("tenant_id", tenantId).eq("user_id", userId).maybeSingle();
      const { data: existing } = await supabaseService!.from("integrations").select("id")
        .eq("tenant_id", tenantId).eq("user_id", userId).eq("provider", GOOGLE_PROVIDER).limit(1);
      if (conn && conn.status === "active" && (!existing || existing.length === 0)) {
        await registerGoogleServices(supabaseService!, { tenantId, userId, email: conn.google_email, scope: conn.scope, credentialId: conn.id });
      }

      const { data: rows } = await supabaseService!.from("integrations")
        .select("id, service, status, account_email, scopes, last_sync_at, last_sync_status, last_sync_error, connected_at")
        .eq("tenant_id", tenantId).eq("user_id", userId).eq("provider", GOOGLE_PROVIDER);
      const byService = new Map<string, any>((rows ?? []).map((r: any) => [r.service, r]));
      const nowIso = new Date().toISOString();

      const services: Record<string, any> = {};
      for (const service of SERVICES) {
        const r = byService.get(service);
        if (!r) { services[service] = { enabled: false, status: "not_authorized" }; continue; }
        let counts: Record<string, number> | undefined;
        if (service === "calendar") {
          const { count } = await supabaseService!.from("google_calendar_events").select("id", { count: "exact", head: true })
            .eq("integration_id", r.id).neq("status", "cancelled");
          counts = { events: count ?? 0 };
        } else {
          const base = () => supabaseService!.from("google_tasks").select("id", { count: "exact", head: true }).eq("integration_id", r.id).eq("deleted", false);
          const [{ count: total }, { count: pending }, { count: overdue }] = await Promise.all([
            base(), base().neq("status", "completed"), base().neq("status", "completed").lt("due_at", nowIso),
          ]);
          counts = { tasks: total ?? 0, pending: pending ?? 0, overdue: overdue ?? 0 };
        }
        services[service] = {
          enabled: true, status: r.status, email: r.account_email, scopes: r.scopes,
          lastSyncAt: r.last_sync_at, lastSyncStatus: r.last_sync_status, lastError: r.last_sync_error,
          connectedAt: r.connected_at, counts,
        };
      }
      const anyConnected = Object.values(services).some((s: any) => s.enabled && s.status === "connected");
      const needsReauth = Object.values(services).some((s: any) => s.enabled && s.status === "needs_reauth");
      res.json({
        google: {
          connected: anyConnected,
          needsReauth,
          email: (rows ?? [])[0]?.account_email ?? conn?.google_email ?? null,
          // Conexão antiga sem o escopo do Tasks: o usuário precisa reautorizar para habilitar.
          tasksNeedsAuthorization: anyConnected && !services.tasks.enabled,
          services,
        },
      });
    } catch (err: any) {
      console.warn("[google-integrations] status:", err?.message);
      res.status(500).json({ error: "Falha ao consultar o estado das conexões." });
    }
  });

  router.get("/calendars", requireUser, async (req: any, res) => {
    const c = await ctx(req, res);
    if (!c) return;
    try {
      const { token } = await getValidAccessToken(supabaseService!, c.tenantId, c.userId);
      res.json({ calendars: await listGoogleCalendars(token) });
    } catch (err: any) {
      if (err instanceof NotConnectedError) return res.status(404).json({ error: "google_not_connected" });
      if (err instanceof ReauthRequiredError) return res.status(409).json({ error: "google_reauth_required" });
      res.status(502).json({ error: "Falha ao listar calendários do Google." });
    }
  });

  router.post("/sync", requireUser, async (req: any, res) => {
    const c = await ctx(req, res);
    if (!c) return;
    const asked = Array.isArray(req.body?.services) ? req.body.services : SERVICES;
    const services = SERVICES.filter(s => asked.includes(s));
    if (services.length === 0) return res.status(400).json({ error: "Informe services: ['calendar'] e/ou ['tasks']." });
    const outcomes = await runGoogleSync(supabaseService!, c.tenantId, c.userId, services, "manual");
    // 200 mesmo com falha parcial: o corpo diz o que deu certo em cada serviço.
    res.json({ outcomes });
  });

  router.get("/runs", requireUser, async (req: any, res) => {
    const c = await ctx(req, res);
    if (!c) return;
    const service = typeof req.query?.service === "string" ? req.query.service : null;
    const { data: integs } = await supabaseService!.from("integrations").select("id")
      .eq("tenant_id", c.tenantId).eq("user_id", c.userId).eq("provider", GOOGLE_PROVIDER);
    const ids = (integs ?? []).map((i: any) => i.id);
    if (ids.length === 0) return res.json({ runs: [] });
    let q = supabaseService!.from("integration_sync_runs")
      .select("id, service, trigger, status, started_at, finished_at, fetched, created, updated, removed, error")
      .in("integration_id", ids).order("started_at", { ascending: false }).limit(20);
    if (service) q = q.eq("service", service);
    const { data } = await q;
    res.json({ runs: data ?? [] });
  });

  return router;
}
