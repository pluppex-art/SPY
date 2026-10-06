// Integração Google Calendar — server-side, multi-tenant.
//
// Regra de segurança: tenant_id autenticado → conexão Google daquele tenant
// → calendário daquele tenant. Nunca o inverso (browser → token global →
// Google). Nenhum access_token/refresh_token sai deste arquivo em direção
// ao frontend — toda resposta HTTP daqui é serializada explicitamente,
// nunca é `res.json(connectionRow)` direto (isso vazaria os tokens).
//
// tenant_id e user_id nunca vêm de query string/body do cliente para as
// operações que importam (connect/disconnect/events/sync): tenant_id vem de
// current_tenant_id() (RPC, deriva de auth.uid() no lado do banco) ou, para
// master/parceiro trocando de tenant (switchTenant no frontend), do header
// x-active-tenant-id — mas só é aceito depois de validado via
// has_tenant_access() (RPC), nunca confiado cegamente. user_id vem sempre de
// req.user.id, que o middleware requireUser (server.ts) já validou contra o
// Supabase Auth.

import { Router } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "crypto";
import { registerGoogleServices, markGoogleIntegrations } from "./integrationsRegistry.js";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const GOOGLE_OAUTH_REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI || "";
// Fallback pro service role key só pra não quebrar se a env dedicada não
// existir ainda — mas o ideal é configurar GOOGLE_OAUTH_STATE_SECRET própria
// (rotacionável sem afetar o acesso ao banco).
const STATE_SECRET = process.env.GOOGLE_OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "axis-state-secret";
const SUCCESS_ORIGIN = process.env.GOOGLE_OAUTH_SUCCESS_ORIGIN || process.env.APP_URL || (process.env.SPY_CORS_ORIGIN || process.env.AXIS_CORS_ORIGIN || "").split(",")[0]?.trim() || "https://axis-crm.pluppex.com.br";

// O Google exige que o redirect_uri seja IDÊNTICO entre a chamada que abre o
// consentimento (/connect/start) e a troca do código por token
// (/oauth/callback) — um só que fosse derivado da requisição (req.protocol +
// req.get("host")) e o outro de env vars já causou token_exchange_failed
// mesmo com client_id/secret corretos, porque os dois valores nem sempre
// batiam. Uma função só, usada nos dois lugares, elimina esse risco.
function getRedirectUri(): string {
  if (GOOGLE_OAUTH_REDIRECT_URI) return GOOGLE_OAUTH_REDIRECT_URI;
  return `${SUCCESS_ORIGIN}/api/google-calendar/oauth/callback`;
}

const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/meetings.space.created",
  "https://www.googleapis.com/auth/tasks.readonly",
  "email",
  "profile",
].join(" ");

const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_SKEW_MS = 2 * 60 * 1000;

interface StatePayload {
  tenantId: string;
  userId: string;
  returnTo: string;
  nonce: string;
  exp: number;
}

export interface ConnectionRow {
  id: string;
  tenant_id: string;
  user_id: string;
  google_email: string | null;
  access_token: string | null;
  refresh_token: string | null;
  access_token_expires_at: string | null;
  scope: string | null;
  status: string;
  calendar_id: string;
  last_error: string | null;
  connected_at: string | null;
  disconnected_at: string | null;
  last_sync_at: string | null;
}

export class NotConnectedError extends Error {}
export class ReauthRequiredError extends Error {}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function signState(payload: StatePayload): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", STATE_SECRET).update(b64).digest("base64url");
  return `${b64}.${sig}`;
}

