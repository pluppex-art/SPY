-- Inscrições de Web Push (notificação do sistema com o app fechado): uma linha por aparelho/navegador.
-- O envio é feito só pelo servidor (service role); o usuário só enxerga e gerencia as PRÓPRIAS inscrições.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists idx_push_subscriptions_user on public.push_subscriptions (user_id);
create index if not exists idx_push_subscriptions_tenant on public.push_subscriptions (tenant_id);

alter table public.push_subscriptions enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'push_subscriptions' and policyname = 'push_subscriptions_own') then
    create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
      using (user_id = (select auth.uid()))
      with check (user_id = (select auth.uid()) and (select public.has_tenant_access(tenant_id)));
  end if;
end $$;
