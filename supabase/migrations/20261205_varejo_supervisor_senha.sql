-- Senha de supervisor do PDV (Varejo): quem opera o caixa precisa dela para remover item ou cancelar a venda.
-- Só o hash fica no banco, e a tabela é invisível para o navegador: RLS ligada e NENHUMA policy
-- (deny total para anon/authenticated). Definir e conferir a senha só acontece nas rotas
-- /api/varejo/supervisor-senha do backend, via service_role.
create table if not exists public.varejo_supervisor_senha (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  senha_hash text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);

comment on table public.varejo_supervisor_senha is 'Hash (scrypt) da senha de supervisor do PDV, uma por empresa. Sem policy de proposito: só service_role lê e escreve.';

alter table public.varejo_supervisor_senha enable row level security;
