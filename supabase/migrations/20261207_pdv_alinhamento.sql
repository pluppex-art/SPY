-- PDV alinhado ao resto do sistema: numeração curta, pagamentos gravados, auditoria,
-- finalizar_venda respeitando "vender sem estoque" e crediário, e estorno atômico.

-- 1) Colunas novas
alter table public.vendas
  add column if not exists numero integer,
  add column if not exists vendedor_nome text,
  add column if not exists valor_recebido numeric,
  add column if not exists troco numeric,
  add column if not exists operador_nome text,
  add column if not exists comissao_valor numeric,
  add column if not exists cancelada_em timestamptz,
  add column if not exists cancelada_motivo text;

alter table public.varejo_pedidos add column if not exists venda_id uuid;

-- 2) Número sequencial da venda por empresa (só vendas do PDV; importadas do ERP ficam sem)
create table if not exists public.vendas_numeracao (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  ultimo integer not null default 0
);
alter table public.vendas_numeracao enable row level security; -- sem policy: só a função abaixo escreve

create or replace function public.vendas_atribuir_numero()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.numero is null and new.externo_sistema is null then
    insert into vendas_numeracao (tenant_id, ultimo) values (new.tenant_id, 1)
    on conflict (tenant_id) do update set ultimo = vendas_numeracao.ultimo + 1
    returning ultimo into new.numero;
  end if;
  return new;
end;
$$;

drop trigger if exists vendas_numero_bi on public.vendas;
create trigger vendas_numero_bi before insert on public.vendas
  for each row execute function public.vendas_atribuir_numero();

-- numera as vendas do PDV já existentes, na ordem em que foram feitas
do $$
begin
  with ord as (
    select id, tenant_id, row_number() over (partition by tenant_id order by created_at, id) as n
    from public.vendas where externo_sistema is null and numero is null
  )
  update public.vendas v set numero = ord.n from ord where v.id = ord.id;

  insert into public.vendas_numeracao (tenant_id, ultimo)
  select tenant_id, max(numero) from public.vendas where numero is not null group by tenant_id
  on conflict (tenant_id) do update set ultimo = greatest(vendas_numeracao.ultimo, excluded.ultimo);
end $$;

create unique index if not exists vendas_tenant_numero_uq on public.vendas (tenant_id, numero) where numero is not null;

-- 3) Pagamentos da venda (divisão do "Misto", base para fechamento de caixa por forma)
create table if not exists public.venda_pagamentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  venda_id uuid not null references public.vendas(id) on delete cascade,
  forma text not null,
  valor numeric not null check (valor >= 0),
  created_at timestamptz not null default now()
);
create index if not exists venda_pagamentos_venda_idx on public.venda_pagamentos (venda_id);
alter table public.venda_pagamentos enable row level security;
drop policy if exists tenant_isolation on public.venda_pagamentos;
create policy tenant_isolation on public.venda_pagamentos for all
  using ((select public.has_tenant_access(tenant_id)))
  with check ((select public.has_tenant_access(tenant_id)));

-- 4) Auditoria do PDV (ninguém edita nem apaga pelo app: só leitura e inserção)
create table if not exists public.pdv_auditoria (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  venda_id uuid,
  acao text not null check (acao in ('remover_item', 'cancelar_venda', 'estornar_venda')),
  usuario_id uuid default auth.uid(),
  usuario_nome text,
  motivo text,
  detalhes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pdv_auditoria_tenant_idx on public.pdv_auditoria (tenant_id, created_at desc);
alter table public.pdv_auditoria enable row level security;
drop policy if exists pdv_auditoria_select on public.pdv_auditoria;
create policy pdv_auditoria_select on public.pdv_auditoria for select
  using ((select public.has_tenant_access(tenant_id)));
drop policy if exists pdv_auditoria_insert on public.pdv_auditoria;
create policy pdv_auditoria_insert on public.pdv_auditoria for insert
  with check ((select public.has_tenant_access(tenant_id)) and usuario_id = (select auth.uid()));

-- 5) finalizar_venda: respeita "vender sem estoque", crediário (conta a receber) e liga o cliente ao financeiro
drop function if exists public.finalizar_venda(uuid);

