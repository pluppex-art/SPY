-- Entrada automática na sequência: novos leads (a partir da data de ativação) que combinem com os filtros entram sozinhos.
alter table public.email_sequences add column if not exists auto jsonb;  -- null = desligado; { sources, statuses, canais, desde }
