-- WhatsApp: escrita em whatsapp_instances só para admin do tenant/master; leitura segue para membros do tenant.
-- (O servidor já exige admin em POST/PUT/DELETE /api/whatsapp/instances; pareamento por colaborador
-- grava status/qrcode via service role.) Idempotente.
DROP POLICY IF EXISTS tenant_isolation ON public.whatsapp_instances;
DROP POLICY IF EXISTS whatsapp_instances_select ON public.whatsapp_instances;
DROP POLICY IF EXISTS whatsapp_instances_insert_admin ON public.whatsapp_instances;
DROP POLICY IF EXISTS whatsapp_instances_update_admin ON public.whatsapp_instances;
DROP POLICY IF EXISTS whatsapp_instances_delete_admin ON public.whatsapp_instances;

CREATE POLICY whatsapp_instances_select ON public.whatsapp_instances
  FOR SELECT TO authenticated
  USING ((SELECT public.has_tenant_access(tenant_id)));

CREATE POLICY whatsapp_instances_insert_admin ON public.whatsapp_instances
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.has_tenant_access(tenant_id)) AND (SELECT public.is_tenant_admin_or_master()));

CREATE POLICY whatsapp_instances_update_admin ON public.whatsapp_instances
  FOR UPDATE TO authenticated
  USING ((SELECT public.has_tenant_access(tenant_id)) AND (SELECT public.is_tenant_admin_or_master()))
  WITH CHECK ((SELECT public.has_tenant_access(tenant_id)) AND (SELECT public.is_tenant_admin_or_master()));

CREATE POLICY whatsapp_instances_delete_admin ON public.whatsapp_instances
  FOR DELETE TO authenticated
  USING ((SELECT public.has_tenant_access(tenant_id)) AND (SELECT public.is_tenant_admin_or_master()));

-- Índice da caixa de entrada (ORDER BY last_message_at DESC por tenant, paginação por cursor).
CREATE INDEX IF NOT EXISTS idx_chat_contacts_tenant_last_message
  ON public.chat_contacts (tenant_id, last_message_at DESC NULLS LAST);
