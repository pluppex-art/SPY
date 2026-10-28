-- Preços dos planos em degraus + implementação como PRODUTO de cada plano (fonte única do valor da implantação).
--   START      R$ 1.621/mês  ·  implementação R$ 3.000 (produto "Implementação SPY CRM + Aurora", já existe)
--   AUTOPILOT  R$ 2.997/mês  ·  implementação R$ 4.997 (produto novo)
--   AUTONOMOUS R$ 4.997/mês  ·  implementação R$ 9.997 (produto novo)
-- A mensalidade já segue o produto da licença (trigger sync_plans_from_product). A implantação do plano passa a seguir
-- o preço do produto de implementação ligado a ele (trigger abaixo). Idempotente.

-- 1) Implantação do plano = preço do produto de implementação ligado ao produto do plano.
create or replace function public.sync_plan_setup_from_implementation() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  update public.subscription_plans s
     set setup_price_cents = greatest(0, round(i.price * 100))::integer, updated_at = now()
    from public.products p, public.products i
   where s.product_id = p.id
     and i.id = any(coalesce(p.linked_product_ids, '{}'))
     and i.category = 'Implantação' and i.deleted_at is null
     and s.setup_price_cents is distinct from greatest(0, round(i.price * 100))::integer;
  return null;
end;
$$;

drop trigger if exists trg_sync_plan_setup_from_implementation on public.products;
create trigger trg_sync_plan_setup_from_implementation
  after insert or update of price, linked_product_ids, category, deleted_at on public.products
  for each statement execute function public.sync_plan_setup_from_implementation();

-- 2) Mensalidades (o trigger sync_plans_from_product leva o novo preço para o plano e para o site).
update public.products p set price = 2997
  from public.subscription_plans s where s.product_id = p.id and s.code = 'autopilot'  and p.price is distinct from 2997;
update public.products p set price = 4997
  from public.subscription_plans s where s.product_id = p.id and s.code = 'autonomous' and p.price is distinct from 4997;

-- 3) Produtos de implementação do AUTOPILOT e do AUTONOMOUS (mesmo molde da implementação do START).
insert into public.products (tenant_id, name, sku, type, category, price, active, is_recurring, provider, tags, description, type_attributes)
select p.tenant_id, 'Implementação S.P.Y | ' || s.name, 'IMPL-' || upper(s.code), 'Serviço', 'Implantação',
       case s.code when 'autopilot' then 4997 else 9997 end, true, false, 'Interno',
       array['spy', 'implantacao', 'implementacao', s.code],
       'Serviço de implementação do S.P.Y. no plano ' || s.name || ', com desenho comercial e de processos, configuração do sistema e dos agentes e acompanhamento do início.',
       jsonb_build_object(
         'modalidadeAtendimento', 'Híbrido',
         'isRecurring', false,
         'ia_oque_e',     base.ta->>'ia_oque_e',
         'ia_para_quem',  base.ta->>'ia_para_quem',
         'ia_beneficios', base.ta->>'ia_beneficios',
         'ia_objecoes',   base.ta->>'ia_objecoes',
         'ia_como_funciona',
           case s.code
             when 'autopilot'  then 'Desenhamos o processo comercial junto com a empresa, configuramos o S.P.Y. e os agentes de IA do plano AUTOPILOT (qualificação, follow-up, recuperação e agendamento automáticos) e acompanhamos o início.'
             else 'Desenhamos o processo comercial junto com a empresa, configuramos o S.P.Y., a Aurora e os múltiplos agentes especializados do plano AUTONOMOUS (propostas, negociação com regras, reativação de clientes e expansão de carteira) e acompanhamos o início.'
           end,
         'ia_planos_valores',
           'Implementação do plano ' || s.name || ': ' || case s.code when 'autopilot' then 'R$ 4.997,00' else 'R$ 9.997,00' end ||
           ', pagamento único (a licença mensal é cobrada à parte). Implementação por plano: START R$ 3.000,00 | AUTOPILOT R$ 4.997,00 | AUTONOMOUS R$ 9.997,00.')
  from public.subscription_plans s
  join public.products p on p.id = s.product_id
  cross join lateral (select type_attributes as ta from public.products where id = '35bdcf7a-5ca7-42da-940a-19d604e6b9cb') base
 where s.code in ('autopilot', 'autonomous')
   and not exists (select 1 from public.products x where x.tenant_id = p.tenant_id and x.sku = 'IMPL-' || upper(s.code) and x.deleted_at is null);

-- 4) Liga cada plano à sua implementação (o trigger acima copia o valor para a implantação do plano).
update public.products p
   set linked_product_ids = array[i.id]
  from public.subscription_plans s, public.products i
 where s.product_id = p.id and s.code in ('autopilot', 'autonomous')
   and i.tenant_id = p.tenant_id and i.deleted_at is null and i.sku = 'IMPL-' || upper(s.code)
   and p.linked_product_ids is distinct from array[i.id];

-- START: implantação do plano = R$ 3.000 do produto de implementação já ligado a ele.
update public.subscription_plans s
   set setup_price_cents = greatest(0, round(i.price * 100))::integer, updated_at = now()
  from public.products p, public.products i
 where s.code = 'start' and s.product_id = p.id and i.id = any(coalesce(p.linked_product_ids, '{}'))
   and i.category = 'Implantação' and i.deleted_at is null
   and s.setup_price_cents is distinct from greatest(0, round(i.price * 100))::integer;

-- 5) Atualiza o texto "planos e valores" do contexto de IA dos planos AUTOPILOT e AUTONOMOUS com os preços novos.
create or replace function pg_temp.brl(cents bigint) returns text language sql immutable as $$
  select 'R$ ' || translate(to_char(cents / 100.0, 'FM999G999G990D00'), ',.', '.,');
$$;
create or replace function pg_temp.num(n bigint) returns text language sql immutable as $$
  select translate(to_char(n, 'FM999G999G999'), ',.', '.,');
$$;
update public.products p
   set type_attributes = jsonb_set(coalesce(p.type_attributes, '{}'::jsonb), '{ia_planos_valores}', to_jsonb(
         'PLANO ' || s.name || ' - ' || pg_temp.brl(s.price_cents) || ' por mês.' ||
         case when s.setup_price_cents > 0 then ' Implantação (paga uma vez): ' || pg_temp.brl(s.setup_price_cents) || '.' else '' end || E'\n' ||
         'Planos do S.P.Y.: ' ||
         (select string_agg(x.name || ' ' || pg_temp.brl(x.price_cents) || '/mês (implantação ' || pg_temp.brl(x.setup_price_cents) || ')', ' | ' order by x.price_cents)
            from public.subscription_plans x where x.active) || '.' || E'\n' ||
         'Créditos de IA são pagos à parte, conforme o uso: ' ||
         (select string_agg(pg_temp.num(c.credits) || ' por ' || pg_temp.brl(c.price_cents), ' | ' order by c.credits)
            from public.credit_tiers c where c.active) || '.'))
  from public.subscription_plans s
 where s.product_id = p.id and s.code in ('autopilot', 'autonomous') and (p.type_attributes ? 'ia_planos_valores');
