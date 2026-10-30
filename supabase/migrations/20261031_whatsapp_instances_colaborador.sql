-- Liga cada sessão pessoal do Agente Secreto ao colaborador dono dela (já aplicado em produção em 2026-10-30).
-- Fonte única das sessões WAHA: whatsapp_instances. Substitui colaboradores.waha_session (20261031_colaboradores_waha_session.sql),
-- que ficou sem uso e pode ser removida: alter table public.colaboradores drop column if exists waha_session;
alter table public.whatsapp_instances add column if not exists colaborador_id text;
comment on column public.whatsapp_instances.colaborador_id is 'Colaborador dono da sessão (Agente Secreto pessoal). Quando preenchido, o nome da sessão no WAHA é whatsapp_instances.name (e não o id da linha).';
create index if not exists whatsapp_instances_colaborador_idx on public.whatsapp_instances (colaborador_id) where colaborador_id is not null;

-- Negocio Fora da Curva: Romulo (linha já existia) e Jakeline/Thainá (sessões criadas no WAHA em 2026-10-30).
update public.whatsapp_instances set colaborador_id = '1790778055322' where id = '0349e921-7ed8-4c5f-9371-02693f1bbe7b' and tenant_id = '85917b01-b7c6-4ca6-95cb-6afe8393f72f';
insert into public.whatsapp_instances (tenant_id, name, status, provider, webhook_url, colaborador_id)
select '85917b01-b7c6-4ca6-95cb-6afe8393f72f', v.name, 'DISCONNECTED', 'waha', 'https://n8n.spycrm.com.br/webhook/spy-agente-secreto-direto-negocio-fora-da-curva', v.colab
from (values ('agente-secreto-Jakeline','kommo-85917b01-15644136'), ('agente-secreto-Thaina','kommo-85917b01-15927512'), ('agente-secreto-MariaEduarda','kommo-85917b01-15471288')) as v(name, colab)
where not exists (select 1 from public.whatsapp_instances w where w.colaborador_id = v.colab);

-- Sessões antigas ligadas ao colaborador pelo nome (aplicado em produção em 2026-10-30), para a bolinha de status em Equipe (RH).
update public.whatsapp_instances w set colaborador_id = v.colab
from (values
  ('9aaa9d33-e83c-4c1b-8036-494b214244bc'::uuid, '1791567929769'), -- Wylian (Casa São Paulo Sports)
  ('ab967729-a970-40bb-8711-2d4ba9e9b142'::uuid, '1791486874635'), -- Romario (GEPLAN)
  ('01fce023-ce36-4174-8c46-b08940cdb59d'::uuid, '1781094991268'), -- Frederico Silva (Pluppex)
  ('886e6a05-a3ac-4710-8610-757afe82349a'::uuid, '1790195636420')  -- Gustavo Oliveira (Pluppex)
) as v(id, colab)
where w.id = v.id and w.colaborador_id is null
  and exists (select 1 from public.colaboradores c where c.id = v.colab and c.tenant_id = w.tenant_id);
