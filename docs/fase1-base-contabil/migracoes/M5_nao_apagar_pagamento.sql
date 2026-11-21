-- ============================================================================================================
-- M5 · Pagamento confirmado de lançamento novo não se APAGA (só se estorna)        PROPOSTA — NÃO APLICADA
-- O M2 já impede EDITAR um lançamento pago da regra nova. Hoje ele ainda pode ser APAGADO (tela, exclusão de proposta,
-- integração): o dinheiro "some" do histórico sem estorno. Este gatilho fecha esse buraco.
-- • Vale só para linha da regra nova (origem_registro preenchida) já 'Pago'. Lançamento antigo e lançamento aberto continuam apagáveis.
-- • Pré-requisito: M2. Se o M2 não estiver aplicado, o script só avisa e sai.
-- • Antes de aplicar, confira que nenhum fluxo seu apaga lançamento pago novo (excluir cobrança paga, excluir proposta com
--   lançamento pago): depois do M5 esses passos passam a dar a mensagem "faça o estorno".
-- ============================================================================================================
begin;

do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'finance_entries' and column_name = 'origem_registro') then
    raise notice 'M5 NÃO aplicado: falta o M2 (coluna origem_registro). Aplique o M2 antes.';
  else
    create or replace function public.finance_entries_nao_apagar_pago()
    returns trigger language plpgsql set search_path to 'public' as $f$
    begin
      if old.origem_registro is not null and old.status = 'Pago' then
        raise exception 'Pagamento confirmado não se apaga: faça o estorno.' using errcode = '42501';
      end if;
      return old;
    end $f$;
    drop trigger if exists trg_finance_entries_nao_apagar_pago on public.finance_entries;
    create trigger trg_finance_entries_nao_apagar_pago
      before delete on public.finance_entries
      for each row execute function public.finance_entries_nao_apagar_pago();
    raise notice 'M5 aplicado: pagamento confirmado da regra nova só sai por estorno.';
  end if;
end $$;

commit;

-- Conferência (somente SELECT): o gatilho existe
--   select tgname from pg_trigger where tgname = 'trg_finance_entries_nao_apagar_pago';
-- DESFAZER:
--   drop trigger if exists trg_finance_entries_nao_apagar_pago on public.finance_entries;
--   drop function if exists public.finance_entries_nao_apagar_pago();
