-- ENSAIO da entrega 2: percorre o funil chamando as funções e confere o resultado. SEMPRE DESFAZ TUDO no final,
-- levantando um erro de propósito: "ENSAIO OK" = passou; qualquer outra mensagem = falhou. Nada fica gravado e nada
-- é enviado (os avisos externos saem por pg_net, que só dispara se a transação for confirmada).
-- Rodar com a migração do motor já aplicada. Antes de colar no SQL Editor, confira que o arquivo começa aqui.
do $ensaio$
declare
  t uuid := '27ef95ee-84dd-499e-9f25-cd9baecb5fe4'; l1 uuid; l2 uuid; l3 uuid; r jsonb; n int; v record; s uuid;
begin
  update public.crm_funis set metodo_ativo = true where id = 'metodo-teste' and tenant_id = t;
  if not found then raise exception 'Falta o funil de teste (entrega-1_funil-de-teste.sql).'; end if;
  insert into public.leads (tenant_id, name, email, phone, "pipelineId", "stageId", status, seller, source) values (t, 'Ensaio 1', '', '00900000001', 'comercial', 'metodo-teste-0', 'Novo', 'Ensaio', 'ensaio') returning id into l1;
  insert into public.leads (tenant_id, name, email, phone, "pipelineId", "stageId", status, seller, source) values (t, 'Ensaio 2', '', '00900000002', 'comercial', 'metodo-teste-0', 'Novo', 'Ensaio', 'ensaio') returning id into l2;
  insert into public.leads (tenant_id, name, email, phone, "pipelineId", "stageId", status, seller, source) values (t, 'Ensaio 3', '', '00900000003', 'comercial', 'metodo-teste-0', 'Novo', 'Ensaio', 'ensaio') returning id into l3;

  -- 1. início
  r := public.spy_iniciar(l1);
  assert r ->> 'situacao' = 'aguardando_atendimento', 'início: situação';
  select count(*) into n from public.lead_timers where lead_id = l1 and status = 'pendente'; assert n = 2, 'início: 2 prazos, vieram ' || n;
  select count(*) into n from public.tasks where lead_id = l1 and origem = 'automacao' and status = 'Em Aberto'; assert n = 1, 'início: tarefa Responder';

  -- 2. mudar situação encerra a anterior
  perform public.spy_mudar_situacao(l1, 'em_qualificacao');
  select count(*) into n from public.tasks where lead_id = l1 and status = 'Concluída'; assert n = 1, 'tarefa anterior deveria fechar';

  -- 3. nota obrigatória e valor do orçamento
  begin perform public.spy_mover_etapa(l1, 'orcamento', null, null, '{"valor":100}', 'usuario'); raise exception 'FALHOU'; exception when others then assert sqlerrm like '%nota%', 'sem nota deveria recusar: ' || sqlerrm; end;
  begin perform public.spy_mover_etapa(l1, 'orcamento', 'ok', null, '{}', 'usuario'); raise exception 'FALHOU'; exception when others then assert sqlerrm like '%valor%', 'sem valor deveria recusar: ' || sqlerrm; end;
  perform public.spy_mover_etapa(l1, 'orcamento', 'Proposta enviada', null, '{"valor":350}', 'usuario');
  select "stageId", status, value into v from public.leads where id = l1;
  assert v."stageId" = 'metodo-teste-1' and v.status = 'Em Aberto' and v.value = 350, 'orçamento: etapa/status/valor';
  select count(*) into n from public.lead_timers where lead_id = l1 and status = 'pendente'; assert n = 4, 'orçamento: 3 follow-ups + saída, vieram ' || n;

  -- 4. repescagem e retorno
  perform public.spy_enviar_repescagem(l1, 'sumiu', 'Não respondeu', '{}', 'usuario');
  select count(*) into n from public.lead_timers where lead_id = l1 and status = 'pendente' and tipo = 'cadencia'; assert n = 8, 'cadência: 7 + saída, vieram ' || n;
  assert (select etapa_origem_tipo from public.lead_estado where lead_id = l1) = 'orcamento', 'repescagem: origem';
  r := public.spy_reativar(l1);
  assert (r ->> 'reaberto')::boolean and (select "stageId" from public.leads where id = l1) = 'metodo-teste-1', 'reativação volta ao orçamento';

  -- 5. pausa e retomada
  perform public.spy_pausar_ate(l1, now() + interval '3 days', 'Pediu para chamar depois');
  select count(*) into n from public.lead_timers where lead_id = l1 and status = 'pendente'; assert n = 0, 'pausa: nada pendente';
  perform public.spy_retomar(l1);
  select count(*) into n from public.lead_timers where lead_id = l1 and status = 'pendente'; assert n > 0, 'retomada: prazos de volta';

  -- 6. pagamento: cobrança, expirada, paga, repetida e fora de ordem
  perform public.spy_registrar_pagamento(l1, 'cobranca_enviada', 350, 'pix', 'ensaio', 'c1');
  assert (select situacao_codigo from public.lead_estado where lead_id = l1) = 'aguardando_pagamento', 'cobrança';
  perform public.spy_registrar_pagamento(l1, 'expirado', 350, 'pix', 'ensaio', 'c1');
  assert (select situacao_codigo from public.lead_estado where lead_id = l1) = 'pagamento_expirado', 'expirada';
  perform public.spy_registrar_pagamento(l1, 'pago', 350, 'pix', 'ensaio', 'c1');
  select "stageId", status, closed_at, loss_reason into v from public.leads where id = l1;
  assert v."stageId" = 'metodo-teste-3' and v.status = 'Fechado' and v.closed_at is not null and v.loss_reason is null, 'pago: venda ganha';
  r := public.spy_registrar_pagamento(l1, 'pago', 350, 'pix', 'ensaio', 'c1'); assert not (r ->> 'registrado')::boolean, 'repetido deveria ser ignorado';
  r := public.spy_registrar_pagamento(l1, 'expirado', 350, 'pix', 'ensaio', 'c1'); assert not (r ->> 'registrado')::boolean, 'fora de ordem deveria ser ignorado';
  assert (select count(*) from public.lead_pagamentos where lead_id = l1) = 1, 'uma cobrança só';

  -- 7. IA move, pede revisão, desfaz; perda e cliente que volta
  perform public.spy_mover_etapa(l2, 'orcamento', null, null, '{"valor":90}', 'ia', 0.9);
  assert exists (select 1 from public.tasks where lead_id = l2 and title like 'Revisar nota%'), 'IA: tarefa de revisão';
  perform public.spy_iniciar(l3);
  perform public.spy_mover_etapa(l3, 'orcamento', 'ia', null, '{"valor":90}', 'ia', 0.9);
  perform public.spy_desfazer(l3);
  assert (select "stageId" from public.leads where id = l3) = 'metodo-teste-0', 'desfazer volta a etapa';
  begin perform public.spy_desfazer(l3); raise exception 'FALHOU'; exception when others then assert sqlerrm like '%desfazer%', 'segundo desfazer: ' || sqlerrm; end;
  begin perform public.spy_marcar_perdido(l2, 'preco', null, '{}', 'usuario'); raise exception 'FALHOU'; exception when others then assert sqlerrm like '%nota%', 'perda sem nota: ' || sqlerrm; end;
  perform public.spy_marcar_perdido(l2, 'preco', 'Achou caro', '{"valor_esperado":70}', 'usuario');
  select status, loss_reason, lost_reason into v from public.leads where id = l2;
  assert v.status = 'Perdido' and v.loss_reason = 'Preço' and v.lost_reason = 'Preço', 'perda: status e motivo';
  r := public.spy_reativar(l2);
  assert not (r ->> 'reaberto')::boolean and (select not negocio_arquivado from public.leads where id = l2), 'perdido não é arquivado';

  -- 8. venda presencial e sugestão
  insert into public.lead_sugestoes_ia (tenant_id, lead_id, tipo, valor_sugerido) values (t, l3, 'temperatura', '{"temperatura":"quente"}') returning id into s;
  perform public.spy_aceitar_sugestao(s);
  assert (select temperature from public.leads where id = l3) = 'quente', 'sugestão de temperatura';
  perform public.spy_registrar_venda_presencial(l3, 120, 'Comprou na loja', 'dinheiro');
  assert (select canal_venda from public.lead_estado where lead_id = l3) = 'presencial' and (select status from public.leads where id = l3) = 'Fechado', 'presencial';

  -- 9. registros
  assert (select count(*) from public.lead_notas where lead_id = l1) >= 4, 'notas';
  assert (select count(*) from public.lead_activities where lead_id = l1::text and type = 'Nota') = (select count(*) from public.lead_notas where lead_id = l1), 'notas na linha do tempo';
  assert (select count(*) from public.aurora_events where entity_id = l1::text and source = 'metodo_funil') > 0, 'eventos';
  begin update public.lead_status_historico set motivo = 'x' where lead_id = l1; raise exception 'FALHOU'; exception when others then assert sqlerrm like '%não pode ser alterado%', 'histórico imutável: ' || sqlerrm; end;

  -- 10. funil com método desligado não é afetado
  update public.crm_funis set metodo_ativo = false where id = 'metodo-teste';
  begin perform public.spy_mudar_situacao(l1, 'concluida'); raise exception 'FALHOU'; exception when others then assert sqlerrm like '%não está ligado%', 'método desligado: ' || sqlerrm; end;

  assert not has_function_privilege('authenticated', 'public.spy__aplicar(public.leads,public.crm_funis,text,text,text,text,jsonb,text,uuid,numeric,uuid)', 'execute'), 'função interna exposta';
  assert not has_function_privilege('anon', 'public.spy_registrar_pagamento(uuid,text,numeric,text,text,text,timestamptz)', 'execute'), 'acesso anônimo';

  raise exception 'ENSAIO OK: todas as conferências passaram. Nada foi gravado.';
end $ensaio$;
