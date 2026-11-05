-- Uma pessoa pode ter mais de uma área/cargo (ex.: Administrador + Dev, Administrador + Closer).
-- As permissões da pessoa são a soma dos cargos. Vazio = vale o cargo do login (users.role), como antes.
alter table public.colaboradores add column if not exists cargos text[] not null default '{}';
comment on column public.colaboradores.cargos is 'Cargos/áreas da pessoa (ex.: Administrador + Dev). Vazio = vale o cargo do login (users.role). As permissões são a soma dos cargos.';
