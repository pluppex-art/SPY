-- Move as 6 tabelas de backup para um schema que a API (PostgREST) não expõe.
-- Nada é apagado. Para voltar: alter table backups.<tabela> set schema public;
create schema if not exists backups;
revoke all on schema backups from anon, authenticated;
alter table if exists public._bkp_leads_vendedores_20261103 set schema backups;
alter table if exists public._bkp_leads_vendedores2_20261103 set schema backups;
alter table if exists public._bkp_leads_vendedores3_20261103 set schema backups;
alter table if exists public.backup_leads_dedup_20261024 set schema backups;
alter table if exists public.backup_leads_interesse_20260924 set schema backups;
alter table if exists public.leads_productids_backup_20261030 set schema backups;
