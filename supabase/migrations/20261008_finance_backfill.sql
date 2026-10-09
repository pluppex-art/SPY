-- Backfill dos dados do Financeiro (idempotente; só preenche onde está null; nunca sobrescreve).
-- Depende de 20261008_finance_columns_drift.sql e das migrations de 20260918 (category_id, competencia_date, tags, contato_id, numero_documento).

-- 1) Categorias: cria em finance_categories cada (tenant, categoria, tipo) usado nos lançamentos e ainda inexistente.
insert into public.finance_categories (id, tenant_id, nome, tipo, created_at)
select gen_random_uuid()::text, d.tenant_id, d.nome, d.tipo, now()
from (
  select tenant_id,
         min(btrim(category)) as nome,
         case type when 'Receber' then 'Receita' else 'Despesa' end as tipo
  from public.finance_entries
  where tenant_id is not null and category is not null and btrim(category) <> ''
  group by tenant_id, lower(btrim(category)), case type when 'Receber' then 'Receita' else 'Despesa' end
) d
where not exists (
  select 1 from public.finance_categories fc
  where fc.tenant_id = d.tenant_id and fc.tipo = d.tipo and lower(btrim(fc.nome)) = lower(btrim(d.nome))
);

-- 2) category_id: junta por (tenant, lower(nome), tipo) com categorias agrupadas (1 id por chave) para evitar join multiplicado.
with cats as (
  select tenant_id, tipo, lower(btrim(nome)) as k, min(id) as id
  from public.finance_categories
  group by tenant_id, tipo, lower(btrim(nome))
)
update public.finance_entries fe
set category_id = c.id
from cats c
where fe.category_id is null
  and fe.category is not null
  and c.tenant_id = fe.tenant_id
  and c.tipo = case fe.type when 'Receber' then 'Receita' else 'Despesa' end
  and c.k = lower(btrim(fe.category));

-- 3) competencia_date = data normalizada.
update public.finance_entries
set competencia_date = date_normalized
where competencia_date is null and date_normalized is not null;

-- 4) Reservas integradas (ids tnp_fat_%): contraparte = texto entre parênteses no fim da descrição.
update public.finance_entries
set counterparty = btrim((regexp_match(description, '\(([^()]*)\)\s*$'))[1])
where id like 'tnp_fat\_%' escape '\'
  and counterparty is null
  and description ~ '\([^()]+\)\s*$'
  and btrim((regexp_match(description, '\(([^()]*)\)\s*$'))[1]) <> '';

-- 5) contato_id: só quando EXATAMENTE UM cliente do mesmo tenant tem esse nome (lower/trim), via CTE agrupada.
with cli as (
  select tenant_id, lower(btrim(name)) as k, min(id) as id
  from public.clientes
  where name is not null and btrim(name) <> ''
  group by tenant_id, lower(btrim(name))
  having count(*) = 1
)
update public.finance_entries fe
set contato_id = cli.id
from cli
where fe.id like 'tnp_fat\_%' escape '\'
  and fe.contato_id is null
  and fe.counterparty is not null
  and cli.tenant_id = fe.tenant_id
  and cli.k = lower(btrim(fe.counterparty));

-- 6) numero_documento das reservas: RES- + 8 primeiros caracteres do externalId (id sem o prefixo 'tnp_fat_').
update public.finance_entries
set numero_documento = 'RES-' || upper(left(substr(id, 9), 8))
where id like 'tnp_fat\_%' escape '\'
  and numero_documento is null;

-- 7) Tags automáticas (só acrescenta se ainda não estiver no array).
update public.finance_entries
set tags = array_append(coalesce(tags, '{}'::text[]), 'Recorrente')
where is_recurring is true and not ('Recorrente' = any(coalesce(tags, '{}'::text[])));

update public.finance_entries
set tags = array_append(coalesce(tags, '{}'::text[]), 'Parcelado')
where installment_group_id is not null and not ('Parcelado' = any(coalesce(tags, '{}'::text[])));

update public.finance_entries
set tags = array_append(coalesce(tags, '{}'::text[]), 'Proposta')
where proposal_id is not null and not ('Proposta' = any(coalesce(tags, '{}'::text[])));
