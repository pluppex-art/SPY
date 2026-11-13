-- Trilha de auditoria do que o chatbot (nó "Salvar dados") grava no formulário da implementação:
-- quem/o quê/quando. A implementação em si continua em public.implementations.data (sem segundo cadastro).
-- Só leitura e inserção: ninguém edita nem apaga histórico.
create table if not exists public.implementation_field_changes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  implementation_id text not null references public.implementations(id) on delete cascade,
  field_id text not null,
  old_value jsonb,
  new_value jsonb,
  source text not null default 'chatbot',
  chatbot_session text,
  created_at timestamptz not null default now()
);
create index if not exists idx_impl_field_changes_impl on public.implementation_field_changes(implementation_id, created_at desc);

-- Reexecutável: se uma versão anterior desta tabela já existe (com colunas/policies de outro desenho), acerta o estado.
alter table public.implementation_field_changes add column if not exists chatbot_session text;
alter table public.implementation_field_changes drop constraint if exists implementation_field_changes_source_check;

alter table public.implementation_field_changes enable row level security;
drop policy if exists "impl_field_changes_select" on public.implementation_field_changes;
create policy "impl_field_changes_select" on public.implementation_field_changes
  for select using (has_tenant_access(tenant_id));
-- Inserção: só pelo servidor (service role, que ignora RLS). A policy de insert da versão anterior é removida:
-- com ela, qualquer usuário do tenant poderia forjar linhas de auditoria.
drop policy if exists "impl_field_changes_insert" on public.implementation_field_changes;
