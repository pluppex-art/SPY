-- Permite abrir um novo negócio no mesmo telefone quando o anterior estiver arquivado. Aplicada em 27/11/2026,
-- antes da entrega prevista (5 ou 6). Sem efeito enquanto nenhum lead tiver negocio_arquivado = true.
-- NÃO marcar lead como arquivado antes de o app e os fluxos do n8n escolherem o lead NÃO arquivado pelo telefone.
alter table public.leads add column if not exists negocio_arquivado boolean not null default false;
create unique index leads_tenant_phone_uniq_v2 on public.leads (tenant_id, phone_digits)
  where deleted_at is null and phone_digits <> '' and not negocio_arquivado
    and (tenant_id <> '85917b01-b7c6-4ca6-95cb-6afe8393f72f'::uuid or source::text = 'Agente Secreto SPY');
drop index public.leads_tenant_phone_uniq;
alter index public.leads_tenant_phone_uniq_v2 rename to leads_tenant_phone_uniq;
