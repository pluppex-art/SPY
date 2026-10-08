-- Cadastro de tags do Financeiro. As tags dos lançamentos continuam em finance_entries.tags (text[]);
-- esta tabela é o catálogo (nome, cor, descrição) de onde os formulários passam a escolher.
create table if not exists public.finance_tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  nome text not null,
  cor text not null default '#6366f1',
  descricao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists finance_tags_tenant_nome_uniq on public.finance_tags (tenant_id, lower(nome));
create index if not exists idx_finance_tags_tenant on public.finance_tags (tenant_id);

alter table public.finance_tags enable row level security;
revoke select on public.finance_tags from anon;

create policy tenant_isolation on public.finance_tags
  for all to authenticated
  using (tenant_id = public.current_tenant_id() or public.is_super_admin())
  with check (tenant_id = public.current_tenant_id() or public.is_super_admin());
