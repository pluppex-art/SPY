-- Checkout: endurecimento antes do lancamento (idempotente; pode rodar mais de uma vez).
--  * fulfill recuperavel (fulfilled_at, created_user_id), renovacao (kind), agentes n8n, e-mail de acesso, LGPD, cupons atomicos,
--    dedup por e-mail, avisos de vencimento (billing_notices) e busca de usuario do Auth por e-mail.

alter table public.checkout_orders
  add column if not exists kind text not null default 'new',
  add column if not exists fulfilled_at timestamptz,
  add column if not exists created_user_id uuid,
  add column if not exists agentes_ok boolean,
  add column if not exists agentes_erro text,
  add column if not exists acesso_email_ok boolean,
  add column if not exists promo_consumed_at timestamptz,
  add column if not exists consent_at timestamptz,
  add column if not exists consent_ip text,
  add column if not exists consent_version text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'checkout_orders_kind_check') then
    alter table public.checkout_orders add constraint checkout_orders_kind_check check (kind in ('new', 'renewal'));
  end if;
end $$;

-- Pedidos ja pagos antes desta migration contam como concluidos.
update public.checkout_orders set fulfilled_at = coalesce(paid_at, now()) where status = 'paid' and fulfilled_at is null;

-- Dedup: no maximo UM pedido 'pending' por e-mail e tipo. Antes de criar o indice, expira os vencidos e cancela os duplicados antigos.
update public.checkout_orders set status = 'expired' where status = 'pending' and expires_at < now();
update public.checkout_orders o set status = 'canceled'
 where o.status = 'pending'
   and exists (select 1 from public.checkout_orders n
                where n.status = 'pending' and lower(n.email) = lower(o.email) and n.kind = o.kind
                  and (n.created_at > o.created_at or (n.created_at = o.created_at and n.id > o.id)));
create unique index if not exists checkout_orders_open_email_uq
  on public.checkout_orders (lower(email), kind) where status = 'pending';
create index if not exists checkout_orders_email_created_idx on public.checkout_orders (lower(email), created_at desc);
create index if not exists checkout_orders_ip_created_idx on public.checkout_orders (consent_ip, created_at desc) where consent_ip is not null;

-- Cupom: consumo atomico (uma unica instrucao; respeita max_uses mesmo com confirmacoes simultaneas).
create or replace function public.checkout_promo_consume(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.checkout_promos set uses = uses + 1
   where id = p_id and (max_uses is null or uses < max_uses);
  get diagnostics n = row_count;
  return n > 0;
end $$;
revoke execute on function public.checkout_promo_consume(uuid) from public, anon, authenticated;
grant execute on function public.checkout_promo_consume(uuid) to service_role;

-- Id do usuario do Auth por e-mail (o admin API nao tem busca por e-mail). So o servidor (service role) chama.
create or replace function public.auth_user_id_by_email(p_email text) returns uuid
language sql stable security definer set search_path = public, auth as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke execute on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;

-- Avisos de vencimento enviados (D-5, D0, D+3): a chave unica impede enviar o mesmo aviso duas vezes.
create table if not exists public.billing_notices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  kind text not null check (kind in ('d-5', 'd0', 'd+3')),
  period_end timestamptz not null,
  to_email text,
  sent_at timestamptz not null default now(),
  unique (tenant_id, kind, period_end)
);
create index if not exists billing_notices_sent_idx on public.billing_notices (sent_at desc);
alter table public.billing_notices enable row level security;
drop policy if exists billing_notices_admin on public.billing_notices;
create policy billing_notices_admin on public.billing_notices for select to authenticated using ((select public.is_super_admin()));
revoke all on public.billing_notices from anon;
revoke insert, update, delete, truncate, references, trigger on public.billing_notices from authenticated;
