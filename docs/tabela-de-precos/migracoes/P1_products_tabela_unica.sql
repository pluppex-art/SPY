-- ============================================================================================================
-- P1 · Tabela de preços única = public.products, completa e com a margem sempre certa
--                                                        PROPOSTA — NÃO APLICAR SEM AUTORIZAÇÃO EXPRESSA
-- Aditiva e reversível. Não apaga nem renomeia nenhuma tabela. Não muda preço, custo nem estoque de ninguém.
-- ============================================================================================================
begin;

-- 1) Código de barras e unidade passam a ter coluna própria (hoje o EAN mora dentro de type_attributes, solto) ----
alter table public.products
  add column if not exists ean     text,
  add column if not exists unidade text;     -- un, kg, h, serv, m²...  (livre; a tela sugere)

-- Preenche o EAN a partir do que já existe no JSON (em produção, em 21/11/2026: 0 produtos têm código ali; fica pronto para os novos)
update public.products
   set ean = nullif(regexp_replace(coalesce(type_attributes->>'ean', type_attributes->>'barcode', ''), '[^0-9A-Za-z]', '', 'g'), '')
 where ean is null and (type_attributes ? 'ean' or type_attributes ? 'barcode');

-- Um código de barras por produto, por empresa. Só cria o índice se não houver repetido hoje (senão avisa e segue sem ele)
do $$
begin
  if exists (select 1 from public.products where ean is not null and deleted_at is null group by tenant_id, ean having count(*) > 1) then
    raise notice 'EAN repetido na mesma empresa: índice único NÃO criado. Corrija os repetidos e rode de novo.';
  else
    create unique index if not exists products_tenant_ean_uq on public.products (tenant_id, ean) where ean is not null and deleted_at is null;
  end if;
end $$;

-- 2) Margem calculada num lugar só (no banco), para valer também para N8N, API, sincronizações e notas de entrada ----
--    Mesma regra da tela (src/lib/tabelaPrecos.ts): (preço − custo) / preço, em %, 1 casa; sem preço = 0.
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
-- (O gatilho só dispara quando preço ou custo mudam. Os gatilhos atuais que sincronizam planos e créditos continuam como estão.)

-- 3) Marca as tabelas antigas de preço como LEGADO (só comentário; nada muda no comportamento) -----------------------
comment on table public.estoque_items         is 'LEGADO: o preço vive em public.products (id preservado). Não gravar aqui.';
comment on table public.clinica_servicos      is 'LEGADO: o preço vive em public.products (type Serviço, id preservado). Não gravar aqui.';
comment on table public.imobiliario_imoveis   is 'LEGADO: o preço vive em public.products (type Imóvel, id preservado). Não gravar aqui.';
comment on table public.imobiliario_veiculos  is 'LEGADO: o preço vive em public.products (type Veículo, id preservado). Não gravar aqui.';
commit;

-- ============================================================================================================
-- OPCIONAL — corrigir a margem dos produtos que já estão divergentes (hoje: 2 de 7 com custo). Só mexe em `margin`.
--   update public.products set margin = round(((price - cost) / price * 100)::numeric, 1)
--    where deleted_at is null and coalesce(price,0) > 0 and coalesce(cost,0) > 0
--      and abs(coalesce(margin,0) - round(((price - cost) / price * 100)::numeric, 1)) > 0.05;
--
-- Verificações (somente SELECT) depois de aplicar:
--   select count(*) filter (where ean is not null) as com_ean, count(*) as total from public.products where deleted_at is null;
--   select count(*) as divergentes from public.products where deleted_at is null and coalesce(price,0) > 0 and coalesce(cost,0) > 0
--      and abs(coalesce(margin,0) - round(((price - cost) / price * 100)::numeric, 1)) > 0.05;      -- 0 depois do OPCIONAL
-- ============================================================================================================
-- DESFAZER:
--   begin;
--   comment on table public.estoque_items is null;       comment on table public.clinica_servicos is null;
--   comment on table public.imobiliario_imoveis is null; comment on table public.imobiliario_veiculos is null;
--   drop trigger if exists trg_products_margem on public.products;
--   drop function if exists public.products_margem_automatica();
--   drop index if exists public.products_tenant_ean_uq;
--   alter table public.products drop column if exists unidade, drop column if exists ean;
--   commit;
