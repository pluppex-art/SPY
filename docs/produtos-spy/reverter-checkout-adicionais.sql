-- Desfaz supabase/migrations/20261127_checkout_adicionais_anual.sql. Só rode com o código antigo no ar.
-- Atenção: apaga o ciclo e os adicionais gravados em pedidos e assinaturas; pedidos 'addon' precisam ser tratados antes.
begin;
create or replace function public.spy_plan_limit(p_tenant uuid, p_key text)
returns bigint language sql stable security definer set search_path to 'public'
as $function$
  select nullif(p.limits ->> p_key, '')::bigint
  from public.tenant_subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.tenant_id = p_tenant and s.status in ('trial', 'active', 'past_due')
$function$;
alter table public.checkout_orders drop constraint if exists checkout_orders_kind_check;
alter table public.checkout_orders add constraint checkout_orders_kind_check check (kind in ('new', 'renewal'));
alter table public.checkout_orders drop column if exists ciclo, drop column if exists itens;
alter table public.tenant_subscriptions drop column if exists ciclo, drop column if exists itens;
commit;
