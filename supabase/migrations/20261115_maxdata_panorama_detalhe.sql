-- Quebras do Mapa da Receita (Max Data) agregadas no banco: canais (forma de pagamento), produtos e segmentos (estado do cliente).
create or replace function public.maxdata_panorama_detalhe(p_tenant uuid, p_tipo text, p_de date default null, p_ate date default null)
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
      group by 1 order by 2 desc limit 10
    ) t;
  elsif p_tipo = 'segmentos' then
    select coalesce(jsonb_agg(to_jsonb(t) order by t.receita desc), '[]'::jsonb) into r from (
      select coalesce(nullif(c.state, ''), 'Não informado') as segmento, sum(v.valor_total) as receita
      from public.maxdata_vendas v
      left join public.maxdata_clientes c on c.tenant_id = v.tenant_id and c.externo_id = v.cliente_externo_id::text
      where v.tenant_id = p_tenant and v.status = 'paga' and v.valor_total <= limite
        and (p_de is null or v.data_venda >= p_de) and (p_ate is null or v.data_venda < p_ate + 1)
      group by 1 order by 2 desc limit 8
    ) t;
  else
    raise exception 'tipo inválido';
  end if;
  return r;
end $$;
grant execute on function public.maxdata_panorama_detalhe(uuid, text, date, date) to authenticated;
