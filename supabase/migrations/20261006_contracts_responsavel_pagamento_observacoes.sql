-- Campos novos pedidos na modal "Editar Contrato" (src/pages/crm/Contracts.tsx
-- e src/pages/crm/Propostas.tsx), nenhum deles existia antes:
--   responsavel_id   -> colaborador interno responsável pelo contrato (FK real,
--                       diferente de contracts.user_id, que aponta pra `users`
--                       — a tabela de LOGIN, não de colaboradores; a maioria dos
--                       colaboradores reais não tem conta de login própria).
--   payment_method   -> forma de pagamento combinada (Boleto/PIX/Cartão/
--                       Transferência) — proposals.pagamento.metodos[] existe,
--                       mas é multi-select e só existe quando o contrato nasceu
--                       de proposta; contrato criado manualmente nunca teria
--                       esse dado sem uma coluna própria.
--   observacoes      -> campo de texto livre maior, separado de `description`
--                       (usado na geração do título) e de `notes` (reservado
--                       pro parsing de cliente/plano em rowToContract).
alter table public.contracts
  add column if not exists responsavel_id text references public.colaboradores(id) on delete set null,
  add column if not exists payment_method text,
  add column if not exists observacoes text;

create index if not exists idx_contracts_responsavel on public.contracts (responsavel_id) where responsavel_id is not null;

-- Backfill pontual: contrato que já nasceu de uma proposta com forma de
-- pagamento escolhida herda o primeiro método marcado — só preenche quando
-- o contrato ainda não tem nada gravado (nunca sobrescreve edição manual).
update public.contracts c
set payment_method = p.pagamento->'metodos'->>0
from public.proposals p
where c.proposal_id = p.id
  and c.payment_method is null
  and p.pagamento is not null
  and jsonb_typeof(p.pagamento->'metodos') = 'array'
  and jsonb_array_length(p.pagamento->'metodos') > 0;

revoke select on public.contracts from anon;
