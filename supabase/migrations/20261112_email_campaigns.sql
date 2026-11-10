-- Disparo de e-mail em massa por empresa (campanhas, destinatários e descadastros). Ver server/emailCampaigns.ts.
create table if not exists public.email_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  subject text not null,
  body text not null,
  audience jsonb not null default '{}'::jsonb,
  status text not null default 'ready',
  total integer not null default 0,
  sent integer not null default 0,
  failed integer not null default 0,
  sender text,
  created_by uuid,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create table if not exists public.email_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.email_campaigns(id) on delete cascade,
  tenant_id uuid not null,
  lead_id text,
  email text not null,
  name text,
  company text,
  status text not null default 'pending',
  error text,
  claimed_at timestamptz,
  sent_at timestamptz
);
create index if not exists idx_ecr_campaign_status on public.email_campaign_recipients (campaign_id, status);
create index if not exists idx_ec_tenant on public.email_campaigns (tenant_id, created_at desc);
create table if not exists public.email_optouts (
  tenant_id uuid not null,
  email text not null,
  created_at timestamptz not null default now(),
  primary key (tenant_id, email)
);
alter table public.email_campaigns enable row level security;
alter table public.email_campaign_recipients enable row level security;
alter table public.email_optouts enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='email_campaigns' and policyname='tenant_isolation') then
    create policy tenant_isolation on public.email_campaigns for all using ((select has_tenant_access(tenant_id))) with check ((select has_tenant_access(tenant_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='email_campaign_recipients' and policyname='tenant_isolation') then
    create policy tenant_isolation on public.email_campaign_recipients for all using ((select has_tenant_access(tenant_id))) with check ((select has_tenant_access(tenant_id)));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='email_optouts' and policyname='tenant_isolation') then
    create policy tenant_isolation on public.email_optouts for all using ((select has_tenant_access(tenant_id))) with check ((select has_tenant_access(tenant_id)));
  end if;
end $$;
