-- 20260924_d_storage_and_audit_hardening.sql
-- Leads c06 e c08 da auditoria SPY. Não destrutivo.

-- 1) Storage: buckets finance/proposals continuam públicos para download por URL (o app usa getPublicUrl),
--    mas a LISTAGEM deixa de ser aberta a anon: SELECT passa a exigir a pasta do próprio tenant.
--    (Download por URL pública de bucket público não depende de policy de SELECT.)
drop policy if exists finance_bucket_read on storage.objects;
create policy finance_bucket_read on storage.objects
  for select to authenticated
  using (bucket_id = 'finance'
         and ((storage.foldername(name))[1] = (public.current_tenant_id())::text or public.is_super_admin()));

drop policy if exists proposals_bucket_read on storage.objects;
create policy proposals_bucket_read on storage.objects
  for select to authenticated
  using (bucket_id = 'proposals'
         and ((storage.foldername(name))[1] = (public.current_tenant_id())::text or public.is_super_admin()));

-- 2) Trilhas de auditoria append-only para membros (leitura e inserção do próprio tenant; sem UPDATE/DELETE).
drop policy if exists tenant_isolation on public.finance_audit_log;
drop policy if exists finance_audit_log_select on public.finance_audit_log;
drop policy if exists finance_audit_log_insert on public.finance_audit_log;
create policy finance_audit_log_select on public.finance_audit_log
  for select using ((select public.has_tenant_access(finance_audit_log.tenant_id)));
create policy finance_audit_log_insert on public.finance_audit_log
  for insert with check ((select public.has_tenant_access(finance_audit_log.tenant_id)));

drop policy if exists tenant_isolation on public.aurora_audit_log;
drop policy if exists aurora_audit_log_select on public.aurora_audit_log;
drop policy if exists aurora_audit_log_insert on public.aurora_audit_log;
create policy aurora_audit_log_select on public.aurora_audit_log
  for select to authenticated using ((select public.has_tenant_access(aurora_audit_log.tenant_id)));
create policy aurora_audit_log_insert on public.aurora_audit_log
  for insert to authenticated with check ((select public.has_tenant_access(aurora_audit_log.tenant_id)));

revoke update, delete on public.finance_audit_log from anon, authenticated;
revoke update, delete on public.aurora_audit_log from anon, authenticated;
