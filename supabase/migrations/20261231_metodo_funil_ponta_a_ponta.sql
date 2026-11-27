-- Método do funil · ponta a ponta: prazos e repescagem automática, nota opcional para o vendedor e
-- método LIGADO no Funil Comercial da SPY | IA (colunas confirmadas em 27/11/2026).
-- Rode o arquivo inteiro no SQL Editor. Ele se testa no fim (o teste é desfeito); se algo falhar, nada é aplicado.

begin;

-- Só segue se as funções no banco forem as que este arquivo conhece (ou já forem as novas).
do $$
begin
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and (
       (proname = 'spy__aplicar' and md5(prosrc) <> '53e0e3e96e604d6e38e400f463b9f436' and prosrc not like '%etapa_origem_id%')
    or (proname = 'spy_pausar_ate' and md5(prosrc) <> 'b3cceb12961704ebe8efdc41393f5b08' and prosrc not like '%p_nota := coalesce%')
    or (proname = 'spy_registrar_venda_presencial' and md5(prosrc) <> 'f10e983d6d40c44f07efe54549b017ce' and prosrc not like '%p_nota := coalesce%'))) then
    raise exception 'Uma função do método mudou no banco desde que este arquivo foi escrito. Não apliquei nada.';
  end if;
end $$;

-- Coluna de onde o lead saiu ao ir para a Repescagem.
alter table public.lead_estado add column if not exists etapa_origem_id text;

