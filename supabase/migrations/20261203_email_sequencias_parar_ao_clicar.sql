-- Sequência de e-mails: parar de enviar para quem já clicou em algum link (já demonstrou interesse).
alter table public.email_sequences add column if not exists parar_ao_clicar boolean not null default false;
