-- Itens das vendas da Max Data são buscados em etapa própria (a Max Data limita ~9 consultas/s e responde 429
-- acima disso); a coluna marca quais vendas já tiveram os itens sincronizados.
alter table public.maxdata_vendas add column if not exists itens_sincronizados boolean not null default false;
create index if not exists maxdata_vendas_itens_pendentes on public.maxdata_vendas (tenant_id, externo_sistema, data_venda desc) where itens_sincronizados = false;
update public.maxdata_vendas v set itens_sincronizados = true where itens_sincronizados = false and exists (select 1 from public.maxdata_venda_itens i where i.venda_id = v.id);
