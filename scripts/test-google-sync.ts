// Teste da sincronização Google (Calendar + Tasks) com banco e Google simulados.
// Rodar: npx tsx scripts/test-google-sync.ts
import assert from "node:assert/strict";
import { mapGoogleEvent, mapGoogleTask, syncGoogleCalendar, syncGoogleTasks } from "../server/googleSync";
import { googleServicesFromScope, registerGoogleServices, markGoogleIntegrations } from "../server/integrationsRegistry";
import { runGoogleSync } from "../server/googleIntegrations";

// ── banco simulado (só o que o código usa) ───────────────────────────────────
let idSeq = 0;
function makeDb(seed: Record<string, any[]> = {}) {
  const tables: Record<string, any[]> = { integrations: [], integration_sync_runs: [], google_calendar_events: [], google_tasks: [], google_calendar_connections: [], ...seed };
  const keyCols: Record<string, string[]> = {
    google_calendar_events: ["integration_id", "calendar_id", "external_event_id"],
    google_tasks: ["integration_id", "task_list_id", "external_task_id"],
    integrations: ["tenant_id", "user_id", "provider", "service"],
    google_calendar_connections: ["tenant_id", "user_id"],
  };
  const from = (table: string) => {
    const st: any = { table, filters: [] as ((r: any) => boolean)[], op: "select", head: false };
    const run = () => {
      const rows = (tables[table] ??= []);
      const match = (r: any) => st.filters.every((f: any) => f(r));
      if (st.op === "insert") { const r = { id: `id${++idSeq}`, ...st.payload }; rows.push(r); return { data: r, error: null }; }
      if (st.op === "update") { rows.filter(match).forEach(r => Object.assign(r, st.payload)); return { data: null, error: null }; }
      if (st.op === "upsert") {
        const keys = keyCols[table] ?? ["id"];
        for (const p of st.payload as any[]) {
          const i = rows.findIndex(r => keys.every(k => r[k] === p[k]));
          if (i >= 0) rows[i] = { ...rows[i], ...p }; else rows.push({ id: `id${++idSeq}`, ...p });
        }
        return { data: null, error: null };
      }
      const out = rows.filter(match);
      return st.head ? { count: out.length, data: null, error: null } : { data: out, count: out.length, error: null };
    };
    const b: any = {
      select: (_c?: string, o?: any) => { if (o?.head) st.head = true; return b; },
      insert: (p: any) => { st.op = "insert"; st.payload = p; return b; },
      update: (p: any) => { st.op = "update"; st.payload = p; return b; },
      upsert: (p: any) => { st.op = "upsert"; st.payload = Array.isArray(p) ? p : [p]; return b; },
      eq: (c: string, v: any) => { st.filters.push((r: any) => r[c] === v); return b; },
      neq: (c: string, v: any) => { st.filters.push((r: any) => r[c] !== v); return b; },
      lt: (c: string, v: any) => { st.filters.push((r: any) => r[c] != null && r[c] < v); return b; },
      in: (c: string, vs: any[]) => { st.filters.push((r: any) => vs.includes(r[c])); return b; },
      order: () => b, limit: () => b,
      single: async () => { const r = run(); return Array.isArray(r.data) ? { data: r.data[0] ?? null, error: null } : r; },
      maybeSingle: async () => { const r = run(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : r.data, error: null }; },
      then: (ok: any, ko: any) => Promise.resolve(run()).then(ok, ko),
    };
    return b;
  };
  return { tables, from } as any;
}

// ── Google simulado ──────────────────────────────────────────────────────────
function makeGoogle(state: { events: any[]; lists: any[]; tasks: Record<string, any[]>; status?: number }) {
  const calls: string[] = [];
  const f: any = async (url: string) => {
    calls.push(url);
    const respond = (body: any, status = 200) => ({ ok: status < 400, status, json: async () => body });
    if (state.status && state.status >= 400) return respond({ error: { message: "token expirado" } }, state.status);
    if (url.includes("/calendar/v3/calendars/")) return respond({ items: state.events });
    if (url.includes("/tasks/v1/users/@me/lists")) return respond({ items: state.lists });
    const m = url.match(/\/tasks\/v1\/lists\/([^/]+)\/tasks/);
    if (m) {
      const um = new URL(url).searchParams.get("updatedMin");
      const all = state.tasks[decodeURIComponent(m[1])] ?? [];
      return respond({ items: um ? all.filter(t => new Date(t.updated) >= new Date(um)) : all });
    }
    return respond({}, 404);
  };
  f.calls = calls;
  return f as typeof fetch & { calls: string[] };
}

