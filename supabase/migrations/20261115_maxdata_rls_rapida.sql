-- Max Data: 75 mil+ clientes / 150 mil+ produtos por tenant. A policy antiga chamava
-- has_tenant_access(tenant_id) (SECURITY DEFINER, não "inlinável") UMA VEZ POR LINHA:
-- count(*) e order by estouravam o statement_timeout (8s) e a API devolvia 500.
-- Agora a lista de tenants permitidos é calculada uma única vez (subselect não correlacionado),
-- com exatamente o mesmo critério de has_tenant_access (próprio tenant, master ou parceiro).

create or replace function public.tenant_ids_acessiveis()
returns setof uuid
language sql stable security definer
set search_path = public
as $$
  select t.id
  from public.tenants t
  join public.users u on u.id = auth.uid()
  where t.id = u.tenant_id
     or coalesce(u.is_master, false)
     or exists (select 1 from public.tenant_partners tp where tp.tenant_id = t.id and tp.partner_id = u.partner_id);
$$;

drop policy if exists maxdata_clientes_select on public.maxdata_clientes;
create policy maxdata_clientes_select on public.maxdata_clientes for select
  using (tenant_id in (select public.tenant_ids_acessiveis()));

drop policy if exists maxdata_produtos_select on public.maxdata_produtos;
create policy maxdata_produtos_select on public.maxdata_produtos for select
  using (tenant_id in (select public.tenant_ids_acessiveis()));

drop policy if exists maxdata_vendas_select on public.maxdata_vendas;
create policy maxdata_vendas_select on public.maxdata_vendas for select
  using (tenant_id in (select public.tenant_ids_acessiveis()));

drop policy if exists maxdata_venda_itens_select on public.maxdata_venda_itens;
create policy maxdata_venda_itens_select on public.maxdata_venda_itens for select
  using (tenant_id in (select public.tenant_ids_acessiveis()));
