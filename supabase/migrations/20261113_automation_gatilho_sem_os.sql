-- Gatilho de funil sem Ordem de Serviço: qualquer empresa pode criar regras "etapa -> ações" (mover no funil, mensagem,
-- tarefa, notificar). Antes toda regra exigia um departamento de OS, então empresas sem OS não podiam usar gatilhos.
-- Também corrige o casamento da etapa nos funis padrão (ids legados "1".."n" e "sdr-n").
alter table public.automation_connections alter column os_departamento_id drop not null;

create or replace function public.spy_stage_id(p_funil text, p_idx int) returns text
language sql immutable as $$
  select case p_funil
    when 'funil-comercial-default' then (p_idx + 1)::text
    when 'funil-sdr-ia-default' then 'sdr-' || (p_idx + 1)::text
    else p_funil || '-' || p_idx::text
  end
$$;

create or replace function public.trg_automacao_lead_etapa()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_regra record;
begin
  if new."stageId" is distinct from old."stageId" then
    for v_regra in
      select c.* from public.automation_connections c
      where c.tenant_id = new.tenant_id and c.ativo = true and c.gatilho_tipo = 'funil_etapa'
        and public.spy_stage_id(c.gatilho_funil_id, c.gatilho_etapa_idx) = new."stageId"
        and (c.os_departamento_id is not null or exists (select 1 from public.automation_connection_acoes a where a.connection_id = c.id))
    loop
      perform public.executar_automacao_connection(
        v_regra.id, new.tenant_id, v_regra.os_departamento_id, v_regra.nome,
        'lead_stage', new.id || ':' || v_regra.id, new.id, new.name
      );
    end loop;
  end if;
  return new;
end;
$function$;
