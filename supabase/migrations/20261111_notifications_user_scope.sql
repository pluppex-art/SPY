-- Notificação endereçada a um usuário (user_id) só pode ser vista/alterada por ele. Sem user_id = aviso da empresa toda.
-- Política RESTRICTIVE: soma-se (AND) à tenant_isolation, sem mexer nela.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_own_user_only') then
    create policy notifications_own_user_only on public.notifications
      as restrictive
      for all
      to public
      using (user_id is null or user_id = (select auth.uid()))
      with check (user_id is null or user_id = (select auth.uid()));
  end if;
end $$;
