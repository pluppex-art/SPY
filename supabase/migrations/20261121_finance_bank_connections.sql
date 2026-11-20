-- Conexão automática com os bancos (Open Finance via Pluggy).
-- Uma linha por conta do banco encontrada numa conexão (item do Pluggy), ligada a uma conta cadastrada em
-- finance_bank_accounts. Aditivo: não altera nenhuma tabela existente.
-- Escrita SÓ pelo servidor (service role): o navegador apenas lê as conexões da própria empresa.

create table if not exists public.finance_bank_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  provider text not null default 'pluggy',
  item_id text not null,
  connector_name text,
  pluggy_account_id text not null,
  pluggy_account_name text,
  pluggy_account_type text,
  conta_bancaria_id uuid references public.finance_bank_accounts(id) on delete set null,
  status text,
  last_sync_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (item_id, pluggy_account_id)
);

create index if not exists idx_finance_bank_connections_tenant on public.finance_bank_connections (tenant_id);
create index if not exists idx_finance_bank_connections_item on public.finance_bank_connections (item_id);

alter table public.finance_bank_connections enable row level security;
revoke all on public.finance_bank_connections from anon;
-- O navegador só LÊ (as da própria empresa); insert/update/delete não têm policy => só o service role escreve.
revoke insert, update, delete on public.finance_bank_connections from authenticated;

drop policy if exists tenant_read on public.finance_bank_connections;
create policy tenant_read on public.finance_bank_connections
  for select to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin());
