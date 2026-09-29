-- 20260924_c_ai_agent_prompts_authenticated_only.sql
-- Lead c10 da auditoria SPY: prompts-padrão dos agentes não devem ser legíveis por anon.
-- Não destrutivo; sem impacto para usuários logados.
drop policy if exists ai_agent_prompts_select on public.ai_agent_prompts;
create policy ai_agent_prompts_select on public.ai_agent_prompts
  for select
  to authenticated
  using (tenant_id is null or public.has_tenant_access(tenant_id));
revoke all on public.ai_agent_prompts from anon;
