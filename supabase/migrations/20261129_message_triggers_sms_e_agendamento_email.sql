-- Gatilhos de mensagem por SMS (Twilio/Zenvia cadastrados em Integrações).
alter table public.tenant_message_triggers drop constraint if exists tenant_message_triggers_canal_check;
alter table public.tenant_message_triggers add constraint tenant_message_triggers_canal_check check (canal in ('whatsapp','email','sms'));

-- Campanhas de e-mail agendadas: saem no disparo automático diário a partir da data escolhida.
alter table public.email_campaigns add column if not exists agendada_para timestamptz;
