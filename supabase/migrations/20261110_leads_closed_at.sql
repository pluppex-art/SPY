-- Data de fechamento do lead: preenchida por gatilho quando o status passa a "Fechado" (e limpa se reabrir).
-- Leads fechados ANTES desta migration ficam sem data (não inventamos uma a partir de updated_at).
alter table public.leads add column if not exists closed_at timestamptz;

create or replace function public.set_lead_closed_at() returns trigger
language plpgsql as $fn$
begin
  if new.status = 'Fechado' and (tg_op = 'INSERT' or old.status is distinct from 'Fechado') then
    new.closed_at := coalesce(new.closed_at, now());
  elsif tg_op = 'UPDATE' and old.status = 'Fechado' and new.status is distinct from 'Fechado' then
    new.closed_at := null; -- reabriu o lead
  end if;
  return new;
end
$fn$;

do $blk$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_leads_closed_at' and tgrelid = 'public.leads'::regclass) then
    create trigger trg_leads_closed_at before insert or update of status on public.leads
      for each row execute function public.set_lead_closed_at();
  end if;
end
$blk$;

create index if not exists idx_leads_tenant_closed_at on public.leads (tenant_id, closed_at desc) where closed_at is not null;
