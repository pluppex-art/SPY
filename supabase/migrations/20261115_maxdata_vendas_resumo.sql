-- Central de Vendas (Max Data): 490 mil+ vendas por tenant não cabem no navegador — o resumo é agregado no banco.
create index if not exists maxdata_vendas_tenant_data on public.maxdata_vendas (tenant_id, data_venda desc);

create or replace function public.maxdata_vendas_resumo(p_tenant uuid, p_dias int default 90)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  ini timestamptz := now() - make_interval(days => greatest(1, least(p_dias, 36500)));
  limite constant numeric := 1000000; -- vendas acima disso são erro de cadastro na origem: ficam fora dos totais
  r jsonb;
begin
  if not exists (select 1 from public.tenant_ids_acessiveis() x(id) where x.id = p_tenant) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  with base as (
    select status, valor_total,
           case
             when coalesce(trim(forma_pagamento), '') = '' then 'Não informado'
             when upper(forma_pagamento) like 'CARTAO%CREDITO%' then 'Cartão de crédito'
             when upper(forma_pagamento) like 'CARTAO%DEBITO%' then 'Cartão de débito'
             when upper(forma_pagamento) = 'DINHEIRO' then 'Dinheiro'
             when upper(forma_pagamento) like 'PIX%' then 'Pix'
             when upper(forma_pagamento) = 'BOLETO' then 'Boleto'
             when upper(forma_pagamento) = 'CARTEIRA' then 'Carteira'
             else 'Outros'
           end as forma
    from public.maxdata_vendas
    where tenant_id = p_tenant and data_venda >= ini
  ), ok as (select * from base where valor_total <= limite)
  select jsonb_build_object(
    'dias', p_dias,
    'vendas', (select count(*) from ok where status = 'paga'),
    'faturamento', (select coalesce(sum(valor_total), 0) from ok where status = 'paga'),
    'canceladas', (select count(*) from ok where status = 'cancelada'),
    'canceladas_valor', (select coalesce(sum(valor_total), 0) from ok where status = 'cancelada'),
    'descartadas', (select count(*) from base where valor_total > limite),
    'por_forma', (select coalesce(jsonb_agg(jsonb_build_object('forma', forma, 'vendas', n, 'valor', v) order by v desc), '[]'::jsonb)
                  from (select forma, count(*) n, sum(valor_total) v from ok where status = 'paga' group by forma) f)
  ) into r;

  r := r || jsonb_build_object('por_mes', (
    select coalesce(jsonb_agg(jsonb_build_object('mes', mes, 'vendas', n, 'valor', v) order by mes), '[]'::jsonb)
    from (
      select to_char(date_trunc('month', data_venda), 'YYYY-MM') mes, count(*) n, sum(valor_total) v
      from public.maxdata_vendas
      where tenant_id = p_tenant and status = 'paga' and valor_total <= limite
        and data_venda >= date_trunc('month', now()) - interval '11 months'
      group by 1
    ) m
  ));
  return r;
end;
$$;
grant execute on function public.maxdata_vendas_resumo(uuid, int) to authenticated;
