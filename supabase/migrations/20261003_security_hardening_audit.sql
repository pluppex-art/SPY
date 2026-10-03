-- Correções da auditoria de segurança de 2026-10-03. Só REMOVE privilégios/restringe acesso.

-- 1) CRÍTICO (reproduzido): a view external_integrations_safe roda como dono (SECURITY DEFINER) e tinha
--    INSERT/UPDATE/DELETE liberados pra anon e authenticated. Um estranho só com a chave pública conseguia
--    INSERIR em external_integrations pela view (a tabela direta bloqueia) — escrita cross-tenant sem login.
--    A view é só de leitura; o backend escreve na tabela via service_role.
revoke all on public.external_integrations_safe from anon;
revoke insert, update, delete, truncate, references, trigger on public.external_integrations_safe from authenticated;

-- 2) Funções SECURITY DEFINER executáveis sem login e sem checagem interna:
--    - atualizar_inadimplencia_mensalidades: UPDATE global em mensalidades (todos os tenants), sem auth.
--    - email_taken: enumeração de e-mails de usuários (auto-cadastro já está desativado).
revoke execute on function public.atualizar_inadimplencia_mensalidades() from public, anon;
revoke execute on function public.email_taken(text) from public, anon;
-- (as RPCs de estoque/venda/métricas já checam has_tenant_access/is_super_admin por dentro; mantidas.)

-- 3) app_settings: a policy tenant_isolation vale pro papel PUBLIC e inclui "tenant_id IS NULL",
--    então anon lê as linhas globais. Restringe pra quem está logado.
drop policy if exists tenant_isolation on public.app_settings;
create policy tenant_isolation on public.app_settings for all to authenticated
  using ((select public.has_tenant_access(tenant_id)) or tenant_id is null)
  with check ((select public.has_tenant_access(tenant_id)));
