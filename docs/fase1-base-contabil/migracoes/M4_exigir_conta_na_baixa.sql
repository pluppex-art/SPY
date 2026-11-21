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
alter table public.finance_entries
  add constraint finance_entries_baixa_spy_check
  check (origem_registro is distinct from 'spy' or status is distinct from 'Pago'
         or (conta_bancaria_id is not null and data_pagamento is not null));
commit;

-- Relatório de pendências (somente SELECT): baixas novas feitas sem conta
--   select tenant_id, count(*) from public.finance_entries
--    where origem_registro in ('api','importacao','externo') and status = 'Pago' and conta_bancaria_id is null group by 1;
-- DESFAZER:
--   alter table public.finance_entries drop constraint if exists finance_entries_baixa_spy_check;
