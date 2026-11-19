-- Financeiro: módulos de gestão genéricos (valem para qualquer tipo de empresa).
-- Só cria tabelas novas (aditivo). Lançamentos continuam em finance_entries — estas
-- tabelas guardam o que não é lançamento: promessas, metas, reservas, adiantamentos,
-- acordos/permutas, patrocínios e viagens/eventos.

-- Promessas de pagamento (cobrança)
create table if not exists public.finance_promessas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  cliente text not null,
  valor numeric(15,2) not null default 0,
  data_prometida date not null,
  status text not null default 'Pendente' check (status in ('Pendente','Cumprida','Quebrada')),
  observacao text,
  created_at timestamptz not null default now()
);

-- Histórico de cobranças (WhatsApp / e-mail / ligação)
create table if not exists public.finance_cobranca_historico (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  cliente text not null,
  canal text not null default 'WhatsApp' check (canal in ('WhatsApp','E-mail','Ligação','Presencial')),
  data_contato date not null default current_date,
  mensagem text,
  resultado text,
  created_at timestamptz not null default now()
);

-- Metas por produto / vendedor / projeto (mês YYYY-MM)
create table if not exists public.finance_metas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  nome text not null,
  tipo text not null default 'Produto' check (tipo in ('Produto','Vendedor','Projeto','Geral')),
  mes text not null,
  valor_meta numeric(15,2) not null default 0,
  valor_realizado numeric(15,2) not null default 0,
  created_at timestamptz not null default now()
);

-- Reservas financeiras (operacional, por projeto/evento, comprometidas)
create table if not exists public.finance_reservas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  nome text not null,
  tipo text not null default 'Operacional' check (tipo in ('Operacional','Projeto/Evento','Comprometida')),
  valor_meta numeric(15,2) not null default 0,
  saldo_atual numeric(15,2) not null default 0,
  observacao text,
  created_at timestamptz not null default now()
);

-- Adiantamentos de funcionários / sócios
create table if not exists public.finance_adiantamentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  pessoa text not null,
  valor numeric(15,2) not null default 0,
  data_adiantamento date not null default current_date,
  desconto_em text,
  status text not null default 'Em aberto' check (status in ('Em aberto','Descontado')),
  observacao text,
  created_at timestamptz not null default now()
);

-- Acordos, descontos e permutas (clientes, funcionários, parceiros)
create table if not exists public.finance_acordos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  pessoa text not null,
  tipo text not null default 'Acordo' check (tipo in ('Acordo','Desconto','Permuta')),
  descricao text,
  valor numeric(15,2) not null default 0,
  status text not null default 'Em andamento' check (status in ('Em andamento','Concluído','Cancelado')),
  data_acordo date not null default current_date,
  created_at timestamptz not null default now()
);

-- Patrocínios e permutas de eventos/projetos
create table if not exists public.finance_patrocinios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  patrocinador text not null,
  projeto text,
  valor_total numeric(15,2) not null default 0,
  valor_recebido numeric(15,2) not null default 0,
  contrapartidas text,
  entregue boolean not null default false,
  status text not null default 'Negociando' check (status in ('Negociando','Fechado','Recebido','Cancelado')),
  created_at timestamptz not null default now()
);

-- Viagens e eventos (planejamento e prestação de contas)
create table if not exists public.finance_viagens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  nome text not null,
  destino text,
  data_inicio date,
  valor_orcado numeric(15,2) not null default 0,
  valor_gasto numeric(15,2) not null default 0,
  prestacao_contas boolean not null default false,
  observacao text,
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array[
    'finance_promessas','finance_cobranca_historico','finance_metas','finance_reservas',
    'finance_adiantamentos','finance_acordos','finance_patrocinios','finance_viagens'
  ] loop
    execute format('create index if not exists idx_%s_tenant on public.%I (tenant_id)', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke select on public.%I from anon', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($p$create policy tenant_isolation on public.%I for all to authenticated
      using (tenant_id = public.current_tenant_id() or public.is_super_admin())
      with check (tenant_id = public.current_tenant_id() or public.is_super_admin())$p$, t);
  end loop;
end $$;
