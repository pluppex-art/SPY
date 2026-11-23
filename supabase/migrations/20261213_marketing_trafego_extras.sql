-- Dados da campanha de tráfego que antes não tinham onde ficar: responsável, objetivo, público, gasto real, checklist e notas.
-- Só adiciona uma coluna (igual à `extras` de marketing_content); nada existente é alterado.
alter table public.marketing_trafego add column if not exists extras jsonb not null default '{}'::jsonb;
