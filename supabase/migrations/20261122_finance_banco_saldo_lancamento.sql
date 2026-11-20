-- Conexão com bancos, parte 2: saldo informado pelo banco e vínculo do extrato com a conta e com o lançamento.
-- Aditivo (add column if not exists): nada existente é alterado ou apagado.

-- Saldo que o BANCO informou na última sincronização (cartão de crédito: dívida, em valor negativo).
-- O saldo do sistema continua vindo dos lançamentos; esta coluna só permite comparar e "acertar com o banco".
alter table public.finance_bank_accounts
  add column if not exists saldo_banco numeric(15,2),
  add column if not exists saldo_banco_em timestamptz;

-- Cada linha de extrato passa a apontar para a conta de onde veio (antes só havia o nome em "banco")
-- e, quando conciliada ou lançada, para o lançamento do financeiro.
alter table public.finance_extratos_importados
  add column if not exists conta_bancaria_id uuid references public.finance_bank_accounts(id) on delete set null,
  add column if not exists lancamento_id text;

create index if not exists idx_finance_extratos_conta on public.finance_extratos_importados (tenant_id, conta_bancaria_id);
create index if not exists idx_finance_extratos_lancamento on public.finance_extratos_importados (tenant_id, lancamento_id) where lancamento_id is not null;
