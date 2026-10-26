-- Automações: gatilho "OS mudou de etapa", notificação com link direto da OS
-- e correção do mover_funil (aceita pipeline_id ou funil_id).

alter table public.automation_connections
  add column if not exists gatilho_os_departamento_id uuid references public.os_departamentos(id) on delete set null,
  add column if not exists gatilho_os_etapa_id text;

-- Agora devolve o id da OS (existente ou recém-criada) para a automação poder linká-la.
drop function if exists public.criar_os_automacao(uuid, uuid, text, text, text, text, text);
create or replace function public.criar_os_automacao(p_tenant_id uuid, p_departamento_id uuid, p_titulo text, p_descricao text, p_origem_tipo text, p_origem_id text, p_cliente_nome text)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare
  v_funil record; v_etapa jsonb; v_etapa_id text; v_id uuid;
begin
  select id into v_id from public.ordens_servico where tenant_id = p_tenant_id and origem_tipo = p_origem_tipo and origem_id = p_origem_id;
  if v_id is not null then return v_id; end if;

  select id, etapas into v_funil from public.os_funis
    where departamento_id = p_departamento_id and ativo = true order by padrao desc, created_at limit 1;
  if v_funil.id is null then return null; end if;

  select e into v_etapa from jsonb_array_elements(v_funil.etapas) e where e->>'tipo' = 'aberta' limit 1;
  if v_etapa is null then select e into v_etapa from jsonb_array_elements(v_funil.etapas) e limit 1; end if;
  if v_etapa is null then return null; end if;
  v_etapa_id := v_etapa->>'id';

  insert into public.ordens_servico (tenant_id, titulo, descricao, status, prioridade, cliente_nome, data_abertura, departamento_id, funil_id, etapa_id, origem_tipo, origem_id)
  values (p_tenant_id, p_titulo, p_descricao, 'Aberta', 'Normal', p_cliente_nome, current_date, p_departamento_id, v_funil.id, v_etapa_id, p_origem_tipo, p_origem_id)
  returning id into v_id;
  return v_id;
exception when others then
  -- Nunca derruba a transação real (update do lead/OS) por causa disso.
  return null;
end;
$$;

drop function if exists public.executar_automacao_connection(uuid, uuid, uuid, text, text, text, uuid, text);
create or replace function public.executar_automacao_connection(p_connection_id uuid, p_tenant_id uuid, p_departamento_id uuid, p_nome_conexao text, p_origem_tipo text, p_origem_id text, p_lead_id uuid, p_cliente_nome text, p_os_id uuid default null)
returns void language plpgsql security definer set search_path to 'public' as $$
declare
  v_conexao record; v_acao record; v_inicio timestamptz := clock_timestamp();
  v_tem_acoes boolean; v_secret text; v_lead record;
  v_titulo text := coalesce(p_cliente_nome, 'Negócio');
  v_os_id uuid := p_os_id; v_dep uuid; v_novo uuid; v_link text;
