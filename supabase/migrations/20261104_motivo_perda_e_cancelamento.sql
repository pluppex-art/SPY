-- Motivo de perda do lead e de cancelamento do contrato (aba Ruptura da Central de Receita).
-- Colunas opcionais: registros existentes ficam com NULL ("sem motivo registrado").
alter table public.leads     add column if not exists lost_reason   text;
alter table public.contracts add column if not exists cancel_reason text;

comment on column public.leads.lost_reason     is 'Motivo informado quando o lead vira Perdido/Desqualificado.';
comment on column public.contracts.cancel_reason is 'Motivo informado quando o contrato é Cancelado.';
