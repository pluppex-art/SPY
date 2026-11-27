-- MÉTODO DO FUNIL · ENTREGA 2 — MOTOR DE REGRAS
-- Aplicada em 27/11/2026 (conferida: 30 funções iguais às deste arquivo). Plano: docs/metodo-funil/ENTREGA-2.md
-- Cria as funções spy_* e dois gatilhos nas tabelas NOVAS. Não altera leads, não cria gatilho em tabela antiga e
-- só age em funil com crm_funis.metodo_ativo = true (hoje nenhum).
-- Funções spy__ (dois sublinhados) são internas: a tela e o n8n não as chamam.

set local lock_timeout = '5s';

-- ─── 0. Colunas que o motor precisa ───────────────────────────────────────
alter table public.crm_situacoes add column if not exists tarefa_titulo text;
alter table public.lead_status_historico add column if not exists operacao_id uuid;
create index if not exists lead_hist_operacao_idx on public.lead_status_historico (tenant_id, lead_id, operacao_id);

update public.crm_situacoes s set tarefa_titulo = v.titulo
from (values
  ('aguardando_atendimento', 'Responder lead'),
  ('em_qualificacao',        'Qualificar o lead (2 a 3 perguntas)'),
  ('orcamento_a_enviar',     'Enviar orçamento'),
  ('em_negociacao',          'Tratar objeção e avançar a negociação'),
  ('pagamento_expirado',     'Reenviar cobrança'),
  ('rep_adiou',              'Retornar na data combinada'),
  ('a_entregar',             'Confirmar entrega ou retirada')
) as v(codigo, titulo)
where s.tenant_id is null and s.codigo = v.codigo;

-- ─── 1. Apoio ─────────────────────────────────────────────────────────────
-- Trava o lead (uma mudança por vez) e confere o acesso com a mesma regra das políticas de leads.
create or replace function public.spy__lead(p_lead uuid) returns public.leads
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.leads%rowtype;
begin
  select * into v from public.leads where id = p_lead and deleted_at is null for update;
  if not found then raise exception 'Lead não encontrado.' using errcode = 'P0002'; end if;
  if auth.uid() is not null then
    if not coalesce(public.has_tenant_access(v.tenant_id), false)
       or (public.usuario_restrito_aos_proprios_dados()
           and not coalesce(v.seller_id = auth.uid() or v.seller = any (public.vendedor_nomes_do_usuario()), false)) then
      raise exception 'Sem acesso a este lead.' using errcode = '42501';
    end if;
  elsif coalesce(auth.role(), 'service_role') <> 'service_role' then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  return v;
end $$;

-- Funil do lead (pelo id da etapa), só com o método ligado.
create or replace function public.spy__funil(p_lead public.leads) returns public.crm_funis
language plpgsql security definer set search_path = public, pg_temp as $$
declare f public.crm_funis%rowtype;
begin
  select * into f from public.crm_funis c
   where c.tenant_id = p_lead.tenant_id
     and left(p_lead."stageId", length(c.id) + 1) = c.id || '-'
     and substr(p_lead."stageId", length(c.id) + 2) ~ '^[0-9]+$'
   limit 1;
  if not found or not f.metodo_ativo then
    raise exception 'O método não está ligado no funil deste lead.' using errcode = 'P0001';
  end if;
  return f;
end $$;

create or replace function public.spy__tipo_atual(p_lead public.leads, p_funil public.crm_funis) returns text
language plpgsql stable set search_path = public, pg_temp as $$
declare v_tipo text;
begin
  v_tipo := p_funil.etapas_config -> (substr(p_lead."stageId", length(p_funil.id) + 2))::int ->> 'tipo';
  if v_tipo is null then raise exception 'A etapa atual do lead não tem tipo definido no funil.'; end if;
  return v_tipo;
end $$;

-- Situação valendo para a empresa/funil: o ajuste do funil vence o da empresa, que vence o de fábrica.
create or replace function public.spy__situacao(p_tenant uuid, p_funil text, p_codigo text) returns public.crm_situacoes
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.crm_situacoes%rowtype;
begin
  select * into s from public.crm_situacoes
   where codigo = p_codigo and (tenant_id is null or tenant_id = p_tenant) and (funil_id is null or funil_id = p_funil)
   order by (funil_id is not null) desc, (tenant_id is not null) desc limit 1;
  if not found or not s.ativo then raise exception 'Situação "%" não existe ou está desativada.', p_codigo; end if;
  return s;
end $$;

create or replace function public.spy__etapa_da_situacao(p_funil public.crm_funis, p_sit public.crm_situacoes) returns text
language sql immutable set search_path = public, pg_temp as $$
  select case when p_funil.template = 'completo' and p_sit.etapa_tipo_completo is not null then p_sit.etapa_tipo_completo else p_sit.etapa_tipo end
$$;

create or replace function public.spy__situacao_inicial(p_tenant uuid, p_funil public.crm_funis, p_tipo text) returns text
language sql security definer set search_path = public, pg_temp as $$
  select codigo from (
    select distinct on (codigo) codigo, ativo, ordem, etapa_tipo, etapa_tipo_completo from public.crm_situacoes
     where (tenant_id is null or tenant_id = p_tenant) and (funil_id is null or funil_id = p_funil.id)
     order by codigo, (funil_id is not null) desc, (tenant_id is not null) desc
  ) s
  where ativo and case when p_funil.template = 'completo' and etapa_tipo_completo is not null then etapa_tipo_completo else etapa_tipo end = p_tipo
  order by ordem limit 1
$$;

create or replace function public.spy__vendedor(p_lead public.leads) returns uuid
language sql security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select u.id from public.users u where u.id = p_lead.seller_id and u.tenant_id = p_lead.tenant_id),
    (select u.id from public.users u where u.tenant_id = p_lead.tenant_id and lower(trim(u.name)) = lower(trim(p_lead.seller)) limit 1))
$$;

