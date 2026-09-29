-- 20260924_e_admin_only_secrets_and_ai_config.sql
-- Leads c07 e c09 da auditoria SPY. APLICAR SÓ DEPOIS de confirmar quem é admin de cada tenant (is_tenant_admin=true):
-- usuários com role "Admin" mas is_tenant_admin=false perderiam acesso a integrações/config de IA. Não destrutivo (só políticas/grants); reversível com DROP POLICY / GRANT.
-- Depende de 20260924_a (is_tenant_admin passa a ser confiável).

-- 1) Credenciais/URLs em app_settings: só admin do tenant (ou master) lê/escreve estas chaves.
--    Política RESTRICTIVE: soma-se (AND) à tenant_isolation existente. service_role ignora RLS.
drop policy if exists app_settings_secrets_admin_only on public.app_settings;
create policy app_settings_secrets_admin_only on public.app_settings
  as restrictive
  for all
  to authenticated
  using (
    (key not like 'integracoes\_%' and key <> 'github_config' and key <> 'globalWebhooks')
    or public.is_tenant_admin_or_master()
  )
  with check (
    (key not like 'integracoes\_%' and key <> 'github_config' and key <> 'globalWebhooks')
    or public.is_tenant_admin_or_master()
  );

-- 2) Configuração de IA e links dinâmicos: só admin (igual a ai_agent_prompts).
drop policy if exists tenant_ai_config_update on public.tenant_ai_config;
create policy tenant_ai_config_update on public.tenant_ai_config
  for update
  using ((select public.has_tenant_access(tenant_ai_config.tenant_id)) and public.is_tenant_admin_or_master())
  with check ((select public.has_tenant_access(tenant_ai_config.tenant_id)) and public.is_tenant_admin_or_master());

drop policy if exists tenant_dynamic_links_insert on public.tenant_dynamic_links;
create policy tenant_dynamic_links_insert on public.tenant_dynamic_links
  for insert
  with check ((select public.has_tenant_access(tenant_dynamic_links.tenant_id)) and public.is_tenant_admin_or_master());

drop policy if exists tenant_dynamic_links_update on public.tenant_dynamic_links;
create policy tenant_dynamic_links_update on public.tenant_dynamic_links
  for update
  using ((select public.has_tenant_access(tenant_dynamic_links.tenant_id)) and public.is_tenant_admin_or_master())
  with check ((select public.has_tenant_access(tenant_dynamic_links.tenant_id)) and public.is_tenant_admin_or_master());

drop policy if exists tenant_dynamic_links_delete on public.tenant_dynamic_links;
create policy tenant_dynamic_links_delete on public.tenant_dynamic_links
  for delete
  using ((select public.has_tenant_access(tenant_dynamic_links.tenant_id)) and public.is_tenant_admin_or_master());

