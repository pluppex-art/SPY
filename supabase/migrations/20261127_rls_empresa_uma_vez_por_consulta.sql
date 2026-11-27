-- NÃO APLICADA. Precisa de autorização.
-- A regra "tenant_isolation" chama has_tenant_access() uma vez para CADA linha lida (uma consulta a users por linha).
-- Em lead_activities isso são 60 mil chamadas por leitura numa empresa grande, e estoura o limite de 8 s.
-- Aqui a MESMA regra (própria empresa, ou master, ou empresa de parceiro) é resolvida uma vez por consulta.
-- Medido em leitura, sem aplicar: a pior página de atividades cai de cerca de 3 s para 12 ms.

create or replace function public.usuario_e_master()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((select u.is_master from public.users u where u.id = auth.uid()), false)
$$;

create or replace function public.empresas_acessiveis()
returns uuid[] language sql stable security definer set search_path to 'public' as $$
  select coalesce(array_agg(x.id), array[]::uuid[]) from (
    select u.tenant_id as id from public.users u where u.id = auth.uid() and u.tenant_id is not null
    union
    select tp.tenant_id from public.tenant_partners tp join public.users u on u.partner_id = tp.partner_id where u.id = auth.uid()
  ) x
$$;

do $$
declare t text;
begin
  foreach t in array array['lead_activities', 'leads', 'tasks', 'clientes', 'chat_messages'] loop
    execute format(
      'alter policy tenant_isolation on public.%I
         using ((select public.usuario_e_master()) or tenant_id = any ((select public.empresas_acessiveis())::uuid[]))
         with check ((select public.usuario_e_master()) or tenant_id = any ((select public.empresas_acessiveis())::uuid[]))', t);
  end loop;
end $$;

-- Para desfazer:
-- do $$ declare t text; begin
--   foreach t in array array['lead_activities','leads','tasks','clientes','chat_messages'] loop
--     execute format('alter policy tenant_isolation on public.%I using ((select public.has_tenant_access(%I.tenant_id))) with check ((select public.has_tenant_access(%I.tenant_id)))', t, t, t);
--   end loop;
-- end $$;
