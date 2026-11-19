-- Aberturas e cliques do e-mail em massa (rastreio por destinatário + totais na campanha).
alter table public.email_campaign_recipients add column if not exists opened_at timestamptz;
alter table public.email_campaign_recipients add column if not exists clicked_at timestamptz;
alter table public.email_campaign_recipients add column if not exists open_count integer not null default 0;
alter table public.email_campaign_recipients add column if not exists click_count integer not null default 0;
alter table public.email_campaigns add column if not exists opened integer not null default 0;
alter table public.email_campaigns add column if not exists clicked integer not null default 0;
