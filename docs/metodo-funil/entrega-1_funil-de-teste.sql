-- Depois de aplicar a entrega 1: cria um funil DESATIVADO na empresa SPY | IA só para o teste e marca os tipos.
-- Não liga o método e não mexe em funil de cliente.
insert into public.crm_funis (id, tenant_id, nome, tipo, etapas, ativo, template)
values ('metodo-teste', '27ef95ee-84dd-499e-9f25-cd9baecb5fe4', 'Teste do método', 'comercial',
        array['Novo Lead', 'Orçamento', 'Repescagem', 'Ganho', 'Perdido', 'Desqualificado'], false, 'simples')
on conflict (id) do nothing;

select * from public.spy_metodo_preparar('metodo-teste'); -- esperado: 6 etapas, todas com tipo

select
  (select count(*) from public.crm_situacoes where tenant_id is null) as situacoes_de_fabrica,          -- 21
  (select count(*) from public.crm_motivos  where tenant_id is null) as motivos_de_fabrica,             -- 12
  (select count(*) from public.crm_funis where metodo_ativo) as funis_com_metodo_ligado;               -- 0
