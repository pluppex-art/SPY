-- 20260924_f_finance_bucket_private.sql
-- Lead c06 (auditoria SPY): bucket `finance` (anexos financeiros) passa a PRIVADO.
-- Pré-requisito: frontend com URL assinada (FinanceiroAnexosTab.tsx) já publicado.
-- A policy finance_bucket_read (20260924_d) já limita a leitura à pasta do próprio tenant.
-- `proposals` permanece público de propósito: o PDF é enviado ao cliente por link público (PropostaPublica).
-- Rollback: update storage.buckets set public = true where id = 'finance';
update storage.buckets set public = false where id = 'finance';
