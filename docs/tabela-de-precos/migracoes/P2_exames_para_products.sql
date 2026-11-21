-- P2 — Exames da saúde passam a existir também em public.products (PROPOSTO, NÃO APLICADO)
-- Copia as linhas de saude_exames_base para products (tipo 'Exame'). Não apaga nem altera a tabela de origem.
-- Pode rodar de novo: não duplica (chave tenant + externo_sistema + externo_id). Roda inteiro numa transação.
-- Independe do P1; se o P1 já tiver rodado, o gatilho da margem calcula a margem sozinho (senão ela é calculada aqui).
begin;

-- (o índice único products_externo_uq já existe em produção e protege contra duplicar)

insert into public.products
  (tenant_id, name, sku, description, price, cost, margin, category, type, material, active,
   externo_sistema, externo_id, externo_dados, type_attributes)
select
  e.tenant_id,
  e.nome,
  coalesce(nullif(e.codigo_interno, ''), nullif(e.codigo_externo, '')),
  e.descricao,
  coalesce(e.valor, 0),
  coalesce(e.custo, 0),
  case when coalesce(e.valor, 0) > 0 and coalesce(e.custo, 0) > 0
       then round((e.valor - e.custo) / e.valor * 100, 1) else 0 end,
  e.categoria,
  'Exame',
  e.material,
  coalesce(e.ativo, true),
  'saude_exames_base',
  e.id::text,
  to_jsonb(e),
  jsonb_strip_nulls(jsonb_build_object(
    'codigo_externo', e.codigo_externo, 'tipo_exame', e.tipo, 'parceiro', e.parceiro,
    'valor_referencia', e.valor_referencia, 'nomes_alternativos', to_jsonb(e.nomes_alternativos),
    'unidade', e.unidade, 'observacoes', e.observacoes))
from public.saude_exames_base e
where not exists (
  select 1 from public.products p
  where p.tenant_id = e.tenant_id and p.externo_sistema = 'saude_exames_base' and p.externo_id = e.id::text);

comment on table public.saude_exames_base is 'LEGADO: cópia em public.products (type=Exame, externo_sistema=saude_exames_base). Não apagar antes de trocar as telas da clínica.';

commit;

-- Conferência (somente leitura): os dois números têm que ser iguais
select (select count(*) from public.saude_exames_base) as exames_origem,
       (select count(*) from public.products where externo_sistema = 'saude_exames_base') as exames_em_products;

-- DESFAZER (copiar e rodar se precisar voltar):
--   delete from public.products where externo_sistema = 'saude_exames_base' and type = 'Exame';
--   comment on table public.saude_exames_base is null;
