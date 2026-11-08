-- =============================================================
-- Hardening (auditoria nov/2026) — idempotente.
-- Aplicar manualmente no SQL Editor do Supabase.
-- =============================================================

-- 1) Funções SECURITY DEFINER que NÃO precisam ser chamáveis por anon.
--    Usadas só em policies de role `authenticated` (vendedor_escopo_*) ou em chamadas de usuário logado.
REVOKE EXECUTE ON FUNCTION public.user_has_module_access(text)          FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_tenant_admin_or_master()           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.lead_e_do_usuario(text, uuid)         FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.usuario_nome_atual()                  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.usuario_restrito_aos_proprios_dados() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.user_has_module_access(text)          TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.is_tenant_admin_or_master()           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.lead_e_do_usuario(text, uuid)         TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.usuario_nome_atual()                  TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.usuario_restrito_aos_proprios_dados() TO authenticated, service_role;

-- NÃO revogadas de anon (decisão consciente — revogar QUEBRARIA o acesso anon):
--  * has_tenant_access, is_super_admin, current_tenant_id, current_partner_id, is_own_tenant_or_super_admin:
--    são avaliadas dentro de policies com role PUBLIC (a maioria das `tenant_isolation`, ~130 tabelas).
--    Sem EXECUTE, qualquer consulta/INSERT anon nessas tabelas (ex.: formulário público do E-EMPREENDA+
--    inserindo em leads) falharia com "permission denied for function" em vez de simplesmente ser negada.
--    Elas só leem auth.uid() (nulo para anon) e retornam false/null, sem expor dados.
--    Para fechar de vez: trocar essas policies para `TO authenticated` tabela a tabela e só então revogar.
--  * claim_next_form_sdr(uuid): chamada como anon pelo formulário público do E-EMPREENDA+ (supabase.rpc);
--    já é escopada ao tenant fixo do formulário (migration 20260903).
--  * get_public_catalog(uuid), get_public_imovel(uuid), get_public_corretor_portfolio(text),
--    get_public_proposal(text): públicas POR DESIGN (vitrine, imóvel, portfólio e proposta por token).

-- 2) search_path fixo nas funções que estavam sem (evita sequestro de schema).
ALTER FUNCTION public.leads_phone_vs_contatos_guard()          SET search_path = public;
ALTER FUNCTION public.spy__parse_notes(text)                   SET search_path = public;
ALTER FUNCTION public.buscar_lead_por_telefone(uuid, text)     SET search_path = public;

-- 3) Policies anon de INSERT hardcoded (tenant 27ef95ee-…) em leads, tasks, julia_interaction_log e
--    lead_commercial_memory: MANTIDAS. Motivo: o comentário de 20260901_tighten_anon_rls_policies.sql
--    documenta que o formulário público do E-EMPREENDA+ (site externo, fora deste repo) insere leads
--    direto via chave anon; /api/public/lead-capture grava no tenant SPY_FORM_TENANT_ID (site do S.P.Y.)
--    e NÃO cobre esse caso. Remover só depois de migrar o E-EMPREENDA+ para um endpoint de servidor.
--    Policies: public_insert_leads_e_empreenda, public_insert_tasks_e_empreenda,
--    public_insert_julia_interaction_log_e_empreenda, public_insert_lead_commercial_memory_e_empreenda.
