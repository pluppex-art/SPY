-- Painéis (Mapa da Receita etc.) da Max Data: 490 mil+ vendas não cabem no navegador — totais agregados no banco, por período.
create or replace function public.maxdata_panorama(p_tenant uuid, p_de date default null, p_ate date default null)
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
    and (p_ate is null or data_venda < p_ate + 1);
  return r;
end $$;
grant execute on function public.maxdata_panorama(uuid, date, date) to authenticated;
