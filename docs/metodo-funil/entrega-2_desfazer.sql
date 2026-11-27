-- Desfaz a ENTREGA 2 (funções, gatilhos e colunas). Não apaga dados das tabelas da entrega 1.
set local lock_timeout = '5s';
drop trigger if exists lead_notas_linha_do_tempo on public.lead_notas;
drop trigger if exists lead_status_historico_eventos on public.lead_status_historico;
do $$
declare r record;
begin
  for r in select p.oid::regprocedure as f from pg_proc p where p.pronamespace = 'public'::regnamespace
      and p.proname in (
        'spy__lead', 'spy__funil', 'spy__tipo_atual', 'spy__situacao', 'spy__etapa_da_situacao', 'spy__situacao_inicial', 'spy__vendedor', 'spy__autor', 'spy__tarefa', 'spy__aviso', 'spy__encerrar_automaticos', 'spy__timer', 'spy__agendar', 'spy__historico', 'spy__aplicar', 'spy__nota_na_linha_do_tempo', 'spy__historico_para_eventos',
        'spy_iniciar', 'spy_mudar_situacao', 'spy_mover_etapa', 'spy_enviar_repescagem', 'spy_marcar_perdido', 'spy_registrar_pagamento', 'spy_registrar_venda_presencial', 'spy_pausar_ate', 'spy_retomar', 'spy_reativar', 'spy_aceitar_sugestao', 'spy_recusar_sugestao', 'spy_desfazer') loop
    execute format('drop function if exists %s cascade', r.f);
  end loop;
end $$;
drop index if exists public.lead_hist_operacao_idx;
alter table public.lead_status_historico drop column if exists operacao_id;
alter table public.crm_situacoes drop column if exists tarefa_titulo;
