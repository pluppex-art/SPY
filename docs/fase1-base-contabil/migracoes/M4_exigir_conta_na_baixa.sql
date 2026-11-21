-- ============================================================================================================
-- M4 · Exigir conta bancária e data de pagamento ao baixar (pagar/receber) pela tela ou pelo PDV
--                                                                        PROPOSTA — NÃO APLICAR SEM AUTORIZAÇÃO
-- ORDEM: aplicar DEPOIS do M2 (sem ele o script só avisa). A baixa sem conta cai sozinha na conta principal da empresa
-- (gatilho abaixo); se a empresa não tiver conta principal, a baixa é barrada com mensagem. O app (DataContext) também
-- já envia a conta principal. Antes de aplicar, confira que toda empresa ativa tem uma conta principal (SELECT no fim).
-- Vale só para origem_registro = 'spy' (usuário na tela/PDV). Linhas antigas (origem NULL), API/N8N e importações
-- não são barradas: o aviso delas é o relatório "baixas sem conta" (SELECT abaixo).
-- Pré-requisito: M2.
-- ============================================================================================================
begin;

-- Não dá erro se o M2 ainda não foi aplicado: avisa e sai sem alterar nada. Pode rodar de novo.
-- NOT VALID: a regra vale só para linhas novas ou alteradas; as antigas não são conferidas (não trava o banco por causa do passado).
do $$
begin
  if (select count(*) from information_schema.columns
       where table_schema = 'public' and table_name = 'finance_entries'
         and column_name in ('origem_registro', 'data_pagamento', 'conta_bancaria_id')) < 3 then
    raise notice 'M4 NÃO aplicado: faltam colunas de finance_entries (origem_registro/data_pagamento vêm do M2). Aplique o M2 antes e rode este script de novo.';
  elsif exists (select 1 from pg_constraint where conrelid = 'public.finance_entries'::regclass and conname = 'finance_entries_baixa_spy_check') then
    raise notice 'M4 já aplicado: a regra já existe.';
  else
    -- Rede de segurança: baixa feita pela tela/PDV sem conta cai na conta principal da empresa (o app e a função
    -- finalizar_venda não precisam ser alterados). Sem conta principal, a regra abaixo barra com mensagem clara.
    create or replace function public.finance_entries_conta_principal()
    returns trigger language plpgsql set search_path to 'public' as $f$
    begin
      if new.status = 'Pago' and new.conta_bancaria_id is null
         and (tg_op = 'INSERT' or old.status is distinct from 'Pago')
         and (new.origem_registro = 'spy' or (tg_op = 'INSERT' and new.origem_registro is null and auth.uid() is not null)) then
        select b.id into new.conta_bancaria_id from public.finance_bank_accounts b
         where b.tenant_id = new.tenant_id and b.is_principal and not coalesce(b.arquivada, false) limit 1;
      end if;
      return new;
    end $f$;
    drop trigger if exists trg_finance_entries_conta_principal on public.finance_entries;
    create trigger trg_finance_entries_conta_principal
      before insert or update on public.finance_entries
      for each row execute function public.finance_entries_conta_principal();

    alter table public.finance_entries
      add constraint finance_entries_baixa_spy_check
      check (origem_registro is distinct from 'spy' or status is distinct from 'Pago'
             or (conta_bancaria_id is not null and data_pagamento is not null)) not valid;
    raise notice 'M4 aplicado: baixas feitas pela tela/PDV agora exigem conta bancária e data de pagamento.';
  end if;
end $$;

commit;

-- Empresas SEM conta principal (as baixas delas serão barradas): precisa vir vazio antes de usar o M4
--   select t.id, t.name from public.tenants t where t.deleted_at is null
--      and not exists (select 1 from public.finance_bank_accounts b where b.tenant_id = t.id and b.is_principal and not coalesce(b.arquivada,false));

-- Relatório de pendências (somente SELECT): baixas novas feitas sem conta
--   select tenant_id, count(*) from public.finance_entries
--    where origem_registro in ('api','importacao','externo') and status = 'Pago' and conta_bancaria_id is null group by 1;
-- DESFAZER:
--   alter table public.finance_entries drop constraint if exists finance_entries_baixa_spy_check;
--   drop trigger if exists trg_finance_entries_conta_principal on public.finance_entries;
--   drop function if exists public.finance_entries_conta_principal();
