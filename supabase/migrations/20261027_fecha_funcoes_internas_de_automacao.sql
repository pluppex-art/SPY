-- Segurança: funções internas de automação não podem ser chamadas pela API pública.
--
-- criar_os_automacao / executar_automacao_connection são SECURITY DEFINER sem nenhuma
-- checagem de quem chama e estavam executáveis por `anon` e `authenticated` em
-- /rest/v1/rpc/...: qualquer pessoa com a chave pública podia criar OS, tarefas e
-- notificações, ou disparar mensagens, em qualquer empresa (bastando conhecer os ids).
-- Elas só devem ser chamadas pelos triggers (que rodam como dono da tabela) — o app não as
-- chama por rpc(). O mesmo vale para as funções de trigger SECURITY DEFINER.
--
-- NÃO mexe em: has_tenant_access/current_tenant_id/is_*/usuario_*/lead_e_do_usuario
-- (usadas pelas policies RLS, avaliadas como o usuário), get_public_* (páginas públicas),
-- nem em finalizar_venda/estoque/platform_metrics_* (têm checagem de usuário por dentro).

revoke execute on function public.criar_os_automacao(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.executar_automacao_connection(uuid, uuid, uuid, text, text, text, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function public.avaliar_condicao_automacao(jsonb, uuid) from public, anon, authenticated;

-- Funções de trigger SECURITY DEFINER: só o banco as dispara; ninguém precisa de EXECUTE.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as f
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype and p.prosecdef
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.f);
  end loop;
end $$;