-- ─── 1. Ajustes nas regras ────────────────────────────────────────────────
create or replace function public.spy__aplicar(p_lead public.leads, p_funil public.crm_funis, p_etapa text, p_situacao text, p_nota text,
  p_motivo text, p_dados jsonb, p_autor_tipo text, p_autor uuid, p_confianca numeric, p_desfaz uuid default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_atual text := public.spy__tipo_atual(p_lead, p_funil);
  v_sit public.crm_situacoes%rowtype; v_idx int; v_muda boolean; v_op uuid := gen_random_uuid(); v_sit_antes text;
  v_nota text := nullif(trim(coalesce(p_nota, '')), ''); v_revisar boolean := false; v_vence timestamptz; v_lead public.leads%rowtype := p_lead;
  v_status text; v_perda boolean; v_dados jsonb := coalesce(p_dados, '{}'::jsonb); v_origem_idx int;
begin
  v_sit := public.spy__situacao(p_lead.tenant_id, p_funil.id, coalesce(p_situacao, public.spy__situacao_inicial(p_lead.tenant_id, p_funil, p_etapa)));
  if public.spy__etapa_da_situacao(p_funil, v_sit) <> p_etapa then
    raise exception 'A situação "%" não pertence à etapa "%".', v_sit.nome_exibido, p_etapa;
  end if;
  v_muda := v_atual <> p_etapa;
  -- Com duas colunas de Repescagem: "Sumiu" vai para a primeira; os outros motivos, para a última.
  select (x.i - 1)::int into v_idx from jsonb_array_elements(p_funil.etapas_config) with ordinality as x(e, i)
   where x.e ->> 'tipo' = p_etapa
   order by case when p_etapa = 'repescagem' and v_sit.codigo <> 'rep_sumiu' then -x.i else x.i end limit 1;
  if v_idx is null then raise exception 'O funil não tem a etapa do tipo "%".', p_etapa; end if;
  -- Saindo da Repescagem para o tipo de onde veio: volta para a mesma coluna.
  if v_muda and v_atual = 'repescagem' then
    select substr(le.etapa_origem_id, length(p_funil.id) + 2)::int into v_origem_idx from public.lead_estado le
     where le.lead_id = p_lead.id and left(le.etapa_origem_id, length(p_funil.id) + 1) = p_funil.id || '-';
    if v_origem_idx is not null and p_funil.etapas_config -> v_origem_idx ->> 'tipo' = p_etapa then v_idx := v_origem_idx; end if;
  end if;
  select situacao_codigo into v_sit_antes from public.lead_estado where lead_id = p_lead.id;

  -- Pessoa não é obrigada a escrever nota. Mudança automática sem texto ganha uma nota curta, sem tarefa de revisão.
  if p_desfaz is null and (v_muda or v_sit.exige_nota) and v_nota is null and p_autor_tipo <> 'usuario' then
    v_nota := 'Mudança automática para "' || v_sit.nome_exibido || '".' || coalesce(' ' || p_motivo, '');
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
  if v_muda and p_etapa = 'repescagem' then update public.lead_estado set etapa_origem_id = p_lead."stageId" where lead_id = p_lead.id; end if;
  perform public.spy__historico(v_lead, 'situacao', v_sit_antes, v_sit.codigo, p_autor_tipo, p_autor, p_confianca, p_motivo, v_op, p_desfaz);

  if v_revisar then perform public.spy__tarefa(v_lead, 'Revisar nota', now() + interval '1 day', v_sit.codigo, 'revisar_nota', false); end if;
  return jsonb_build_object('etapa', p_etapa, 'situacao', v_sit.codigo, 'operacao', v_op, 'revisar_nota', v_revisar);
end $$;

create or replace function public.spy_pausar_ate(p_lead uuid, p_data timestamptz, p_nota text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.leads%rowtype := public.spy__lead(p_lead); f public.crm_funis%rowtype; a record; v_sit text; v_tipo text;
begin
  f := public.spy__funil(v); select * into a from public.spy__autor(null); v_tipo := public.spy__tipo_atual(v, f);
  if p_data is null or p_data <= now() then raise exception 'A data de retorno precisa ser no futuro.'; end if;
  p_nota := coalesce(nullif(trim(coalesce(p_nota, '')), ''), 'Cliente pediu mais tempo.');
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

create or replace function public.spy_registrar_venda_presencial(p_lead uuid, p_valor numeric, p_nota text, p_metodo text default 'outro',
  p_venda_id uuid default null, p_entregar boolean default false) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v public.leads%rowtype := public.spy__lead(p_lead); f public.crm_funis%rowtype; a record; v_res jsonb;
begin
  f := public.spy__funil(v); select * into a from public.spy__autor('usuario');
  if public.spy__tipo_atual(v, f) = 'ganho' then raise exception 'Este negócio já está ganho.'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Informe o valor da venda.'; end if;
  p_nota := coalesce(nullif(trim(coalesce(p_nota, '')), ''), 'Venda presencial.');
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

-- ─── 2. Prazos e repescagem automática ────────────────────────────────────
-- Cada etapa tem o seu tempo sem resposta e as suas tentativas. A empresa pode ajustar em
-- app_settings, chave 'crm_repescagem', no mesmo formato.
create or replace function public.spy__regra_repescagem(p_tenant uuid, p_tipo text) returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    (select s.value -> k.chave from public.app_settings s
      where s.tenant_id = p_tenant and s.key = 'crm_repescagem' and jsonb_typeof(s.value -> k.chave) = 'object' limit 1),
    '{"atendimento":          {"horas": 48, "dias": [1, 3, 7, 15]},
      "orcamento":            {"horas": 72, "dias": [1, 2, 4, 7, 10, 15, 21]},
      "aguardando_pagamento": {"horas": 24, "dias": [1, 2, 4, 7]}}'::jsonb -> k.chave)
  from (select case when p_tipo = 'novo_lead' then 'atendimento' else p_tipo end as chave) k
$$;

-- Expediente do funil (dias 1 = segunda … 7 = domingo). Sem configuração: todos os dias, das 8h às 20h de Brasília.
create or replace function public.spy__no_expediente(p_funil public.crm_funis) returns boolean
language sql stable set search_path = public, pg_temp as $$
  select (coalesce(cardinality(p_funil.dias_semana), 0) = 0 or extract(isodow from a.agora)::int = any (p_funil.dias_semana))
     and a.agora::time between coalesce(p_funil.horario_inicio, '08:00') and coalesce(p_funil.horario_fim, '20:00')
  from (select now() at time zone 'America/Sao_Paulo' as agora) a
$$;

-- Chamada pelo n8n a cada poucos minutos. Fora do expediente, nada é feito: fica para a próxima rodada.
create or replace function public.spy_executar_prazos(p_limite int default 100) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  r record; t public.lead_timers%rowtype; v public.leads%rowtype; f public.crm_funis%rowtype; e public.lead_estado%rowtype;
  v_sit text; v_regra jsonb; v_origem text; v_dest text; v_dia int; v_i int; v_total int; u record;
  n_alertas int := 0; n_repescagem int := 0; n_perdidos int := 0; n_erros int := 0; v_erro text;
begin
  if auth.uid() is not null then raise exception 'Só a automação chama esta função.' using errcode = '42501'; end if;

  -- 1. Pausas que venceram.
  for r in
    select es.lead_id from public.lead_estado es
      join public.leads l on l.id = es.lead_id and l.deleted_at is null
      join public.crm_funis c on c.tenant_id = l.tenant_id and c.metodo_ativo and left(l."stageId", length(c.id) + 1) = c.id || '-'
     where es.pausa_ate <= now() and public.spy__no_expediente(c)
     order by es.pausa_ate limit p_limite
  loop
    begin
      perform public.spy_retomar(r.lead_id);
      perform public.spy__aviso(public.spy__lead(r.lead_id), 'critico', 'Data combinada chegou: chamar o cliente', 'retomar:' || r.lead_id);
      n_alertas := n_alertas + 1;
    exception when others then n_erros := n_erros + 1; v_erro := sqlerrm;
    end;
  end loop;

  -- 2. Relógios vencidos.
  for r in
    select tm.id from public.lead_timers tm
      join public.leads l on l.id = tm.lead_id and l.deleted_at is null
      join public.crm_funis c on c.tenant_id = l.tenant_id and c.metodo_ativo and left(l."stageId", length(c.id) + 1) = c.id || '-'
     where tm.status = 'pendente' and tm.executar_em <= now() and public.spy__no_expediente(c)
     order by tm.executar_em limit p_limite
  loop
    begin
      select * into t from public.lead_timers where id = r.id and status = 'pendente' for update skip locked;
      if not found then continue; end if; -- já tratado, ou cancelado por uma mudança feita nesta rodada
      update public.lead_timers set status = 'executado', executado_em = now() where id = t.id;
      v := public.spy__lead(t.lead_id); f := public.spy__funil(v);
      select * into e from public.lead_estado where lead_id = v.id;
      if t.situacao_codigo is distinct from e.situacao_codigo then continue; end if;
      select nome_exibido into v_sit from public.spy__situacao(v.tenant_id, f.id, e.situacao_codigo);

      if t.tipo = 'sla' and t.payload ->> 'para' = 'gestor' then
        for u in select id from public.users where tenant_id = v.tenant_id and coalesce(active, true) and coalesce(is_tenant_admin, false) loop
          insert into public.notifications (tenant_id, user_id, title, description, type, is_read, nivel, lead_id, dedupe_key, canais)
          values (v.tenant_id, u.id, 'Prazo estourado na equipe: ' || v_sit, v.name, 'lead', false, 'critico', v.id, 'sla_gestor:' || v.id, array['app']);
          n_alertas := n_alertas + 1;
        end loop;
      elsif t.tipo = 'sla' and t.payload ? 'metodo' and e.situacao_codigo = 'aguardando_pagamento' then
        v_dest := public.spy__etapa_da_situacao(f, public.spy__situacao(v.tenant_id, f.id, 'pagamento_expirado'));
        perform public.spy__aplicar(v, f, v_dest, 'pagamento_expirado', 'O prazo do pagamento venceu sem confirmação.', 'Cobrança expirada.', '{}', 'sistema', null, null);
        update public.lead_estado set pagamento_status = 'expirado' where lead_id = v.id;
        update public.lead_pagamentos set status = 'expirado' where lead_id = v.id and status = 'cobranca_enviada';
        perform public.spy__historico(v, 'pagamento', 'cobranca_enviada', 'expirado', 'sistema', null, null, null, gen_random_uuid());
        perform public.spy__aviso(v, 'importante', 'Pagamento expirado: reenviar a cobrança', 'pagamento_expirado:' || v.id);
        n_alertas := n_alertas + 1;
      elsif t.tipo = 'sla' then
        update public.lead_estado set sla_status = 'estourado' where lead_id = v.id;
        perform public.spy__historico(v, 'sla', 'em_dia', 'estourado', 'sistema', null, null, v_sit, gen_random_uuid());
        perform public.spy__aviso(v, 'critico', 'Prazo estourado: ' || v_sit, 'sla:' || v.id);
        n_alertas := n_alertas + 1;
      elsif t.tipo = 'followup' and coalesce(t.payload ->> 'acao', '') = '' then
        if t.payload ? 'para' then
          perform public.spy__aviso(v, 'critico', 'Retorno combinado: chamar o cliente', 'retorno:' || v.id);
          n_alertas := n_alertas + 1;
        elsif e.conversa_status is distinct from 'aguardando_vendedor' then
          perform public.spy__aviso(v, 'importante', 'Fazer retorno: ' || v_sit, 'followup:' || v.id);
          n_alertas := n_alertas + 1;
        end if;
      elsif t.tipo = 'cadencia' and t.payload ->> 'acao' = 'perder' then
        perform public.spy_marcar_perdido(v.id, 'sem_retorno', 'Sem retorno depois de todas as tentativas da repescagem.', '{}', 'sistema');
        perform public.spy__aviso(v, 'informativo', 'Perdido por falta de retorno', 'perdido:' || v.id);
        n_perdidos := n_perdidos + 1;
      elsif t.tipo = 'cadencia' then
        update public.lead_estado set repescagem_tentativa = (t.payload ->> 'tentativa')::int where lead_id = v.id;
        perform public.spy__aviso(v, 'critico', 'Repescagem ' || (t.payload ->> 'tentativa') || ' de ' || (t.payload ->> 'de') || ': chamar o cliente', 'repescagem:' || v.id);
        n_alertas := n_alertas + 1;
      end if;
    exception when others then
      n_erros := n_erros + 1; v_erro := sqlerrm;
      update public.lead_timers set status = 'executado', executado_em = now(), payload = payload || jsonb_build_object('erro', left(v_erro, 300)) where id = r.id;
    end;
  end loop;

  -- 3. Cliente sem responder há mais tempo que o permitido na etapa: vai para a Repescagem.
  for r in
    select es.lead_id, k.tipo, l.tenant_id from public.lead_estado es
      join public.leads l on l.id = es.lead_id and l.deleted_at is null
      join public.crm_funis c on c.tenant_id = l.tenant_id and c.metodo_ativo and left(l."stageId", length(c.id) + 1) = c.id || '-'
      cross join lateral (select case when substr(l."stageId", length(c.id) + 2) ~ '^[0-9]+$'
                                      then c.etapas_config -> (substr(l."stageId", length(c.id) + 2))::int ->> 'tipo' end as tipo) k
     where es.conversa_status = 'aguardando_cliente' and es.pausa_ate is null and public.spy__no_expediente(c)
       and k.tipo in ('novo_lead', 'atendimento', 'orcamento', 'aguardando_pagamento')
       -- a mensagem e a situação precisam estar paradas: quem acabou de ser movido (mesmo à mão) não volta na hora
       and greatest(es.conversa_desde, es.situacao_desde) <= now() - make_interval(hours => (public.spy__regra_repescagem(l.tenant_id, k.tipo) ->> 'horas')::int)
     order by es.conversa_desde limit p_limite
  loop
    begin
      v_regra := public.spy__regra_repescagem(r.tenant_id, r.tipo);
      v_origem := case r.tipo when 'orcamento' then 'Orçamento' when 'aguardando_pagamento' then 'Aguardando pagamento' else 'Atendimento' end;
      perform public.spy_enviar_repescagem(r.lead_id, 'sumiu',
        'Cliente sem responder há mais de ' || (v_regra ->> 'horas') || ' horas em ' || v_origem || '.', '{}', 'sistema');
      v := public.spy__lead(r.lead_id);
      -- As tentativas seguem a regra da etapa de onde veio.
      update public.lead_timers set status = 'cancelado' where lead_id = v.id and tipo = 'cadencia' and status = 'pendente';
      v_total := jsonb_array_length(v_regra -> 'dias'); v_i := 0; v_dia := 0;
      for u in select value::int as dia from jsonb_array_elements_text(v_regra -> 'dias') loop
        v_i := v_i + 1; v_dia := u.dia;
        perform public.spy__timer(v, 'cadencia', now() + make_interval(days => v_dia), 'rep_sumiu', jsonb_build_object('tentativa', v_i, 'de', v_total));
      end loop;
      perform public.spy__timer(v, 'cadencia', now() + make_interval(days => v_dia + 1), 'rep_sumiu', '{"acao":"perder","motivo":"sem_retorno"}');
      perform public.spy__aviso(v, 'critico', 'Repescagem (veio de ' || v_origem || '): chamar o cliente', 'repescagem:' || v.id);
      n_repescagem := n_repescagem + 1;
    exception when others then n_erros := n_erros + 1; v_erro := sqlerrm;
    end;
  end loop;

  return jsonb_build_object('alertas', n_alertas, 'repescagem', n_repescagem, 'perdidos', n_perdidos, 'erros', n_erros, 'ultimo_erro', v_erro);
end $$;

do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f, p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in ('spy__regra_repescagem', 'spy__no_expediente', 'spy_executar_prazos') loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.f);
    execute format('grant execute on function %s to service_role', r.f);
  end loop;