create or replace function public.finalizar_venda(
  p_venda_id uuid,
  p_permitir_sem_estoque boolean default false,
  p_prazo_dias integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_venda record;
  v_item record;
  v_estoque_atual integer;
  v_total numeric := 0;
  v_finance_id text;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_cliente_ok boolean;
  v_rotulo text;
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

    select "currentStock" into v_estoque_atual from products
      where id = v_item.product_id and tenant_id = v_venda.tenant_id for update;
    if not found then
      raise exception 'Produto não encontrado: %.', v_item.product_name;
    end if;
    if not coalesce(p_permitir_sem_estoque, false) and coalesce(v_estoque_atual, 0) < v_item.quantidade then
      raise exception 'Estoque insuficiente para o produto %.', v_item.product_name;
    end if;
    update products set "currentStock" = coalesce("currentStock", 0) - v_item.quantidade
      where id = v_item.product_id and tenant_id = v_venda.tenant_id;
    insert into estoque_movimentacoes (tenant_id, product_id, tipo, quantidade, motivo, referencia_venda_id, created_by)
    values (v_venda.tenant_id, v_item.product_id, 'venda', -v_item.quantidade, 'Baixa automática por venda', p_venda_id, auth.uid());
    v_total := v_total + (v_item.quantidade * v_item.preco_unitario);
  end loop;

  if v_total <= 0 then
    raise exception 'Venda sem itens — nada a finalizar.';
  end if;

  v_cliente_ok := v_venda.cliente_id is not null
    and exists (select 1 from clientes where id = v_venda.cliente_id::text and tenant_id = v_venda.tenant_id);
  v_rotulo := coalesce('#' || lpad(v_venda.numero::text, 4, '0'), '#' || substr(p_venda_id::text, 1, 8));

  v_finance_id := 'venda_' || replace(p_venda_id::text, '-', '');
  insert into finance_entries (
    id, tenant_id, description, category, status, value, type, date,
    payment_method, contato_id, counterparty, numero_documento, created_at
  ) values (
    v_finance_id, v_venda.tenant_id,
    'Venda ' || v_rotulo || coalesce(' · ' || nullif(v_venda.cliente_nome, ''), ''),
    'Vendas',
    case when p_prazo_dias is not null then 'A Vencer' else 'Pago' end,
    v_total, 'Receber',
    to_char(case when p_prazo_dias is not null then v_hoje + p_prazo_dias else v_hoje end, 'YYYY-MM-DD'),
    v_venda.forma_pagamento,
    case when v_cliente_ok then v_venda.cliente_id::text else null end,
    v_venda.cliente_nome,
    v_venda.numero::text,
    now()
  );

  update vendas
    set status = 'paga',
        valor_total = v_total,
        paid_at = case when p_prazo_dias is null then now() else null end,
        finance_entry_id = v_finance_id
    where id = p_venda_id;

  return jsonb_build_object('success', true, 'venda_id', p_venda_id, 'numero', v_venda.numero, 'valor_total', v_total);
end;
$$;

revoke all on function public.finalizar_venda(uuid, boolean, integer) from public, anon;
grant execute on function public.finalizar_venda(uuid, boolean, integer) to authenticated, service_role;

-- 6) estornar_venda: status, estoque, financeiro e pedido em uma transação só
create or replace function public.estornar_venda(p_venda_id uuid, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_venda record;
  v_item record;
  v_fin record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_rotulo text;
begin
  select * into v_venda from vendas where id = p_venda_id for update;
  if v_venda.id is null then
    raise exception 'Venda não encontrada.';
  end if;
  if not has_tenant_access(v_venda.tenant_id) then
    raise exception 'Sem permissão para esta venda.';
  end if;
  if v_venda.externo_sistema is not null then
    raise exception 'Vendas importadas do ERP não podem ser estornadas pelo PDV.';
  end if;
  if v_venda.status <> 'paga' then
    raise exception 'Esta venda já foi estornada ou não está paga.';
  end if;

  v_rotulo := coalesce('#' || lpad(v_venda.numero::text, 4, '0'), '#' || substr(p_venda_id::text, 1, 8));

  for v_item in select product_id, quantidade from venda_items
    where venda_id = p_venda_id and tenant_id = v_venda.tenant_id and product_id is not null loop
    update products set "currentStock" = coalesce("currentStock", 0) + v_item.quantidade
      where id = v_item.product_id and tenant_id = v_venda.tenant_id;
    insert into estoque_movimentacoes (tenant_id, product_id, tipo, quantidade, motivo, referencia_venda_id, created_by)
    values (v_venda.tenant_id, v_item.product_id, 'entrada', v_item.quantidade, 'Estorno da venda ' || v_rotulo, p_venda_id, auth.uid());
  end loop;

  if v_venda.finance_entry_id is not null then
    select * into v_fin from finance_entries where id = v_venda.finance_entry_id and tenant_id = v_venda.tenant_id;
    if found then
      if v_fin.status in ('Pago', 'Recebido') then
        -- já entrou no caixa: lança a saída que desfaz a receita, mantendo o histórico
        insert into finance_entries (
          id, tenant_id, description, category, status, value, type, date,
          payment_method, counterparty, numero_documento, created_at
        ) values (
          'estorno_' || replace(p_venda_id::text, '-', ''), v_venda.tenant_id,
          'Estorno da venda ' || v_rotulo || coalesce(' · ' || nullif(v_venda.cliente_nome, ''), ''),
          'Estornos', 'Pago', v_fin.value, 'Pagar', to_char(v_hoje, 'YYYY-MM-DD'),
          v_fin.payment_method, v_fin.counterparty, v_venda.numero::text, now()
        )
        on conflict (id) do nothing;
      else
        -- crediário ainda não recebido: a conta a receber deixa de existir
        delete from finance_entries where id = v_fin.id and tenant_id = v_venda.tenant_id;
      end if;
    end if;
  end if;

  update vendas
    set status = 'cancelada', cancelada_em = now(), cancelada_motivo = nullif(btrim(p_motivo), '')
    where id = p_venda_id;

  update varejo_pedidos set status = 'Cancelado'
    where venda_id = p_venda_id and tenant_id = v_venda.tenant_id;

  insert into pdv_auditoria (tenant_id, venda_id, acao, usuario_id, usuario_nome, motivo, detalhes)
  values (
    v_venda.tenant_id, p_venda_id, 'estornar_venda', auth.uid(),
    (select name from users where id = auth.uid()),
    nullif(btrim(p_motivo), ''),
    jsonb_build_object('numero', v_venda.numero, 'valor_total', v_venda.valor_total, 'cliente', v_venda.cliente_nome)
  );

  return jsonb_build_object('success', true, 'venda_id', p_venda_id, 'numero', v_venda.numero);
end;
$$;

revoke all on function public.estornar_venda(uuid, text) from public, anon;
grant execute on function public.estornar_venda(uuid, text) to authenticated, service_role;
