-- Valor de tabela (o "de" riscado) detalhado: implantacao + mensalidade.
alter table public.checkout_config
  add column if not exists list_setup_cents integer,
  add column if not exists list_monthly_cents integer;
update public.checkout_config
   set list_setup_cents = 500000, list_monthly_cents = 200000, list_price_cents = 700000
 where id = 'main';
