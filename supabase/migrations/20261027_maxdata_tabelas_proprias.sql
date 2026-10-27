-- Dados da Max Data ficam em tabelas próprias (fora do Realtime e do carregamento integral do app):
-- o app lê clientes/products inteiros no navegador, o que não escala para dezenas de milhares de linhas.
create table if not exists public.maxdata_clientes (like public.clientes including defaults);
create table if not exists public.maxdata_produtos (like public.products including defaults);
create table if not exists public.maxdata_vendas (like public.vendas including defaults);
create table if not exists public.maxdata_venda_itens (like public.venda_items including defaults);

alter table public.maxdata_clientes add primary key (id);
alter table public.maxdata_produtos add primary key (id);
alter table public.maxdata_vendas add primary key (id);
alter table public.maxdata_venda_itens add primary key (id);
alter table public.maxdata_venda_itens add constraint maxdata_venda_itens_venda_fk foreign key (venda_id) references public.maxdata_vendas(id) on delete cascade;

create unique index maxdata_clientes_uq on public.maxdata_clientes (tenant_id, externo_sistema, externo_id);
create unique index maxdata_produtos_uq on public.maxdata_produtos (tenant_id, externo_sistema, externo_id);
create unique index maxdata_vendas_uq on public.maxdata_vendas (tenant_id, externo_sistema, externo_id);
create unique index maxdata_venda_itens_uq on public.maxdata_venda_itens (venda_id, externo_id);
create index maxdata_clientes_nome on public.maxdata_clientes (tenant_id, name);
create index maxdata_clientes_doc on public.maxdata_clientes (tenant_id, documento);
create index maxdata_produtos_nome on public.maxdata_produtos (tenant_id, name);
create index maxdata_produtos_sku on public.maxdata_produtos (tenant_id, sku);
create index maxdata_vendas_data on public.maxdata_vendas (tenant_id, data_venda desc);
create index maxdata_vendas_cliente on public.maxdata_vendas (tenant_id, cliente_externo_id);
create index maxdata_itens_produto on public.maxdata_venda_itens (tenant_id, product_id);

alter table public.maxdata_clientes enable row level security;
alter table public.maxdata_produtos enable row level security;
alter table public.maxdata_vendas enable row level security;
alter table public.maxdata_venda_itens enable row level security;
create policy "maxdata_clientes_select" on public.maxdata_clientes for select using (has_tenant_access(tenant_id));
create policy "maxdata_produtos_select" on public.maxdata_produtos for select using (has_tenant_access(tenant_id));
create policy "maxdata_vendas_select" on public.maxdata_vendas for select using (has_tenant_access(tenant_id));
create policy "maxdata_venda_itens_select" on public.maxdata_venda_itens for select using (has_tenant_access(tenant_id));
