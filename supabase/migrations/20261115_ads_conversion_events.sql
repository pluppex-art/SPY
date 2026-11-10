-- Conversões do CRM -> Meta (Conversions API): registro dos envios (um por lead e evento) e trigger que avisa o servidor
-- quando um lead fecha ou muda de etapa, só se a empresa ligou "crmSync" na integração Meta. Nunca bloqueia o update do lead.
create table if not exists public.ads_conversion_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  lead_id text not null,
  platform text not null default 'meta',
  event_name text not null,
  status text not null,
  detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, lead_id, platform, event_name)
);
create index if not exists idx_ads_conv_tenant_created on public.ads_conversion_events (tenant_id, created_at desc);
alter table public.ads_conversion_events enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ads_conversion_events' and policyname='tenant_read') then
    create policy tenant_read on public.ads_conversion_events for select using ((select has_tenant_access(tenant_id)));
  end if;
end $$;

create or replace function public.trg_ads_conversion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_kind text; v_on boolean; v_secret text;
begin
  if new.status = 'Fechado' and old.status is distinct from 'Fechado' then v_kind := 'closed';
  elsif new."stageId" is distinct from old."stageId" then v_kind := 'stage';
  else return new;
  end if;

  select exists (
    select 1 from public.app_settings a
    where a.tenant_id = new.tenant_id and a.key = 'integracoes_meta_ads'
      and (a.value -> 'crmSync' ->> 'enabled') = 'true'
  ) into v_on;
  if not v_on then return new; end if;

  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'automation_internal_secret';
  perform net.http_post(
    url := 'https://www.spycrm.com.br/api/ads/conversion',
    body := jsonb_build_object('tenantId', new.tenant_id, 'leadId', new.id, 'kind', v_kind),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || coalesce(v_secret, ''))
  );
  return new;
exception when others then
  return new;
end;
$function$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_ads_conversion' and tgrelid = 'public.leads'::regclass) then
    create trigger trg_ads_conversion after update on public.leads for each row execute function public.trg_ads_conversion();
  end if;
end $$;
