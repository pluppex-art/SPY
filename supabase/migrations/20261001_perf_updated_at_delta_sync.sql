-- Base da carga incremental (delta sync) por tenant: updated_at confiável + índice (tenant_id, updated_at).
-- Aditiva: não apaga nem altera dados existentes. Depois de aplicar, ligar DELTA_SYNC_ENABLED em DataContext.tsx.
create or replace function public.spy_touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at := now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['leads','clientes','tasks','reunioes','finance_entries','lead_activities','contracts','appointments','proposals','proposal_items']
  loop
    if to_regclass('public.'||t) is null then continue; end if;
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='updated_at') then
      execute format('alter table public.%I add column updated_at timestamptz', t);
      if exists (select 1 from information_schema.columns where table_schema='public' and table_name=t and column_name='created_at') then
        execute format('update public.%I set updated_at = coalesce(created_at, now())', t);
      else
        execute format('update public.%I set updated_at = now()', t);
      end if;
      execute format('alter table public.%I alter column updated_at set default now()', t);
      execute format('alter table public.%I alter column updated_at set not null', t);
    end if;
    execute format('drop trigger if exists trg_spy_touch_updated_at on public.%I', t);
    execute format('create trigger trg_spy_touch_updated_at before update on public.%I for each row execute function public.spy_touch_updated_at()', t);
    execute format('create index if not exists %I on public.%I (tenant_id, updated_at)', 'idx_'||t||'_tenant_updated', t);
  end loop;
end $$;

-- Notificações: o login só lê as não lidas mais recentes do tenant.
create index if not exists idx_notifications_tenant_unread_created on public.notifications (tenant_id, created_at desc) where is_read = false;