end $$;

-- ─── 3. Liga o método no Funil Comercial da SPY | IA ──────────────────────
do $$
declare
  v_funil constant text := '3x7skf56bjq';
  v_nomes constant text[] := array['Novo Lead', 'Não Respondeu', 'Diagnostico', 'Reunião / Apresentação', 'Proposta', 'Follow-Up', 'Negociação', 'Contrato', 'Ganho', 'Perdido', 'Desqualificado'];
  v_tipos constant text[] := array['novo_lead', 'repescagem', 'atendimento', 'atendimento', 'orcamento', 'repescagem', 'orcamento', 'aguardando_pagamento', 'ganho', 'perdido', 'desqualificado'];
  l record; n int := 0;
begin
  if not exists (select 1 from public.crm_funis where id = v_funil and etapas = v_nomes and jsonb_array_length(etapas_config) = 11) then
    raise exception 'As colunas do funil mudaram desde a confirmação. Não apliquei nada.';
  end if;
  update public.crm_funis c set template = 'completo', metodo_ativo = true,
    etapas_config = (select jsonb_agg(x.e || jsonb_build_object('tipo', v_tipos[x.i::int]) order by x.i) from jsonb_array_elements(c.etapas_config) with ordinality as x(e, i))
   where c.id = v_funil;
  -- Leads atuais: ganham a situação da coluna onde estão, sem prazos atrasados e sem tarefas.
  for l in select id from public.leads where deleted_at is null and "stageId" ~ ('^' || v_funil || '-([0-9]|10)$') loop
    perform public.spy_iniciar(l.id, false); n := n + 1;
  end loop;
  raise notice '% leads receberam situação', n;
