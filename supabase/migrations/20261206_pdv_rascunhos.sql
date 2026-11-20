-- Rascunho da venda em andamento no PDV: um por usuário e empresa.
-- Salvo a cada alteração do carrinho e apagado ao finalizar, cancelar ou colocar em espera,
-- para a venda sobreviver a fechar o sistema ou trocar de computador.
create table if not exists public.pdv_rascunhos (
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

alter table public.pdv_rascunhos enable row level security;

drop policy if exists pdv_rascunhos_own on public.pdv_rascunhos;
create policy pdv_rascunhos_own on public.pdv_rascunhos
  for all
  using ((select public.has_tenant_access(tenant_id)) and user_id = (select auth.uid()))
  with check ((select public.has_tenant_access(tenant_id)) and user_id = (select auth.uid()));
