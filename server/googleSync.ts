// Sincronização Google Calendar + Google Tasks → tabelas próprias (google_calendar_events, google_tasks).
//
// Princípios:
//  • Idempotente: upsert pela chave externa (integração + calendário/lista + id do Google). Rodar de novo
//    nunca duplica; linhas que não mudaram (external_updated_at igual) nem são regravadas.
//  • Sem perda: cancelamentos/remoções chegam como status "cancelled"/deleted=true (showDeleted) e são
//    gravados como tal em vez de apagar a linha.
//  • Rastreável: cada execução vira uma linha em integration_sync_runs (status, contagens, erro) e a
//    integração guarda a última sincronização.
//  • Tokens nunca saem daqui: quem chama passa uma função que devolve o token já válido.
import type { SupabaseClient } from "@supabase/supabase-js";

export type SyncTrigger = "manual" | "connect" | "scheduled";

export interface IntegrationRow {
  id: string;
  tenant_id: string;
  user_id: string;
  provider: string;
  service: string;
  sync_state: Record<string, any> | null;
}

export interface SyncDeps {
  supabase: SupabaseClient;
  /** Devolve um access token válido (renova se preciso) e o calendário principal do usuário. */
  getToken: () => Promise<{ token: string; calendarId: string }>;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export interface SyncResult {
  runId: string | null;
  fetched: number;
  created: number;
  updated: number;
  removed: number;
}

export class GoogleApiError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

const CHUNK = 200;
const chunk = <T,>(arr: T[], n = CHUNK): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const iso = (v: unknown): string | null => {
  if (!v || typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

// ─── Mapeadores (puros, testáveis) ──────────────────────────────────────────

export function mapGoogleEvent(ev: any, ctx: { tenantId: string; userId: string; integrationId: string; calendarId: string; now: string }) {
  const allDay = !!ev.start?.date && !ev.start?.dateTime;
  const startRaw = ev.start?.dateTime ?? (ev.start?.date ? `${ev.start.date}T00:00:00Z` : null);
  const endRaw = ev.end?.dateTime ?? (ev.end?.date ? `${ev.end.date}T00:00:00Z` : null);
  const meet = ev.hangoutLink
    ?? ev.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")?.uri
    ?? null;
  return {
    tenant_id: ctx.tenantId,
    user_id: ctx.userId,
    integration_id: ctx.integrationId,
    external_event_id: String(ev.id),
    calendar_id: ctx.calendarId,
    title: ev.summary ?? null,
    description: ev.description ?? null,
    location: ev.location ?? null,
    start_at: iso(startRaw),
    end_at: iso(endRaw),
    all_day: allDay,
    timezone: ev.start?.timeZone ?? ev.end?.timeZone ?? null,
    status: ev.status ?? "confirmed",
    organizer: ev.organizer ? { email: ev.organizer.email ?? null, name: ev.organizer.displayName ?? null, self: !!ev.organizer.self } : null,
    attendees: (ev.attendees ?? []).map((a: any) => ({
      email: a.email ?? null, name: a.displayName ?? null, response: a.responseStatus ?? null,
      self: !!a.self, organizer: !!a.organizer, optional: !!a.optional,
    })),
    html_link: ev.htmlLink ?? null,
    meet_link: meet,
    external_created_at: iso(ev.created),
    external_updated_at: iso(ev.updated),
    synced_at: ctx.now,
    raw_data: ev,
  };
}

export function mapGoogleTask(task: any, list: { id: string; title?: string }, ctx: { tenantId: string; userId: string; integrationId: string; now: string }) {
  const completed = task.status === "completed";
  return {
    tenant_id: ctx.tenantId,
    user_id: ctx.userId,
    integration_id: ctx.integrationId,
    external_task_id: String(task.id),
    task_list_id: list.id,
    task_list_title: list.title ?? null,
    parent_external_id: task.parent ?? null,
    title: task.title ?? null,
    notes: task.notes ?? null,
    due_at: iso(task.due),
    completed_at: completed ? (iso(task.completed) ?? iso(task.updated)) : null,
    status: completed ? "completed" : "needsAction",
    deleted: !!task.deleted,
    external_updated_at: iso(task.updated),
    synced_at: ctx.now,
    raw_data: task,
  };
}

// ─── Google API ─────────────────────────────────────────────────────────────

async function gGet(f: typeof fetch, url: string, token: string): Promise<any> {
  const res = await f(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new GoogleApiError((body as any)?.error?.message || `Google API respondeu ${res.status}`, res.status);
  }
  return res.json();
}

export async function listGoogleCalendars(token: string, f: typeof fetch = fetch): Promise<{ id: string; title: string; primary: boolean; accessRole: string | null }[]> {
  const out: any[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 10; i++) {
    const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await gGet(f, url.toString(), token);
    out.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return out.map(c => ({ id: c.id, title: c.summaryOverride || c.summary || c.id, primary: !!c.primary, accessRole: c.accessRole ?? null }));
}

async function fetchEvents(f: typeof fetch, token: string, calendarId: string, timeMin: string, timeMax: string): Promise<any[]> {
  const events: any[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 40; page++) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`);
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("showDeleted", "true"); // traz os cancelados, para refletir cancelamentos
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "250");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await gGet(f, url.toString(), token);
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return events;
}

export async function fetchTaskLists(f: typeof fetch, token: string): Promise<{ id: string; title: string }[]> {
  const out: any[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < 10; i++) {
    const url = new URL("https://tasks.googleapis.com/tasks/v1/users/@me/lists");
    url.searchParams.set("maxResults", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await gGet(f, url.toString(), token);
    out.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return out.map(l => ({ id: l.id, title: l.title ?? l.id }));
}

async function fetchTasks(f: typeof fetch, token: string, listId: string, updatedMin: string | null): Promise<any[]> {
  const tasks: any[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 40; page++) {
    const url = new URL(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`);
    url.searchParams.set("maxResults", "100");
    url.searchParams.set("showCompleted", "true");
    url.searchParams.set("showHidden", "true");
    url.searchParams.set("showDeleted", "true");
    if (updatedMin) url.searchParams.set("updatedMin", updatedMin);
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const data = await gGet(f, url.toString(), token);
    tasks.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    if (!pageToken) break;
  }
  return tasks;
}

// ─── Persistência idempotente ───────────────────────────────────────────────

/** Grava só o que é novo ou mudou. Devolve contagens. `keyCols` é a chave natural além da integração. */
async function upsertChanged(
  supabase: SupabaseClient,
  table: "google_calendar_events" | "google_tasks",
  rows: Record<string, any>[],
  keyCol: "external_event_id" | "external_task_id",
  scope: { integration_id: string; extraCol: "calendar_id" | "task_list_id"; extraVal?: string },
  onConflict: string,
  isRemoved: (row: Record<string, any>) => boolean,
): Promise<{ created: number; updated: number; removed: number }> {
  let created = 0, updated = 0, removed = 0;
  for (const part of chunk(rows)) {
    // Estado atual dessas chaves, para decidir criar / atualizar / ignorar.
    let q = supabase.from(table).select(`${keyCol}, external_updated_at, status${table === "google_tasks" ? ", deleted" : ""}, ${scope.extraCol}`)
      .eq("integration_id", scope.integration_id);
    if (scope.extraVal) q = q.eq(scope.extraCol, scope.extraVal);
    const { data: existing, error: selErr } = await q.in(keyCol, part.map(r => r[keyCol]));
    if (selErr) throw new Error(`Falha ao ler ${table}: ${selErr.message}`);
    const byKey = new Map<string, any>((existing ?? []).map((e: any) => [`${e[scope.extraCol]}|${e[keyCol]}`, e]));

    const toWrite: Record<string, any>[] = [];
    for (const r of part) {
      const prev = byKey.get(`${r[scope.extraCol]}|${r[keyCol]}`);
      if (!prev) { toWrite.push(r); created++; if (isRemoved(r)) removed++; continue; }
      const sameVersion = prev.external_updated_at && r.external_updated_at && new Date(prev.external_updated_at).getTime() === new Date(r.external_updated_at).getTime();
      if (sameVersion) continue; // nada mudou no Google: não regrava
      toWrite.push(r); updated++;
      if (isRemoved(r) && !isRemoved(prev)) removed++;
    }
    if (toWrite.length > 0) {
      const { error } = await supabase.from(table).upsert(toWrite, { onConflict });
      if (error) throw new Error(`Falha ao gravar ${table}: ${error.message}`);
    }
  }
  return { created, updated, removed };
}

// ─── Execução com log ───────────────────────────────────────────────────────

async function withRun(
  deps: SyncDeps, integ: IntegrationRow, trigger: SyncTrigger,
  body: () => Promise<{ fetched: number; created: number; updated: number; removed: number; state?: Record<string, any>; details?: Record<string, any> }>,
): Promise<SyncResult> {
  const { supabase } = deps;
  const now = deps.now ?? (() => new Date());
  const { data: run } = await supabase.from("integration_sync_runs")
    .insert({ tenant_id: integ.tenant_id, integration_id: integ.id, provider: integ.provider, service: integ.service, trigger, status: "running" })
    .select("id").single();
  const runId: string | null = run?.id ?? null;
  await supabase.from("integrations").update({ last_sync_status: "running" }).eq("id", integ.id);
  try {
    const r = await body();
    await supabase.from("integrations").update({
      last_sync_at: now().toISOString(), last_sync_status: "ok", last_sync_error: null, status: "connected",
      ...(r.state ? { sync_state: { ...(integ.sync_state ?? {}), ...r.state } } : {}),
    }).eq("id", integ.id);
    if (runId) await supabase.from("integration_sync_runs").update({
      status: "ok", finished_at: now().toISOString(), fetched: r.fetched, created: r.created, updated: r.updated, removed: r.removed, details: r.details ?? {},
    }).eq("id", runId);
    return { runId, fetched: r.fetched, created: r.created, updated: r.updated, removed: r.removed };
  } catch (err: any) {
    const message = String(err?.message ?? err).slice(0, 500);
    const reauth = err?.name === "ReauthRequiredError" || err?.constructor?.name === "ReauthRequiredError" || err?.status === 401 || err?.status === 403;
    await supabase.from("integrations").update({
      last_sync_status: "error", last_sync_error: message, ...(reauth ? { status: "needs_reauth" } : {}),
    }).eq("id", integ.id);
    if (runId) await supabase.from("integration_sync_runs").update({ status: "error", finished_at: now().toISOString(), error: message }).eq("id", runId);
    throw err;
  }
}

export async function syncGoogleCalendar(deps: SyncDeps, integ: IntegrationRow, trigger: SyncTrigger = "manual", opts: { timeMin?: string; timeMax?: string } = {}): Promise<SyncResult> {
  const f = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  return withRun(deps, integ, trigger, async () => {
    const { token, calendarId } = await deps.getToken();
    const timeMin = opts.timeMin ?? new Date(now().getTime() - 30 * 86400000).toISOString();
    const timeMax = opts.timeMax ?? new Date(now().getTime() + 90 * 86400000).toISOString();
    const events = await fetchEvents(f, token, calendarId, timeMin, timeMax);
    const ctx = { tenantId: integ.tenant_id, userId: integ.user_id, integrationId: integ.id, calendarId, now: now().toISOString() };
    const rows = events.filter(e => e?.id).map(e => mapGoogleEvent(e, ctx));
    const r = await upsertChanged(deps.supabase, "google_calendar_events", rows, "external_event_id",
      { integration_id: integ.id, extraCol: "calendar_id", extraVal: calendarId }, "integration_id,calendar_id,external_event_id",
      row => row.status === "cancelled");
    return { fetched: events.length, ...r, details: { calendarId, timeMin, timeMax } };
  });
}

export async function syncGoogleTasks(deps: SyncDeps, integ: IntegrationRow, trigger: SyncTrigger = "manual", opts: { full?: boolean } = {}): Promise<SyncResult> {
  const f = deps.fetchImpl ?? fetch;
  const now = deps.now ?? (() => new Date());
  return withRun(deps, integ, trigger, async () => {
    const startedAt = now();
    const { token } = await deps.getToken();
    // Incremental: só o que mudou desde a última sincronização bem-sucedida (com folga de 2 min p/ relógios).
    const prev = !opts.full ? (integ.sync_state?.tasks_updated_min as string | undefined) ?? null : null;
    const updatedMin = prev ? new Date(new Date(prev).getTime() - 2 * 60000).toISOString() : null;
    const lists = await fetchTaskLists(f, token);
    const ctx = { tenantId: integ.tenant_id, userId: integ.user_id, integrationId: integ.id, now: startedAt.toISOString() };
    let fetched = 0, created = 0, updated = 0, removed = 0;
    for (const list of lists) {
      const tasks = await fetchTasks(f, token, list.id, updatedMin);
      fetched += tasks.length;
      const rows = tasks.filter(t => t?.id).map(t => mapGoogleTask(t, list, ctx));
      const r = await upsertChanged(deps.supabase, "google_tasks", rows, "external_task_id",
        { integration_id: integ.id, extraCol: "task_list_id", extraVal: list.id }, "integration_id,task_list_id,external_task_id",
        row => row.deleted === true);
      created += r.created; updated += r.updated; removed += r.removed;
    }
    return { fetched, created, updated, removed, state: { tasks_updated_min: startedAt.toISOString() }, details: { lists: lists.length, incremental: !!updatedMin } };
  });
}
