-- Independente do método: fecha a tabela de backup que hoje pode ser lida e alterada com a chave pública.
-- Não apaga nada. Aplicada em 27/11/2026.
alter table public.ai_usage_log_bkp_20261118 enable row level security;
revoke all on public.ai_usage_log_bkp_20261118 from anon, authenticated;
