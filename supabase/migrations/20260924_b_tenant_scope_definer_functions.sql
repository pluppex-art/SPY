-- 20260924_b_tenant_scope_definer_functions.sql
-- Amarra ao tenant as 3 funções SECURITY DEFINER que mexiam em estoque/contadores por id estrangeiro
-- (auditoria SPY, lead c11). Só CREATE OR REPLACE: ACLs e triggers existentes são preservados.

create or replace function public.finalizar_venda(p_venda_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_venda record;
  v_item record;
  v_estoque_atual integer;
  v_total numeric := 0;
  v_finance_id text;
begin
  select * into v_venda from vendas where id = p_venda_id for update;
  if v_venda.id is null then
    raise exception 'Venda não encontrada.';
  end if;
  if not has_tenant_access(v_venda.tenant_id) then
    raise exception 'Sem permissão para esta venda.';
  end if;
  if v_venda.status <> 'aberta' then
    raise exception 'Venda já processada ou cancelada.';
  end if;

  for v_item in select * from venda_items where venda_id = p_venda_id and tenant_id = v_venda.tenant_id loop
    if v_item.quantidade is null or v_item.quantidade <= 0 then
      raise exception 'Quantidade inválida para o produto %.', v_item.product_name;
    end if;
    if v_item.product_id is null then
      v_total := v_total + (v_item.quantidade * v_item.preco_unitario);
      continue;
    end if;

    -- Produto precisa ser do MESMO tenant da venda.
    select "currentStock" into v_estoque_atual from products
      where id = v_item.product_id and tenant_id = v_venda.tenant_id for update;
    if v_estoque_atual is null or v_estoque_atual < v_item.quantidade then
      raise exception 'Estoque insuficiente para o produto %.', v_item.product_name;
    end if;
    update products set "currentStock" = "currentStock" - v_item.quantidade
      where id = v_item.product_id and tenant_id = v_venda.tenant_id;
    insert into estoque_movimentacoes (tenant_id, product_id, tipo, quantidade, motivo, referencia_venda_id, created_by)
    values (v_venda.tenant_id, v_item.product_id, 'venda', -v_item.quantidade, 'Baixa automática por venda', p_venda_id, auth.uid());
    v_total := v_total + (v_item.quantidade * v_item.preco_unitario);
  end loop;

  if v_total <= 0 then
    raise exception 'Venda sem itens — nada a finalizar.';
  end if;

  v_finance_id := 'venda_' || replace(p_venda_id::text, '-', '');
  insert into finance_entries (id, tenant_id, description, category, status, value, type, date, created_at)
  values (v_finance_id, v_venda.tenant_id, 'Venda #' || substr(p_venda_id::text, 1, 8), 'Vendas', 'Recebido', v_total, 'Receita', to_char(now(), 'YYYY-MM-DD'), now());

  update vendas set status = 'paga', valor_total = v_total, paid_at = now(), finance_entry_id = v_finance_id where id = p_venda_id;

  return jsonb_build_object('success', true, 'venda_id', p_venda_id, 'valor_total', v_total);
end;
$function$;

create or replace function public.baixar_estoque_proposta_aceita()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.status = 'Aceita' and (OLD.status is distinct from 'Aceita') then
    update public.products p
       set "currentStock" = p."currentStock" - pi.quantidade
      from public.proposal_items pi
     where pi.proposal_id = NEW.id
       and pi.tenant_id = NEW.tenant_id
       and pi.product_id is not null
       and pi.quantidade > 0
       and p.id = pi.product_id
       and p.tenant_id = NEW.tenant_id;
  end if;
  return NEW;
end;
$function$;

create or replace function public.increment_veiculo_test_drive()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if NEW.veiculo_id is not null then
    update public.imobiliario_veiculos
       set visitas = coalesce(visitas, 0) + 1
     where id = NEW.veiculo_id
       and tenant_id = NEW.tenant_id;
  end if;
  return NEW;
end;
$function$;
