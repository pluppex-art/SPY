-- Garante que as colunas usadas pelo app em finance_entries existam em qualquer ambiente
-- (alguns bancos foram criados antes dessas colunas e ficaram com drift). Idempotente.
alter table public.finance_entries
  add column if not exists payment_method text,
  add column if not exists counterparty text,
  add column if not exists notes text,
  add column if not exists is_recurring boolean not null default false,
  add column if not exists recurring_frequency text,
  add column if not exists recurring_group_id text,
  add column if not exists installment_group_id text,
  add column if not exists installment_number integer,
  add column if not exists installment_total integer,
  add column if not exists filial_id text;
