-- Gestão de Tráfego Pago (Kanban + Calendário): campanhas planejadas e em andamento.
-- Tabela nova; mesma regra de isolamento por empresa de marketing_content (has_tenant_access).
create table if not exists public.marketing_trafego (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id),
  title text not null,
  description text,
  platform text not null default 'Meta Ads',
  status text not null default 'planejamento',
  start_date date,
  end_date date,
  budget numeric(14,2) not null default 0,
  priority text not null default 'Média',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.marketing_trafego enable row level security;

drop policy if exists tenant_isolation on public.marketing_trafego;
create policy tenant_isolation on public.marketing_trafego
  for all to authenticated
  using ((select public.has_tenant_access(marketing_trafego.tenant_id)))
  with check ((select public.has_tenant_access(marketing_trafego.tenant_id)));

create index if not exists marketing_trafego_tenant_idx on public.marketing_trafego (tenant_id, status) where deleted_at is null;
