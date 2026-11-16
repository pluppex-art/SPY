-- Teste das funções do módulo Agendamento (rode DEPOIS da migração 20261122_agendamento.sql).
-- Seguro: tudo acontece numa única instrução que termina em erro de propósito ("TESTE_OK: ..."), então o banco
-- desfaz tudo e nada fica gravado. Se aparecer outra mensagem de erro, alguma regra falhou.
-- Precisa de pelo menos 2 empresas ainda sem configuração de agendamento.
do $teste$
declare
  t uuid; r1 public.agendamento_reservas; r2 public.agendamento_reservas; msg text; n int; rr record; ok text := '';
begin
  select id into t from public.tenants x where not exists (select 1 from public.agendamento_config c where c.tenant_id = x.id) limit 1;
  if t is null then raise exception 'precisa de uma empresa sem configuração de agendamento para testar'; end if;
  insert into public.agendamento_config (tenant_id, slug, qtd_recursos, expiracao_pendente_min) values (t, 'teste-rollback', 6, 30);

  -- 1) reserva normal: 2 pistas às 19:00 por 2h
  select * into r1 from public.agendamento_reservar(t, jsonb_build_array(jsonb_build_object('data','2099-01-05','hora','19:00','duracao',2,'qtd_recursos',2,'qtd_pessoas',10,'valor_total',400,'contato_nome','Ana','origem','site','status','Confirmada','status_pagamento','Pago')));
  ok := ok || 'criou(inicio_min=' || r1.inicio_min || ') ';

  -- 2) 4 pistas no mesmo horário ainda cabem (2+4=6)
  perform public.agendamento_reservar(t, jsonb_build_array(jsonb_build_object('data','2099-01-05','hora','19:00','duracao',1,'qtd_recursos',4,'contato_nome','Beto','status','Confirmada')));
  ok := ok || 'cabe-6 ';

  -- 3) mais 1 pista em qualquer hora ocupada estoura: erro sem_vaga
  begin
    perform public.agendamento_reservar(t, jsonb_build_array(jsonb_build_object('data','2099-01-05','hora','20:00','duracao',1,'qtd_recursos',5,'contato_nome','Cris','status','Confirmada')));
    raise exception 'DEVERIA_FALHAR_1';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg not like 'sem_vaga:%' then raise exception 'erro inesperado: %', msg; end if;
    ok := ok || 'recusou(' || msg || ') ';
  end;

  -- 4) tudo ou nada: segundo item estoura, o primeiro não pode ficar gravado
  select count(*) into n from public.agendamento_reservas where tenant_id = t and data = '2099-01-06';
  begin
    perform public.agendamento_reservar(t, jsonb_build_array(
      jsonb_build_object('data','2099-01-06','hora','18:00','duracao',1,'qtd_recursos',1,'contato_nome','Duda'),
      jsonb_build_object('data','2099-01-06','hora','18:00','duracao',1,'qtd_recursos',6,'contato_nome','Edu')));
    raise exception 'DEVERIA_FALHAR_2';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg not like 'sem_vaga:%' then raise exception 'erro inesperado: %', msg; end if;
  end;
  select count(*) into n from public.agendamento_reservas where tenant_id = t and data = '2099-01-06';
  if n <> 0 then raise exception 'tudo-ou-nada quebrou: % linhas', n; end if;
  ok := ok || 'tudo-ou-nada ';

  -- 5) horário quebrado 18:30 por 1h ocupa as horas 18 e 19
  perform public.agendamento_reservar(t, jsonb_build_array(jsonb_build_object('data','2099-01-07','hora','18:30','duracao',1,'qtd_recursos',6,'contato_nome','Fabi','status','Confirmada')));
  if public.agendamento_ocupados_hora(t, '2099-01-07', 18, null, 30) <> 6 or public.agendamento_ocupados_hora(t, '2099-01-07', 19, null, 30) <> 6 or public.agendamento_ocupados_hora(t, '2099-01-07', 20, null, 30) <> 0 then
    raise exception 'intervalo errado';
  end if;
  ok := ok || 'intervalo ';

  -- 6) depois da meia-noite: 23:00 por 2h ocupa a hora 24
  perform public.agendamento_reservar(t, jsonb_build_array(jsonb_build_object('data','2099-01-08','hora','23:00','duracao',2,'qtd_recursos',3,'contato_nome','Gabi','status','Confirmada')));
  if public.agendamento_ocupados_hora(t, '2099-01-08', 24, null, 30) <> 3 then raise exception 'meia-noite errada'; end if;
  ok := ok || 'meia-noite ';

  -- 7) pendente velha (45 min) não segura vaga; pendente nova segura; "pagar no local" segura sempre
  insert into public.agendamento_reservas (tenant_id, data, hora, duracao, qtd_recursos, contato_nome, status, status_pagamento, created_at) values (t,'2099-01-09','19:00',1,6,'Velha','Pendente','Pendente', now() - interval '50 minutes');
  if public.agendamento_ocupados_hora(t, '2099-01-09', 19, null, 30) <> 0 then raise exception 'pendente velha segurou vaga'; end if;
  insert into public.agendamento_reservas (tenant_id, data, hora, duracao, qtd_recursos, contato_nome, status, status_pagamento, created_at) values (t,'2099-01-09','19:00',1,2,'Nova','Pendente','Pendente', now() - interval '5 minutes');
  insert into public.agendamento_reservas (tenant_id, data, hora, duracao, qtd_recursos, contato_nome, status, status_pagamento, pagar_no_local, created_at) values (t,'2099-01-09','19:00',1,1,'Local','Pendente','Pendente', true, now() - interval '500 minutes');
  if public.agendamento_ocupados_hora(t, '2099-01-09', 19, null, 30) <> 3 then raise exception 'pendentes erradas: %', public.agendamento_ocupados_hora(t, '2099-01-09', 19, null, 30); end if;
  ok := ok || 'pendentes ';

  -- 8) atualizar: mover para horário lotado recusa; cancelar libera; reabrir sem vaga recusa
  begin
    perform public.agendamento_atualizar(t, r1.id, jsonb_build_object('qtd_recursos',6)); -- 19:00: com os 4 do Beto passaria de 6
    raise exception 'DEVERIA_FALHAR_3';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg not like 'sem_vaga:%' then raise exception 'erro inesperado (mover): %', msg; end if;
  end;
  perform public.agendamento_atualizar(t, r1.id, jsonb_build_object('status','Cancelada','motivo_cancelamento','teste'));
  if public.agendamento_ocupados_hora(t, '2099-01-05', 19, null, 30) <> 4 then raise exception 'cancelar não liberou'; end if;
  perform public.agendamento_reservar(t, jsonb_build_array(jsonb_build_object('data','2099-01-05','hora','19:00','duracao',2,'qtd_recursos',2,'contato_nome','Novo','status','Confirmada')));
  begin
    perform public.agendamento_atualizar(t, r1.id, jsonb_build_object('status','Confirmada'));
    raise exception 'DEVERIA_FALHAR_4';
  exception when others then
    get stacked diagnostics msg = message_text;
    if msg not like 'sem_vaga:%' then raise exception 'erro inesperado (reabrir): %', msg; end if;
  end;
  ok := ok || 'atualizar ';

  -- 9) campos livres não mexem na vaga e o patch parcial preserva o resto
  select * into r2 from public.agendamento_atualizar(t, r1.id, jsonb_build_object('observacoes','oi','checkin_ids',jsonb_build_array('a','b'),'recursos_atribuidos',jsonb_build_array(1,2)));
  if r2.observacoes <> 'oi' or r2.checkin_ids <> array['a','b'] or r2.recursos_atribuidos <> array[1,2] or r2.contato_nome <> 'Ana' or r2.valor_total <> 400 then raise exception 'patch parcial errado'; end if;
  ok := ok || 'patch ';

  -- 10) expirar pendentes: cancela só as sem pagamento passadas do prazo+15
  perform public.agendamento_expirar_pendentes(t);
  select count(*) into n from public.agendamento_reservas where tenant_id = t and contato_nome = 'Velha' and status = 'Cancelada';
  if n <> 1 then raise exception 'velha não expirou'; end if;
  select count(*) into n from public.agendamento_reservas where tenant_id = t and contato_nome in ('Nova','Local') and status = 'Pendente';
  if n <> 2 then raise exception 'expirou demais'; end if;
  ok := ok || 'expirar ';

  -- 11) slug único (sem diferenciar maiúsculas) e formato
  begin
    insert into public.agendamento_config (tenant_id, slug) select id, 'teste-rollback' from public.tenants x where x.id <> t and not exists (select 1 from public.agendamento_config c where c.tenant_id = x.id) limit 1;
    raise exception 'DEVERIA_FALHAR_5';
  exception when unique_violation then ok := ok || 'slug-unico ';
  end;
  begin
    insert into public.agendamento_config (tenant_id, slug) select id, 'Teste-Rollback' from public.tenants x where x.id <> t and not exists (select 1 from public.agendamento_config c where c.tenant_id = x.id) limit 1;
    raise exception 'DEVERIA_FALHAR_5b';
  exception when check_violation then ok := ok || 'slug-minusculo ';
  end;
  begin
    update public.agendamento_config set slug = 'A b' where tenant_id = t;
    raise exception 'DEVERIA_FALHAR_6';
  exception when check_violation then ok := ok || 'slug-formato ';
  end;

  raise exception 'TESTE_OK: %', ok;
end
$teste$;
