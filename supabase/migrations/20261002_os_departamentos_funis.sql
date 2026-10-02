-- Ordem de Serviço (OS) como hub operacional multi-departamento.
--
-- A tabela public.ordens_servico JÁ EXISTE (migration 20260925151437) com o
-- modelo de OS comercial (cliente, valores, status Rascunho..Faturada) e o
-- trigger de numeração por tenant. Esta migration NÃO recria nem altera nada
-- do que existe: só acrescenta colunas opcionais, para a mesma OS poder
-- também percorrer o funil configurado de um departamento.
--
--   os_departamentos -> áreas da empresa (Dev, Tráfego, Implementação...),
--                       cadastráveis por tenant.
--   os_funis         -> funil de cada departamento. Etapas em JSONB com id
--                       ESTÁVEL ({id,nome,cor,iniciarMinimizado,tipo}): renomear
--                       ou reordenar etapa nunca remapeia as OS (diferente de
--                       crm_funis, onde o id da etapa é derivado da posição).
--   ordens_servico   -> ganha departamento_id/funil_id/etapa_id. O `status`
--                       legado continua sendo mantido a partir do tipo da etapa.

create table if not exists public.os_departamentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id() references public.tenants(id),
  nome text not null,
  cor text not null default 'blue',
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.os_funis (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default current_tenant_id() references public.tenants(id),
  departamento_id uuid not null references public.os_departamentos(id) on delete cascade,
  nome text not null,
  -- [{ "id": "etp_x", "nome": "Briefing", "cor": "blue", "iniciarMinimizado": false,
  --    "tipo": "aberta" | "concluida" | "cancelada" }]
  etapas jsonb not null default '[]'::jsonb,
  padrao boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- No máximo um funil padrão por departamento (é nele que as OS novas entram).
create unique index if not exists uq_os_funis_padrao_por_departamento
  on public.os_funis (departamento_id) where padrao;
create index if not exists idx_os_departamentos_tenant on public.os_departamentos (tenant_id);
create index if not exists idx_os_funis_tenant on public.os_funis (tenant_id);

-- Colunas novas, todas opcionais: OS antigas (sem departamento) continuam válidas.
alter table public.ordens_servico
  add column if not exists departamento_id uuid references public.os_departamentos(id) on delete restrict,
  add column if not exists funil_id uuid references public.os_funis(id) on delete restrict,
  add column if not exists etapa_id text,
  add column if not exists solicitante_nome text,
  -- Campos livres por tipo de OS (orçamento de tráfego, repo do dev etc.).
  add column if not exists campos jsonb not null default '{}'::jsonb,
  -- Vínculo com o item de origem (implementação, lead, tarefa de sprint...).
  add column if not exists origem_tipo text,
  add column if not exists origem_id text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ordens_servico_funil_etapa_chk') then
    alter table public.ordens_servico
      add constraint ordens_servico_funil_etapa_chk
      check ((funil_id is null) = (etapa_id is null) and (funil_id is null or departamento_id is not null));
  end if;
end $$;

create index if not exists idx_ordens_servico_tenant_dep
  on public.ordens_servico (tenant_id, departamento_id) where departamento_id is not null;
create index if not exists idx_ordens_servico_funil on public.ordens_servico (funil_id) where funil_id is not null;
-- Uma OS por item de origem (torna a importação idempotente).
create unique index if not exists uq_ordens_servico_origem
  on public.ordens_servico (tenant_id, origem_tipo, origem_id) where origem_id is not null;

alter table public.os_departamentos enable row level security;
alter table public.os_funis enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['os_departamentos', 'os_funis'] loop
    if not exists (
      select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = 'tenant_isolation'
    ) then
      execute format(
        'create policy tenant_isolation on public.%I for all using (public.has_tenant_access(tenant_id)) with check (public.has_tenant_access(tenant_id))',
        t
      );
    end if;
  end loop;
end $$;
