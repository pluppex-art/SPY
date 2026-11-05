-- Segurança (semana 1 do plano de lançamento).
-- 1) lead_funis estava sem RLS e com INSERT/SELECT/UPDATE/DELETE liberados para anon.
alter table public.lead_funis enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'lead_funis' and policyname = 'tenant_isolation') then
    create policy tenant_isolation on public.lead_funis for all
      using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id));
  end if;
end $$;
revoke all on public.lead_funis from anon;

-- 2) View de uso de tokens passa a respeitar o RLS de quem consulta (ai_usage_log já filtra por empresa).
alter view public.tenant_token_usage_current_month set (security_invoker = true);
revoke all on public.tenant_token_usage_current_month from anon;
-- external_integrations_safe continua com permissão do dono DE PROPÓSITO: ela mascara o segredo
-- (a tabela base não tem policy) e já filtra por has_tenant_access. Só tira o acesso anônimo.
revoke all on public.external_integrations_safe from anon;

-- 3) Funções que mexem em dados não precisam ser chamáveis sem login (já exigem has_tenant_access por dentro).
revoke execute on function public.finalizar_venda(uuid) from public, anon;
revoke execute on function public.lancar_nota_entrada_estoque(uuid, boolean) from public, anon;
revoke execute on function public.registrar_movimentacao_estoque(uuid, text, integer, text) from public, anon;
revoke execute on function public.platform_metrics_overview() from public, anon;
grant execute on function public.finalizar_venda(uuid) to authenticated, service_role;
grant execute on function public.lancar_nota_entrada_estoque(uuid, boolean) to authenticated, service_role;
grant execute on function public.registrar_movimentacao_estoque(uuid, text, integer, text) to authenticated, service_role;
grant execute on function public.platform_metrics_overview() to authenticated, service_role;

-- 4) Funções de gatilho não precisam de EXECUTE para ninguém (o gatilho dispara do mesmo jeito).
revoke execute on function public.enforce_plan_limit_leads() from public, anon, authenticated;
revoke execute on function public.enforce_plan_limit_users() from public, anon, authenticated;
revoke execute on function public.sync_plan_setup_from_implementation() from public, anon, authenticated;
revoke execute on function public.sync_plans_from_product() from public, anon, authenticated;
