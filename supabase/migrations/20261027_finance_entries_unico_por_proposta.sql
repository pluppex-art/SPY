-- Aceitar uma proposta gera contrato + lançamentos no financeiro. O contrato já tinha índice
-- único por proposta (contracts_proposal_id_unique); os lançamentos não, e duas abas/usuários
-- (ou excluir o contrato de uma proposta aceita) podiam duplicar as cobranças.
-- Cada lançamento gerado por proposta tem descrição própria (mensalidade 3/12, parcela 2/4,
-- entrada…), então (proposal_id, description) identifica o lançamento e vira trava única.
create unique index if not exists finance_entries_proposal_description_unique
  on public.finance_entries (proposal_id, description)
  where proposal_id is not null;
