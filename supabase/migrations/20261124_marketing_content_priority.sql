-- Prioridade das pautas do calendário de Conteúdo (antes a tela mostrava "Prioridade alterada" mas não gravava).
alter table public.marketing_content add column if not exists priority text not null default 'Média';
alter table public.marketing_content drop constraint if exists marketing_content_priority_check;
alter table public.marketing_content add constraint marketing_content_priority_check check (priority in ('Alta','Média','Baixa'));
