-- Métricas de aquisição (CPL, MQL, CPLQ, CAC, ROAS) por empresa: investimento em mídia + agregação por origem.
create table if not exists public.marketing_spend (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  month date not null,
  source text not null default '',
  amount numeric(14,2) not null check (amount >= 0),
  note text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_marketing_spend_tenant_month on public.marketing_spend (tenant_id, month);
alter table public.marketing_spend enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='marketing_spend' and policyname='tenant_isolation') then
    create policy tenant_isolation on public.marketing_spend for all
      using ((select has_tenant_access(tenant_id))) with check ((select has_tenant_access(tenant_id)));
  end if;
end $$;

-- MQL = lead (não desqualificado) que fechou, tem score >= mínimo ou passou da 1ª etapa do funil (e não está perdido).
-- Vendas = fechados com data de fechamento (closed_at) no período. Fuso de São Paulo. SECURITY INVOKER (RLS vale).
create or replace function public.marketing_aquisicao(p_tenant uuid, p_from date, p_to date, p_min_score int default 60)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $$
  with base as (
    select coalesce(nullif(btrim(l.source), ''), '(sem origem)') as origem,
           l.status, coalesce(l."scoreIA", 0) as score, l."stageId" as stage, coalesce(l.value, 0) as value,
           (l.created_at at time zone 'America/Sao_Paulo')::date as criado,
           (l.closed_at at time zone 'America/Sao_Paulo')::date as fechado
    from public.leads l
    where l.tenant_id = p_tenant and l.deleted_at is null
  ),
  novos as (
    select origem, count(*) as leads,
           count(*) filter (where status is distinct from 'Desqualificado'
                              and (status = 'Fechado' or score >= p_min_score
                                   or (status is distinct from 'Perdido' and stage is not null and stage not in ('1', 'sdr-1') and stage !~ '-0$'))) as mql
    from base where criado between p_from and p_to group by origem
  ),
  vendas as (
    select origem, count(*) as vendas, coalesce(sum(value), 0) as receita
    from base where status = 'Fechado' and fechado between p_from and p_to group by origem
  )
  select jsonb_build_object(
    'porOrigem', coalesce((
      select jsonb_agg(jsonb_build_object('origem', o.origem, 'leads', coalesce(n.leads, 0), 'mql', coalesce(n.mql, 0),
                                           'vendas', coalesce(v.vendas, 0), 'receita', coalesce(v.receita, 0))
                       order by coalesce(n.leads, 0) desc, o.origem)
      from (select origem from novos union select origem from vendas) o
      left join novos n using (origem) left join vendas v using (origem)), '[]'::jsonb),
    'vendasSemData', (select count(*) from base where status = 'Fechado' and fechado is null)
  );
$$;
