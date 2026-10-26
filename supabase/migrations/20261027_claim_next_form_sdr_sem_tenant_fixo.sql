-- claim_next_form_sdr (chamada pelo formulário público) tinha o id de uma empresa gravado no código
-- como única autorizada. Passa a valer para qualquer empresa que tenha o rodízio de formulário
-- configurado (app_settings 'form_rodizio_empreenda'); quem não tem continua negado.
create or replace function public.claim_next_form_sdr(p_tenant_id uuid)
returns table(sdr_id text, nome character varying, phone text, user_id uuid)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_config jsonb;
  v_index  int;
  v_count  int;
  v_ids    text[];
begin
  select value into v_config
  from app_settings
  where tenant_id = p_tenant_id and key = 'form_rodizio_empreenda';

  if v_config is null then
    raise exception 'access denied';
  end if;

  v_index := coalesce((v_config->>'current_index')::int, 0);

  if (v_config ? 'active_sdr_ids') and jsonb_array_length(v_config->'active_sdr_ids') > 0 then
    select array(select jsonb_array_elements_text(v_config->'active_sdr_ids')) into v_ids;
  end if;

  if v_ids is not null then
    select count(*) into v_count from colaboradores
    where tenant_id = p_tenant_id and cargo = 'SDR' and status = 'Ativo' and id = any(v_ids);
  else
    select count(*) into v_count from colaboradores
    where tenant_id = p_tenant_id and cargo = 'SDR' and status = 'Ativo';
  end if;

  if v_count = 0 then return; end if;

  if v_ids is not null then
    return query
    select c.id, c.nome, c.phone, c.user_id from colaboradores c
    where c.tenant_id = p_tenant_id and c.cargo = 'SDR' and c.status = 'Ativo' and c.id = any(v_ids)
    order by c.nome limit 1 offset (v_index % v_count);
  else
    return query
    select c.id, c.nome, c.phone, c.user_id from colaboradores c
    where c.tenant_id = p_tenant_id and c.cargo = 'SDR' and c.status = 'Ativo'
    order by c.nome limit 1 offset (v_index % v_count);
  end if;

  update app_settings
  set value = jsonb_set(value, '{current_index}', to_jsonb(v_index + 1)), updated_at = now()
  where tenant_id = p_tenant_id and key = 'form_rodizio_empreenda';
end;
$function$;
