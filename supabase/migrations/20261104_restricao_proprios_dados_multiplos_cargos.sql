-- A restrição "só os próprios dados" passa a considerar TODOS os cargos da pessoa (ex.: Administrador + Closer):
-- só é restrita se todos os cargos restringem (mesma regra da tela, src/lib/cargosUsuario.ts).
-- Cargos da pessoa = colaboradores.cargos (se preenchido); senão, o cargo do login (users.role) — igual a antes.
create or replace function public.usuario_restrito_aos_proprios_dados()
 returns boolean
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select coalesce((
    select not coalesce(u.is_master, false)
       and not coalesce(u.is_tenant_admin, false)
       and coalesce((
         select bool_and(coalesce(c.restringir_aos_proprios_dados, false))
         from public.cargos c
         where c.tenant_id = u.tenant_id
           and c.nome = any (coalesce(nullif(co.cargos, '{}'::text[]), array[u.role]::text[]))
       ), false)
    from public.users u
    left join lateral (
      select x.cargos
      from public.colaboradores x
      where x.tenant_id = u.tenant_id
        and (x.user_id = u.id or lower(x.email::text) = lower(u.email::text))
        and cardinality(x.cargos) > 0
      limit 1
    ) co on true
    where u.id = auth.uid()
  ), false)
$function$;
