-- Prioridade das pautas do calendário de Conteúdo (antes a tela mostrava "Prioridade alterada" mas não gravava).
alter table public.marketing_content add column if not exists priority text not null default 'Média';
alter table public.marketing_content drop constraint if exists marketing_content_priority_check;
alter table public.marketing_content add constraint marketing_content_priority_check check (priority in ('Alta','Média','Baixa'));

-- Dados de cada pauta que antes só viviam na tela: checklist, roteiro, hashtags, links de referência e anexos.
alter table public.marketing_content add column if not exists extras jsonb not null default '{}'::jsonb;
