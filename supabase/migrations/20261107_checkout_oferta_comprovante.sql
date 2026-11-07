-- Checkout de produto unico: oferta (valor "de" riscado + valor promocional), comprovante do Pix obrigatorio.
alter table public.checkout_config
  add column if not exists single_plan_code text,
  add column if not exists list_price_cents integer not null default 0,
  add column if not exists offer_cents integer;
alter table public.checkout_orders add column if not exists comprovante_path text;

update public.checkout_config
   set single_plan_code = 'start', list_price_cents = 700000, offer_cents = 100000
 where id = 'main' and single_plan_code is null and offer_cents is null;

-- bucket privado: sem politicas = so o servidor (service role) le e grava
insert into storage.buckets (id, name, public) values ('checkout-comprovantes', 'checkout-comprovantes', false)
on conflict (id) do nothing;
