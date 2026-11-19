-- Por que o e-mail está bloqueado: pediu para sair, foi bloqueado à mão, ou o endereço não existe (devolução definitiva).
alter table public.email_optouts add column if not exists motivo text;
