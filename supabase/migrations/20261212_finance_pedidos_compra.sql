-- Pedidos de compra do Financeiro: o pedido (fornecedor, centro de custo, solicitante, situação) e os itens.
-- Ao receber o pedido, a tela gera a conta a pagar em finance_entries (centro de custo vai junto).
create table if not exists public.finance_pedidos_compra (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  numero integer not null,
  fornecedor text not null,
  contato_id text,
  centro_custo_id uuid references public.finance_centros_custo(id) on delete set null,
  solicitante text,
  data_pedido date not null default current_date,
  previsao_entrega date,
  status text not null default 'Rascunho'
    check (status in ('Rascunho', 'Aguardando aprovação', 'Aprovado', 'Recebido', 'Cancelado')),
  forma_pagamento text,
  parcelas integer not null default 1 check (parcelas >= 1 and parcelas <= 60),
  primeiro_vencimento date,
  observacoes text,
  total numeric not null default 0,
  aprovado_por text,
  aprovado_em timestamptz,
  recebido_em timestamptz,
  lancamento_grupo_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists finance_pedidos_compra_tenant_numero_uniq on public.finance_pedidos_compra (tenant_id, numero);
create index if not exists idx_finance_pedidos_compra_tenant_status on public.finance_pedidos_compra (tenant_id, status);
create index if not exists idx_finance_pedidos_compra_centro on public.finance_pedidos_compra (centro_custo_id);

create table if not exists public.finance_pedido_compra_itens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  pedido_id uuid not null references public.finance_pedidos_compra(id) on delete cascade,
  descricao text not null,
  quantidade numeric not null default 1 check (quantidade > 0),
  valor_unitario numeric not null default 0 check (valor_unitario >= 0),
  category_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_finance_pedido_compra_itens_pedido on public.finance_pedido_compra_itens (pedido_id);
create index if not exists idx_finance_pedido_compra_itens_tenant on public.finance_pedido_compra_itens (tenant_id);

alter table public.finance_pedidos_compra enable row level security;
alter table public.finance_pedido_compra_itens enable row level security;
revoke select on public.finance_pedidos_compra from anon;
revoke select on public.finance_pedido_compra_itens from anon;

drop policy if exists tenant_isolation on public.finance_pedidos_compra;
create policy tenant_isolation on public.finance_pedidos_compra
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin())
  with check (tenant_id = public.current_tenant_id() or public.is_super_admin());
drop policy if exists tenant_isolation on public.finance_pedido_compra_itens;
create policy tenant_isolation on public.finance_pedido_compra_itens
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin())
  with check (tenant_id = public.current_tenant_id() or public.is_super_admin());
