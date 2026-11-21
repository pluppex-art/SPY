-- Comissão por item vendido no PDV: quem recebe, % (vem do cadastro do produto) e valor.
-- Colunas opcionais: vendas antigas continuam válidas.
alter table public.venda_items
  add column if not exists comissao_vendedor_id uuid,
  add column if not exists comissao_vendedor_nome text,
  add column if not exists comissao_pct numeric,
  add column if not exists comissao_valor numeric;
