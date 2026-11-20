-- Financeiro: Folha e Equipe, Comissões de vendedores, dados das contas bancárias e campos novos
-- em cobranças/adiantamentos/acordos. 100% aditivo (create if not exists / add column if not exists):
-- nenhum dado existente é alterado ou apagado.

-- ───────────── Contas bancárias: dados da conta + preparo para conexão automática ─────────────
alter table public.finance_bank_accounts
  add column if not exists banco text,
  add column if not exists agencia text,
  add column if not exists numero_conta text,
  add column if not exists titular text,
  add column if not exists documento text,
  add column if not exists chave_pix text,
  add column if not exists conexao_status text not null default 'Manual',
  add column if not exists conexao_provedor text,
  add column if not exists ultima_sincronizacao timestamptz;

-- ───────────── Histórico de cobranças ─────────────
alter table public.finance_cobranca_historico
  add column if not exists valor_cobrado numeric(15,2) not null default 0,
  add column if not exists proximo_contato date,
  add column if not exists responsavel text;

-- ───────────── Adiantamentos ─────────────
alter table public.finance_adiantamentos
  add column if not exists tipo text not null default 'Adiantamento',
  add column if not exists parcelas integer not null default 1,
  add column if not exists parcelas_descontadas integer not null default 0,
  add column if not exists forma_pagamento text;

-- ───────────── Acordos, descontos e permutas ─────────────
alter table public.finance_acordos
  add column if not exists contraparte_tipo text not null default 'Cliente',
  add column if not exists valor_original numeric(15,2) not null default 0,
  add column if not exists parcelas integer not null default 1,
  add column if not exists data_vencimento date,
  add column if not exists contrapartida text,
  add column if not exists entregue boolean not null default false;

-- ───────────── Funcionários (cadastro e salário) ─────────────
create table if not exists public.finance_funcionarios (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  nome text not null,
  cargo text,
  tipo_contrato text not null default 'CLT',
  salario_base numeric(15,2) not null default 0,
  dia_pagamento integer not null default 5 check (dia_pagamento between 1 and 31),
  chave_pix text,
  data_admissao date,
  status text not null default 'Ativo' check (status in ('Ativo','Afastado','Desligado')),
  colaborador_id text,
  observacao text,
  created_at timestamptz not null default now()
);

-- ───────────── Folha: pagamento de cada funcionário por competência (YYYY-MM) ─────────────
create table if not exists public.finance_folha_pagamentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  funcionario_id uuid not null references public.finance_funcionarios(id) on delete cascade,
  competencia text not null,
  salario numeric(15,2) not null default 0,
  adicionais numeric(15,2) not null default 0,
  descontos numeric(15,2) not null default 0,
  adiantamentos numeric(15,2) not null default 0,
  liquido numeric(15,2) not null default 0,
  status text not null default 'Pendente' check (status in ('Pendente','Pago')),
  data_pagamento date,
  entry_id text,
  observacao text,
  created_at timestamptz not null default now(),
  unique (funcionario_id, competencia)
);

-- ───────────── Comissões de vendedores: regras e lançamentos ─────────────
create table if not exists public.finance_comissao_regras (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  vendedor text not null,
  percentual numeric(5,2) not null default 0,
  meta_mensal numeric(15,2) not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists finance_comissao_regras_vendedor_uniq on public.finance_comissao_regras (tenant_id, lower(vendedor));

create table if not exists public.finance_comissoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  vendedor text not null,
  competencia text not null,
  referencia text,
  descricao text,
  cliente text,
  valor_venda numeric(15,2) not null default 0,
  percentual numeric(5,2) not null default 0,
  valor_comissao numeric(15,2) not null default 0,
  status text not null default 'Pendente' check (status in ('Pendente','Aprovada','Paga','Cancelada')),
  data_pagamento date,
  entry_id text,
  created_at timestamptz not null default now()
);
-- uma comissão por venda/proposta (impede gerar duas vezes)
create unique index if not exists finance_comissoes_referencia_uniq on public.finance_comissoes (tenant_id, referencia) where referencia is not null;

-- ───────────── Índices + RLS (isolamento por empresa) nas tabelas novas ─────────────
do $$
declare t text;
begin
  foreach t in array array['finance_funcionarios','finance_folha_pagamentos','finance_comissao_regras','finance_comissoes'] loop
    execute format('create index if not exists idx_%s_tenant on public.%I (tenant_id)', t, t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke select on public.%I from anon', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($p$create policy tenant_isolation on public.%I for all to authenticated
      using (tenant_id = public.current_tenant_id() or public.is_super_admin())
      with check (tenant_id = public.current_tenant_id() or public.is_super_admin())$p$, t);
  end loop;
end $$;
