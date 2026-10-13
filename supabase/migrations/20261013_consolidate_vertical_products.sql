-- Fase 2 da consolidação do cadastro de produtos: copia imóveis, veículos, insumos da clínica e
-- serviços da clínica para o catálogo central (public.products). Só COPIA: as tabelas de origem
-- continuam existindo até as telas/RPCs que dependem delas serem religadas ao catálogo.
-- Idempotente: reaproveita o id de imóveis/veículos (mantém os vínculos) e ignora linhas já copiadas.

-- Imóveis → products (type 'Imóvel')
insert into public.products (id, tenant_id, name, sku, description, price, active, category, type, provider,
  "currentStock", "stockMin", "stockMax", tags, type_attributes)
select i.id, i.tenant_id, i.titulo, 'IMV-' || upper(left(i.id::text, 8)), i.descricao, coalesce(i.valor, 0),
  i.status not in ('Vendido', 'Locado'), 'Imóvel', 'Imóvel', i.corretor,
  case when i.status = 'Disponível' then 1 else 0 end, 0, 1, array['imobiliario'],
  jsonb_strip_nulls(jsonb_build_object(
    'tipoImovel', i.tipo, 'operacao', i.operacao, 'statusAtivo', i.status, 'bairro', i.bairro, 'cidade', i.cidade,
    'areaM2', i.area, 'quartos', i.quartos, 'banheiros', i.banheiros, 'vagas', i.vagas, 'corretor', i.corretor,
    'isRecurring', false))
from public.imobiliario_imoveis i
on conflict (id) do nothing;

-- Veículos → products (type 'Veículo')
insert into public.products (id, tenant_id, name, sku, description, price, active, category, type, provider,
  "currentStock", "stockMin", "stockMax", tags, type_attributes)
select v.id, v.tenant_id, trim(concat_ws(' ', v.marca, v.modelo, v.ano_modelo::text)),
  coalesce(nullif(v.placa, ''), 'VEI-' || upper(left(v.id::text, 8))), v.descricao, coalesce(v.valor, 0),
  v.status not in ('Vendido', 'Locado'), 'Veículo', 'Veículo', v.vendedor,
  case when v.status = 'Disponível' then 1 else 0 end, 0, 1, array['automotivo'],
  jsonb_strip_nulls(jsonb_build_object(
    'marca', v.marca, 'modelo', v.modelo, 'anoFabricacao', v.ano_fabricacao, 'anoModelo', v.ano_modelo, 'km', v.km,
    'placa', v.placa, 'cor', v.cor, 'combustivel', v.combustivel, 'cambio', v.cambio, 'vendedor', v.vendedor,
    'statusAtivo', v.status, 'isConsignado', v.is_consignado, 'consignanteNome', v.consignante_nome,
    'consignanteTelefone', v.consignante_telefone, 'comissaoPercentual', v.comissao_percentual,
    'repasseRealizado', v.repasse_realizado, 'isRecurring', false))
from public.imobiliario_veiculos v
on conflict (id) do nothing;

-- Insumos da clínica (estoque_items) → products (type 'Físico')
insert into public.products (id, tenant_id, name, sku, price, active, category, type,
  "currentStock", "stockMin", tags, type_attributes)
select e.id, e.tenant_id, e.name, 'INS-' || upper(left(e.id::text, 8)),
  coalesce(nullif(replace(regexp_replace(coalesce(e.price, ''), '[^0-9,.]', '', 'g'), ',', '.'), '')::numeric, 0),
  true, coalesce(e.category, 'Insumos'), 'Físico', coalesce(e.qty, 0), coalesce(e.min_qty, 0), array['clinica'],
  jsonb_build_object('origem', 'clinica_estoque')
from public.estoque_items e
where e.tenant_id is not null
on conflict (id) do nothing;

-- Serviços da clínica → products (type 'Serviço')
insert into public.products (id, tenant_id, name, sku, price, active, category, type, tags, type_attributes)
select s.id, s.tenant_id, s.nome, 'SRV-' || upper(left(s.id::text, 8)), coalesce(s.valor_particular, 0), true,
  coalesce(s.especialidade, 'Serviços'), 'Serviço', array['clinica'],
  jsonb_strip_nulls(jsonb_build_object('duracao', s.duracao, 'convenios', s.convenios, 'origem', 'clinica_servicos'))
from public.clinica_servicos s
where s.tenant_id is not null
on conflict (id) do nothing;
