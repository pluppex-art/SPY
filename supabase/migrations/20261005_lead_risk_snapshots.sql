-- Histórico diário de quantos leads estavam em cada faixa de risco (Radar,
-- src/pages/crm/Radar.tsx) — sem isso não existia nenhum jeito real de
-- mostrar tendência/"vs período anterior", já que timeIdle é sempre o
-- estado AGORA, não um retrato do passado. A linha de "hoje" é upsertada
-- toda vez que alguém abre o Radar (não depende de cron) e as linhas de
-- dias passados ficam congeladas — o gráfico começa vazio/esparso e vai se
-- preenchendo com dado real a partir de quando essa migration for aplicada.

create table if not exists public.lead_risk_snapshots (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id() references public.tenants(id),
  snapshot_date date not null default current_date,
  critico_count int not null default 0,
  alto_count int not null default 0,
  atencao_count int not null default 0,
  total_count int not null default 0,
  valor_em_risco numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_lead_risk_snapshots_tenant_date
  on public.lead_risk_snapshots (tenant_id, snapshot_date);
create index if not exists idx_lead_risk_snapshots_tenant
  on public.lead_risk_snapshots (tenant_id, snapshot_date desc);

alter table public.lead_risk_snapshots enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'lead_risk_snapshots' and policyname = 'tenant_isolation'
  ) then
    execute 'create policy tenant_isolation on public.lead_risk_snapshots for all using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id))';
  end if;
end $$;

-- Mesmo tratamento de 20261002_os_revoke_anon_graphql_exposure.sql: RLS já
-- protege o acesso real (tenant_isolation), isto só tira a tabela do schema
-- GraphQL público exposto pro papel anon.
revoke select on public.lead_risk_snapshots from anon;
