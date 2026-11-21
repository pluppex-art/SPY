-- ============================================================================================================
-- M3 · Bloqueio de período que vale também para lançamento novo        PROPOSTA — NÃO APLICAR SEM AUTORIZAÇÃO
-- Hoje (verificado no banco em 21/11/2026): o gatilho trg_guard_finance_period_lock roda só em UPDATE/DELETE,
-- só olha lançamento já 'Pago', usa o VENCIMENTO (date_normalized) e deixa passar quem não é usuário logado
-- (service role, N8N, rotinas). Esta proposta muda só o que dá para mudar sem quebrar o N8N:
--   a) também barra INSERT de lançamento já pago dentro de período fechado;
--   b) para lançamentos da regra nova, usa a data do PAGAMENTO (data_pagamento), não o vencimento.
-- NÃO muda: a exceção do service role/N8N (decisão sua — ver README, item "Decisões").
-- Pré-requisito: M2.
-- ============================================================================================================
begin;

create or replace function public.guard_finance_period_lock()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare
  v_user_id uuid := auth.uid();
  v_row public.finance_entries;
  v_dia date;
  v_locked boolean;
begin
  v_row := case when tg_op = 'INSERT' then new else old end;       -- INSERT olha a linha nova; UPDATE/DELETE, a antiga

  if v_row.status is distinct from 'Pago' then
    return coalesce(new, old);
  end if;
  v_dia := case when v_row.origem_registro is not null then coalesce(v_row.data_pagamento, v_row.date_normalized)
                else v_row.date_normalized end;
  if v_dia is null then
    return coalesce(new, old);
  end if;

  perform 1 from public.users where id = v_user_id;
  if not found then
    return coalesce(new, old);                                      -- mantido: service role / N8N não são barrados
  end if;

  select exists (
    select 1 from public.finance_period_locks l
    where l.tenant_id = v_row.tenant_id and v_dia between l.data_inicial and l.data_final
  ) into v_locked;
  if v_locked then
    raise exception 'Este período está bloqueado para fechamento — não é possível incluir/alterar/excluir uma transação paga nessa data.'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists trg_guard_finance_period_lock on public.finance_entries;
create trigger trg_guard_finance_period_lock
  before insert or update or delete on public.finance_entries
  for each row execute function public.guard_finance_period_lock();
commit;

-- ============================================================================================================
-- Verificação (somente SELECT): select tgname, pg_get_triggerdef(oid) from pg_trigger where tgname = 'trg_guard_finance_period_lock';
-- ============================================================================================================
-- DESFAZER (volta ao mesmo COMPORTAMENTO de hoje; o texto da função fica reformatado, não idêntico byte a byte):
--   begin;
--   create or replace function public.guard_finance_period_lock() returns trigger language plpgsql security definer set search_path to 'public' as $f$
--   declare v_user_id uuid := auth.uid(); v_user_found boolean; v_locked boolean;
--   begin
--     if old.status is distinct from 'Pago' or old.date_normalized is null then return coalesce(new, old); end if;
--     perform 1 from public.users where id = v_user_id; v_user_found := found;
--     if not v_user_found then return coalesce(new, old); end if;
--     select exists (select 1 from public.finance_period_locks l where l.tenant_id = old.tenant_id
--                    and old.date_normalized between l.data_inicial and l.data_final) into v_locked;
--     if v_locked then
--       raise exception 'Este período está bloqueado para fechamento — não é possível alterar/excluir uma transação paga nessa data.' using errcode = '42501';
--     end if;
--     return coalesce(new, old);
--   end $f$;
--   drop trigger if exists trg_guard_finance_period_lock on public.finance_entries;
--   create trigger trg_guard_finance_period_lock before delete or update on public.finance_entries
--     for each row execute function public.guard_finance_period_lock();
--   commit;
