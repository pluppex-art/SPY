-- Filtro por unidade (Casa São Paulo principal x SR filial): os painéis agregados passam a aceitar p_origem (maxdata:estoque | maxdata:notas; null = todas).
drop function if exists public.maxdata_panorama(uuid, date, date);
create or replace function public.maxdata_panorama(p_tenant uuid, p_de date default null, p_ate date default null, p_origem text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  limite constant numeric := 1000000; -- acima disso é erro de cadastro na origem
  r jsonb;
begin
  if not exists (select 1 from public.tenant_ids_acessiveis() x(id) where x.id = p_tenant) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'registros', count(*),
    'vendas', count(*) filter (where status = 'paga'),
    'faturamento', coalesce(sum(valor_total) filter (where status = 'paga'), 0),
    'canceladas', count(*) filter (where status = 'cancelada'),
    'canceladas_valor', coalesce(sum(valor_total) filter (where status = 'cancelada'), 0),
    'em_aberto', count(*) filter (where status not in ('paga', 'cancelada')),
    'clientes', count(distinct coalesce(cliente_externo_id, cliente_nome)) filter (where status = 'paga')
  ) into r
  from public.maxdata_vendas
  where tenant_id = p_tenant and valor_total <= limite
    and (p_de is null or data_venda >= p_de)
    and (p_ate is null or data_venda < p_ate + 1)
    and (p_origem is null or externo_sistema = p_origem);
  return r;
end $$;
grant execute on function public.maxdata_panorama(uuid, date, date, text) to authenticated;

drop function if exists public.maxdata_panorama_detalhe(uuid, text, date, date);
create or replace function public.maxdata_panorama_detalhe(p_tenant uuid, p_tipo text, p_de date default null, p_ate date default null, p_origem text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
set statement_timeout = '30s'
as $$
declare
  limite constant numeric := 1000000;
  r jsonb;
begin
  if not exists (select 1 from public.tenant_ids_acessiveis() x(id) where x.id = p_tenant) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  if p_tipo = 'canais' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.receita desc), '[]'::jsonb) into r from (
      select forma as origem, sum(valor_total) filter (where status = 'paga') as receita,
             round(100.0 * count(*) filter (where status = 'paga') / greatest(count(*), 1), 1) as conversao
      from (
        select status, valor_total,
          case
            when coalesce(trim(forma_pagamento), '') = '' then 'Não informado'
            when upper(forma_pagamento) like 'CARTAO%CREDITO%' then 'Cartão de crédito'
            when upper(forma_pagamento) like 'CARTAO%DEBITO%' then 'Cartão de débito'
            when upper(forma_pagamento) = 'DINHEIRO' then 'Dinheiro'
            when upper(forma_pagamento) like 'PIX%' then 'Pix'
            when upper(forma_pagamento) = 'BOLETO' then 'Boleto'
            when upper(forma_pagamento) = 'CARTEIRA' then 'Carteira'
            else 'Outros' end as forma
        from public.maxdata_vendas
        where tenant_id = p_tenant and valor_total <= limite
          and (p_de is null or data_venda >= p_de) and (p_ate is null or data_venda < p_ate + 1)
          and (p_origem is null or externo_sistema = p_origem)
      ) b group by forma
    ) t;
  elsif p_tipo = 'produtos' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.receita desc), '[]'::jsonb) into r from (
      select coalesce(i.product_name, 'Outros') as produto,
             sum(i.preco_unitario * i.quantidade) as receita,
             case when sum(i.preco_unitario * i.quantidade) filter (where i.custo_unitario is not null) > 0
               then round(100.0 * (1 - sum(i.custo_unitario * i.quantidade) filter (where i.custo_unitario is not null)
                    / sum(i.preco_unitario * i.quantidade) filter (where i.custo_unitario is not null)), 1) end as margem
      from public.maxdata_venda_itens i join public.maxdata_vendas v on v.id = i.venda_id
      where i.tenant_id = p_tenant and v.status = 'paga' and v.valor_total <= limite
        and i.preco_unitario * i.quantidade <= 100000
        and (p_de is null or v.data_venda >= p_de) and (p_ate is null or v.data_venda < p_ate + 1)
        and (p_origem is null or v.externo_sistema = p_origem)
      group by 1 order by 2 desc limit 10
    ) t;
  elsif p_tipo = 'segmentos' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.receita desc), '[]'::jsonb) into r from (
      select coalesce(nullif(c.state, ''), 'Não informado') as segmento, sum(v.valor_total) as receita
      from public.maxdata_vendas v
      left join public.maxdata_clientes c on c.tenant_id = v.tenant_id and c.externo_sistema = v.externo_sistema and c.externo_id = v.cliente_externo_id::text
      where v.tenant_id = p_tenant and v.status = 'paga' and v.valor_total <= limite
        and (p_de is null or v.data_venda >= p_de) and (p_ate is null or v.data_venda < p_ate + 1)
        and (p_origem is null or v.externo_sistema = p_origem)
      group by 1 order by 2 desc limit 8
    ) t;
  else
    raise exception 'tipo inválido';
  end if;
  return r;
end $$;
grant execute on function public.maxdata_panorama_detalhe(uuid, text, date, date, text) to authenticated;

drop function if exists public.maxdata_vendedores(uuid, date, date);
create or replace function public.maxdata_vendedores(p_tenant uuid, p_de date default null, p_ate date default null, p_origem text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
set statement_timeout = '30s'
as $$
declare r jsonb;
begin
  if not exists (select 1 from public.tenant_ids_acessiveis() x(id) where x.id = p_tenant) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(to_jsonb(t) order by t.total desc), '[]'::jsonb) into r from (
    select coalesce(externo_dados->>'atendenteId', 'sem código') as codigo,
           sum(valor_total) filter (where status = 'paga') as total,
           count(*) filter (where status = 'paga') as deals,
           round(100.0 * count(*) filter (where status = 'paga') / greatest(count(*), 1), 1) as rate
    from public.maxdata_vendas
    where tenant_id = p_tenant and valor_total <= 1000000
      and (p_de is null or data_venda >= p_de) and (p_ate is null or data_venda < p_ate + 1)
      and (p_origem is null or externo_sistema = p_origem)
    group by 1 order by 2 desc nulls last limit 15
  ) t;
  return r;
end $$;
grant execute on function public.maxdata_vendedores(uuid, date, date, text) to authenticated;
