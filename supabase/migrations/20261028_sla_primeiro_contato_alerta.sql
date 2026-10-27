-- Alerta de SLA de primeiro contato (Configurações › CRM › SLA).
-- A cada 15 min avisa (notificação no sistema) o vendedor do lead — ou os administradores, se o vendedor
-- não tiver usuário — quando um lead aberto, criado nos últimos 30 dias e sem nenhuma atividade, reunião
-- ou tarefa passa do limite da regra da sua prioridade. Um aviso por lead (não repete).
create or replace function public.sla_alertar_primeiro_contato()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  cfg record;
  regra jsonb;
  ld record;
  v_horas numeric;
  v_destinos uuid[];
  v_link text;
  v_total int := 0;
  v_uid uuid;
begin
  for cfg in
    select s.tenant_id, s.value as regras
    from app_settings s
    where s.key = 'crm_sla_rules' and jsonb_typeof(s.value) = 'array'
  loop
    for regra in select * from jsonb_array_elements(cfg.regras) loop
      continue when coalesce((regra->>'active')::boolean, false) is not true;
      v_horas := coalesce((regra->>'limitHours')::numeric, 0);
      continue when v_horas <= 0;

      for ld in
        select l.id::text as lead_id, l.name, l.seller
        from leads l
        where l.tenant_id = cfg.tenant_id
          and coalesce(l.status, '') not in ('Fechado', 'Perdido')
          and coalesce(l.priority, 'Média') = regra->>'priority'
          and l.created_at <= now() - make_interval(secs => v_horas * 3600)
          and l.created_at >= now() - interval '30 days'
          and not exists (select 1 from lead_activities a where a.lead_id = l.id::text)
          and not exists (select 1 from reunioes ru where ru."leadId"::text = l.id::text)
          and not exists (select 1 from tasks t where t.lead_id::text = l.id::text)
      loop
        v_link := '/app/crm/pipeline?leadId=' || ld.lead_id;
        continue when exists (select 1 from notifications n where n.link_url = v_link and n.title = 'SLA de primeiro contato estourado');

        v_destinos := null;
        if ld.seller is not null and trim(ld.seller) <> '' then
          select array_agg(u.id) into v_destinos
          from users u
          where u.tenant_id = cfg.tenant_id and coalesce(u.active, true)
            and (lower(trim(u.name)) = lower(trim(ld.seller)) or lower(trim(ld.seller)) like '%' || lower(trim(u.name)) || '%');
        end if;
        if v_destinos is null then
          select array_agg(u.id) into v_destinos
          from users u
          where u.tenant_id = cfg.tenant_id and coalesce(u.active, true) and coalesce(u.is_tenant_admin, false);
        end if;

        foreach v_uid in array coalesce(v_destinos, '{}'::uuid[]) loop
          insert into notifications (tenant_id, user_id, title, description, type, link_url)
          values (cfg.tenant_id, v_uid, 'SLA de primeiro contato estourado',
                  'O lead "' || coalesce(ld.name, 'sem nome') || '" passou de ' || v_horas::int || 'h sem nenhum contato registrado.',
                  'warning', v_link);
          v_total := v_total + 1;
        end loop;
      end loop;
    end loop;
  end loop;
  return v_total;
end;
$function$;

revoke execute on function public.sla_alertar_primeiro_contato() from public, anon, authenticated;

select cron.schedule('sla-primeiro-contato', '*/15 * * * *', $$select public.sla_alertar_primeiro_contato()$$);
