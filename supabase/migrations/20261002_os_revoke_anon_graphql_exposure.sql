-- GraphQL (pg_graphql) lista toda tabela em que anon/authenticated tem SELECT.
-- O acesso real já é barrado pelo RLS (tenant_isolation); isto só tira as
-- tabelas da OS do schema GraphQL público. O app usa PostgREST (supabase-js).
revoke select on public.os_departamentos from anon;
revoke select on public.os_funis from anon;
revoke select on public.ordens_servico from anon;