const T = "tenant-1", U = "user-1";
const integ = (service: string, extra: any = {}) => ({ id: `int-${service}`, tenant_id: T, user_id: U, provider: "google", service, sync_state: {}, ...extra });
const ev = (id: string, o: any = {}) => ({ id, status: "confirmed", summary: `Evento ${id}`, start: { dateTime: "2026-10-10T14:00:00-03:00", timeZone: "America/Sao_Paulo" }, end: { dateTime: "2026-10-10T15:00:00-03:00" }, updated: "2026-10-01T10:00:00Z", created: "2026-09-30T10:00:00Z", ...o });

(async () => {
  // 1) mapeadores
  const allDay = mapGoogleEvent({ id: "a", summary: "Feriado", start: { date: "2026-10-12" }, end: { date: "2026-10-13" }, status: "confirmed" }, { tenantId: T, userId: U, integrationId: "i", calendarId: "primary", now: "n" });
  assert.equal(allDay.all_day, true); assert.equal(allDay.start_at, "2026-10-12T00:00:00.000Z");
  const meet = mapGoogleEvent(ev("m", { hangoutLink: "https://meet.google.com/abc", attendees: [{ email: "x@y.com", responseStatus: "accepted", self: true }], organizer: { email: "o@y.com", displayName: "Org" } }), { tenantId: T, userId: U, integrationId: "i", calendarId: "primary", now: "n" });
  assert.equal(meet.meet_link, "https://meet.google.com/abc"); assert.equal(meet.attendees[0].response, "accepted"); assert.equal(meet.organizer?.name, "Org");
  assert.equal(meet.start_at, "2026-10-10T17:00:00.000Z"); assert.equal(meet.tenant_id, T);
  const tdone = mapGoogleTask({ id: "t1", title: "Pagar", status: "completed", completed: "2026-10-02T09:00:00Z", due: "2026-10-01T00:00:00Z", updated: "2026-10-02T09:00:00Z" }, { id: "L1", title: "Minhas" }, { tenantId: T, userId: U, integrationId: "i", now: "n" });
  assert.equal(tdone.status, "completed"); assert.equal(tdone.completed_at, "2026-10-02T09:00:00.000Z"); assert.equal(tdone.deleted, false);
  const topen = mapGoogleTask({ id: "t2", title: "Ligar", status: "needsAction", updated: "2026-10-02T09:00:00Z" }, { id: "L1" }, { tenantId: T, userId: U, integrationId: "i", now: "n" });
  assert.equal(topen.completed_at, null); assert.equal(topen.status, "needsAction");

  // 2) Calendar: cria, não duplica, só regrava o que mudou, reflete cancelamento
  const db = makeDb({ integrations: [integ("calendar", { last_sync_status: null })] });
  const g = makeGoogle({ events: [ev("e1"), ev("e2", { attendees: [{ email: "a@b.com" }] }), ev("e3", { status: "cancelled" })], lists: [], tasks: {} });
  const deps = { supabase: db, getToken: async () => ({ token: "tok", calendarId: "primary" }), fetchImpl: g, now: () => new Date("2026-10-05T12:00:00Z") };
  let r = await syncGoogleCalendar(deps, db.tables.integrations[0], "manual");
  assert.deepEqual([r.fetched, r.created, r.updated, r.removed], [3, 3, 0, 1]);
  assert.equal(db.tables.google_calendar_events.length, 3);
  assert.ok(g.calls[0].includes("showDeleted=true"), "pede os cancelados ao Google");
  assert.equal(db.tables.integration_sync_runs.length, 1); assert.equal(db.tables.integration_sync_runs[0].status, "ok");
  assert.equal(db.tables.integrations[0].last_sync_status, "ok"); assert.ok(db.tables.integrations[0].last_sync_at);
  r = await syncGoogleCalendar(deps, db.tables.integrations[0], "manual");
  assert.deepEqual([r.created, r.updated, r.removed], [0, 0, 0], "segunda sync idêntica não grava nada");
  assert.equal(db.tables.google_calendar_events.length, 3, "sem duplicar");
  const novo = [ev("e1", { summary: "Evento e1 (remarcado)", updated: "2026-10-04T10:00:00Z" }), ev("e2", { status: "cancelled", updated: "2026-10-04T11:00:00Z" }), ev("e3", { status: "cancelled" })];
  g.calls.length = 0;
  const g2 = makeGoogle({ events: novo, lists: [], tasks: {} });
  r = await syncGoogleCalendar({ ...deps, fetchImpl: g2 }, db.tables.integrations[0], "manual");
  assert.deepEqual([r.created, r.updated, r.removed], [0, 2, 1], "1 alterado + 1 cancelado agora");
  assert.equal(db.tables.google_calendar_events.find((e: any) => e.external_event_id === "e1").title, "Evento e1 (remarcado)");
  assert.equal(db.tables.google_calendar_events.find((e: any) => e.external_event_id === "e2").status, "cancelled");
  assert.equal(db.tables.google_calendar_events.length, 3);

  // 3) Tasks: primeira sync completa, segunda incremental (updatedMin) e só o que mudou
  const dbt = makeDb({ integrations: [integ("tasks")] });
  const tstate = {
    events: [], lists: [{ id: "L1", title: "Minhas tarefas" }, { id: "L2", title: "Trabalho" }],
    tasks: {
      L1: [{ id: "t1", title: "Pagar boleto", status: "needsAction", due: "2026-10-01T00:00:00Z", updated: "2026-10-01T08:00:00Z" }, { id: "t2", title: "Feita", status: "completed", completed: "2026-10-02T00:00:00Z", updated: "2026-10-02T00:00:00Z" }],
      L2: [{ id: "t3", title: "Reunião", status: "needsAction", updated: "2026-10-01T09:00:00Z" }],
    } as Record<string, any[]>,
  };
  const gt = makeGoogle(tstate);
  const tdeps = { supabase: dbt, getToken: async () => ({ token: "tok", calendarId: "primary" }), fetchImpl: gt, now: () => new Date("2026-10-05T12:00:00Z") };
  r = await syncGoogleTasks(tdeps, dbt.tables.integrations[0], "manual");
  assert.deepEqual([r.fetched, r.created], [3, 3]); assert.equal(dbt.tables.google_tasks.length, 3);
  assert.equal(dbt.tables.google_tasks.find((t: any) => t.external_task_id === "t2").status, "completed");
  assert.equal(dbt.tables.google_tasks.find((t: any) => t.external_task_id === "t1").task_list_title, "Minhas tarefas");
  assert.ok(dbt.tables.integrations[0].sync_state.tasks_updated_min, "guarda o cursor incremental");
  gt.calls.length = 0;
  tstate.tasks.L1[0] = { ...tstate.tasks.L1[0], status: "completed", completed: "2026-10-05T12:20:00Z", updated: "2026-10-05T12:20:00Z" };
  tstate.tasks.L2.push({ id: "t4", title: "Excluída", status: "needsAction", deleted: true, updated: "2026-10-05T12:25:00Z" });
  r = await syncGoogleTasks({ ...tdeps, now: () => new Date("2026-10-05T12:30:00Z") }, dbt.tables.integrations[0], "manual");
  assert.ok(gt.calls.some(u => u.includes("updatedMin=")), "segunda sync é incremental");
  assert.deepEqual([r.created, r.updated, r.removed], [1, 1, 1], "1 concluída agora, 1 excluída (nova) — o resto não foi buscado");
  assert.equal(dbt.tables.google_tasks.find((t: any) => t.external_task_id === "t1").status, "completed");
  assert.equal(dbt.tables.google_tasks.find((t: any) => t.external_task_id === "t4").deleted, true);
  assert.equal(dbt.tables.google_tasks.length, 4, "sem duplicar");
  // sync completa (full) refaz tudo sem duplicar
  r = await syncGoogleTasks(tdeps, dbt.tables.integrations[0], "manual", { full: true });
  assert.equal(dbt.tables.google_tasks.length, 4);

  // 4) erro do Google: registra o erro e marca a integração como precisando reautorizar
  const dbe = makeDb({ integrations: [integ("calendar")] });
  await assert.rejects(() => syncGoogleCalendar({ supabase: dbe, getToken: async () => ({ token: "x", calendarId: "primary" }), fetchImpl: makeGoogle({ events: [], lists: [], tasks: {}, status: 401 }) }, dbe.tables.integrations[0], "manual"));
  assert.equal(dbe.tables.integrations[0].last_sync_status, "error"); assert.equal(dbe.tables.integrations[0].status, "needs_reauth");
  assert.equal(dbe.tables.integration_sync_runs[0].status, "error"); assert.match(dbe.tables.integration_sync_runs[0].error, /token expirado/);

  // 5) registro de serviços a partir dos escopos concedidos
  assert.deepEqual(googleServicesFromScope("email profile https://www.googleapis.com/auth/calendar.events"), ["calendar"]);
  assert.deepEqual(googleServicesFromScope("https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks.readonly"), ["calendar", "tasks"]);
  assert.deepEqual(googleServicesFromScope("email profile"), []);
  const dbr = makeDb();
  const regs = await registerGoogleServices(dbr, { tenantId: T, userId: U, email: "a@b.com", accountId: "g-1", credentialId: "cred-1", scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks.readonly email" });
  assert.deepEqual(regs, ["calendar", "tasks"]); assert.equal(dbr.tables.integrations.length, 2);
  await registerGoogleServices(dbr, { tenantId: T, userId: U, email: "a@b.com", scope: "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks.readonly" });
  assert.equal(dbr.tables.integrations.length, 2, "reconectar não duplica");
  assert.deepEqual(dbr.tables.integrations.find((i: any) => i.service === "tasks").scopes, ["https://www.googleapis.com/auth/tasks.readonly"]);
  await markGoogleIntegrations(dbr, T, U, "disconnected");
  assert.ok(dbr.tables.integrations.every((i: any) => i.status === "disconnected" && i.disconnected_at));
  await markGoogleIntegrations(dbr, "outro-tenant", U, "needs_reauth");
  assert.ok(dbr.tables.integrations.every((i: any) => i.status === "disconnected"), "não mexe em outro tenant");

  // 6) runGoogleSync: token vem da conexão guardada, serviços independentes, sem sync concorrente
  const future = new Date(Date.now() + 3600_000).toISOString();
  const dbg = makeDb({
    google_calendar_connections: [{ id: "c1", tenant_id: T, user_id: U, status: "active", access_token: "tok-ok", refresh_token: "r", access_token_expires_at: future, calendar_id: "primary" }],
    integrations: [integ("calendar"), integ("tasks", { last_sync_status: "running", updated_at: new Date().toISOString() })],
  });
  (globalThis as any).fetch = makeGoogle({ events: [ev("z1")], lists: [], tasks: {} });
  const outs = await runGoogleSync(dbg, T, U, ["calendar", "tasks"], "manual");
  assert.equal(outs[0].ok, true); assert.equal(outs[0].result?.created, 1);
  assert.equal(outs[1].skipped, "sync_in_progress", "não roda duas sync da mesma integração ao mesmo tempo");
  const outs2 = await runGoogleSync(makeDb({ google_calendar_connections: [] , integrations: [] }), T, U, ["calendar"], "manual");
  assert.equal(outs2[0].skipped, "not_connected");

  console.log("SYNC OK: mapeadores, calendar (cria/não duplica/atualiza/cancela), tasks (completa+incremental+excluída), erro→needs_reauth, registro por escopo, guarda de concorrência");
})().catch(e => { console.error("FALHOU:", e.stack || e.message); process.exit(1); });
