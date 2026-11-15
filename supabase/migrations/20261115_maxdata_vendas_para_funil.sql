-- Central de Vendas (funil) alimentada pelas vendas da Max Data.
-- Cada venda vira um negócio no funil "Vendas (Max Data)":
--   aberta     -> etapa "Em aberto"  (status Em Aberto)
--   paga       -> etapa "Ganho"      (status Fechado, valor = total da venda)
--   cancelada  -> etapa "Perdido"    (status Perdido, motivo "Venda cancelada")
-- Só entra o período pedido (padrão 90 dias) e vendas abertas; valores > R$ 1 milhão são erro de origem e ficam de fora.
-- Idempotente: rodar de novo atualiza os mesmos negócios (chave = id da venda), sem duplicar.
-- Importante: os gatilhos de leads que disparam coisas para FORA (webhooks, eventos de conversão para anúncios, automações,
-- round-robin, log) ficam DESLIGADOS só durante a carga e voltam no fim, na mesma transação (se algo falhar, voltam sozinhos).
-- São vendas passadas, não leads novos chegando; sem isso, milhares de "Lead criado" iriam para Meta/n8n.
-- (Não usa session_replication_role: o Supabase não permite esse parâmetro ao papel do editor SQL.)

create unique index if not exists leads_maxdata_venda_uq
  on public.leads (tenant_id, (("customFields" ->> 'maxdata_venda_id')))
  where "customFields" ? 'maxdata_venda_id';

create or replace function public.maxdata_vendas_para_funil(p_tenant uuid, p_dias int default 90)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  funil text := 'maxdata-vendas-' || left(p_tenant::text, 8);
  ini timestamptz := now() - make_interval(days => greatest(1, least(p_dias, 3650)));
  n_ins int; n_total int; t text;
  gatilhos constant text[] := array[
    'trg_ads_conversion', 'trg_assign_lead_round_robin', 'trg_automacao_lead_etapa', 'trg_external_lead_created',
    'trg_external_lead_status_changed', 'trg_lead_entrou_implementacao', 'trg_permission_log_crm',
    'trg_spy_log_lead_data_history', 'webhook_lead_created', 'webhook_lead_status_changed'];
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin')
     and not exists (select 1 from public.tenant_ids_acessiveis() x(id) where x.id = p_tenant) then
    raise exception 'sem acesso a este tenant' using errcode = '42501';
  end if;

  insert into public.crm_funis (id, nome, tipo, etapas, etapas_config, ativo, tenant_id)
  values (
    funil, 'Vendas (Max Data)', 'comercial',
    array['Em aberto', 'Negociação', 'Ganho', 'Perdido', 'Desqualificado'],
    '[{"cor":"blue","nome":"Em aberto","iniciarMinimizado":false},
      {"cor":"amber","nome":"Negociação","iniciarMinimizado":false},
      {"cor":"emerald","nome":"Ganho","iniciarMinimizado":false},
      {"cor":"rose","nome":"Perdido","iniciarMinimizado":true},
      {"cor":"slate","nome":"Desqualificado","iniciarMinimizado":true}]'::jsonb,
    true, p_tenant)
  on conflict (id) do nothing;

  foreach t in array gatilhos loop
    if exists (select 1 from pg_trigger where tgrelid = 'public.leads'::regclass and tgname = t and not tgisinternal) then
      execute format('alter table public.leads disable trigger %I', t);
    end if;
  end loop;

  with fonte as (
    select v.*,
           case v.status when 'paga' then 2 when 'cancelada' then 3 else 0 end as idx
    from public.maxdata_vendas v
    where v.tenant_id = p_tenant
      and v.valor_total <= 1000000
      and v.status in ('paga', 'cancelada', 'aberta')
      and (v.data_venda >= ini or v.status = 'aberta')
  ), ins as (
    insert into public.leads (
      tenant_id, name, title, status, priority, source, date, "clientName", value,
      "pipelineId", "stageId", created_at, updated_at, last_contact_at, closed_at, loss_reason, lost_reason, "customFields"
    )
    select
      p_tenant,
      left(coalesce(nullif(trim(f.cliente_nome), ''), 'Consumidor final'), 200),
      'Venda #' || f.externo_id,
      case f.status when 'paga' then 'Fechado' when 'cancelada' then 'Perdido' else 'Em Aberto' end,
      'Média', 'Max Data',
      to_char(coalesce(f.data_venda, f.created_at), 'YYYY-MM-DD'),
      left(coalesce(nullif(trim(f.cliente_nome), ''), 'Consumidor final'), 200),
      f.valor_total,
      'comercial', funil || '-' || f.idx,
      coalesce(f.data_venda, f.created_at), now(), coalesce(f.data_venda, f.created_at),
      case when f.status in ('paga', 'cancelada') then coalesce(f.paid_at, f.data_venda, f.created_at) end,
      case when f.status = 'cancelada' then 'Venda cancelada' end,
      case when f.status = 'cancelada' then 'Venda cancelada' end,
      jsonb_build_object('origin', 'maxdata', 'maxdata_venda_id', f.externo_id, 'forma_pagamento', f.forma_pagamento,
                         'cliente_externo_id', f.cliente_externo_id, 'fonte', f.externo_sistema)
    from fonte f
    on conflict (tenant_id, (("customFields" ->> 'maxdata_venda_id'))) where ("customFields" ? 'maxdata_venda_id')
    do update set
      status = excluded.status, "stageId" = excluded."stageId", value = excluded.value,
      closed_at = excluded.closed_at, loss_reason = excluded.loss_reason, lost_reason = excluded.lost_reason,
      updated_at = now()
    where public.leads.status is distinct from excluded.status or public.leads.value is distinct from excluded.value
    returning 1
  )
  select count(*) into n_ins from ins;

  foreach t in array gatilhos loop
    if exists (select 1 from pg_trigger where tgrelid = 'public.leads'::regclass and tgname = t and not tgisinternal) then
      execute format('alter table public.leads enable trigger %I', t);
    end if;
  end loop;

  select count(*) into n_total from public.leads where tenant_id = p_tenant and "customFields" ? 'maxdata_venda_id';
  return jsonb_build_object('funil', funil, 'gravados', n_ins, 'total_no_funil', n_total, 'dias', p_dias);
end;
$$;
grant execute on function public.maxdata_vendas_para_funil(uuid, int) to authenticated, service_role;

-- Carga inicial da Casa São Paulo Sports (últimos 90 dias + vendas abertas). Roda só onde esse tenant existe.
do $$
begin
  if exists (select 1 from public.tenants where id = '3ce261f6-505b-4cad-ba44-b398f764a0b4') then
    perform public.maxdata_vendas_para_funil('3ce261f6-505b-4cad-ba44-b398f764a0b4', 90);
  end if;
end $$;
