-- Checkout com adicionais e plano anual. Autorizado pelo dono e aplicado em 27/11/2026.
-- Só acrescenta: nenhuma linha existente é apagada ou reescrita.
alter table public.checkout_orders
  add column if not exists ciclo text not null default 'monthly',
  add column if not exists itens jsonb not null default '[]'::jsonb;
alter table public.checkout_orders drop constraint if exists checkout_orders_ciclo_check;
alter table public.checkout_orders add constraint checkout_orders_ciclo_check check (ciclo in ('monthly', 'yearly'));
alter table public.checkout_orders drop constraint if exists checkout_orders_kind_check;
alter table public.checkout_orders add constraint checkout_orders_kind_check check (kind in ('new', 'renewal', 'addon'));

alter table public.tenant_subscriptions
  add column if not exists ciclo text not null default 'monthly',
  add column if not exists itens jsonb not null default '[]'::jsonb;
alter table public.tenant_subscriptions drop constraint if exists tenant_subscriptions_ciclo_check;
alter table public.tenant_subscriptions add constraint tenant_subscriptions_ciclo_check check (ciclo in ('monthly', 'yearly'));

-- Limite de usuários do plano + usuários extras comprados (usuário adicional e acesso extra da Aurora).
create or replace function public.spy_plan_limit(p_tenant uuid, p_key text)
returns bigint
language sql
stable security definer
set search_path to 'public'
as $function$
  select nullif(p.limits ->> p_key, '')::bigint
    + case when p_key = 'users' then coalesce((
        select sum(greatest(0, (i ->> 'qtd')::int))
          from jsonb_array_elements(case when jsonb_typeof(s.itens) = 'array' then s.itens else '[]'::jsonb end) i
         where i ->> 'sku' in ('SPY-ADD-USUARIO', 'SPY-ADD-AURORA')), 0) else 0 end
  from public.tenant_subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.tenant_id = p_tenant and s.status in ('trial', 'active', 'past_due')
$function$;
