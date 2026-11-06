-- Registro do aceite do aviso de conexao nao oficial do WhatsApp (feito ao ler o QR).
alter table public.whatsapp_instances
  add column if not exists risk_accepted_at timestamptz,
  add column if not exists risk_accepted_by uuid;
comment on column public.whatsapp_instances.risk_accepted_at is 'Quando a pessoa aceitou o aviso de conexao nao oficial do WhatsApp (risco de limitacao/banimento) ao parear o QR.';
comment on column public.whatsapp_instances.risk_accepted_by is 'auth.users.id de quem aceitou o aviso.';
