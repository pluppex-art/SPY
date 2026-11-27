-- Liga o método SÓ no funil de teste da empresa SPY | IA. Ele passa a aparecer no quadro dessa empresa.
-- Rode depois de 20261231_metodo_funil_mesclar.sql.
update public.crm_funis set ativo = true, metodo_ativo = true
 where id = 'metodo-teste' and tenant_id = '27ef95ee-84dd-499e-9f25-cd9baecb5fe4';

select id, nome, ativo, metodo_ativo from public.crm_funis where metodo_ativo; -- esperado: só metodo-teste

-- Para desligar (as telas voltam ao comportamento antigo na próxima carga):
-- update public.crm_funis set ativo = false, metodo_ativo = false where id = 'metodo-teste';
