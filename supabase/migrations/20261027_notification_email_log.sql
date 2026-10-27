-- Controle de e-mails de aviso já enviados (lembretes por horário não podem repetir).
-- Só o servidor (service role) lê/escreve: RLS ligada e nenhuma policy.
create table if not exists public.notification_email_log (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dedupe_key text not null,
  sent_at timestamptz not null default now(),
  primary key (tenant_id, dedupe_key)
);
alter table public.notification_email_log enable row level security;
create index if not exists idx_notification_email_log_sent_at on public.notification_email_log (sent_at);
