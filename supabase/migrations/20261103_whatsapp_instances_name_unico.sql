-- O nome da instância é o nome da sessão no gateway WAHA (compartilhado entre empresas): precisa ser único no sistema todo,
-- senão uma empresa poderia registrar o nome da sessão de outra e ler as conversas dela (já aplicado em produção em 2026-11-03).
create unique index if not exists whatsapp_instances_name_key on public.whatsapp_instances (name);