create or replace function public.spy__autor(p_autor text, out tipo text, out id uuid)
language plpgsql set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null then tipo := 'usuario'; id := auth.uid(); return; end if; -- pessoa logada nunca se passa por IA
  tipo := coalesce(p_autor, 'sistema');
  if tipo not in ('ia', 'sistema', 'usuario') then raise exception 'Autor inválido: %', tipo; end if;
end $$;

create or replace function public.spy__tarefa(p_lead public.leads, p_titulo text, p_vence timestamptz, p_situacao text, p_tipo text, p_fecha boolean) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.tasks (tenant_id, lead_id, assigned_to, title, description, status, priority, due_date, filial_id, origem, tipo, situacao_codigo, fecha_sozinha)
  values (p_lead.tenant_id, p_lead.id, public.spy__vendedor(p_lead), left(p_titulo || ' — ' || p_lead.name, 250), 'Criada automaticamente pelo método do funil.',
          'Em Aberto', 'Média', p_vence, p_lead.filial_id, 'automacao', p_tipo, p_situacao, p_fecha)
$$;

create or replace function public.spy__aviso(p_lead public.leads, p_nivel text, p_titulo text, p_chave text) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.notifications (tenant_id, user_id, title, description, type, is_read, nivel, lead_id, dedupe_key, canais)
  values (p_lead.tenant_id, public.spy__vendedor(p_lead), p_titulo, p_lead.name, 'lead', false, p_nivel, p_lead.id, p_chave, array['app'])
$$;

-- Encerra o que pertencia à situação que está saindo.
create or replace function public.spy__encerrar_automaticos(p_lead uuid) returns void
language sql security definer set search_path = public, pg_temp as $$
  update public.lead_timers set status = 'cancelado' where lead_id = p_lead and status in ('pendente', 'pausado');
  update public.tasks set status = 'Concluída', completed_at = now()
   where lead_id = p_lead and origem = 'automacao' and fecha_sozinha and deleted_at is null
     and coalesce(status, '') not in ('Concluída', 'Done', 'Cancelado');
$$;

create or replace function public.spy__timer(p_lead public.leads, p_tipo text, p_quando timestamptz, p_situacao text, p_payload jsonb) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.lead_timers (tenant_id, lead_id, tipo, executar_em, situacao_codigo, payload)
  values (p_lead.tenant_id, p_lead.id, p_tipo, p_quando, p_situacao, p_payload)
$$;

-- Cria os relógios (e a tarefa) de uma situação. Devolve o prazo principal, se houver.
-- Os prazos são corridos; pausar fora do expediente fica no executor (entrega 4).
create or replace function public.spy__agendar(p_lead public.leads, p_sit public.crm_situacoes, p_dados jsonb, p_com_tarefa boolean) returns timestamptz
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  t jsonb := p_sit.timer; v_vence timestamptz; v_data timestamptz := nullif(p_dados ->> 'data', '')::timestamptz;
  v_metodo text := coalesce(p_dados ->> 'metodo', 'pix'); v_min int; r record; v_cadencia int[]; v_i int;
begin
  if t ? 'prazo_min' then
    v_vence := now() + make_interval(mins => (t ->> 'prazo_min')::int);
    perform public.spy__timer(p_lead, 'sla', v_vence, p_sit.codigo, '{"para":"vendedor"}');
    if t ? 'escala_gestor_min' then
      perform public.spy__timer(p_lead, 'sla', now() + make_interval(mins => (t ->> 'escala_gestor_min')::int), p_sit.codigo, '{"para":"gestor"}');
    end if;
  end if;

  if t ? 'followups_min' then
    for r in select value::int as min, ordinality as n from jsonb_array_elements_text(t -> 'followups_min') with ordinality loop
      perform public.spy__timer(p_lead, 'followup', now() + make_interval(mins => r.min), p_sit.codigo, jsonb_build_object('tentativa', r.n));
    end loop;
    if t ? 'sem_resposta_min' then -- 1h depois do prazo, para o último follow-up sair antes
      perform public.spy__timer(p_lead, 'followup', now() + make_interval(mins => (t ->> 'sem_resposta_min')::int + 60), p_sit.codigo,
        jsonb_build_object('acao', 'repescagem', 'motivo', 'sumiu'));
    end if;
  end if;

  if t ? 'por_metodo_min' then
    if v_metodo = 'boleto' then
      v_vence := nullif(p_dados ->> 'vencimento', '')::timestamptz;
    else
      v_min := coalesce(t -> 'por_metodo_min' ->> v_metodo, t -> 'por_metodo_min' ->> 'pix')::int;
      v_vence := now() + make_interval(mins => v_min);
    end if;
    if v_vence is not null then perform public.spy__timer(p_lead, 'sla', v_vence, p_sit.codigo, jsonb_build_object('metodo', v_metodo)); end if;
  end if;

  if left(p_sit.codigo, 4) = 'rep_' then
    select cadencia_dias into v_cadencia from public.crm_motivos
     where uso = 'repescagem' and codigo = substr(p_sit.codigo, 5) and (tenant_id is null or tenant_id = p_lead.tenant_id)
     order by (tenant_id is not null) desc limit 1;
    if coalesce(array_length(v_cadencia, 1), 0) > 0 then
      for v_i in 1 .. array_length(v_cadencia, 1) loop
        perform public.spy__timer(p_lead, 'cadencia', now() + make_interval(days => v_cadencia[v_i]), p_sit.codigo,
          jsonb_build_object('tentativa', v_i, 'de', array_length(v_cadencia, 1)));
      end loop;
      perform public.spy__timer(p_lead, 'cadencia', now() + make_interval(days => v_cadencia[array_length(v_cadencia, 1)] + 1), p_sit.codigo,
        '{"acao":"perder","motivo":"sem_retorno"}');
    end if;
  end if;

  if v_data is not null and (t ? 'na_data' or t ->> 'quando' = 'prazo_entrega') then
    v_vence := v_data;
    perform public.spy__timer(p_lead, case when t ? 'na_data' then 'followup' else 'sla' end, v_data, p_sit.codigo, '{"para":"vendedor"}');
  end if;

  if p_com_tarefa and p_sit.tarefa_titulo is not null then
    perform public.spy__tarefa(p_lead, p_sit.tarefa_titulo, coalesce(v_vence, v_data), p_sit.codigo, 'situacao', true);
  end if;
  return v_vence;
