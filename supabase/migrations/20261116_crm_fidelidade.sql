-- Níveis de fidelidade (Bronze/Prata/Ouro...) por empresa: compras por cliente na janela escolhida.
-- fonte 'vendas' = leads fechados ligados ao cliente (clientId) com closed_at na janela; 'financeiro' = receitas pagas
-- ligadas ao contato (contato_id). Devolve {clienteId: {c: compras, v: valor}}. SECURITY INVOKER (RLS vale).
create or replace function public.crm_fidelidade_compras(p_tenant uuid, p_janela text default 'mes', p_fonte text default 'vendas')
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public'
as $$
declare
  v_ini timestamptz;
  v_res jsonb;
begin
  if p_janela = 'mes' then v_ini := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  elsif p_janela = '12m' then v_ini := now() - interval '12 months';
  else v_ini := null;
  end if;

  if p_fonte = 'financeiro' then
    select coalesce(jsonb_object_agg(cid, jsonb_build_object('c', n, 'v', v)), '{}'::jsonb) into v_res
    from (
      select f.contato_id as cid, count(*) as n, coalesce(sum(f.value), 0) as v
      from public.finance_entries f
      where f.tenant_id = p_tenant and f.type = 'Receber' and f.status = 'Pago' and f.contato_id is not null
        and (v_ini is null or f.date_normalized >= (v_ini at time zone 'America/Sao_Paulo')::date)
      group by f.contato_id
    ) t;
  else
    select coalesce(jsonb_object_agg(cid, jsonb_build_object('c', n, 'v', v)), '{}'::jsonb) into v_res
    from (
      select l."clientId" as cid, count(*) as n, coalesce(sum(l.value), 0) as v
      from public.leads l
      where l.tenant_id = p_tenant and l.deleted_at is null and l.status = 'Fechado' and l."clientId" is not null
        and (v_ini is null or (l.closed_at is not null and l.closed_at >= v_ini))
      group by l."clientId"
    ) t;
  end if;
  return v_res;
end;
$$;
