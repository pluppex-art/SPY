-- Teste A/B de assunto no e-mail em massa: segundo assunto na campanha e variante (a/b) em cada destinatário.
alter table public.email_campaigns add column if not exists subject_b text;
alter table public.email_campaign_recipients add column if not exists variant text;
