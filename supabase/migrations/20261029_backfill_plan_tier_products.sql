-- Todo plano e todo pacote de créditos de IA passa a ter o seu produto no catálogo da plataforma
-- (mesmas regras do botão "Criar produto" do Admin). Idempotente: só mexe em quem ainda não tem product_id.
-- O produto vira a fonte única de preço/ativo/recorrência (trigger sync_plans_from_product).
do $$
declare
  v_owner constant uuid := '27ef95ee-84dd-499e-9f25-cd9baecb5fe4';
  r record;
  v_pid uuid;
begin
  if not exists (select 1 from public.tenants where id = v_owner) then
    raise notice 'tenant dono do catálogo não existe neste banco; nada a fazer';
    return;
  end if;

  for r in select * from public.subscription_plans where product_id is null loop
    insert into public.products (tenant_id, name, type, category, price, active, is_recurring, recurring_period, description, type_attributes)
    values (v_owner, 'Licença S.P.Y | ' || r.name, 'Digital', 'Software', r.price_cents / 100.0, r.active, true,
            case when r.billing_interval = 'yearly' then 'yearly' else 'monthly' end,
            nullif(r.tagline, ''),
            jsonb_build_object('isRecurring', true,
                               'billingCycle', case when r.billing_interval = 'yearly' then 'Anual' else 'Mensal' end,
                               'tipoEntrega', 'Acesso por Login'))
    returning id into v_pid;
    update public.subscription_plans set product_id = v_pid where id = r.id;
  end loop;

  for r in select * from public.credit_tiers where product_id is null loop
    insert into public.products (tenant_id, name, type, category, price, active, is_recurring, description, type_attributes)
    values (v_owner, 'Pacote de créditos de IA | ' || to_char(r.credits, 'FM999G999G999G999'), 'Digital', 'Créditos de IA',
            r.price_cents / 100.0, r.active, false,
            to_char(r.credits, 'FM999G999G999G999') || ' créditos de inteligência artificial.',
            jsonb_build_object('isRecurring', false, 'creditosIA', r.credits))
    returning id into v_pid;
    update public.credit_tiers set product_id = v_pid where id = r.id;
  end loop;
end $$;
