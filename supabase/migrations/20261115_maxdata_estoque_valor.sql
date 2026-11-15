-- Valor total em estoque da Max Data (saldo × custo e saldo × venda), agregado no banco. Ignora saldo <= 0 e preços absurdos (erro de cadastro).
create or replace function public.maxdata_estoque_valor(p_tenant uuid, p_origem text default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare r jsonb;
begin
  if not exists (select 1 from public.tenant_ids_acessiveis() x(id) where x.id = p_tenant) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'custo', coalesce(sum(stock * coalesce(cost, 0)) filter (where stock > 0 and coalesce(cost, 0) < 1000000), 0),
    'venda', coalesce(sum(stock * coalesce(price, 0)) filter (where stock > 0 and coalesce(price, 0) < 1000000), 0),
    'unidades', coalesce(sum(stock) filter (where stock > 0), 0)
  ) into r
  from public.maxdata_produtos
  where tenant_id = p_tenant and (p_origem is null or externo_sistema = p_origem);
  return r;
end $$;
grant execute on function public.maxdata_estoque_valor(uuid, text) to authenticated;
