-- Registro de erros próprio (alternativa gratuita ao Sentry): erros do navegador e do servidor.
-- Só o servidor (service role) grava; só o master lê. Fica 30 dias.
create table if not exists public.app_error_log (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  tenant_id uuid references public.tenants(id) on delete set null,
  user_id uuid,
  origem text not null check (origem in ('web', 'servidor')),
  mensagem text not null,
  stack text,
  url text,
  navegador text,
  fingerprint text not null
);
create index if not exists idx_app_error_log_created on public.app_error_log (created_at desc);
create index if not exists idx_app_error_log_fp on public.app_error_log (fingerprint, created_at desc);

alter table public.app_error_log enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'app_error_log' and policyname = 'master_le') then
    create policy master_le on public.app_error_log for select using (public.is_super_admin());
  end if;
end $$;
revoke all on public.app_error_log from anon;
revoke insert, update, delete on public.app_error_log from authenticated;

-- Limpeza diária (03:17): guarda só 30 dias.
select cron.schedule('limpar-app-error-log', '17 3 * * *', $$delete from public.app_error_log where created_at < now() - interval '30 days'$$);
