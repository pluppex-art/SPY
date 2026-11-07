-- Checkout publico com Pix avulso (sem gateway): cadastro em passos -> QR Code Pix -> confirmacao.
--  * checkout_config: dados do Pix de quem recebe (uma linha so);
--  * checkout_promos: promocoes/cupons (desconto %, desconto em R$, isencao da implantacao, validade, limite de usos);
--  * checkout_orders: pedidos. Preco e sempre calculado no servidor a partir de subscription_plans.
-- Acesso: so super admin pelo app; o checkout publico passa pelo servidor (service role) com limite de requisicoes.

create table if not exists public.checkout_config (
  id text primary key default 'main' check (id = 'main'),
  active boolean not null default false,
  pix_key text not null default '',
  receiver_name text not null default '',
  receiver_city text not null default '',
  notify_email text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.checkout_config (id) values ('main') on conflict do nothing;

create table if not exists public.checkout_promos (
  id uuid primary key default gen_random_uuid(),
  code text,                                   -- null = promocao automatica (vale sem digitar cupom)
  label text not null default '',
  plan_code text,                              -- null = vale para todos os planos
  percent_off integer not null default 0 check (percent_off between 0 and 100),
  amount_off_cents integer not null default 0 check (amount_off_cents >= 0),
  setup_waived boolean not null default false, -- zera a taxa de implantacao
  valid_until timestamptz,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists checkout_promos_code_uq on public.checkout_promos (lower(code)) where code is not null;

create table if not exists public.checkout_orders (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  status text not null default 'pending' check (status in ('pending', 'awaiting_confirmation', 'paid', 'canceled', 'expired')),
  plan_id uuid references public.subscription_plans(id) on delete set null,
  plan_code text not null,
  plan_name text not null,
  nome text not null,
  telefone text not null,
  email text not null,
  documento text not null,
  empresa text not null,
  price_cents integer not null check (price_cents >= 0),
  setup_cents integer not null default 0 check (setup_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  total_cents integer not null check (total_cents >= 0),
  promo_id uuid references public.checkout_promos(id) on delete set null,
  promo_code text,
  txid text not null,
  pix_payload text not null,
  lead_id uuid,
  tenant_id uuid,
  error text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  informed_paid_at timestamptz,
  paid_at timestamptz,
  confirmed_by uuid
);
create index if not exists checkout_orders_status_idx on public.checkout_orders (status, created_at desc);

alter table public.checkout_config enable row level security;
alter table public.checkout_promos enable row level security;
alter table public.checkout_orders enable row level security;

drop policy if exists checkout_config_admin on public.checkout_config;
drop policy if exists checkout_promos_admin on public.checkout_promos;
drop policy if exists checkout_orders_admin on public.checkout_orders;
create policy checkout_config_admin on public.checkout_config for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy checkout_promos_admin on public.checkout_promos for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
create policy checkout_orders_admin on public.checkout_orders for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
