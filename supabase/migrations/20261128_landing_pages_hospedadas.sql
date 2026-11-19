-- Landing pages criadas dentro do sistema (link /p/<id>): conteúdo editável e marca de "hospedada".
alter table public.marketing_landing_pages add column if not exists hospedada boolean not null default false;
alter table public.marketing_landing_pages add column if not exists conteudo jsonb not null default '{}'::jsonb;
