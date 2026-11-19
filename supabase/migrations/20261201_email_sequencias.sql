-- Sequência de e-mails (gotejamento): vários e-mails em dias seguidos para cada pessoa inscrita.
create table if not exists public.email_sequences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  steps jsonb not null default '[]'::jsonb,        -- [{ dias, subject, body }]
  status text not null default 'active',           -- active | paused
  campaign_id uuid references public.email_campaigns(id) on delete set null, -- guarda envios, aberturas e cliques
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_es_tenant on public.email_sequences (tenant_id, created_at desc);

create table if not exists public.email_sequence_enrollments (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.email_sequences(id) on delete cascade,
  tenant_id uuid not null,
  lead_id text,
  email text not null,
  name text,
  company text,
  step_idx integer not null default 0,
  next_send_at timestamptz not null default now(),
  status text not null default 'active',           -- active | done | stopped
  falhas integer not null default 0,
  created_at timestamptz not null default now(),
  unique (sequence_id, email)
);
create index if not exists idx_ese_due on public.email_sequence_enrollments (status, next_send_at);
create index if not exists idx_ese_seq on public.email_sequence_enrollments (sequence_id, status);

alter table public.email_sequences enable row level security;
alter table public.email_sequence_enrollments enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='email_sequences' and policyname='tenant_isolation') then
    create policy tenant_isolation on public.email_sequences for all using ((select has_tenant_access(tenant_id))) with check ((select has_tenant_access(tenant_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='email_sequence_enrollments' and policyname='tenant_isolation') then
    create policy tenant_isolation on public.email_sequence_enrollments for all using ((select has_tenant_access(tenant_id))) with check ((select has_tenant_access(tenant_id)));
  end if;
end $$;
