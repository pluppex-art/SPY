-- Marca os itens que a Aurora já analisou (evita reanalisar e permite "analisar mais" em lotes).
alter table public.saude_comparacao_itens add column if not exists aurora_analisado boolean not null default false;
create index if not exists idx_saude_comp_itens_aurora on public.saude_comparacao_itens (comparacao_id)
  where aurora_analisado = false and status in ('revisao', 'nao_identificado');
