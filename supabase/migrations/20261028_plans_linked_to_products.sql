-- Planos e pacotes de créditos de IA passam a apontar para um PRODUTO do catálogo (fonte única de preço).
--  - subscription_plans / credit_tiers ganham product_id; preço, recorrência e "ativo" vêm do produto
--    (trigger abaixo). O plano guarda só o que é do plano: módulos liberados, limites, teto de IA e vitrine.
--  - subscription_plans.modules: módulos liberados ao tenant que assina o plano ({} = não mexe nos módulos).
--  - subscription_plans.ai_monthly_tokens: teto mensal de IA aplicado ao tenant ao assinar (null = sem teto).

alter table public.subscription_plans
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists modules jsonb not null default '{}'::jsonb,
  add column if not exists ai_monthly_tokens bigint check (ai_monthly_tokens is null or ai_monthly_tokens > 0);
create unique index if not exists uq_subscription_plans_product on public.subscription_plans (product_id) where product_id is not null;

alter table public.credit_tiers
  add column if not exists product_id uuid references public.products(id) on delete set null;
create unique index if not exists uq_credit_tiers_product on public.credit_tiers (product_id) where product_id is not null;

create or replace function public.sync_plans_from_product() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare
  v_active boolean := coalesce(new.active, true) and new.deleted_at is null;
  v_cents integer := greatest(0, round(coalesce(new.price, 0) * 100))::integer;
begin
  update public.subscription_plans
     set price_cents = v_cents,
         active = v_active,
         billing_interval = case when lower(coalesce(new.recurring_period, '')) in ('yearly','annual','anual') then 'yearly' else 'monthly' end,
         updated_at = now()
   where product_id = new.id;
  update public.credit_tiers
     set price_cents = v_cents, active = v_active, updated_at = now()
   where product_id = new.id;
  return new;
end;
$$;

drop trigger if exists trg_sync_plans_from_product on public.products;
create trigger trg_sync_plans_from_product
  after update of price, active, deleted_at, recurring_period on public.products
  for each row execute function public.sync_plans_from_product();

-- Vincula o plano de entrada ao produto de licença já cadastrado (mesmo valor), se houver um só candidato.
do $$
declare v_pid uuid; v_n int;
begin
  select count(*), (array_agg(p.id))[1] into v_n, v_pid
    from public.products p, public.subscription_plans s
   where s.code = 'start' and s.product_id is null
     and p.deleted_at is null and p.is_recurring is true and p.name ilike '%S.P.Y%'
     and round(p.price * 100)::integer = s.price_cents;
  if v_n = 1 then update public.subscription_plans set product_id = v_pid where code = 'start'; end if;
end $$;