end $$;

create or replace function public.spy__historico(p_lead public.leads, p_dim text, p_de text, p_para text, p_autor_tipo text, p_autor uuid,
  p_confianca numeric, p_motivo text, p_op uuid, p_desfaz uuid default null) returns void
language sql security definer set search_path = public, pg_temp as $$
  insert into public.lead_status_historico (tenant_id, lead_id, dimensao, de, para, autor_tipo, autor_id, confianca, motivo, operacao_id, desfaz_id, created_at)
  values (p_lead.tenant_id, p_lead.id, p_dim, p_de, p_para, p_autor_tipo, p_autor, p_confianca, p_motivo, p_op, p_desfaz, clock_timestamp())
$$;

-- O coração: muda etapa e/ou situação, com nota, histórico, relógios e tarefas.
create or replace function public.spy__aplicar(p_lead public.leads, p_funil public.crm_funis, p_etapa text, p_situacao text, p_nota text,
  p_motivo text, p_dados jsonb, p_autor_tipo text, p_autor uuid, p_confianca numeric, p_desfaz uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_atual text := public.spy__tipo_atual(p_lead, p_funil);
  v_sit public.crm_situacoes%rowtype; v_idx int; v_muda boolean; v_op uuid := gen_random_uuid(); v_sit_antes text;
  v_nota text := nullif(trim(coalesce(p_nota, '')), ''); v_revisar boolean := false; v_vence timestamptz; v_lead public.leads%rowtype := p_lead;
  v_status text; v_perda boolean; v_dados jsonb := coalesce(p_dados, '{}'::jsonb);
begin
  select (x.i - 1)::int into v_idx from jsonb_array_elements(p_funil.etapas_config) with ordinality as x(e, i)
   where x.e ->> 'tipo' = p_etapa order by x.i limit 1;
  if v_idx is null then raise exception 'O funil não tem a etapa do tipo "%".', p_etapa; end if;

  v_sit := public.spy__situacao(p_lead.tenant_id, p_funil.id, coalesce(p_situacao, public.spy__situacao_inicial(p_lead.tenant_id, p_funil, p_etapa)));
  if public.spy__etapa_da_situacao(p_funil, v_sit) <> p_etapa then
    raise exception 'A situação "%" não pertence à etapa "%".', v_sit.nome_exibido, p_etapa;
  end if;
  v_muda := v_atual <> p_etapa;
  select situacao_codigo into v_sit_antes from public.lead_estado where lead_id = p_lead.id;

  -- Nota: obrigatória ao sair de uma etapa e nas situações que pedem. Pessoa escreve; automação rascunha e pede revisão.
  if p_desfaz is null and (v_muda or v_sit.exige_nota) and v_nota is null then
    if p_autor_tipo = 'usuario' then raise exception 'Registre a nota antes de mudar.' using errcode = 'P0001'; end if;
    v_nota := 'Mudança automática para "' || v_sit.nome_exibido || '".' || coalesce(' ' || p_motivo, '');
    v_revisar := true;
  end if;
  if v_nota is not null then
    insert into public.lead_notas (tenant_id, lead_id, etapa_tipo, situacao_codigo, motivo_codigo, texto, valor_esperado, concorrente, data_retorno, autor_tipo, autor_id)
    values (p_lead.tenant_id, p_lead.id, case when v_muda then v_atual else p_etapa end, v_sit.codigo, v_dados ->> 'motivo_codigo', v_nota,
      nullif(v_dados ->> 'valor_esperado', '')::numeric, nullif(v_dados ->> 'concorrente', ''), nullif(v_dados ->> 'data_retorno', '')::date,
      case when p_autor_tipo = 'usuario' then 'usuario' else 'ia' end, p_autor);
  end if;

  perform public.spy__encerrar_automaticos(p_lead.id);

  if v_muda then
    v_perda := p_etapa in ('perdido', 'desqualificado');
    v_status := case p_etapa when 'novo_lead' then 'Novo' when 'ganho' then 'Fechado' when 'perdido' then 'Perdido' when 'desqualificado' then 'Desqualificado' else 'Em Aberto' end;
    -- loss_reason também: é nele que os avisos de "negócio perdido" já existentes se baseiam.
    update public.leads set
      "stageId" = p_funil.id || '-' || v_idx,
      status = v_status,
      lost_reason = case when v_perda then v_dados ->> 'motivo_nome' end,
      loss_reason = case when p_etapa = 'perdido' then left(v_dados ->> 'motivo_nome', 250) end,
      value = coalesce(nullif(v_dados ->> 'valor', '')::numeric, value)
    where id = p_lead.id returning * into v_lead;
    update public.lead_funis set stage_id = p_funil.id || '-' || v_idx, updated_at = now() where lead_id = p_lead.id and funil_id = p_funil.id;
    perform public.spy__historico(v_lead, 'etapa', v_atual, p_etapa, p_autor_tipo, p_autor, p_confianca, p_motivo, v_op, p_desfaz);
  elsif nullif(v_dados ->> 'valor', '') is not null then
    update public.leads set value = (v_dados ->> 'valor')::numeric where id = p_lead.id returning * into v_lead;
  end if;

  v_vence := public.spy__agendar(v_lead, v_sit, v_dados, true);

  insert into public.lead_estado (lead_id, tenant_id, situacao_codigo, situacao_desde, sla_status, sla_vence_em)
  values (p_lead.id, p_lead.tenant_id, v_sit.codigo, now(), case when v_vence is not null then 'em_dia' end, v_vence)
  on conflict (lead_id) do update set situacao_codigo = excluded.situacao_codigo, situacao_desde = excluded.situacao_desde,
    sla_status = excluded.sla_status, sla_vence_em = excluded.sla_vence_em, pausa_ate = null,
    repescagem_motivo = case when p_etapa = 'repescagem' then substr(v_sit.codigo, 5) end,
    repescagem_tentativa = 0,
    etapa_origem_tipo = case when p_etapa = 'repescagem' then lead_estado.etapa_origem_tipo end;
  perform public.spy__historico(v_lead, 'situacao', v_sit_antes, v_sit.codigo, p_autor_tipo, p_autor, p_confianca, p_motivo, v_op, p_desfaz);

  if v_revisar then perform public.spy__tarefa(v_lead, 'Revisar nota', now() + interval '1 day', v_sit.codigo, 'revisar_nota', false); end if;
  return jsonb_build_object('etapa', p_etapa, 'situacao', v_sit.codigo, 'operacao', v_op, 'revisar_nota', v_revisar);
end $$;

-- ─── 2. Funções que a tela e o n8n chamam ─────────────────────────────────
-- Dá a primeira situação a um lead. Para leads antigos, usar p_com_prazos = false (sem prazos retroativos).
create or replace function public.spy_iniciar(p_lead uuid, p_com_prazos boolean default true) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.leads%rowtype := public.spy__lead(p_lead); f public.crm_funis%rowtype; v_tipo text; v_cod text; v_sit public.crm_situacoes%rowtype;
  v_vence timestamptz; a record;
begin
  f := public.spy__funil(v); v_tipo := public.spy__tipo_atual(v, f); select * into a from public.spy__autor(null);
  if exists (select 1 from public.lead_estado where lead_id = p_lead and situacao_codigo is not null) then
    return jsonb_build_object('iniciado', false, 'motivo', 'Já tem situação.');
  end if;
  v_cod := case when v_tipo = 'perdido' then null when v_tipo = 'ganho' and not p_com_prazos then 'concluida'
                else public.spy__situacao_inicial(v.tenant_id, f, v_tipo) end;
  if v_cod is not null then
    v_sit := public.spy__situacao(v.tenant_id, f.id, v_cod);
    if p_com_prazos then v_vence := public.spy__agendar(v, v_sit, '{}', true); end if;
  end if;
  insert into public.lead_estado (lead_id, tenant_id, situacao_codigo, situacao_desde, sla_status, sla_vence_em)
  values (v.id, v.tenant_id, v_cod, now(), case when v_vence is not null then 'em_dia' end, v_vence)
  on conflict (lead_id) do update set situacao_codigo = excluded.situacao_codigo, situacao_desde = excluded.situacao_desde,
    sla_status = excluded.sla_status, sla_vence_em = excluded.sla_vence_em;
  if v_cod is not null then perform public.spy__historico(v, 'situacao', null, v_cod, a.tipo, a.id, null, 'início', gen_random_uuid()); end if;
  return jsonb_build_object('iniciado', true, 'etapa', v_tipo, 'situacao', v_cod);
end $$;

create or replace function public.spy_mudar_situacao(p_lead uuid, p_situacao text, p_nota text default null, p_dados jsonb default '{}',
  p_autor text default null, p_confianca numeric default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.leads%rowtype := public.spy__lead(p_lead); f public.crm_funis%rowtype; a record; v_tipo text; v_origem text; v_res jsonb;
begin
  f := public.spy__funil(v); v_tipo := public.spy__tipo_atual(v, f); select * into a from public.spy__autor(p_autor);
  select etapa_origem_tipo into v_origem from public.lead_estado where lead_id = p_lead;
  v_res := public.spy__aplicar(v, f, v_tipo, p_situacao, p_nota, null, p_dados, a.tipo, a.id, p_confianca);
  if v_tipo = 'repescagem' then update public.lead_estado set etapa_origem_tipo = v_origem where lead_id = p_lead; end if;
  return v_res;
end $$;

create or replace function public.spy_mover_etapa(p_lead uuid, p_etapa text, p_nota text default null, p_situacao text default null,
  p_dados jsonb default '{}', p_autor text default null, p_confianca numeric default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.leads%rowtype := public.spy__lead(p_lead); f public.crm_funis%rowtype; a record;
begin
  f := public.spy__funil(v); select * into a from public.spy__autor(p_autor);
  if p_etapa not in ('novo_lead', 'atendimento', 'orcamento', 'aguardando_pagamento') then
    raise exception 'Para "%", use a função própria: repescagem, perdido, pagamento ou venda presencial.', p_etapa;
  end if;
  if public.spy__tipo_atual(v, f) = p_etapa then raise exception 'O lead já está nessa etapa.'; end if;
  if p_etapa = 'orcamento' and a.tipo = 'usuario' and coalesce(nullif(p_dados ->> 'valor', '')::numeric, v.value, 0) <= 0 then
    raise exception 'Informe o valor do orçamento.';
  end if;
  return public.spy__aplicar(v, f, p_etapa, p_situacao, p_nota, null, p_dados, a.tipo, a.id, p_confianca);
end $$;

create or replace function public.spy_enviar_repescagem(p_lead uuid, p_motivo text, p_nota text default null, p_dados jsonb default '{}',
  p_autor text default null, p_confianca numeric default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.leads%rowtype := public.spy__lead(p_lead); f public.crm_funis%rowtype; a record; v_origem text; v_res jsonb; v_nome text;
begin
  f := public.spy__funil(v); select * into a from public.spy__autor(p_autor); v_origem := public.spy__tipo_atual(v, f);
  if v_origem not in ('novo_lead', 'atendimento', 'orcamento', 'aguardando_pagamento') then
    raise exception 'Só vai para a repescagem quem está em uma etapa ativa.';
  end if;
  select nome_exibido into v_nome from public.crm_motivos where uso = 'repescagem' and codigo = p_motivo
    and (tenant_id is null or tenant_id = v.tenant_id) order by (tenant_id is not null) desc limit 1;
  if v_nome is null then raise exception 'Motivo de repescagem inválido: %', p_motivo; end if;
  if p_motivo = 'adiou' and nullif(p_dados ->> 'data_retorno', '') is null then raise exception 'Informe a data combinada para o retorno.'; end if;
  v_res := public.spy__aplicar(v, f, 'repescagem', 'rep_' || p_motivo, p_nota, v_nome,
    coalesce(p_dados, '{}') || jsonb_build_object('motivo_codigo', p_motivo) ||
      case when p_motivo = 'adiou' then jsonb_build_object('data', ((p_dados ->> 'data_retorno')::date + time '09:00') at time zone 'America/Sao_Paulo') else '{}'::jsonb end,
    a.tipo, a.id, p_confianca);
  update public.lead_estado set etapa_origem_tipo = v_origem, repescagem_motivo = p_motivo, repescagem_tentativa = 0 where lead_id = p_lead;
  return v_res;
end $$;

create or replace function public.spy_marcar_perdido(p_lead uuid, p_motivo text, p_nota text default null, p_dados jsonb default '{}',
  p_autor text default null, p_confianca numeric default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.leads%rowtype := public.spy__lead(p_lead); f public.crm_funis%rowtype; a record; v_nome text;
begin
  f := public.spy__funil(v); select * into a from public.spy__autor(p_autor);
  if public.spy__tipo_atual(v, f) in ('ganho', 'perdido', 'desqualificado') then raise exception 'Este negócio já está encerrado.'; end if;
  select nome_exibido into v_nome from public.crm_motivos where uso = 'perda' and codigo = p_motivo
    and (tenant_id is null or tenant_id = v.tenant_id) order by (tenant_id is not null) desc limit 1;
  if v_nome is null then raise exception 'Motivo de perda inválido: %', p_motivo; end if;
  return public.spy__aplicar(v, f, case when p_motivo = 'nao_lead' then 'desqualificado' else 'perdido' end,
    case when p_motivo = 'nao_lead' then 'nao_lead' else 'perda_' || p_motivo end, p_nota, v_nome,
    coalesce(p_dados, '{}') || jsonb_build_object('motivo_codigo', p_motivo, 'motivo_nome', v_nome), a.tipo, a.id, p_confianca);
end $$;

-- Não gera cobrança: registra o que o gateway do cliente avisou, ou o que o vendedor marcou.
create or replace function public.spy_registrar_pagamento(p_lead uuid, p_status text, p_valor numeric, p_metodo text default null,
  p_gateway text default null, p_gateway_id text default null, p_vencimento timestamptz default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.leads%rowtype := public.spy__lead(p_lead); f public.crm_funis%rowtype; a record; v_tipo text; v_ant public.lead_pagamentos%rowtype;
  v_manual boolean := auth.uid() is not null; v_sit text; v_pag_antes text; v_dest text; v_dados jsonb; v_res jsonb := '{}';
  v_peso jsonb := '{"cobranca_enviada":1,"expirado":2,"recusado":2,"pago":3,"estornado":4}';
begin
  f := public.spy__funil(v); select * into a from public.spy__autor('sistema'); v_tipo := public.spy__tipo_atual(v, f);
  if not v_peso ? p_status then raise exception 'Status de pagamento inválido: %', p_status; end if;
  if v_manual then p_gateway := null; p_gateway_id := null; end if; -- pessoa logada não simula aviso de gateway
  if p_gateway_id is not null then
    select * into v_ant from public.lead_pagamentos where tenant_id = v.tenant_id and gateway = p_gateway and gateway_id = p_gateway_id for update;
    if found then
      if v_ant.lead_id <> v.id then raise exception 'Essa cobrança pertence a outro lead.'; end if;
      if (v_peso ->> p_status)::int <= (v_peso ->> v_ant.status)::int then
        return jsonb_build_object('registrado', false, 'motivo', 'Aviso repetido ou fora de ordem.');
      end if;
      update public.lead_pagamentos set status = p_status, valor = p_valor, metodo = coalesce(p_metodo, metodo),
        confirmado_em = case when p_status = 'pago' then now() else confirmado_em end where id = v_ant.id;
    end if;
  end if;
  if v_ant.id is null then
    insert into public.lead_pagamentos (tenant_id, lead_id, metodo, valor, status, vencimento, origem, gateway, gateway_id, confirmado_por, confirmado_em)
    values (v.tenant_id, v.id, p_metodo, p_valor, p_status, p_vencimento, case when v_manual then 'manual' else 'webhook' end, p_gateway, p_gateway_id,
      case when p_status = 'pago' then a.id end, case when p_status = 'pago' then now() end);
  end if;

  select pagamento_status, situacao_codigo into v_pag_antes, v_sit from public.lead_estado where lead_id = v.id;
  v_dados := jsonb_build_object('metodo', p_metodo, 'vencimento', p_vencimento);

  if p_status = 'pago' and v_tipo <> 'ganho' then
    v_res := public.spy__aplicar(v, f, 'ganho', 'a_entregar', case when v_manual then 'Pagamento marcado como pago.' end, 'Pagamento confirmado.',
      v_dados || jsonb_build_object('valor', p_valor), a.tipo, a.id, null);
    update public.lead_estado set canal_venda = 'whatsapp' where lead_id = v.id;
  elsif p_status = 'expirado' and v_sit = 'aguardando_pagamento' then
    v_res := public.spy__aplicar(v, f, v_tipo, 'pagamento_expirado', null, 'Cobrança expirada.', v_dados, a.tipo, a.id, null);
    perform public.spy__aviso(v, 'importante', 'Pagamento expirado', 'pagamento_expirado:' || v.id);
  elsif p_status = 'cobranca_enviada' and v_tipo in ('novo_lead', 'atendimento', 'orcamento', 'aguardando_pagamento') then
    v_dest := public.spy__etapa_da_situacao(f, public.spy__situacao(v.tenant_id, f.id, 'aguardando_pagamento'));
    v_res := public.spy__aplicar(v, f, v_dest, 'aguardando_pagamento', case when v_manual then 'Cobrança enviada ao cliente.' end, 'Cobrança enviada.', v_dados, a.tipo, a.id, null);
  end if;

  insert into public.lead_estado (lead_id, tenant_id, pagamento_status) values (v.id, v.tenant_id, p_status)
  on conflict (lead_id) do update set pagamento_status = excluded.pagamento_status;
  perform public.spy__historico(v, 'pagamento', v_pag_antes, p_status, a.tipo, a.id, null, null, gen_random_uuid());
  if p_status = 'pago' then perform public.spy__aviso(v, 'importante', 'Pagamento confirmado', 'pagamento_pago:' || v.id); end if;
  if p_status = 'estornado' then perform public.spy__aviso(v, 'critico', 'Pagamento estornado: conferir a venda', 'pagamento_estornado:' || v.id); end if;
  return jsonb_build_object('registrado', true) || v_res;
end $$;

create or replace function public.spy_registrar_venda_presencial(p_lead uuid, p_valor numeric, p_nota text, p_metodo text default 'outro',
  p_venda_id uuid default null, p_entregar boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.leads%rowtype := public.spy__lead(p_lead); f public.crm_funis%rowtype; a record; v_res jsonb;
begin
  f := public.spy__funil(v); select * into a from public.spy__autor('usuario');
  if public.spy__tipo_atual(v, f) = 'ganho' then raise exception 'Este negócio já está ganho.'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Informe o valor da venda.'; end if;
  if nullif(trim(coalesce(p_nota, '')), '') is null then raise exception 'Registre a nota da venda.'; end if;
  if p_venda_id is not null and not exists (select 1 from public.vendas where id = p_venda_id and tenant_id = v.tenant_id) then
    raise exception 'Venda do PDV não encontrada nesta empresa.';
  end if;
  v_res := public.spy__aplicar(v, f, 'ganho', case when p_entregar then 'a_entregar' else 'concluida' end, p_nota, 'Venda presencial.',
    jsonb_build_object('valor', p_valor), a.tipo, a.id, null);
  insert into public.lead_pagamentos (tenant_id, lead_id, metodo, valor, status, origem, confirmado_por, confirmado_em)
  values (v.tenant_id, v.id, p_metodo, p_valor, 'pago', 'manual', a.id, now());
  update public.lead_estado set canal_venda = 'presencial', pagamento_status = 'pago', venda_id = p_venda_id where lead_id = v.id;
  perform public.spy__historico(v, 'pagamento', null, 'pago', a.tipo, a.id, null, 'venda presencial', (v_res ->> 'operacao')::uuid);
  return v_res;
end $$;

-- Regra de foco: o cliente pediu mais tempo.
create or replace function public.spy_pausar_ate(p_lead uuid, p_data timestamptz, p_nota text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.leads%rowtype := public.spy__lead(p_lead); f public.crm_funis%rowtype; a record; v_sit text; v_tipo text;
begin
  f := public.spy__funil(v); select * into a from public.spy__autor(null); v_tipo := public.spy__tipo_atual(v, f);
  if p_data is null or p_data <= now() then raise exception 'A data de retorno precisa ser no futuro.'; end if;
  if nullif(trim(coalesce(p_nota, '')), '') is null then raise exception 'Registre o que o cliente pediu.'; end if;
  select situacao_codigo into v_sit from public.lead_estado where lead_id = v.id;
  update public.lead_timers set status = 'pausado' where lead_id = v.id and status = 'pendente';
  update public.tasks set status = 'Concluída', completed_at = now() where lead_id = v.id and origem = 'automacao' and tipo = 'pausa' and coalesce(status, '') not in ('Concluída', 'Done', 'Cancelado');
  perform public.spy__tarefa(v, 'Retomar contato', p_data, v_sit, 'pausa', true);
  insert into public.lead_notas (tenant_id, lead_id, etapa_tipo, situacao_codigo, texto, data_retorno, autor_tipo, autor_id)
  values (v.tenant_id, v.id, v_tipo, v_sit, p_nota, (p_data at time zone 'America/Sao_Paulo')::date, case when a.tipo = 'usuario' then 'usuario' else 'ia' end, a.id);
  insert into public.lead_estado (lead_id, tenant_id, pausa_ate) values (v.id, v.tenant_id, p_data)
  on conflict (lead_id) do update set pausa_ate = excluded.pausa_ate, sla_status = null, sla_vence_em = null;
  perform public.spy__historico(v, 'sla', 'ativo', 'pausado', a.tipo, a.id, null, p_nota, gen_random_uuid());
  return jsonb_build_object('pausado_ate', p_data);
end $$;

-- Fim da pausa (na data, ou porque o cliente escreveu): os prazos da situação atual voltam a contar de agora.
create or replace function public.spy_retomar(p_lead uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.leads%rowtype := public.spy__lead(p_lead); f public.crm_funis%rowtype; a record; e public.lead_estado%rowtype; v_vence timestamptz;
begin
  f := public.spy__funil(v); select * into a from public.spy__autor(null);
  select * into e from public.lead_estado where lead_id = v.id;
  if e.pausa_ate is null then return jsonb_build_object('retomado', false); end if;
  update public.lead_timers set status = 'cancelado' where lead_id = v.id and status = 'pausado';
  update public.tasks set status = 'Concluída', completed_at = now() where lead_id = v.id and origem = 'automacao' and tipo = 'pausa' and coalesce(status, '') not in ('Concluída', 'Done', 'Cancelado');
  if e.situacao_codigo is not null then
    v_vence := public.spy__agendar(v, public.spy__situacao(v.tenant_id, f.id, e.situacao_codigo), '{}', false);
  end if;
  update public.lead_estado set pausa_ate = null, sla_status = case when v_vence is not null then 'em_dia' end, sla_vence_em = v_vence where lead_id = v.id;
  perform public.spy__historico(v, 'sla', 'pausado', 'ativo', a.tipo, a.id, null, null, gen_random_uuid());
  return jsonb_build_object('retomado', true);
end $$;

-- O cliente voltou a falar.
create or replace function public.spy_reativar(p_lead uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.leads%rowtype := public.spy__lead(p_lead); f public.crm_funis%rowtype; a record; v_tipo text; e public.lead_estado%rowtype;
  v_origem text; v_res jsonb;
begin
  f := public.spy__funil(v); select * into a from public.spy__autor('sistema'); v_tipo := public.spy__tipo_atual(v, f);
  select * into e from public.lead_estado where lead_id = v.id;
  if v_tipo = 'repescagem' then
    v_origem := coalesce(e.etapa_origem_tipo, 'orcamento');
    v_res := public.spy__aplicar(v, f, v_origem,
      case when v_origem = 'orcamento' then 'em_negociacao' when v_origem = 'aguardando_pagamento' then 'aguardando_pagamento'
           when v_origem = 'novo_lead' and f.template <> 'completo' then 'em_qualificacao' end, -- nulo = situação inicial da etapa
      'Cliente voltou a responder.', 'reativado', '{}', a.tipo, a.id, null);
    perform public.spy__aviso(v, 'critico', 'Cliente da repescagem respondeu', 'reativado:' || v.id);
    return v_res || jsonb_build_object('reaberto', true);
  elsif v_tipo in ('perdido', 'desqualificado') then
    -- Abrir um novo negócio depende de o app e o n8n ignorarem o lead arquivado (entregas 5 e 6): por ora, só avisa.
    if not exists (select 1 from public.tasks where lead_id = v.id and origem = 'automacao' and tipo = 'voltou' and deleted_at is null and coalesce(status, '') not in ('Concluída', 'Done', 'Cancelado')) then
      perform public.spy__tarefa(v, 'Cliente voltou a falar', now() + interval '2 hours', e.situacao_codigo, 'voltou', false);
      perform public.spy__aviso(v, 'critico', 'Cliente de venda perdida voltou a falar', 'voltou:' || v.id);
    end if;
    return jsonb_build_object('reaberto', false, 'motivo', 'Abrir novo negócio ainda não está liberado.');
  elsif e.pausa_ate is not null then
    return public.spy_retomar(p_lead);
  end if;
  return jsonb_build_object('reaberto', false);
end $$;

create or replace function public.spy_aceitar_sugestao(p_sugestao uuid, p_nota text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.lead_sugestoes_ia%rowtype; v public.leads%rowtype; f public.crm_funis%rowtype; v_cod text; v_nota text; v_dados jsonb; v_etapa text; v_res jsonb := '{}';
begin
  select * into s from public.lead_sugestoes_ia where id = p_sugestao for update;
  if not found then raise exception 'Sugestão não encontrada.'; end if;
  v := public.spy__lead(s.lead_id); f := public.spy__funil(v);
  if s.status <> 'pendente' then raise exception 'Essa sugestão já foi respondida.'; end if;
  v_nota := coalesce(nullif(trim(coalesce(p_nota, '')), ''), s.valor_sugerido ->> 'nota');
  v_dados := coalesce(s.valor_sugerido -> 'dados', '{}');
  if s.tipo = 'temperatura' then
    if s.valor_sugerido ->> 'temperatura' not in ('quente', 'morno', 'frio') then raise exception 'Temperatura inválida.'; end if;
    update public.leads set temperature = s.valor_sugerido ->> 'temperatura' where id = v.id;
    perform public.spy__historico(v, 'temperatura', v.temperature, s.valor_sugerido ->> 'temperatura', 'usuario', auth.uid(), s.confianca, s.justificativa, gen_random_uuid());
  elsif s.tipo = 'nota' then
    insert into public.lead_notas (tenant_id, lead_id, etapa_tipo, texto, autor_tipo, autor_id)
    values (v.tenant_id, v.id, public.spy__tipo_atual(v, f), coalesce(v_nota, s.valor_sugerido ->> 'texto'), 'usuario', auth.uid());
  elsif s.tipo = 'etapa' then
    v_res := public.spy_mover_etapa(v.id, s.valor_sugerido ->> 'etapa', v_nota, null, v_dados);
  else
    v_cod := s.valor_sugerido ->> 'situacao';
    if left(v_cod, 4) = 'rep_' then v_res := public.spy_enviar_repescagem(v.id, substr(v_cod, 5), v_nota, v_dados);
    elsif left(v_cod, 6) = 'perda_' then v_res := public.spy_marcar_perdido(v.id, substr(v_cod, 7), v_nota, v_dados);
    elsif v_cod = 'nao_lead' then v_res := public.spy_marcar_perdido(v.id, 'nao_lead', v_nota, v_dados);
    elsif v_cod in ('a_entregar', 'concluida') then raise exception 'Venda ganha só por pagamento ou venda presencial.';
    else
      v_etapa := public.spy__etapa_da_situacao(f, public.spy__situacao(v.tenant_id, f.id, v_cod));
      if v_etapa <> public.spy__tipo_atual(v, f) then v_res := public.spy_mover_etapa(v.id, v_etapa, v_nota, v_cod, v_dados);
      else v_res := public.spy_mudar_situacao(v.id, v_cod, v_nota, v_dados); end if;
    end if;
  end if;
  update public.lead_sugestoes_ia set status = 'aceita', respondida_por = auth.uid(), respondida_em = now() where id = s.id;
  return v_res || jsonb_build_object('aceita', true);
end $$;

create or replace function public.spy_recusar_sugestao(p_sugestao uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare s public.lead_sugestoes_ia%rowtype;
begin
  select * into s from public.lead_sugestoes_ia where id = p_sugestao for update;
  if not found then raise exception 'Sugestão não encontrada.'; end if;
  perform public.spy__lead(s.lead_id);
  if s.status <> 'pendente' then raise exception 'Essa sugestão já foi respondida.'; end if;
  update public.lead_sugestoes_ia set status = 'recusada', respondida_por = auth.uid(), respondida_em = now() where id = s.id;
  return jsonb_build_object('recusada', true);
end $$;

-- Desfaz a ÚLTIMA mudança de etapa/situação, se foi da IA. Vira um novo registro; nada é apagado.
create or replace function public.spy_desfazer(p_lead uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.leads%rowtype := public.spy__lead(p_lead); f public.crm_funis%rowtype; a record; h public.lead_status_historico%rowtype;
  v_etapa_de text; v_sit_de text;
begin
  f := public.spy__funil(v); select * into a from public.spy__autor(null);
  select * into h from public.lead_status_historico where tenant_id = v.tenant_id and lead_id = v.id and dimensao in ('etapa', 'situacao')
    order by created_at desc limit 1;
  if not found or h.autor_tipo <> 'ia' or h.desfaz_id is not null then raise exception 'Só dá para desfazer a última mudança feita pela IA.'; end if;
  select de into v_etapa_de from public.lead_status_historico where operacao_id = h.operacao_id and lead_id = v.id and dimensao = 'etapa';
  select de into v_sit_de from public.lead_status_historico where operacao_id = h.operacao_id and lead_id = v.id and dimensao = 'situacao';
  if v_sit_de is null then raise exception 'Não há situação anterior para voltar.'; end if;
  return public.spy__aplicar(v, f, coalesce(v_etapa_de, public.spy__tipo_atual(v, f)), v_sit_de, null, 'mudança da IA desfeita', '{}', a.tipo, a.id, null, h.operacao_id);
end $$;

-- ─── 3. Gatilhos (só nas tabelas novas) ───────────────────────────────────
-- A nota aparece na linha do tempo que a tela já mostra.
create or replace function public.spy__nota_na_linha_do_tempo() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.lead_activities (id, tenant_id, lead_id, type, title, description, date, seller, created_at)
  values ('nota-' || new.id, new.tenant_id, new.lead_id::text, 'Nota',
    'Nota · ' || case new.etapa_tipo when 'novo_lead' then 'Novo Lead' when 'atendimento' then 'Em Atendimento' when 'orcamento' then 'Orçamento'
      when 'aguardando_pagamento' then 'Aguardando Pagamento' when 'repescagem' then 'Repescagem' when 'ganho' then 'Venda ganha' when 'perdido' then 'Venda perdida' else 'Desqualificado' end, new.texto,
    to_char(new.created_at at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'),
    case when new.autor_tipo = 'ia' then 'Aurora' else coalesce((select name from public.users where id = new.autor_id), 'Sistema') end,
    new.created_at);
  return new;
end $$;
drop trigger if exists lead_notas_linha_do_tempo on public.lead_notas;
create trigger lead_notas_linha_do_tempo after insert on public.lead_notas for each row execute function public.spy__nota_na_linha_do_tempo();

-- Ponte para a camada de eventos. Uma falha aqui não impede a mudança.
create or replace function public.spy__historico_para_eventos() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_tipo text;
begin
  v_tipo := case when new.dimensao = 'etapa' then 'lead.stage_changed'
                 when new.dimensao = 'situacao' then 'lead.situacao_changed'
                 when new.dimensao = 'pagamento' and new.para = 'pago' then 'lead.payment_confirmed'
                 when new.dimensao = 'sla' and new.para = 'estourado' then 'lead.sla_breached'
                 when new.dimensao = 'sla' and new.para = 'pausado' then 'lead.paused' end;
  if v_tipo is null then return new; end if;
  begin
    insert into public.aurora_events (tenant_id, event_type, entity_type, entity_id, actor_type, actor_id, source, payload)
    values (new.tenant_id, v_tipo, 'lead', new.lead_id::text,
      case new.autor_tipo when 'ia' then 'aurora' when 'usuario' then 'user' else 'system' end, new.autor_id, 'metodo_funil',
      jsonb_build_object('de', new.de, 'para', new.para, 'motivo', new.motivo, 'confianca', new.confianca, 'operacao', new.operacao_id));
  exception when others then raise warning 'metodo_funil: evento não registrado (%)', sqlerrm;
  end;
  return new;
end $$;
drop trigger if exists lead_status_historico_eventos on public.lead_status_historico;
create trigger lead_status_historico_eventos after insert on public.lead_status_historico for each row execute function public.spy__historico_para_eventos();

-- ─── 4. Quem pode chamar o quê ────────────────────────────────────────────
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'spy__lead', 'spy__funil', 'spy__tipo_atual', 'spy__situacao', 'spy__etapa_da_situacao', 'spy__situacao_inicial', 'spy__vendedor', 'spy__autor', 'spy__tarefa', 'spy__aviso', 'spy__encerrar_automaticos', 'spy__timer', 'spy__agendar', 'spy__historico', 'spy__aplicar', 'spy__nota_na_linha_do_tempo', 'spy__historico_para_eventos',
        'spy_iniciar', 'spy_mudar_situacao', 'spy_mover_etapa', 'spy_enviar_repescagem', 'spy_marcar_perdido', 'spy_registrar_pagamento', 'spy_registrar_venda_presencial', 'spy_pausar_ate', 'spy_retomar', 'spy_reativar', 'spy_aceitar_sugestao', 'spy_recusar_sugestao', 'spy_desfazer') loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.f);
    execute format('grant execute on function %s to service_role', r.f);
    if left(r.proname, 5) <> 'spy__' then execute format('grant execute on function %s to authenticated', r.f); end if;
  end loop;
end $$;