end $$;

-- ─── 4. Autoteste (desfeito no fim) ───────────────────────────────────────
do $$
declare
  v_funil constant text := '3x7skf56bjq'; t uuid; a uuid; r jsonb; s text;
begin
  select tenant_id into t from public.crm_funis where id = v_funil;
  begin
    update public.crm_funis set horario_inicio = '00:00', horario_fim = '23:59:59', dias_semana = '{}' where id = v_funil;

    -- Negociação parada há 80h vai para "Não Respondeu" e volta para "Negociação" quando o cliente responde.
    insert into public.leads (tenant_id, name, "stageId", status) values (t, 'Autoteste de prazos A', v_funil || '-6', 'Em Aberto') returning id into a;
    perform public.spy_iniciar(a);
    update public.lead_estado set conversa_status = 'aguardando_cliente', conversa_desde = now() - interval '80 hours', situacao_desde = now() - interval '80 hours' where lead_id = a;
    r := public.spy_executar_prazos(500);
    select "stageId" into s from public.leads where id = a;
    if s <> v_funil || '-1' then raise exception 'repescagem automática: lead em %, resultado %', s, r; end if;
    if (select count(*) from public.lead_timers where lead_id = a and tipo = 'cadencia' and status = 'pendente') <> 8 then raise exception 'repescagem: tentativas erradas'; end if;
    update public.lead_timers set executar_em = now() - interval '1 minute' where lead_id = a and tipo = 'cadencia' and status = 'pendente' and payload ->> 'tentativa' = '1';
    r := public.spy_executar_prazos(500);
    if (select repescagem_tentativa from public.lead_estado where lead_id = a) <> 1 then raise exception 'primeira tentativa: %', r; end if;
    perform public.spy_reativar(a);
    select "stageId" into s from public.leads where id = a;
    if s <> v_funil || '-6' then raise exception 'volta para a coluna de origem: lead em %', s; end if;

    -- Pausa sem nota.
    perform public.spy_pausar_ate(a, now() + interval '1 day', null);

    -- Cobrança vencida; depois, fim das tentativas vira perdido.
    insert into public.leads (tenant_id, name, "stageId", status) values (t, 'Autoteste de prazos B', v_funil || '-7', 'Em Aberto') returning id into a;
    perform public.spy_iniciar(a);
    update public.lead_timers set executar_em = now() - interval '1 minute' where lead_id = a and status = 'pendente' and tipo = 'sla';
    r := public.spy_executar_prazos(500);
    if (select situacao_codigo from public.lead_estado where lead_id = a) <> 'pagamento_expirado' then raise exception 'cobrança vencida: %', r; end if;
    update public.lead_estado set conversa_status = 'aguardando_cliente', conversa_desde = now() - interval '30 hours', situacao_desde = now() - interval '30 hours' where lead_id = a;
    r := public.spy_executar_prazos(500);
    if (select "stageId" from public.leads where id = a) <> v_funil || '-1' then raise exception 'repescagem do pagamento: %', r; end if;
    update public.lead_timers set executar_em = now() - interval '1 minute' where lead_id = a and status = 'pendente' and payload ->> 'acao' = 'perder';
    r := public.spy_executar_prazos(500);
    if (select "stageId" from public.leads where id = a) <> v_funil || '-9' then raise exception 'perda sem retorno: %', r; end if;

    -- Lead novo sem atendimento avisa.
    insert into public.leads (tenant_id, name, "stageId", status) values (t, 'Autoteste de prazos C', v_funil || '-0', 'Novo') returning id into a;
    perform public.spy_iniciar(a);
    update public.lead_timers set executar_em = now() - interval '1 minute' where lead_id = a and status = 'pendente';
    r := public.spy_executar_prazos(500);
    if not exists (select 1 from public.notifications where lead_id = a and nivel = 'critico') then raise exception 'sem alerta do 1º atendimento: %', r; end if;
    if (r ->> 'erros')::int <> 0 then raise exception 'o motor registrou erro: %', r; end if;

    raise exception 'DESFAZER_AUTOTESTE';
  exception when others then
    if sqlerrm <> 'DESFAZER_AUTOTESTE' then raise; end if;
  end;
end $$;

commit;

-- Esperado: metodo_ligado = true, leads_no_funil = leads_com_situacao (perdidos ficam sem situação), sobras = 0
select
  (select metodo_ativo from public.crm_funis where id = '3x7skf56bjq') as metodo_ligado,
  (select count(*) from public.leads where deleted_at is null and "stageId" like '3x7skf56bjq-%') as leads_no_funil,
  (select count(*) from public.lead_estado e join public.leads l on l.id = e.lead_id where l."stageId" like '3x7skf56bjq-%' and e.situacao_codigo is not null) as leads_com_situacao,
  (select count(*) from public.leads where name like 'Autoteste de prazos %') as sobras;
