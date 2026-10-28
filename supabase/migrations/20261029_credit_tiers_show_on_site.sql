-- Pacote de créditos de IA ganha a mesma flag "mostrar no site" do plano.
-- Default true preserva o comportamento atual (todos os pacotes ativos apareciam na landing).
alter table public.credit_tiers
  add column if not exists show_on_site boolean not null default true;
