-- ============================================================================================================
-- TABELA DE PREÇOS ÚNICA — TUDO EM UM SÓ SCRIPT. Copie e rode inteiro, uma vez, no SQL Editor do Supabase.
--
-- • Pode rodar de novo sem erro (cada passo confere antes se já foi feito).
-- • Não apaga nem renomeia nenhuma tabela. Não muda preço, custo nem estoque de ninguém.
-- • Tem uma única transação: se qualquer passo falhar, NADA fica pela metade.
-- • No fim aparece uma linha de conferência (resultado do último SELECT).
-- Para desfazer: veja o bloco DESFAZER no fim do arquivo (está comentado).
-- ============================================================================================================
begin;

-- 1) Código de barras e unidade ganham coluna própria ----------------------------------------------------------
alter table public.products add column if not exists ean     text;
alter table public.products add column if not exists unidade text;     -- un, kg, h, serv, m²...

-- Traz para a coluna nova o código que estiver dentro de type_attributes (barcode ou ean)
update public.products
   set ean = nullif(regexp_replace(coalesce(type_attributes->>'ean', type_attributes->>'barcode', ''), '[^0-9A-Za-z]', '', 'g'), '')
 where ean is null and (type_attributes ? 'ean' or type_attributes ? 'barcode');

-- Um código de barras por produto, por empresa (produto apagado libera o código).
-- Se hoje houver código repetido na mesma empresa, NÃO falha: avisa e segue sem o índice.
do $$
begin
  if exists (select 1 from public.products where ean is not null and deleted_at is null group by tenant_id, ean having count(*) > 1) then
    raise notice 'AVISO: há EAN repetido na mesma empresa; o índice único NÃO foi criado. Corrija os repetidos e rode este script de novo.';
  else
    create unique index if not exists products_tenant_ean_uq on public.products (tenant_id, ean) where ean is not null and deleted_at is null;
  end if;
end $$;

-- 2) Margem calculada num lugar só, no banco (vale também para N8N, API, sincronizações e nota de entrada) ------
--    Mesma regra da tela (src/lib/tabelaPrecos.ts): (preço - custo) / preço, em %, 1 casa. Sem preço = 0.
create or replace function public.products_margem_automatica()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  new.margin := case when coalesce(new.price, 0) > 0
                     then round(((new.price - coalesce(new.cost, 0)) / new.price * 100)::numeric, 1)
                     else 0 end;
  return new;
end $$;

drop trigger if exists trg_products_margem on public.products;
create trigger trg_products_margem
  before insert or update of price, cost on public.products
  for each row execute function public.products_margem_automatica();
-- (Os gatilhos que sincronizam planos e créditos com o preço do produto continuam exatamente como estão.)

-- 3) Corrige a margem dos produtos que já estão divergentes (só mexe na coluna "margin") --------------------------
update public.products
   set margin = round(((price - cost) / price * 100)::numeric, 1)
 where deleted_at is null and coalesce(price, 0) > 0 and coalesce(cost, 0) > 0
   and abs(coalesce(margin, 0) - round(((price - cost) / price * 100)::numeric, 1)) > 0.05;

-- 4) Marca as tabelas antigas de preço como LEGADO (só comentário; confere se a tabela existe) --------------------
do $$
declare
  t record;
begin
  for t in select * from (values
    ('estoque_items',        'o preço vive em public.products (id preservado)'),
    ('clinica_servicos',     'o preço vive em public.products, tipo Serviço (id preservado)'),
    ('imobiliario_imoveis',  'o preço vive em public.products, tipo Imóvel (id preservado)'),
    ('imobiliario_veiculos', 'o preço vive em public.products, tipo Veículo (id preservado)')
  ) as x(tabela, motivo) loop
    if to_regclass('public.' || t.tabela) is not null then
      execute format('comment on table public.%I is %L', t.tabela, 'LEGADO: ' || t.motivo || '. Não gravar aqui.');
    end if;
  end loop;
end $$;

commit;

-- 5) CONFERÊNCIA (aparece como resultado): quantos produtos têm EAN, quantas margens ainda divergem, e se o gatilho existe
select
  (select count(*) from public.products where deleted_at is null)                                                  as produtos,
  (select count(*) from public.products where deleted_at is null and ean is not null)                              as com_ean,
  (select count(*) from public.products where deleted_at is null and coalesce(price,0) > 0 and coalesce(cost,0) > 0
      and abs(coalesce(margin,0) - round(((price - cost) / price * 100)::numeric, 1)) > 0.05)                      as margens_divergentes_restantes,
  exists (select 1 from pg_trigger where tgrelid = 'public.products'::regclass and tgname = 'trg_products_margem') as gatilho_margem_ok,
  exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'products_tenant_ean_uq')          as indice_ean_ok;

-- ============================================================================================================
-- DESFAZER (copie e rode só se precisar voltar; as margens corrigidas no passo 3 ficam como estão):
--   begin;
--   drop trigger if exists trg_products_margem on public.products;
--   drop function if exists public.products_margem_automatica();
--   drop index if exists public.products_tenant_ean_uq;
--   alter table public.products drop column if exists unidade;
--   alter table public.products drop column if exists ean;
--   comment on table public.estoque_items is null;
--   comment on table public.clinica_servicos is null;
--   comment on table public.imobiliario_imoveis is null;
--   comment on table public.imobiliario_veiculos is null;
--   commit;
-- ============================================================================================================
