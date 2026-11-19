-- Formulários criados dentro do sistema (com link próprio /form/<id>): campos, mensagem final e marca de "hospedado".
alter table public.marketing_forms add column if not exists hospedado boolean not null default false;
alter table public.marketing_forms add column if not exists campos jsonb not null default '[]'::jsonb;
alter table public.marketing_forms add column if not exists mensagem_sucesso text;
