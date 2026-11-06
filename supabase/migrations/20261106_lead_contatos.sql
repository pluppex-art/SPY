-- Outras pessoas do mesmo negocio (socios, financeiro...) dentro do card do lead.
-- Motivo: so 5.005 de 18.543 leads tem empresa em `clientes`, e `cliente_contatos` exige cliente_id; um prospecto
-- ainda nao tem empresa cadastrada. O WhatsApp de cada pessoa aparece na conversa do card (ver /api/leads/:id/conversa-whatsapp).
create table if not exists public.lead_contatos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  nome text not null check (length(btrim(nome)) > 0),
  cargo text,
  telefone text,
  email text,
  phone_digits text generated always as (regexp_replace(coalesce(telefone, ''), '\D', '', 'g')) stored,
  created_at timestamptz not null default now()
);
comment on table public.lead_contatos is 'Outras pessoas do mesmo negocio (socios, financeiro...). O WhatsApp de cada uma aparece na conversa do card do lead.';

create index if not exists lead_contatos_lead_idx on public.lead_contatos (lead_id);
create index if not exists lead_contatos_fone_idx on public.lead_contatos (tenant_id, phone_digits) where phone_digits <> '';
create unique index if not exists lead_contatos_lead_fone_uniq on public.lead_contatos (lead_id, phone_digits) where phone_digits <> '';

-- O tenant do contato e sempre o do lead (mesmo para master/parceiro que enxergam varias empresas).
create or replace function public.lead_contatos_set_tenant() returns trigger
language plpgsql security invoker set search_path = public as $$
begin
  select l.tenant_id into new.tenant_id from public.leads l where l.id = new.lead_id;
  if new.tenant_id is null then raise exception 'lead nao encontrado ou sem acesso'; end if;
  return new;
end $$;
drop trigger if exists lead_contatos_tenant on public.lead_contatos;
create trigger lead_contatos_tenant before insert or update of lead_id on public.lead_contatos
  for each row execute function public.lead_contatos_set_tenant();

alter table public.lead_contatos enable row level security;
drop policy if exists tenant_isolation on public.lead_contatos;
create policy tenant_isolation on public.lead_contatos for all to authenticated
  using ((select has_tenant_access(tenant_id))) with check ((select has_tenant_access(tenant_id)));
-- Quem so ve os proprios leads (vendedor restrito) so ve os contatos desses leads: a RLS de leads vale dentro do EXISTS.
drop policy if exists lead_visivel on public.lead_contatos;
create policy lead_visivel on public.lead_contatos as restrictive for all to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_contatos.lead_id))
  with check (exists (select 1 from public.leads l where l.id = lead_contatos.lead_id));

revoke all on public.lead_contatos from anon;
grant select, insert, update, delete on public.lead_contatos to authenticated;
grant all on public.lead_contatos to service_role;
