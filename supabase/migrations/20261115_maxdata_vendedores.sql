-- Receita por atendente (vendedor) da Max Data, agregada no banco. A venda só traz o código (atendenteId), não o nome.
create or replace function public.maxdata_vendedores(p_tenant uuid, p_de date default null, p_ate date default null)
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
    group by 1 order by 2 desc nulls last limit 15
  ) t;
  return r;
end $$;
grant execute on function public.maxdata_vendedores(uuid, date, date) to authenticated;
