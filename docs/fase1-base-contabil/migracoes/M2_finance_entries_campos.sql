-- ============================================================================================================
-- M2 · Campos novos em public.finance_entries            PROPOSTA — NÃO APLICAR SEM AUTORIZAÇÃO EXPRESSA
-- Aditiva. NENHUMA linha existente é alterada: as colunas novas ficam NULL/false nas linhas antigas e
-- "origem_registro IS NULL" passa a significar "legado" (nasceu antes da regra nova).
-- Pré-requisito: M1 (para o campo nao_operacional enxergar a linha FORA_DRE da categoria).
-- ============================================================================================================
begin;

-- 1) Colunas -------------------------------------------------------------------------------------------------
alter table public.finance_entries
  add column if not exists data_pagamento  date,                                           -- quando o dinheiro de fato se moveu
  add column if not exists venda_id        uuid references public.vendas(id) on delete set null,   -- venda de origem (1 venda -> N lançamentos)
  add column if not exists origem_registro text,                                           -- NULL = legado; sem DEFAULT de propósito
  add column if not exists nao_operacional boolean not null default false,                 -- empréstimo, aporte, retirada, investimento...
  add column if not exists estorno_de      text references public.finance_entries(id);     -- lançamento que este estorno desfaz

alter table public.finance_entries
  add constraint finance_entries_origem_check
  check (origem_registro is null or origem_registro in ('spy', 'api', 'importacao', 'externo'));

-- 2) Índices (leitura do DRE por competência, fluxo por pagamento, vínculo com a venda, estorno único) ---------
create index if not exists finance_entries_tenant_competencia_idx on public.finance_entries (tenant_id, competencia_date);
create index if not exists finance_entries_tenant_pagamento_idx   on public.finance_entries (tenant_id, data_pagamento) where data_pagamento is not null;
create index if not exists finance_entries_venda_idx              on public.finance_entries (venda_id) where venda_id is not null;
create unique index if not exists finance_entries_estorno_uq      on public.finance_entries (estorno_de) where estorno_de is not null;

-- 3) Leitura da coluna "date" (texto) igual à da coluna gerada date_normalized (a gerada ainda não existe num BEFORE) --
create or replace function public.finance_parse_date(t text)
returns date language sql immutable as $$
  select case
    when t ~ '^\d{4}-\d{2}-\d{2}' then make_date(substring(t from 1 for 4)::int, substring(t from 6 for 2)::int, substring(t from 9 for 2)::int)
    when t ~ '^\d{2}/\d{2}/\d{4}$' then make_date(substring(t from 7 for 4)::int, substring(t from 4 for 2)::int, substring(t from 1 for 2)::int)
    else null end
$$;

-- 4) Regra de gravação ---------------------------------------------------------------------------------------
create or replace function public.finance_entries_regra_v2()
returns trigger language plpgsql set search_path to 'public' as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_linha text;
begin
  if tg_op = 'INSERT' then
    -- Quem grava sem ser usuário logado (N8N, rotinas, service role) é 'api'; usuário na tela é 'spy'
    new.origem_registro := coalesce(new.origem_registro, case when auth.uid() is null then 'api' else 'spy' end);
  end if;

  if new.origem_registro is null then
    return new;                               -- legado: nada muda
  end if;

  if tg_op = 'UPDATE' and old.origem_registro is null and new.origem_registro is not null then
    raise exception 'Lançamento antigo não muda para a regra nova.' using errcode = '42501';
  end if;

  -- Pagamento confirmado não se edita, se estorna
  if tg_op = 'UPDATE' and old.status = 'Pago' then
    if new.value is distinct from old.value or new.type is distinct from old.type
       or new.status is distinct from old.status
       or new.data_pagamento is distinct from old.data_pagamento
       or new.conta_bancaria_id is distinct from old.conta_bancaria_id
       or new.competencia_date is distinct from old.competencia_date
       or new.category_id is distinct from old.category_id
       or new.venda_id is distinct from old.venda_id then
      raise exception 'Pagamento confirmado não se edita: faça o estorno.' using errcode = '42501';
    end if;
  end if;

  new.competencia_date := coalesce(new.competencia_date, public.finance_parse_date(new.date), v_hoje);
  if new.status = 'Pago' and new.data_pagamento is null then
    new.data_pagamento := coalesce(public.finance_parse_date(new.date), v_hoje);
  end if;

  if new.category_id is not null then
    select linha_dre into v_linha from public.finance_categories where id = new.category_id and tenant_id = new.tenant_id;
    if v_linha = 'FORA_DRE' then new.nao_operacional := true; end if;
  end if;

  if new.venda_id is not null and not exists (select 1 from public.vendas v where v.id = new.venda_id and v.tenant_id = new.tenant_id) then
    raise exception 'Venda de outra empresa ou inexistente.';
  end if;

  if new.estorno_de is not null and not exists (
       select 1 from public.finance_entries f where f.id = new.estorno_de and f.tenant_id = new.tenant_id and f.status = 'Pago') then
    raise exception 'Só dá para estornar um pagamento confirmado da mesma empresa.';
  end if;
  return new;
end $$;

drop trigger if exists trg_finance_entries_regra_v2 on public.finance_entries;
create trigger trg_finance_entries_regra_v2
  before insert or update on public.finance_entries
  for each row execute function public.finance_entries_regra_v2();

-- RLS: nada a mudar. A policy atual (tenant_isolation, FOR ALL, has_tenant_access(tenant_id)) cobre as colunas novas.
-- Os gatilhos existentes (período bloqueado, "Pagamento Recebido", permissão do módulo, updated_at) continuam como estão.
commit;

-- ============================================================================================================
-- Verificação depois de aplicar (somente SELECT):
--   select count(*) filter (where origem_registro is null) as legado, count(*) filter (where origem_registro is not null) as novos
--     from public.finance_entries;                                  -- novos = 0 até alguém gravar de novo
-- ============================================================================================================
-- DESFAZER (as colunas novas se perdem; só execute se nenhum lançamento novo depender delas):
--   begin;
--   drop trigger if exists trg_finance_entries_regra_v2 on public.finance_entries;
--   drop function if exists public.finance_entries_regra_v2();
--   drop function if exists public.finance_parse_date(text);
--   drop index if exists public.finance_entries_tenant_competencia_idx, public.finance_entries_tenant_pagamento_idx,
--                        public.finance_entries_venda_idx, public.finance_entries_estorno_uq;
--   alter table public.finance_entries drop constraint if exists finance_entries_origem_check;
--   alter table public.finance_entries drop column if exists estorno_de, drop column if exists nao_operacional,
--                                      drop column if exists origem_registro, drop column if exists venda_id,
--                                      drop column if exists data_pagamento;
--   commit;
