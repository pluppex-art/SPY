-- O chatbot passa a ser um módulo/agente vendido à parte (tenants.modules.chatbot). Quem já criou chatbot não perde o acesso:
-- liga o módulo para as empresas que já têm algum chatbot cadastrado. Reexecutável.
update public.tenants
   set modules = coalesce(modules, '{}'::jsonb) || '{"chatbot": true}'::jsonb
 where id in (select distinct tenant_id from public.chatbots)
   and coalesce((modules ->> 'chatbot')::boolean, false) is not true;
