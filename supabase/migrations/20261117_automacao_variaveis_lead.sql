-- Variáveis do lead nos textos das automações ({nome}, {primeiro_nome}, {score}, {temperatura}, {interesse}, {origem},
-- {empresa}, {telefone}, {email}) nas ações Notificar, Tarefa e Mensagem. Reaplica sobre a definição atual da função.
create or replace function public.spy_render_vars(p_text text, p_lead jsonb)
returns text
language sql
immutable
set search_path to 'public'
as $$
  select replace(replace(replace(replace(replace(replace(replace(replace(replace(coalesce(p_text, ''),
    '{primeiro_nome}', split_part(coalesce(p_lead->>'name', ''), ' ', 1)),
    '{nome}', coalesce(p_lead->>'name', '')),
    '{score}', coalesce(p_lead->>'scoreIA', p_lead->>'score_ia', '')),
    '{temperatura}', coalesce(p_lead->>'temperature', '')),
    '{interesse}', coalesce(p_lead->>'lead_interesse_cliente', '')),
    '{origem}', coalesce(p_lead->>'source', '')),
    '{empresa}', coalesce(p_lead->>'company', '')),
    '{telefone}', coalesce(p_lead->>'phone', '')),
    '{email}', coalesce(p_lead->>'email', ''))
$$;

do $$
declare
  d text := pg_get_functiondef('public.executar_automacao_connection'::regproc);
  lj text := '(case when p_lead_id is not null then to_jsonb(v_lead) else ''{}''::jsonb end)';
  alvos text[][] := array[
    array['coalesce(v_acao.config->>''titulo'', ''Automação disparada'')'],
    array['coalesce(v_acao.config->>''mensagem'', p_nome_conexao || '' — '' || v_titulo)'],
    array['coalesce(v_acao.config->>''titulo'', ''Tarefa automática: '' || p_nome_conexao)'],
    array['v_acao.config->>''descricao'''],
    array['coalesce(v_acao.config->>''texto'', ''Olá! Tudo bem?'')']
  ];
  i int; a text;
begin
  if position('spy_render_vars' in d) > 0 then raise notice 'já aplicado'; return; end if;
  for i in 1..array_length(alvos, 1) loop
    a := alvos[i][1];
    if position(a in d) = 0 then raise exception 'trecho %: não encontrado', i; end if;
    d := replace(d, a, 'public.spy_render_vars(' || a || ', ' || lj || ')');
  end loop;
  execute d;
end $$;
