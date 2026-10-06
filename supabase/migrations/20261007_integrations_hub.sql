-- Central de Conexões (OAuth) — camada de dados.
--
-- O que JÁ existia e é reaproveitado (nada disso é recriado):
--   google_calendar_connections  → credenciais Google por (tenant, usuário). Tokens só no backend
--                                  (service_role): nenhum grant de coluna sensível para anon/authenticated.
--   reunioes                     → agenda comercial do Spy; /api/google-calendar/sync continua alimentando.
--
-- O que esta migration acrescenta:
--   integrations           registro de cada SERVIÇO conectado (google/calendar, google/tasks, futuramente
--                          gmail, drive, sheets, contacts, meta/instagram...). SEM tokens: só estado, escopos,
--                          conta, última sincronização. Generaliza para outros provedores.
--   integration_sync_runs  log de cada sincronização (status, contagens, erro).
--   google_calendar_events eventos sincronizados (idempotente por integração + calendário + id externo).
--   google_tasks           tarefas sincronizadas (idempotente por integração + lista + id externo).
--   aurora_google_agenda / aurora_google_tasks  visões para a Aurora consultar (security_invoker: respeitam a RLS).
--
-- Segurança: RLS em tudo; leitura só do dono da conexão (ou admin do tenant / super admin nos registros de
-- conexão); escrita só pelo backend (service_role). Eventos e tarefas são pessoais: só o dono lê.

-- ── integrations ───────────────────────────────────────────────────────────
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  provider text not null,               -- 'google', 'meta', ...
  service text not null,                -- 'calendar', 'tasks', 'gmail', 'drive', 'sheets', 'contacts', ...
  provider_account_id text,             -- id estável da conta no provedor
  account_email text,
  scopes text[] not null default '{}',  -- escopos efetivamente concedidos
  status text not null default 'connected'
    check (status in ('connected', 'needs_reauth', 'disconnected', 'error')),
  -- Aponta para a linha de credenciais (ex.: google_calendar_connections.id). Sem FK de propósito: cada
  -- provedor guarda credenciais na sua própria tabela, só visível ao backend.
  credential_table text,
  credential_id uuid,
  sync_state jsonb not null default '{}'::jsonb,   -- cursores incrementais (ex.: tasks updatedMin)
  last_sync_at timestamptz,
  last_sync_status text check (last_sync_status in ('running', 'ok', 'error')),
  last_sync_error text,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint integrations_unique_service unique (tenant_id, user_id, provider, service)
);

create index if not exists idx_integrations_tenant on public.integrations (tenant_id, provider, service);
create index if not exists idx_integrations_user on public.integrations (user_id);

create or replace trigger update_integrations_modtime
  before update on public.integrations
  for each row execute function update_modified_column();

-- ── integration_sync_runs ──────────────────────────────────────────────────
create table if not exists public.integration_sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  provider text not null,
  service text not null,
  trigger text not null default 'manual' check (trigger in ('manual', 'connect', 'scheduled')),
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fetched integer not null default 0,
  created integer not null default 0,
  updated integer not null default 0,
  removed integer not null default 0,
  error text,
  details jsonb not null default '{}'::jsonb
);

create index if not exists idx_sync_runs_integration on public.integration_sync_runs (integration_id, started_at desc);

-- ── google_calendar_events ─────────────────────────────────────────────────
create table if not exists public.google_calendar_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  external_event_id text not null,
  calendar_id text not null default 'primary',
  title text,
  description text,
  location text,
  start_at timestamptz,
  end_at timestamptz,
  all_day boolean not null default false,
  timezone text,
  status text not null default 'confirmed',   -- confirmed | tentative | cancelled
  organizer jsonb,
  attendees jsonb not null default '[]'::jsonb,
  html_link text,
  meet_link text,
  external_created_at timestamptz,
  external_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  raw_data jsonb,
  constraint google_calendar_events_unique unique (integration_id, calendar_id, external_event_id)
);

create index if not exists idx_gcal_events_user_start on public.google_calendar_events (tenant_id, user_id, start_at);

-- ── google_tasks ───────────────────────────────────────────────────────────
create table if not exists public.google_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  integration_id uuid not null references public.integrations(id) on delete cascade,
  external_task_id text not null,
  task_list_id text not null,
  task_list_title text,
  parent_external_id text,
  title text,
  notes text,
  due_at timestamptz,
  completed_at timestamptz,
  status text not null default 'needsAction',   -- needsAction | completed
  deleted boolean not null default false,
  external_updated_at timestamptz,
  synced_at timestamptz not null default now(),
  raw_data jsonb,
  constraint google_tasks_unique unique (integration_id, task_list_id, external_task_id)
);

create index if not exists idx_gtasks_user_due on public.google_tasks (tenant_id, user_id, due_at);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.integrations enable row level security;
alter table public.integration_sync_runs enable row level security;
alter table public.google_calendar_events enable row level security;
alter table public.google_tasks enable row level security;

-- Registro de conexões: o próprio dono, o admin do tenant e o super admin enxergam. Escrita: só backend.
create policy integrations_select on public.integrations
  for select to authenticated
  using (
    (tenant_id = public.current_tenant_id() and user_id = auth.uid())
    or (tenant_id = public.current_tenant_id()
        and exists (select 1 from public.users u where u.id = auth.uid() and u.tenant_id = integrations.tenant_id and u.is_tenant_admin))
    or public.is_super_admin()
  );

create policy sync_runs_select on public.integration_sync_runs
  for select to authenticated
  using (
    exists (select 1 from public.integrations i where i.id = integration_sync_runs.integration_id)
  );

-- Dados sincronizados são pessoais (agenda e tarefas de alguém): só o dono lê.
create policy gcal_events_select on public.google_calendar_events
  for select to authenticated
  using ((tenant_id = public.current_tenant_id() and user_id = auth.uid()) or public.is_super_admin());

create policy gtasks_select on public.google_tasks
  for select to authenticated
  using ((tenant_id = public.current_tenant_id() and user_id = auth.uid()) or public.is_super_admin());

-- Nenhum grant de escrita (nem de TRUNCATE) para anon/authenticated; leitura só para authenticated.
revoke all on public.integrations, public.integration_sync_runs, public.google_calendar_events, public.google_tasks from anon, authenticated;
grant select on public.integrations, public.integration_sync_runs, public.google_calendar_events, public.google_tasks to authenticated;

-- ── Visões para a Aurora (respeitam a RLS de quem consulta) ────────────────
create or replace view public.aurora_google_agenda with (security_invoker = true) as
  select e.id, e.tenant_id, e.user_id, e.title, e.description, e.location, e.start_at, e.end_at, e.all_day,
         e.status, e.attendees, e.meet_link, e.html_link, e.calendar_id, e.synced_at
    from public.google_calendar_events e
   where e.status <> 'cancelled';

create or replace view public.aurora_google_tasks with (security_invoker = true) as
  select t.id, t.tenant_id, t.user_id, t.task_list_title, t.title, t.notes, t.due_at, t.completed_at,
         (t.status <> 'completed') as pending,
         (t.status <> 'completed' and t.due_at is not null and t.due_at < now()) as overdue,
         t.synced_at
    from public.google_tasks t
   where not t.deleted;

revoke all on public.aurora_google_agenda, public.aurora_google_tasks from anon;
grant select on public.aurora_google_agenda, public.aurora_google_tasks to authenticated;