begin
  select * into v_conexao from public.automation_connections where id = p_connection_id;
  if v_conexao.id is null then return; end if;

  if not public.avaliar_condicao_automacao(v_conexao.condicao, p_lead_id) then
    insert into public.automation_connection_execucoes (tenant_id, connection_id, origem_tipo, origem_id, status, duracao_ms)
    values (p_tenant_id, p_connection_id, p_origem_tipo, p_origem_id, 'condicao_nao_atendida', extract(milliseconds from clock_timestamp() - v_inicio)::int);
    return;
  end if;

  select exists(select 1 from public.automation_connection_acoes where connection_id = p_connection_id) into v_tem_acoes;

  if not v_tem_acoes then
    perform public.criar_os_automacao(p_tenant_id, p_departamento_id, v_titulo,
      'Criada automaticamente pela regra "' || p_nome_conexao || '".', p_origem_tipo, p_origem_id, p_cliente_nome);
    insert into public.automation_connection_execucoes (tenant_id, connection_id, origem_tipo, origem_id, status, duracao_ms)
    values (p_tenant_id, p_connection_id, p_origem_tipo, p_origem_id, 'sucesso', extract(milliseconds from clock_timestamp() - v_inicio)::int);
    return;
  end if;

  if p_lead_id is not null then select * into v_lead from public.leads where id = p_lead_id; end if;

  for v_acao in select * from public.automation_connection_acoes where connection_id = p_connection_id order by ordem loop
    if v_acao.tipo = 'criar_os' then
      v_dep := coalesce((v_acao.config->>'departamento_id')::uuid, p_departamento_id);
      v_novo := public.criar_os_automacao(p_tenant_id, v_dep, v_titulo,
        'Criada automaticamente pela regra "' || p_nome_conexao || '".', p_origem_tipo, p_origem_id, p_cliente_nome);
      if v_novo is not null then v_os_id := v_novo; end if;

    elsif v_acao.tipo = 'tarefa' then
      insert into public.tasks (tenant_id, lead_id, title, description, status, priority, due_date)
      values (p_tenant_id, p_lead_id, coalesce(v_acao.config->>'titulo', 'Tarefa automática: ' || p_nome_conexao),
        v_acao.config->>'descricao', 'A Fazer', coalesce(v_acao.config->>'prioridade', 'Média'),
        case when v_acao.config->>'prazo_dias' is not null then now() + ((v_acao.config->>'prazo_dias')::int || ' days')::interval else null end);

    elsif v_acao.tipo = 'notificar' then
      -- Link direto para a OS (criada agora ou de origem); sem OS, cai no lead.
      v_link := case
        when v_os_id is not null then '/app/ordens-servico/' || v_os_id
        when p_lead_id is not null then '/app/crm/pipeline?leadId=' || p_lead_id
        else null end;
      insert into public.notifications (tenant_id, user_id, title, description, type, link_url)
      select p_tenant_id, u.id, coalesce(v_acao.config->>'titulo', 'Automação disparada'),
        coalesce(v_acao.config->>'mensagem', p_nome_conexao || ' — ' || v_titulo), 'automation', v_link
      from public.users u
      where u.tenant_id = p_tenant_id and coalesce(u.active, true) = true
        and (v_acao.config->>'destinatario_id' is null or u.id = (v_acao.config->>'destinatario_id')::uuid);

    elsif v_acao.tipo = 'crm_update' and p_lead_id is not null and v_acao.config->>'chave' is not null then
      update public.leads set "customFields" = coalesce("customFields", '{}'::jsonb) || jsonb_build_object(v_acao.config->>'chave', v_acao.config->>'valor')
      where id = p_lead_id;

    elsif v_acao.tipo = 'mover_funil' and p_lead_id is not null and coalesce(v_acao.config->>'pipeline_id', v_acao.config->>'funil_id') is not null then
      update public.leads set "pipelineId" = coalesce(v_acao.config->>'pipeline_id', v_acao.config->>'funil_id'), "stageId" = v_acao.config->>'etapa_id'
      where id = p_lead_id;

    elsif v_acao.tipo = 'mensagem' and p_lead_id is not null and v_lead.phone is not null and v_lead.phone <> '' then
      select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'automation_internal_secret';
      perform net.http_post(
        url := 'https://www.spycrm.com.br/api/automations/enviar-mensagem',
        body := jsonb_build_object('tenantId', p_tenant_id, 'leadId', p_lead_id, 'telefone', v_lead.phone, 'texto', coalesce(v_acao.config->>'texto', 'Olá! Tudo bem?')),
        headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || coalesce(v_secret, '')));

    elsif v_acao.tipo = 'api_call' then
      perform public.dispatch_external_integration_event(p_tenant_id, 'Automação: ' || p_nome_conexao,
        jsonb_build_object('conexao', p_nome_conexao, 'origemTipo', p_origem_tipo, 'origemId', p_origem_id, 'clienteNome', p_cliente_nome, 'leadId', p_lead_id));
    end if;
  end loop;

  insert into public.automation_connection_execucoes (tenant_id, connection_id, origem_tipo, origem_id, status, duracao_ms)
  values (p_tenant_id, p_connection_id, p_origem_tipo, p_origem_id, 'sucesso', extract(milliseconds from clock_timestamp() - v_inicio)::int);
exception when others then
  insert into public.automation_connection_execucoes (tenant_id, connection_id, origem_tipo, origem_id, status, duracao_ms, erro)
  values (p_tenant_id, p_connection_id, p_origem_tipo, p_origem_id, 'erro', extract(milliseconds from clock_timestamp() - v_inicio)::int, sqlerrm);
end;
$$;

-- Gatilho: OS mudou de etapa (ex.: CONTRATO → Concluída).
create or replace function public.trg_automacao_os_etapa()
returns trigger language plpgsql security definer set search_path to 'public' as $$
declare v_regra record; v_lead uuid;
begin
  if new.etapa_id is distinct from old.etapa_id then
    if new.origem_tipo = 'lead_stage' then
      begin v_lead := split_part(new.origem_id, ':', 1)::uuid; exception when others then v_lead := null; end;
    end if;
    for v_regra in
      select * from public.automation_connections
      where tenant_id = new.tenant_id and ativo = true and gatilho_tipo = 'os_etapa'
        and gatilho_os_departamento_id = new.departamento_id and gatilho_os_etapa_id = new.etapa_id
    loop
      perform public.executar_automacao_connection(v_regra.id, new.tenant_id, v_regra.os_departamento_id, v_regra.nome,
        'os_etapa', new.id || ':' || v_regra.id, v_lead, new.cliente_nome, new.id);
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_automacao_os_etapa on public.ordens_servico;
create trigger trg_automacao_os_etapa after update of etapa_id on public.ordens_servico
  for each row execute function public.trg_automacao_os_etapa();
