-- Remove o gatilho que chamava o webhook do agente de implementacao (n8n) a cada INSERT em tenants.
-- Motivo: os dois caminhos que criam empresas (checkout em server/checkout.ts e o cadastro do administrador em
-- server.ts /admin/tenant) JA chamam o mesmo webhook, com e-mail e telefone reais. O gatilho chamava de novo com
-- e-mail/telefone vazios, e cada empresa nova ficava com os agentes duplicados (12 em vez de 6). O gatilho
-- tambem guardava o segredo do webhook escrito dentro da funcao. Idempotente.
drop trigger if exists trg_provisionar_tenant_novo on public.tenants;
drop function if exists public.trigger_provisionar_tenant_novo();
