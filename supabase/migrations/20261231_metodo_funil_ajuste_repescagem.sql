-- Método do funil · ajuste no executor de prazos.
-- A versão aplicada manda para a Repescagem olhando só a hora da última mensagem. Com isso, um lead tirado da
-- Repescagem à mão voltaria na rodada seguinte. Agora a situação também precisa estar parada pelo mesmo tempo.
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

-- Esperado: ajustado = true, logado_pode_chamar = false
select (select md5(prosrc) = '57679d126b0071d3bd01ccd99d14316c' from pg_proc where oid = 'public.spy_executar_prazos(integer)'::regprocedure) as ajustado,
       has_function_privilege('authenticated', 'public.spy_executar_prazos(integer)', 'execute') as logado_pode_chamar;
