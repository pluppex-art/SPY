-- Novo gatilho: "proposta aceita com ESTE produto" (além da categoria), para rotear um produto
-- específico (ex.: um produto de Dev) a um departamento de OS.
alter table public.automation_connections
  add column if not exists gatilho_produto_id uuid references public.products(id) on delete cascade;

alter table public.automation_connections drop constraint if exists automation_connections_gatilho_tipo_check;
alter table public.automation_connections add constraint automation_connections_gatilho_tipo_check
  check (gatilho_tipo = any (array['funil_etapa'::text, 'produto_categoria'::text, 'produto'::text, 'os_etapa'::text]));

create or replace function public.trg_automacao_proposta_categoria()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_regra record;
  v_tem_categoria boolean;
  v_lead_id uuid;
begin
  if new.status = 'Aceita' and old.status is distinct from 'Aceita' then
    select id into v_lead_id from public.leads where tenant_id = new.tenant_id and id::text = new.lead_id limit 1;
    for v_regra in
      select * from public.automation_connections
      where tenant_id = new.tenant_id and ativo = true and gatilho_tipo in ('produto_categoria', 'produto')
    loop
      if v_regra.gatilho_tipo = 'produto' then
        select exists(
          select 1 from public.proposal_items pi
          where pi.proposal_id = new.id and pi.product_id = v_regra.gatilho_produto_id
        ) into v_tem_categoria;
      else
        select exists(
          select 1 from public.proposal_items pi join public.products p on p.id = pi.product_id
          where pi.proposal_id = new.id and p.category = v_regra.gatilho_categoria
        ) into v_tem_categoria;
      end if;
      if v_tem_categoria then
        perform public.executar_automacao_connection(
          v_regra.id, new.tenant_id, v_regra.os_departamento_id, v_regra.nome,
          'proposal_categoria', new.id || ':' || v_regra.id, v_lead_id, new.cliente
        );
      end if;
    end loop;
  end if;
  return new;
end;
$function$;