function verifyState(state: string | undefined): StatePayload | null {
  if (!state) return null;
  const dot = state.lastIndexOf(".");
  if (dot === -1) return null;
  const b64 = state.slice(0, dot);
  const sig = state.slice(dot + 1);
  const expected = createHmac("sha256", STATE_SECRET).update(b64).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload: StatePayload = JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
    if (!payload?.tenantId || !payload?.userId || !payload?.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function sanitizeReturnTo(raw: unknown): string {
  const value = typeof raw === "string" ? raw : "";
  // Só caminhos relativos same-origin — nunca um redirect pra fora do site
  // (o state é assinado e à prova de adulteração, mas o valor de returnTo é
  // escolhido no /connect/start a partir de um parâmetro do cliente, então
  // precisa ser validado ali, antes de entrar no state).
  if (/^\/[a-zA-Z0-9\-_/]*$/.test(value)) return value;
  return "/agenda";
}

// Nunca loga tokens — só metadados (tenant, ator, ação, contadores/erros de
// texto). Reaproveita aurora_audit_log (já existe, já tem RLS/grants
// fechados pra anon/authenticated — ver 20260903_close_open_rls_policies.sql).
export async function logAudit(
  supabaseService: SupabaseClient,
  params: { tenantId: string; actor: string; action: string; details?: Record<string, unknown> }
) {
  try {
    await supabaseService.from("aurora_audit_log").insert({
      tenant_id: params.tenantId,
      actor: params.actor,
      action: params.action,
      details: params.details ?? {},
    });
  } catch (err: any) {
    console.error("[google-calendar] falha ao gravar audit log:", err?.message);
  }
}

// Resolve o tenant ativo da requisição. Nunca confia num tenantId de
// query/body — só aceita o header x-active-tenant-id (usado por
// master/parceiro após switchTenant) depois de validar via has_tenant_access
// (RPC, roda no banco com a sessão real do chamador). Sem o header, ou se a
// validação falhar, cai no tenant "de casa" do usuário (current_tenant_id).
export async function resolveTenantId(req: any): Promise<{ tenantId: string } | { error: string; status: number }> {
  try {
    const requested = (req.header("x-active-tenant-id") || "").trim();
    let ownTenantId: string | null = null;
    if (req.supabase?.rpc) {
      try {
        const { data, error } = await req.supabase.rpc("current_tenant_id");
        if (!error && data) ownTenantId = String(data);
      } catch {}
    }
    if (!ownTenantId) {
      ownTenantId = req.user?.app_metadata?.tenant_id || req.user?.user_metadata?.tenant_id || null;
    }

    if (requested) {
      if (requested === ownTenantId) return { tenantId: requested };
      if (!ownTenantId) return { error: "Tenant não resolvido para o usuário.", status: 403 };
      if (req.supabase?.rpc) {
        try {
          const { data: allowed, error: accessErr } = await req.supabase.rpc("has_tenant_access", { target_tenant_id: requested });
          if (!accessErr && allowed === true) return { tenantId: requested };
        } catch {}
      }
      return { error: "Sem acesso ao tenant solicitado.", status: 403 };
    }

    if (ownTenantId) return { tenantId: ownTenantId };
    return { tenantId: "default" };
  } catch (err: any) {
    console.warn("[google-calendar] resolveTenantId fallback:", err?.message);
    return { error: "Não foi possível resolver o tenant.", status: 500 };
  }
}

async function getConnection(supabaseService: SupabaseClient, tenantId: string, userId: string): Promise<ConnectionRow | null> {
  try {
    const { data, error } = await supabaseService
      .from("google_calendar_connections")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.warn("[google-calendar] getConnection query notice:", error.message);
      return null;
    }
    return (data as ConnectionRow) ?? null;
  } catch (err: any) {
    console.warn("[google-calendar] getConnection error:", err?.message);
    return null;
  }
}

async function refreshAccessToken(
  supabaseService: SupabaseClient,
  connection: ConnectionRow
): Promise<string> {
  if (!connection.refresh_token) {
    await supabaseService.from("google_calendar_connections").update({
      status: "requires_reauth",
      last_error: "Sem refresh_token — reconexão necessária.",
    }).eq("id", connection.id);
    await markGoogleIntegrations(supabaseService, connection.tenant_id, connection.user_id, "needs_reauth", "Sem refresh_token — reconexão necessária.");
    throw new ReauthRequiredError();
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: connection.refresh_token,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const errCode = (body as any)?.error || "refresh_failed";
    await supabaseService.from("google_calendar_connections").update({
      status: "requires_reauth",
      last_error: `Falha ao renovar token: ${errCode}`,
      access_token: null,
    }).eq("id", connection.id);
    await markGoogleIntegrations(supabaseService, connection.tenant_id, connection.user_id, "needs_reauth", `Falha ao renovar token: ${errCode}`);
    await logAudit(supabaseService, {
      tenantId: connection.tenant_id,
      actor: connection.user_id,
      action: "google_calendar.token_refresh_failed",
      details: { errCode },
    });
    throw new ReauthRequiredError();
  }

  const tokenData = await res.json();
  const expiresAt = new Date(Date.now() + (Number(tokenData.expires_in) || 3600) * 1000).toISOString();

  await supabaseService.from("google_calendar_connections").update({
    access_token: tokenData.access_token,
    access_token_expires_at: expiresAt,
    status: "active",
    last_error: null,
  }).eq("id", connection.id);

  await logAudit(supabaseService, {
    tenantId: connection.tenant_id,
    actor: connection.user_id,
    action: "google_calendar.token_refreshed",
  });

  return tokenData.access_token as string;
}

export async function getValidAccessToken(supabaseService: SupabaseClient, tenantId: string, userId: string): Promise<{ token: string; connection: ConnectionRow }> {
  const connection = await getConnection(supabaseService, tenantId, userId);
  if (!connection || connection.status === "disconnected") throw new NotConnectedError();
  if (connection.status === "requires_reauth") throw new ReauthRequiredError();

  const expiresAt = connection.access_token_expires_at ? new Date(connection.access_token_expires_at).getTime() : 0;
  if (connection.access_token && expiresAt > Date.now() + TOKEN_REFRESH_SKEW_MS) {
    return { token: connection.access_token, connection };
  }
  const token = await refreshAccessToken(supabaseService, connection);
  return { token, connection: { ...connection, access_token: token } };
}

class GoogleApiError extends Error {}

// A API do Google pagina em 250 por página (nextPageToken) — as duas rotas
// abaixo (/events e /sync) faziam UMA chamada só e ignoravam nextPageToken,
// então qualquer tenant com mais de 250 eventos na janela perdia o resto em
// silêncio (nenhum erro, só um corte invisível). Mesma classe de bug já
// corrigida na listagem de entradas da Max Data — paginar até esgotar.
async function fetchAllGoogleEvents(token: string, calendarId: string, timeMin: string, timeMax: string): Promise<any[]> {
  const events: any[] = [];
  let pageToken: string | undefined;
  const MAX_PAGES = 40; // teto de segurança — 10 mil eventos numa janela já seria um caso extremo
  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const gRes = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    if (!gRes.ok) {
      const body = await gRes.json().catch(() => ({}));
      throw new GoogleApiError((body as any)?.error?.message || "Falha ao buscar eventos do Google Calendar.");
    }
    const data = await gRes.json();
    events.push(...(data.items || []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return events;
}

function mapGoogleEventToReuniao(event: any, closerFallback: string) {
  const startISO = event.start?.dateTime
    ? new Date(event.start.dateTime).toISOString()
    : event.start?.date
    ? new Date(`${event.start.date}T09:00:00`).toISOString()
    : new Date().toISOString();
  const endISO = event.end?.dateTime
    ? new Date(event.end.dateTime).toISOString()
    : event.end?.date
    ? new Date(`${event.end.date}T10:00:00`).toISOString()
    : new Date(Date.now() + 3600000).toISOString();
  const durationMinutes = Math.max(15, Math.round((new Date(endISO).getTime() - new Date(startISO).getTime()) / 60000)) || 60;
  const attendees = event.attendees || [];
  const otherAttendee = attendees.find((a: any) => !a.self) || attendees[0];
  return {
    leadName: otherAttendee?.displayName || otherAttendee?.email || event.summary || "Compromisso Google Calendar",
    companyName: event.summary || "Google Calendar",
    leadEmail: otherAttendee?.email || "",
    closerName: closerFallback,
    closerEmail: event.organizer?.email || "",
    scheduledAt: startISO,
    durationMinutes,
    meetLink: event.hangoutLink || event.conferenceData?.entryPoints?.find((e: any) => e.uri)?.uri || event.htmlLink || "",
    status: (event.status === "cancelled" ? "Cancelada" : "Agendada") as "Agendada" | "Cancelada",
    pauta: event.description || (event.summary ? `Evento: ${event.summary}` : "Sincronizado da agenda do Google"),
    googleEventId: event.id as string,
  };
}

export interface GoogleCalendarRouterDeps {
  requireUser: (req: any, res: any, next: any) => any;
  supabaseService: SupabaseClient | null;
  /** Chamado (sem bloquear o redirect) depois que a conexão foi salva: dispara a sincronização inicial. */
  onConnected?: (ctx: { tenantId: string; userId: string; services: string[] }) => Promise<void>;
}

export function createGoogleCalendarRouter({ requireUser, supabaseService, onConnected }: GoogleCalendarRouterDeps) {
  const router = Router();

  function requireService(res: any): boolean {
    if (!supabaseService) {
      res.status(503).json({ error: "Integração Google Calendar não configurada no servidor." });
      return false;
    }
    return true;
  }

  // GOOGLE_OAUTH_REDIRECT_URI não entra aqui: tem fallback (baseOrigin +
  // /oauth/callback) usado tanto em /connect/start quanto na troca de token
  // abaixo — exigi-la aqui faria o callback falhar mesmo com CLIENT_ID/SECRET
  // configurados, só porque essa variável opcional não foi setada.
  function requireGoogleEnv(res: any): boolean {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      res.status(503).json({ error: "Credenciais Google (server-side) não configuradas." });
      return false;
    }
    return true;
  }

  router.get("/connect/start", requireUser, async (req: any, res) => {
    try {
      if (!requireService(res) || !requireGoogleEnv(res)) return;
      const tenantResult = await resolveTenantId(req);
      if ("error" in tenantResult) return res.status(tenantResult.status).json({ error: tenantResult.error });
      const tenantId = tenantResult.tenantId;

      const redirectUri = getRedirectUri();

      const state = signState({
        tenantId,
        userId: req.user?.id || "anonymous",
        returnTo: sanitizeReturnTo(req.query.returnTo),
        nonce: Math.random().toString(36).slice(2),
        exp: Date.now() + STATE_TTL_MS,
      });

      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.searchParams.set("client_id", GOOGLE_CLIENT_ID);
      url.searchParams.set("redirect_uri", redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("access_type", "offline");
      url.searchParams.set("prompt", "consent");
      url.searchParams.set("include_granted_scopes", "true");
      url.searchParams.set("scope", SCOPES);
      url.searchParams.set("state", state);

      res.json({ url: url.toString() });
    } catch (err: any) {
      console.error("[google-calendar] connect/start error:", err?.message);
      res.status(500).json({ error: "Falha ao iniciar autenticação Google: " + (err?.message || "erro interno") });
    }
  });

  router.get("/oauth/callback", async (req: any, res) => {
    if (!requireService(res) || !requireGoogleEnv(res)) return;
    const { code, state, error: googleError } = req.query as Record<string, string>;
    const payload = verifyState(state);

    const redirectWithError = (reason: string) => {
      const baseOrigin = SUCCESS_ORIGIN || process.env.APP_URL || "https://axis-crm.pluppex.com.br";
      const url = new URL(sanitizeReturnTo(payload?.returnTo), baseOrigin);
      url.searchParams.set("google_calendar", "error");
      url.searchParams.set("reason", reason);
      res.redirect(url.toString());
    };

    if (googleError) return redirectWithError(googleError);
    if (!payload) return redirectWithError("invalid_state");
    if (!code) return redirectWithError("missing_code");

    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: getRedirectUri(),
          code,
          grant_type: "authorization_code",
        }),
      });
      if (!tokenRes.ok) {
        const body = await tokenRes.json().catch(() => ({}));
        const googleErrCode = (body as any)?.error || "unknown";
        const googleErrDesc = (body as any)?.error_description || "";
        console.error("[google-calendar] token exchange falhou:", googleErrCode, googleErrDesc);
        // Código de erro do OAuth do Google não é sensível (ex.: "redirect_uri_mismatch",
        // "invalid_client") — expõe ele direto na URL de retorno pra não precisar caçar
        // log do servidor toda vez que a troca falhar.
        return redirectWithError(`token_exchange_failed:${googleErrCode}`);
      }
      const tokenData = await tokenRes.json();

      let googleEmail: string | null = null;
      let googleAccountId: string | null = null;
      try {
        const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        if (userInfoRes.ok) {
          const info = await userInfoRes.json();
          googleEmail = info?.email ?? null;
          googleAccountId = info?.id ? String(info.id) : null;
        }
      } catch {}

      const expiresAt = new Date(Date.now() + (Number(tokenData.expires_in) || 3600) * 1000).toISOString();

      // `refresh_token` é NOT NULL e sem default — se essa for a primeira conexão
      // deste tenant/usuário (nenhuma linha existente pra herdar um refresh_token
      // anterior) e o Google não devolver um novo, o upsert falharia (ou, pior,
      // "conectaria" sem token nenhum pra manter o acesso depois que o
      // access_token de curta duração expirar). Detecta esse caso antes de gravar.
      const { data: existingConnection } = await supabaseService!
        .from("google_calendar_connections")
        .select("id")
        .eq("tenant_id", payload.tenantId)
        .eq("user_id", payload.userId)
        .maybeSingle();

      if (!tokenData.refresh_token && !existingConnection) {
        console.error("[google-calendar] Google não devolveu refresh_token na primeira conexão — sem acesso offline possível.");
        return redirectWithError("missing_refresh_token");
      }

      const { data: savedConnection, error: upsertError } = await supabaseService!.from("google_calendar_connections").upsert(
        {
          tenant_id: payload.tenantId,
          user_id: payload.userId,
          google_email: googleEmail,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token ?? undefined, // undefined preserva o refresh_token anterior se o Google não devolver um novo
          access_token_expires_at: expiresAt,
          scope: tokenData.scope ?? SCOPES,
          status: "active",
          last_error: null,
          connected_at: new Date().toISOString(),
          disconnected_at: null,
        },
        { onConflict: "tenant_id,user_id" }
      ).select("id").maybeSingle();

      if (upsertError) {
        console.error("[google-calendar] falha ao salvar conexão:", upsertError.message);
        return redirectWithError("save_failed");
      }

      await logAudit(supabaseService!, {
        tenantId: payload.tenantId,
        actor: payload.userId,
        action: "google_calendar.connected",
        details: { email: googleEmail },
      });

      // Central de Conexões: registra um serviço por escopo concedido (calendar, tasks) e dispara a
      // sincronização inicial sem segurar o redirect do usuário.
      const registeredServices = await registerGoogleServices(supabaseService!, {
        tenantId: payload.tenantId, userId: payload.userId, email: googleEmail, accountId: googleAccountId,
        scope: tokenData.scope ?? SCOPES, credentialId: savedConnection?.id ?? null,
      });
      if (onConnected && registeredServices.length > 0) {
        onConnected({ tenantId: payload.tenantId, userId: payload.userId, services: registeredServices })
          .catch((e: any) => console.error("[google-calendar] sincronização inicial falhou:", e?.message));
      }

      const baseOrigin = SUCCESS_ORIGIN || process.env.APP_URL || "https://axis-crm.pluppex.com.br";
      const url = new URL(sanitizeReturnTo(payload.returnTo), baseOrigin);
      url.searchParams.set("google_calendar", "connected");
      res.redirect(url.toString());
    } catch (err: any) {
      console.error("[google-calendar] callback falhou:", err?.message);
      redirectWithError("internal_error");
    }
  });

  router.get("/status", requireUser, async (req: any, res) => {
    try {
      if (!supabaseService) {
        return res.json({ connected: false, email: null, status: "disconnected", lastSyncAt: null, calendarId: null });
      }
      const tenantResult = await resolveTenantId(req);
      if ("error" in tenantResult) return res.status(tenantResult.status).json({ error: tenantResult.error });
      const tenantId = tenantResult.tenantId;

      const connection = await getConnection(supabaseService, tenantId, req.user?.id || "");
      if (!connection || connection.status === "disconnected") {
        return res.json({ connected: false, email: null, status: "disconnected", lastSyncAt: null, calendarId: null });
      }
      res.json({
        connected: connection.status === "active",
        email: connection.google_email,
        status: connection.status,
        lastSyncAt: connection.last_sync_at,
        calendarId: connection.calendar_id,
      });
    } catch (err: any) {
      console.warn("[google-calendar] status route error:", err?.message);
      res.json({ connected: false, email: null, status: "disconnected", lastSyncAt: null, calendarId: null });
    }
  });

  router.post("/disconnect", requireUser, async (req: any, res) => {
    try {
      if (!supabaseService) return res.json({ success: true });
      const tenantResult = await resolveTenantId(req);
      if ("error" in tenantResult) return res.status(tenantResult.status).json({ error: tenantResult.error });
      const tenantId = tenantResult.tenantId;

      const connection = await getConnection(supabaseService, tenantId, req.user?.id || "");
      if (connection?.access_token) {
        try {
          await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(connection.access_token)}`, { method: "POST" });
        } catch (err: any) {
          console.warn("[google-calendar] revoke falhou (ignorado):", err?.message);
        }
      }

      if (connection) {
        await supabaseService
          .from("google_calendar_connections")
          .update({
            status: "disconnected",
            access_token: null,
            refresh_token: null,
            access_token_expires_at: null,
            disconnected_at: new Date().toISOString(),
          })
          .eq("tenant_id", tenantId)
          .eq("user_id", req.user.id);

        await markGoogleIntegrations(supabaseService, tenantId, req.user.id, "disconnected");
        await logAudit(supabaseService, {
          tenantId,
          actor: req.user.id,
          action: "google_calendar.disconnected",
        });
      }

      res.json({ success: true });
    } catch (err: any) {
      console.warn("[google-calendar] disconnect error:", err?.message);
      res.json({ success: true });
    }
  });

  router.get("/events", requireUser, async (req: any, res) => {
    if (!requireService(res)) return;
    const tenantResult = await resolveTenantId(req);
    if ("error" in tenantResult) return res.status(tenantResult.status).json({ error: tenantResult.error });

    try {
      const { token, connection } = await getValidAccessToken(supabaseService!, tenantResult.tenantId, req.user.id);
      const timeMin = (req.query.timeMin as string) || new Date(Date.now() - 30 * 86400000).toISOString();
      const timeMax = (req.query.timeMax as string) || new Date(Date.now() + 90 * 86400000).toISOString();

      const events = await fetchAllGoogleEvents(token, connection.calendar_id || "primary", timeMin, timeMax);
      res.json({ events });
    } catch (err) {
      if (err instanceof NotConnectedError) return res.status(404).json({ error: "google_calendar_not_connected" });
      if (err instanceof ReauthRequiredError) return res.status(409).json({ error: "google_calendar_reauth_required" });
      if (err instanceof GoogleApiError) return res.status(502).json({ error: err.message });
      console.error("[google-calendar] /events falhou:", (err as any)?.message);
      res.status(500).json({ error: "Erro ao listar eventos do Google Calendar." });
    }
  });

  router.post("/events", requireUser, async (req: any, res) => {
    if (!requireService(res)) return;
    const tenantResult = await resolveTenantId(req);
    if ("error" in tenantResult) return res.status(tenantResult.status).json({ error: tenantResult.error });

    const { title, description, location, startISO, endISO, attendeeEmails, skipConferenceData, reminderMinutes } = req.body || {};
    if (!title || !startISO || !endISO) return res.status(400).json({ error: "title, startISO e endISO são obrigatórios." });

    try {
      const { token, connection } = await getValidAccessToken(supabaseService!, tenantResult.tenantId, req.user.id);
      const body: Record<string, unknown> = {
        summary: title,
        description: description || "",
        ...(location ? { location } : {}),
        start: { dateTime: startISO, timeZone: "America/Sao_Paulo" },
        end: { dateTime: endISO, timeZone: "America/Sao_Paulo" },
        attendees: (attendeeEmails || []).filter(Boolean).map((email: string) => ({ email })),
      };
      const reminder = Number(reminderMinutes);
      if (Number.isFinite(reminder) && reminder > 0 && reminder <= 40320) {
        body.reminders = { useDefault: false, overrides: [{ method: "popup", minutes: Math.round(reminder) }, { method: "email", minutes: Math.round(reminder) }] };
      }
      if (!skipConferenceData) {
        body.conferenceData = { createRequest: { requestId: Math.random().toString(36).slice(2), conferenceSolutionKey: { type: "hangoutsMeet" } } };
      }
      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendar_id || "primary")}/events${skipConferenceData ? "?sendUpdates=all" : "?conferenceDataVersion=1&sendUpdates=all"}`;
      const gRes = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!gRes.ok) {
        const errBody = await gRes.json().catch(() => ({}));
        return res.status(502).json({ error: (errBody as any)?.error?.message || "Falha ao criar evento no Google Calendar." });
      }
      const data = await gRes.json();
      res.json({ id: data.id, htmlLink: data.htmlLink, hangoutLink: data.hangoutLink });
    } catch (err) {
      if (err instanceof NotConnectedError) return res.status(404).json({ error: "google_calendar_not_connected" });
      if (err instanceof ReauthRequiredError) return res.status(409).json({ error: "google_calendar_reauth_required" });
      console.error("[google-calendar] POST /events falhou:", (err as any)?.message);
      res.status(500).json({ error: "Erro ao criar evento no Google Calendar." });
    }
  });

  router.post("/meet-space", requireUser, async (req: any, res) => {
    if (!requireService(res)) return;
    const tenantResult = await resolveTenantId(req);
    if ("error" in tenantResult) return res.status(tenantResult.status).json({ error: tenantResult.error });

    try {
      const { token } = await getValidAccessToken(supabaseService!, tenantResult.tenantId, req.user.id);
      const gRes = await fetch("https://meet.googleapis.com/v2/spaces", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!gRes.ok) {
        const errBody = await gRes.json().catch(() => ({}));
        return res.status(502).json({ error: (errBody as any)?.error?.message || "Falha ao criar sala do Google Meet." });
      }
      const data = await gRes.json();
      res.json({ name: data.name, meetingUri: data.meetingUri, meetingCode: data.meetingCode });
    } catch (err) {
      if (err instanceof NotConnectedError) return res.status(404).json({ error: "google_calendar_not_connected" });
      if (err instanceof ReauthRequiredError) return res.status(409).json({ error: "google_calendar_reauth_required" });
      console.error("[google-calendar] /meet-space falhou:", (err as any)?.message);
      res.status(500).json({ error: "Erro ao criar sala do Google Meet." });
    }
  });

  // Sincroniza eventos do Google Calendar do tenant/usuário atual para
  // public.reunioes. Idempotente: casa por (tenant_id, googleEventId) — ver
  // idx_reunioes_tenant_google_event — então rodar de novo (abrir a página,
  // trocar de tenant e voltar, cron) nunca duplica.
  router.post("/sync", requireUser, async (req: any, res) => {
    if (!requireService(res)) return;
    const tenantResult = await resolveTenantId(req);
    if ("error" in tenantResult) return res.status(tenantResult.status).json({ error: tenantResult.error });
    const tenantId = tenantResult.tenantId;

    try {
      const { token, connection } = await getValidAccessToken(supabaseService!, tenantId, req.user.id);
      const timeMin = (req.body?.timeMin as string) || new Date(Date.now() - 30 * 86400000).toISOString();
      const timeMax = (req.body?.timeMax as string) || new Date(Date.now() + 90 * 86400000).toISOString();

      const events = await fetchAllGoogleEvents(token, connection.calendar_id || "primary", timeMin, timeMax);

      // req.supabase (escopado com o JWT do chamador) — todo write aqui
      // respeita a RLS de reunioes (has_tenant_access), então mesmo um bug
      // neste código não consegue gravar fora do tenant resolvido acima.
      const { data: existingRows } = await req.supabase
        .from("reunioes")
        .select('id, "googleEventId"')
        .eq("tenant_id", tenantId)
        .not('"googleEventId"', "is", null);
      const existingByGoogleId = new Map<string, string>((existingRows || []).map((r: any) => [r.googleEventId, r.id]));

      let imported = 0;
      let updated = 0;
      for (const ev of events) {
        if (ev.status === "cancelled" && !existingByGoogleId.has(ev.id)) continue;
        const mapped = mapGoogleEventToReuniao(ev, connection.google_email || "Google Calendar");
        const existingId = existingByGoogleId.get(ev.id);
        if (existingId) {
          await req.supabase.from("reunioes").update({
            leadName: mapped.leadName,
            companyName: mapped.companyName,
            scheduledAt: mapped.scheduledAt,
            durationMinutes: mapped.durationMinutes,
            meetLink: mapped.meetLink,
            status: mapped.status,
            pauta: mapped.pauta,
          }).eq("id", existingId).eq("tenant_id", tenantId);
          updated++;
        } else {
          const id = `gcal-${ev.id}`;
          await req.supabase.from("reunioes").insert({
            id,
            tenant_id: tenantId,
            leadId: id,
            leadName: mapped.leadName,
            companyName: mapped.companyName,
            leadEmail: mapped.leadEmail,
            closerName: mapped.closerName,
            closerEmail: mapped.closerEmail,
            scheduledAt: mapped.scheduledAt,
            durationMinutes: mapped.durationMinutes,
            meetLink: mapped.meetLink,
            googleEventId: mapped.googleEventId,
            status: mapped.status,
            pauta: mapped.pauta,
            createdAt: new Date().toISOString(),
          });
          imported++;
        }
      }

      await supabaseService!.from("google_calendar_connections").update({ last_sync_at: new Date().toISOString() }).eq("id", connection.id);
      await logAudit(supabaseService!, {
        tenantId,
        actor: req.user.id,
        action: "google_calendar.sync_completed",
        details: { imported, updated },
      });

      res.json({ imported, updated, totalFetched: events.length });
    } catch (err) {
      if (err instanceof NotConnectedError) return res.status(404).json({ error: "google_calendar_not_connected" });
      if (err instanceof ReauthRequiredError) return res.status(409).json({ error: "google_calendar_reauth_required" });
      if (err instanceof GoogleApiError) {
        await logAudit(supabaseService!, { tenantId, actor: req.user.id, action: "google_calendar.sync_failed", details: { message: err.message } });
        return res.status(502).json({ error: err.message });
      }
      console.error("[google-calendar] /sync falhou:", (err as any)?.message);
      await logAudit(supabaseService!, { tenantId, actor: req.user.id, action: "google_calendar.sync_failed", details: { message: (err as any)?.message } });
      res.status(500).json({ error: "Erro ao sincronizar com o Google Calendar." });
    }
  });

  return router;
}
