-- SaaS: planos + assinaturas por tenant, teto de IA por tenant, solicitações LGPD.
-- Tenant SEM linha em tenant_subscriptions = ativo (compatível com os clientes atuais).
-- billing_tick() NÃO é agendada aqui: ver supabase/migrations/20261003_billing_tick_cron.sql.example

create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_cents integer not null default 0 check (price_cents >= 0),
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly','yearly')),
  trial_days integer not null default 0 check (trial_days >= 0),
  limits jsonb not null default '{}'::jsonb,
  features jsonb not null default '[]'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null unique references public.tenants(id) on delete cascade,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  status text not null default 'trial' check (status in ('trial','active','past_due','suspended','canceled')),
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  grace_days integer not null default 7 check (grace_days >= 0),
  gateway text,
  gateway_customer_id text,
  gateway_subscription_id text,
  last_payment_at timestamptz,
  suspended_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tenant_subscriptions_status on public.tenant_subscriptions (status);

create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null,
  from_status text,
  to_status text,
  amount_cents integer,
  gateway_ref text,
  payload jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_billing_events_tenant_created on public.billing_events (tenant_id, created_at desc);

create table if not exists public.tenant_ai_budget (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  monthly_token_limit bigint check (monthly_token_limit is null or monthly_token_limit > 0),
  warn_pct integer not null default 80 check (warn_pct between 1 and 100),
  hard_stop boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.lgpd_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('export','anonymize','consent')),
  subject_type text not null check (subject_type in ('lead','cliente')),
  subject_id text not null,
  requested_by uuid,
  status text not null default 'done' check (status in ('done','failed')),
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_lgpd_requests_tenant_created on public.lgpd_requests (tenant_id, created_at desc);

create index if not exists idx_ai_usage_log_tenant_created on public.ai_usage_log (tenant_id, created_at desc);

alter table public.subscription_plans   enable row level security;
alter table public.tenant_subscriptions enable row level security;
alter table public.billing_events       enable row level security;
alter table public.tenant_ai_budget     enable row level security;
alter table public.lgpd_requests        enable row level security;

create policy plans_read   on public.subscription_plans for select to authenticated using (true);
create policy plans_admin  on public.subscription_plans for all to authenticated using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy subs_read    on public.tenant_subscriptions for select to authenticated using ((select public.has_tenant_access(tenant_id)));
create policy subs_admin   on public.tenant_subscriptions for all to authenticated using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy bill_read    on public.billing_events for select to authenticated using ((select public.has_tenant_access(tenant_id)));
create policy budget_read  on public.tenant_ai_budget for select to authenticated using ((select public.has_tenant_access(tenant_id)));
create policy budget_admin on public.tenant_ai_budget for all to authenticated using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy lgpd_read    on public.lgpd_requests for select to authenticated using ((select public.has_tenant_access(tenant_id)));

revoke all on public.subscription_plans, public.tenant_subscriptions, public.billing_events, public.tenant_ai_budget, public.lgpd_requests from anon;
revoke truncate, references, trigger on public.subscription_plans, public.tenant_subscriptions, public.billing_events, public.tenant_ai_budget, public.lgpd_requests from authenticated;
revoke insert, update, delete on public.billing_events, public.lgpd_requests from authenticated;

create or replace function public.tenant_ai_tokens_month(p_tenant uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(total_tokens), 0)::bigint from public.ai_usage_log
  where tenant_id = p_tenant and created_at >= date_trunc('month', now());
$$;
revoke execute on function public.tenant_ai_tokens_month(uuid) from public, anon;
grant execute on function public.tenant_ai_tokens_month(uuid) to authenticated, service_role;

create or replace function public.billing_tick() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; r record;
begin
  for r in
    select s.id, s.tenant_id, s.status as old_status,
      case
        when s.status = 'trial'  and s.trial_ends_at is not null and s.trial_ends_at < now() then 'past_due'
        when s.status = 'active' and s.current_period_end is not null and s.current_period_end < now() then 'past_due'
        when s.status = 'past_due' and coalesce(s.current_period_end, s.trial_ends_at) is not null
             and coalesce(s.current_period_end, s.trial_ends_at) + make_interval(days => s.grace_days) < now() then 'suspended'
      end as new_status
    from public.tenant_subscriptions s
  loop
    if r.new_status is null then continue; end if;
    update public.tenant_subscriptions
       set status = r.new_status, suspended_at = case when r.new_status = 'suspended' then now() else suspended_at end, updated_at = now()
     where id = r.id;
    insert into public.billing_events (tenant_id, type, from_status, to_status) values (r.tenant_id, 'status_change', r.old_status, r.new_status);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.billing_tick() from public, anon, authenticated;
grant execute on function public.billing_tick() to service_role;
