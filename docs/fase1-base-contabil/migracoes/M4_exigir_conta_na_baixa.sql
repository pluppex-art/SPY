-- ============================================================================================================
-- M4 · Exigir conta bancária e data de pagamento ao baixar (pagar/receber) pela tela ou pelo PDV
--                                                                        PROPOSTA — NÃO APLICAR SEM AUTORIZAÇÃO
-- ATENÇÃO À ORDEM: só aplicar DEPOIS que (1) as telas de baixa do financeiro e das Cobranças, (2) o PDV e
-- (3) a função finalizar_venda passarem a enviar a conta bancária. Antes disso, a tela de baixa passa a dar erro.
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
    alter table public.finance_entries
      add constraint finance_entries_baixa_spy_check
      check (origem_registro is distinct from 'spy' or status is distinct from 'Pago'
             or (conta_bancaria_id is not null and data_pagamento is not null)) not valid;
    raise notice 'M4 aplicado: baixas feitas pela tela/PDV agora exigem conta bancária e data de pagamento.';
  end if;
end $$;

commit;

-- Relatório de pendências (somente SELECT): baixas novas feitas sem conta
--   select tenant_id, count(*) from public.finance_entries
--    where origem_registro in ('api','importacao','externo') and status = 'Pago' and conta_bancaria_id is null group by 1;
-- DESFAZER:
--   alter table public.finance_entries drop constraint if exists finance_entries_baixa_spy_check;
