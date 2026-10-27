-- Sincronização completa da Max Data (somente leitura na origem): colunas de
-- rastreio externo + estado/cursor por entidade para sincronizar em lotes retomáveis.
alter table public.clientes add column if not exists externo_sistema text, add column if not exists externo_id text, add column if not exists externo_dados jsonb;
alter table public.products add column if not exists externo_sistema text, add column if not exists externo_id text, add column if not exists externo_dados jsonb;
alter table public.vendas add column if not exists externo_sistema text, add column if not exists externo_id text, add column if not exists cliente_externo_id text,
  add column if not exists valor_desconto numeric, add column if not exists valor_frete numeric, add column if not exists data_venda timestamptz, add column if not exists externo_dados jsonb;
alter table public.venda_items add column if not exists externo_id text, add column if not exists custo_unitario numeric, add column if not exists valor_desconto numeric,
  add column if not exists quantidade_decimal numeric, add column if not exists codigo text;

create unique index if not exists clientes_externo_full_uq on public.clientes (tenant_id, externo_sistema, externo_id);
create unique index if not exists products_externo_full_uq on public.products (tenant_id, externo_sistema, externo_id);
create unique index if not exists vendas_externo_full_uq on public.vendas (tenant_id, externo_sistema, externo_id);
create unique index if not exists venda_items_externo_full_uq on public.venda_items (venda_id, externo_id);

create table if not exists public.integracao_sync_state (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  fonte text not null,
  entidade text not null,
  status text not null default 'pendente' check (status in ('pendente','rodando','concluida','erro')),
  cursor jsonb not null default '{}'::jsonb,
  total integer,
  sincronizados integer not null default 0,
  erro text,
  iniciado_em timestamptz,
  atualizado_em timestamptz not null default now(),
  primary key (tenant_id, fonte, entidade)
);
alter table public.integracao_sync_state enable row level security;
create policy "integracao_sync_state_select" on public.integracao_sync_state for select using (has_tenant_access(tenant_id));
