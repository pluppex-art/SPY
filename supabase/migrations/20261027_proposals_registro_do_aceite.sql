-- Registro de quem aceitou a proposta pela página pública (nome, documento, IP e data/hora).
-- Antes o aceite só virava status "Aceita", sem rastro de quem aceitou.
alter table public.proposals
  add column if not exists aceite_nome text,
  add column if not exists aceite_documento text,
  add column if not exists aceite_ip text,
  add column if not exists aceite_em timestamptz;
