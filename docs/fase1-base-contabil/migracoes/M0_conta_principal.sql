-- ============================================================================================================
-- M0 · Toda empresa passa a ter uma conta principal (pré-requisito do M4)        PROPOSTA — NÃO APLICADA
-- • Empresa SEM nenhuma conta ativa  -> cria a conta "Caixa principal" (carteira, saldo inicial 0) já como principal.
-- • Empresa COM conta ativa mas sem principal -> a conta ativa MAIS ANTIGA vira a principal (só marca; nada mais muda).
-- • Empresa que já tem principal: não é tocada. Não altera lançamentos nem saldos (as contas novas começam em zero).
-- Pode rodar de novo: nada a fazer na segunda vez. Uma transação só.
-- ============================================================================================================
begin;

-- 0) Conta principal ARQUIVADA não serve para baixar e ocupa o índice "uma principal por empresa": deixa de ser principal
update public.finance_bank_accounts set is_principal = false where is_principal and arquivada;

-- 1) Quem tem conta ativa mas nenhuma principal: promove a mais antiga
update public.finance_bank_accounts b
   set is_principal = true
 where b.id in (
   select distinct on (a.tenant_id) a.id
     from public.finance_bank_accounts a
     join public.tenants t on t.id = a.tenant_id and t.deleted_at is null
    where not a.arquivada
      and not exists (select 1 from public.finance_bank_accounts p where p.tenant_id = a.tenant_id and p.is_principal and not p.arquivada)
    order by a.tenant_id, a.created_at, a.id);

-- 2) Quem não tem nenhuma conta ativa: cria o "Caixa principal"
insert into public.finance_bank_accounts (tenant_id, nome, tipo, saldo_inicial, sinal_saldo_inicial, is_principal, arquivada)
select t.id, 'Caixa principal', 'CARTEIRA', 0, 'ZERADO', true, false
  from public.tenants t
 where t.deleted_at is null
   and not exists (select 1 from public.finance_bank_accounts a where a.tenant_id = t.id and not a.arquivada);

commit;

-- Conferência (precisa dar 0): empresas ativas sem conta principal
select count(*) as empresas_sem_conta_principal
  from public.tenants t
 where t.deleted_at is null
   and not exists (select 1 from public.finance_bank_accounts b where b.tenant_id = t.id and b.is_principal and not b.arquivada);

-- DESFAZER (só as contas criadas aqui e que ainda não receberam lançamento; as promovidas voltam a "não principal"):
--   begin;
--   delete from public.finance_bank_accounts b where b.nome = 'Caixa principal' and b.tipo = 'CARTEIRA' and b.saldo_inicial = 0
--      and not exists (select 1 from public.finance_entries f where f.conta_bancaria_id = b.id);
--   (as contas que apenas foram promovidas a principal: marque is_principal = false à mão, conferindo a lista antes)
--   commit;
