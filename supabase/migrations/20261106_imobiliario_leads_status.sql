-- O quadro de leads do imobiliario/automotivo marcava Ganho/Perdido so em memoria (perdia ao recarregar)
-- e o painel geral consultava uma coluna "status" que nao existia (HTTP 400, KPIs de leads sempre zerados).
alter table public.imobiliario_leads
  add column if not exists status text not null default 'Ativo';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'imobiliario_leads_status_check') then
    alter table public.imobiliario_leads add constraint imobiliario_leads_status_check check (status in ('Ativo','Ganho','Perdido'));
  end if;
end $$;
