-- Cargo ganha "Restringir aos próprios dados" (vendedor) e colaborador ganha meta mensal.
-- Já aplicado no banco da Pluppex; este arquivo registra a mudança no repositório.
alter table public.cargos
  add column if not exists restringir_aos_proprios_dados boolean not null default false;

alter table public.colaboradores
  add column if not exists meta_mensal numeric not null default 0;

comment on column public.cargos.restringir_aos_proprios_dados is
  'Quando true, quem tem este cargo enxerga só os próprios leads/propostas/tarefas (vendedor). Aplicado na tela e nas policies RLS.';
comment on column public.colaboradores.meta_mensal is
  'Meta mensal de receita (R$) do vendedor — alimenta a barra "meta x realizado" da Central de Receita > Vendedores.';
