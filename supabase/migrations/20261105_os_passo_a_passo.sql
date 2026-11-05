-- Passo a passo (backlog) por departamento da OS.
--   os_modelos_passos -> modelo editável de cada departamento (Dev, Tráfego, Conteúdo, Serviços...).
--   os_passos         -> os passos de CADA OS (copiados do modelo quando a OS nasce), com responsável e andamento.
create table if not exists public.os_modelos_passos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id() references public.tenants(id) on delete cascade,
  departamento_id uuid not null references public.os_departamentos(id) on delete cascade,
  posicao int not null default 0,
  titulo text not null,
  descricao text,
  created_at timestamptz not null default now()
);
create index if not exists idx_os_modelos_passos_dep on public.os_modelos_passos (departamento_id, posicao);
create index if not exists idx_os_modelos_passos_tenant on public.os_modelos_passos (tenant_id);

create table if not exists public.os_passos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id() references public.tenants(id) on delete cascade,
  ordem_id uuid not null references public.ordens_servico(id) on delete cascade,
  posicao int not null default 0,
  titulo text not null,
  descricao text,
  status text not null default 'A fazer' check (status in ('A fazer', 'Em andamento', 'Feito')),
  responsavel_id text,
  responsavel_nome text,
  prazo date,
  concluido_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_os_passos_ordem on public.os_passos (ordem_id, posicao);
create index if not exists idx_os_passos_tenant on public.os_passos (tenant_id);
create index if not exists idx_os_passos_responsavel on public.os_passos (tenant_id, responsavel_id) where responsavel_id is not null;

alter table public.os_modelos_passos enable row level security;
alter table public.os_passos enable row level security;
do $$
declare t text;
begin
  foreach t in array array['os_modelos_passos', 'os_passos'] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'tenant_isolation') then
      execute format('create policy tenant_isolation on public.%I for all using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id))', t);
    end if;
  end loop;
end $$;
revoke select on public.os_modelos_passos from anon;
revoke select on public.os_passos from anon;

-- Quando uma OS nasce num departamento, ganha os passos do modelo (qualquer caminho: automação, tela, importação).
-- Nunca derruba a criação da OS.
create or replace function public.trg_os_copiar_passos()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.departamento_id is not null then
    insert into public.os_passos (tenant_id, ordem_id, posicao, titulo, descricao)
    select new.tenant_id, new.id, m.posicao, m.titulo, m.descricao
    from public.os_modelos_passos m
    where m.departamento_id = new.departamento_id
    order by m.posicao;
  end if;
  return new;
exception when others then
  return new;
end;
$function$;
revoke all on function public.trg_os_copiar_passos() from public, anon, authenticated;

drop trigger if exists trg_os_copiar_passos on public.ordens_servico;
create trigger trg_os_copiar_passos after insert on public.ordens_servico
  for each row execute function public.trg_os_copiar_passos();
