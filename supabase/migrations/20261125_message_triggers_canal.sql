-- Canal de envio dos Gatilhos de mensagem (WhatsApp pelo n8n/Júlia, ou e-mail enviado pelo próprio sistema).
alter table public.tenant_message_triggers add column if not exists canal text not null default 'whatsapp';
alter table public.tenant_message_triggers drop constraint if exists tenant_message_triggers_canal_check;
alter table public.tenant_message_triggers add constraint tenant_message_triggers_canal_check check (canal in ('whatsapp','email'));
