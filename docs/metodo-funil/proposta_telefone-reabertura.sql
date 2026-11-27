-- PROPOSTA para a entrega 5/6 (recompra e reativação). NÃO APLICAR com a entrega 1.
-- Hoje só pode existir um lead por telefone em cada empresa. Para abrir um novo negócio no mesmo contato, o anterior
-- é marcado como arquivado e sai da regra. Antes de aplicar, o app e os fluxos do n8n precisam passar a escolher o
-- lead NÃO arquivado ao procurar por telefone.
alter table public.leads add column if not exists negocio_arquivado boolean not null default false;
create unique index leads_tenant_phone_uniq_v2 on public.leads (tenant_id, phone_digits)
  where deleted_at is null and phone_digits <> '' and not negocio_arquivado
    and (tenant_id <> '85917b01-b7c6-4ca6-95cb-6afe8393f72f'::uuid or source::text = 'Agente Secreto SPY');
drop index public.leads_tenant_phone_uniq;
alter index public.leads_tenant_phone_uniq_v2 rename to leads_tenant_phone_uniq;
