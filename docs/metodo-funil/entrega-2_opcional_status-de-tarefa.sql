-- OPCIONAL e separado: padroniza o status antigo das tarefas. MUDA O QUE A TELA MOSTRA para empresas sem o método
-- (hoje "Done" aparece como tarefa aberta). Não dispara aviso de "tarefa concluída". Rodar fora do horário de uso.
-- Conferir antes:  select status, count(*) from public.tasks group by 1 order by 2 desc;
update public.tasks set status = 'Concluída', completed_at = coalesce(completed_at, updated_at) where status = 'Done';
update public.tasks set status = 'Em Aberto' where status = 'To Do';
