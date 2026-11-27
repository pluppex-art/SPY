-- Método do funil · Agente Secreto: uma única função que o fluxo chama depois de ler a conversa.
-- Ela decide e aplica (etapa, situação, nota, prazos, repescagem, venda, perda) com as mesmas regras das telas.
-- Só age em funil com o método ligado; nos demais devolve {"metodo": false} sem mexer em nada.
-- No fim há um autoteste que roda e é desfeito: nada dele fica gravado. Rode o arquivo inteiro no SQL Editor.
--
-- p_fatos (tudo opcional; "em" = data e hora da mensagem que prova o fato):
--   cliente_em, vendedor_em   última mensagem de cada lado
--   nota, confianca
--   preco       {em}
--   cobranca    {em, metodo, valor}
--   pago        {em, metodo, valor}
--   repescagem  {em, motivo: sumiu|adiou|preco|pesquisando|sem_estoque, data_retorno, valor_esperado, concorrente}
--   recusa      {em, motivo: preco|concorrente|desistiu|fora_area, valor_esperado, concorrente}
-- Um fato só vale se a mensagem for mais nova que a última já analisada: reprocessar não repete nem refaz o que foi desfeito.

begin;

create or replace function public.spy_agente(p_lead uuid, p_tenant uuid, p_fatos jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v public.leads%rowtype; f public.crm_funis%rowtype; e public.lead_estado%rowtype;
  c_ativas constant text[] := array['novo_lead', 'atendimento', 'orcamento', 'aguardando_pagamento'];
  j jsonb := coalesce(p_fatos, '{}'::jsonb);
  v_tipo text; v_corte timestamptz; v_cli timestamptz; v_ven timestamptz; v_ult timestamptz;
  v_pago timestamptz; v_recusa timestamptz; v_rep timestamptz; v_cob timestamptz; v_preco timestamptz;
  v_acao text := 'nenhuma'; v_nota text; v_conf numeric; v_valor numeric; v_metodo text; v_motivo text;
  v_data date; v_dest text; v_extra jsonb; s jsonb; v_pag text;
begin
  if auth.uid() is not null then raise exception 'Só o Agente Secreto chama esta função.' using errcode = '42501'; end if;
  v := public.spy__lead(p_lead);
  if v.tenant_id is distinct from p_tenant then raise exception 'O lead não é desta empresa.' using errcode = '42501'; end if;

  select * into f from public.crm_funis c
   where c.tenant_id = v.tenant_id and c.metodo_ativo and left(v."stageId", length(c.id) + 1) = c.id || '-'
     and substr(v."stageId", length(c.id) + 2) ~ '^[0-9]+$'
   limit 1;
  if not found then return jsonb_build_object('metodo', false); end if;
  v_tipo := f.etapas_config -> (substr(v."stageId", length(f.id) + 2))::int ->> 'tipo';
  if v_tipo is null then return jsonb_build_object('metodo', true, 'acao', 'etapa_sem_tipo'); end if;

  v_cli := nullif(j ->> 'cliente_em', '')::timestamptz;
  v_ven := nullif(j ->> 'vendedor_em', '')::timestamptz;
  v_ult := greatest(v_cli, v_ven);
  select * into e from public.lead_estado where lead_id = v.id;
  v_corte := coalesce(e.conversa_desde, '-infinity'::timestamptz);
  if v_ult is null or v_ult <= v_corte then return jsonb_build_object('metodo', true, 'acao', 'sem_mensagem_nova'); end if;

  v_nota := coalesce(nullif(trim(j ->> 'nota'), ''), 'Atualização do Agente Secreto a partir da conversa no WhatsApp.');
  v_nota := left(v_nota, 4000);
  v_conf := least(greatest(nullif(j ->> 'confianca', '')::numeric, 0), 1);
  if j ->> 'confianca' is null then v_conf := null; end if;
  v_pago := nullif(j #>> '{pago,em}', '')::timestamptz;
  v_recusa := nullif(j #>> '{recusa,em}', '')::timestamptz;
  v_rep := nullif(j #>> '{repescagem,em}', '')::timestamptz;
  v_cob := nullif(j #>> '{cobranca,em}', '')::timestamptz;
  v_preco := nullif(j #>> '{preco,em}', '')::timestamptz;

  -- Lead que ainda não tem situação: começa agora (venda antiga não ganha prazos retroativos).
  if e.situacao_codigo is null and v_tipo not in ('perdido') then
    perform public.spy_iniciar(v.id, v_tipo <> 'ganho');
    select * into e from public.lead_estado where lead_id = v.id;
    v_acao := 'iniciado';
  end if;
  -- Cliente escreveu durante uma pausa: os prazos voltam a contar.
  if e.pausa_ate is not null and v_cli > v_corte then perform public.spy_retomar(v.id); end if;

  -- Resposta do cliente já traz o motivo da repescagem (usado nos dois ramos abaixo).
  s := j -> 'repescagem';
  v_motivo := case when s ->> 'motivo' in ('sumiu', 'adiou', 'preco', 'pesquisando', 'sem_estoque') then s ->> 'motivo' else 'pesquisando' end;
  v_data := case when s ->> 'data_retorno' ~ '^\d{4}-\d{2}-\d{2}$' then (s ->> 'data_retorno')::date end;
  if v_motivo = 'adiou' and (v_data is null or v_data <= current_date) then v_motivo := 'pesquisando'; end if;
  v_extra := jsonb_strip_nulls(jsonb_build_object('valor_esperado', nullif(s ->> 'valor_esperado', '')::numeric,
    'concorrente', nullif(left(coalesce(s ->> 'concorrente', ''), 120), ''), 'data_retorno', case when v_motivo = 'adiou' then v_data end));

  if v_pago > v_corte and v_tipo <> 'ganho' then
    s := j -> 'pago';
    v_valor := coalesce(nullif(nullif(s ->> 'valor', '')::numeric, 0), v.value, 0);
    v_metodo := case when s ->> 'metodo' in ('pix', 'link', 'cartao', 'boleto', 'dinheiro', 'outro') then s ->> 'metodo' end;
    v_pag := e.pagamento_status;
    perform public.spy__aplicar(v, f, 'ganho', 'a_entregar', v_nota, 'Pagamento identificado na conversa.',
      jsonb_build_object('valor', nullif(v_valor, 0)), 'ia', null, v_conf);
    insert into public.lead_pagamentos (tenant_id, lead_id, metodo, valor, status, origem, gateway, confirmado_em)
    values (v.tenant_id, v.id, v_metodo, v_valor, 'pago', 'webhook', 'agente', now());
    update public.lead_estado set pagamento_status = 'pago', canal_venda = 'whatsapp' where lead_id = v.id;
    perform public.spy__historico(v, 'pagamento', v_pag, 'pago', 'ia', null, v_conf, null, gen_random_uuid());
    perform public.spy__aviso(v, 'importante', 'Pagamento identificado na conversa: confira', 'pagamento_pago:' || v.id);
    v_acao := 'venda_ganha';

  elsif v_recusa > v_corte and (v_tipo = any (c_ativas) or v_tipo = 'repescagem') then
    s := j -> 'recusa';
    v_motivo := case when s ->> 'motivo' in ('preco', 'concorrente', 'desistiu', 'fora_area') then s ->> 'motivo' else 'desistiu' end;
    perform public.spy_marcar_perdido(v.id, v_motivo, v_nota,
      jsonb_strip_nulls(jsonb_build_object('valor_esperado', nullif(s ->> 'valor_esperado', '')::numeric,
        'concorrente', nullif(left(coalesce(s ->> 'concorrente', ''), 120), ''))), 'ia', v_conf);
    v_acao := 'perdido';

  elsif v_cli > v_corte and v_tipo = 'repescagem' then
    if v_rep > v_corte and v_motivo is distinct from e.repescagem_motivo then
      perform public.spy_mudar_situacao(v.id, 'rep_' || v_motivo, v_nota,
        v_extra || case when v_motivo = 'adiou' then jsonb_build_object('data', (v_data + time '09:00') at time zone 'America/Sao_Paulo') else '{}'::jsonb end, 'ia', v_conf);
      v_acao := 'repescagem_atualizada';
    elsif v_rep is null or v_rep <= v_corte then
      perform public.spy_reativar(v.id);
      v_acao := 'reativado';
    end if;

  elsif v_cli > v_corte and v_tipo in ('perdido', 'desqualificado') then
    perform public.spy_reativar(v.id);
    v_acao := 'cliente_voltou';

  elsif v_rep > v_corte and v_tipo = any (c_ativas) then
    perform public.spy_enviar_repescagem(v.id, v_motivo, v_nota, v_extra, 'ia', v_conf);
    perform public.spy__aviso(v, 'critico',
      case when v_motivo = 'adiou' then 'Repescagem: chamar o cliente em ' || to_char(v_data, 'DD/MM') else 'Repescagem: chamar o cliente' end,
      'repescagem:' || v.id);
    v_acao := 'repescagem';

  elsif v_cob > v_corte and v_tipo = any (c_ativas) and e.pagamento_status is distinct from 'cobranca_enviada'
        and coalesce(nullif(nullif(j #>> '{cobranca,valor}', '')::numeric, 0), v.value, 0) > 0 then
    s := j -> 'cobranca';
    v_valor := coalesce(nullif(nullif(s ->> 'valor', '')::numeric, 0), v.value);
    v_metodo := case when s ->> 'metodo' in ('pix', 'link', 'cartao', 'boleto') then s ->> 'metodo' else 'pix' end;
    v_dest := public.spy__etapa_da_situacao(f, public.spy__situacao(v.tenant_id, f.id, 'aguardando_pagamento'));
    v_pag := e.pagamento_status;
    perform public.spy__aplicar(v, f, v_dest, 'aguardando_pagamento', v_nota, 'Cobrança enviada ao cliente.',
      jsonb_build_object('metodo', v_metodo), 'ia', null, v_conf);
    insert into public.lead_pagamentos (tenant_id, lead_id, metodo, valor, status, origem, gateway)
    values (v.tenant_id, v.id, v_metodo, v_valor, 'cobranca_enviada', 'webhook', 'agente');
    update public.lead_estado set pagamento_status = 'cobranca_enviada' where lead_id = v.id;
    perform public.spy__historico(v, 'pagamento', v_pag, 'cobranca_enviada', 'ia', null, v_conf, null, gen_random_uuid());
    v_acao := 'cobranca';

  elsif v_preco > v_corte and v_tipo in ('novo_lead', 'atendimento') then
    perform public.spy__aplicar(v, f, 'orcamento', 'orcamento_enviado', v_nota, 'Preço ou orçamento enviado.', '{}', 'ia', null, v_conf);
    v_acao := 'orcamento';

  elsif v_tipo in ('novo_lead', 'atendimento') and e.situacao_codigo = 'aguardando_atendimento' and v_ven > v_corte then
    v_dest := public.spy__etapa_da_situacao(f, public.spy__situacao(v.tenant_id, f.id, 'em_qualificacao'));
    perform public.spy__aplicar(v, f, v_dest, 'em_qualificacao', case when v_dest <> v_tipo then v_nota end, 'Vendedor respondeu.', '{}', 'ia', null, v_conf);
    v_acao := 'em_qualificacao';

  elsif v_tipo = 'orcamento' and e.situacao_codigo = 'orcamento_enviado' and v_cli > v_corte and v_cli > coalesce(v_ven, '-infinity') then
    perform public.spy_mudar_situacao(v.id, 'em_negociacao', v_nota, '{}', 'ia', v_conf);
    v_acao := 'em_negociacao';

  elsif v_tipo = 'orcamento' and e.situacao_codigo = 'em_negociacao' and v_ven > v_corte and v_ven > coalesce(v_cli, '-infinity') then
    -- Vendedor respondeu: a vez volta para o cliente e os retornos recomeçam.
    perform public.spy_mudar_situacao(v.id, 'orcamento_enviado', null, '{}', 'ia', v_conf);
    v_acao := 'aguardando_cliente';
  end if;

  insert into public.lead_estado (lead_id, tenant_id, conversa_status, conversa_desde)
  values (v.id, v.tenant_id, case when v_ven > coalesce(v_cli, '-infinity') then 'aguardando_cliente' else 'aguardando_vendedor' end, v_ult)
  on conflict (lead_id) do update set conversa_status = excluded.conversa_status, conversa_desde = excluded.conversa_desde;

  return (select jsonb_build_object('metodo', true, 'acao', v_acao, 'etapa_id', l."stageId", 'situacao', es.situacao_codigo)
            from public.leads l join public.lead_estado es on es.lead_id = l.id where l.id = v.id);
end $$;

revoke execute on function public.spy_agente(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.spy_agente(uuid, uuid, jsonb) to service_role;

-- ─── Autoteste (desfeito no fim; se algo falhar, nada deste arquivo é aplicado) ───
do $$
declare
  t uuid; v_funil constant text := 'metodo-teste'; a uuid; b uuid; r jsonb; t0 timestamptz := now() - interval '1 hour';
  m timestamptz[]; f jsonb;
begin
  select tenant_id into t from public.crm_funis where id = v_funil;
  if t is null then raise notice 'Funil de teste não existe: autoteste pulado.'; return; end if;
  for i in 1 .. 10 loop m[i] := t0 + make_interval(mins => i); end loop;
  begin
    update public.crm_funis set metodo_ativo = true where id = v_funil;
    insert into public.leads (tenant_id, name, "stageId", status) values (t, 'Autoteste do agente A', v_funil || '-0', 'Novo') returning id into a;
    insert into public.leads (tenant_id, name, "stageId", status) values (t, 'Autoteste do agente B', v_funil || '-0', 'Novo') returning id into b;

    f := jsonb_build_object('cliente_em', m[1]);
    r := public.spy_agente(a, t, f);
    if r ->> 'situacao' is distinct from 'aguardando_atendimento' then raise exception 'passo 1 (primeira mensagem): %', r; end if;
    r := public.spy_agente(a, t, f);
    if r ->> 'acao' is distinct from 'sem_mensagem_nova' then raise exception 'passo 2 (repetição): %', r; end if;
    r := public.spy_agente(a, t, jsonb_build_object('cliente_em', m[1], 'vendedor_em', m[2]));
    if r ->> 'situacao' is distinct from 'em_qualificacao' then raise exception 'passo 3 (vendedor respondeu): %', r; end if;
    r := public.spy_agente(a, t, jsonb_build_object('vendedor_em', m[3], 'preco', jsonb_build_object('em', m[3]), 'nota', 'Preço enviado.'));
    if r ->> 'etapa_id' is distinct from v_funil || '-1' or r ->> 'situacao' is distinct from 'orcamento_enviado' then raise exception 'passo 4 (preço): %', r; end if;
    r := public.spy_agente(a, t, jsonb_build_object('cliente_em', m[4], 'nota', 'Perguntou sobre parcelamento.'));
    if r ->> 'situacao' is distinct from 'em_negociacao' then raise exception 'passo 5 (negociação): %', r; end if;
    r := public.spy_agente(a, t, jsonb_build_object('vendedor_em', m[5]));
    if r ->> 'situacao' is distinct from 'orcamento_enviado' then raise exception 'passo 6 (vez do cliente): %', r; end if;
    r := public.spy_agente(a, t, jsonb_build_object('cliente_em', m[6], 'repescagem', jsonb_build_object('em', m[6], 'motivo', 'pesquisando'), 'nota', 'Vai comparar.'));
    if r ->> 'etapa_id' is distinct from v_funil || '-2' or r ->> 'situacao' is distinct from 'rep_pesquisando' then raise exception 'passo 7 (repescagem): %', r; end if;
    if not exists (select 1 from public.notifications where lead_id = a and dedupe_key = 'repescagem:' || a) then raise exception 'passo 7: sem aviso ao vendedor'; end if;
    r := public.spy_agente(a, t, jsonb_build_object('cliente_em', m[7]));
    if r ->> 'etapa_id' is distinct from v_funil || '-1' then raise exception 'passo 8 (cliente voltou): %', r; end if;
    r := public.spy_agente(a, t, jsonb_build_object('cliente_em', m[8], 'cobranca', jsonb_build_object('em', m[8], 'metodo', 'pix', 'valor', 100)));
    if r ->> 'situacao' is distinct from 'aguardando_pagamento' then raise exception 'passo 9 (cobrança): %', r; end if;
    r := public.spy_agente(a, t, jsonb_build_object('cliente_em', m[9], 'pago', jsonb_build_object('em', m[9], 'valor', 100), 'nota', 'Comprovante recebido.'));
    if r ->> 'etapa_id' is distinct from v_funil || '-3' then raise exception 'passo 10 (pagamento): %', r; end if;

    r := public.spy_agente(b, t, jsonb_build_object('cliente_em', m[1], 'recusa', jsonb_build_object('em', m[1], 'motivo', 'desistiu'), 'nota', 'Disse que não quer.'));
    if r ->> 'etapa_id' is distinct from v_funil || '-4' then raise exception 'passo 11 (recusa): %', r; end if;
    if exists (select 1 from public.tasks where lead_id in (a, b) and tipo = 'revisar_nota') then raise exception 'sobrou tarefa de revisar nota'; end if;

    raise exception 'DESFAZER_AUTOTESTE';
  exception when others then
    if sqlerrm <> 'DESFAZER_AUTOTESTE' then raise; end if;
  end;
end $$;

commit;

-- Esperado: instalado = true, logado_pode_chamar = false, sobras = 0
select
  to_regprocedure('public.spy_agente(uuid,uuid,jsonb)') is not null as instalado,
  has_function_privilege('authenticated', 'public.spy_agente(uuid,uuid,jsonb)', 'execute') as logado_pode_chamar,
  (select count(*) from public.leads where name like 'Autoteste do agente %') as sobras;
