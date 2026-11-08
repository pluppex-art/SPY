-- Segredos de whatsapp_instances (webhook_secret, api_key).
--
-- NAO foi incluido o REVOKE SELECT (webhook_secret, api_key) ... FROM authenticated porque o back-end
-- (server.ts) le essas colunas com o cliente do USUARIO (role authenticated), via select("*") em
-- whatsapp_instances (ex.: linhas ~5379, 5445, 5710, 5720, 5741) e usa row.webhook_secret ao montar a URL do webhook.
-- Alem disso, webhook_url contem "?secret=<webhook_secret>". Revogar quebraria essas rotas.
-- Quando o server.ts passar a ler esses campos com a service role (e a listar colunas explicitas), aplique o bloco comentado:
--   revoke select on public.whatsapp_instances from authenticated;
--   grant select (id, tenant_id, name, updated_at, phone, status, qrcode, provider, created_at, colaborador_id, ia_agent)
--     on public.whatsapp_instances to authenticated;
-- (REVOKE de coluna sozinho nao funciona quando existe GRANT SELECT na tabela inteira.)

-- Entrega segura agora: view sem segredos (inclui so colunas nao sensiveis; webhook_url fica de fora pois embute o secret).
create or replace view public.whatsapp_instances_safe
  with (security_invoker = true) as
  select id, tenant_id, name, updated_at, phone, status, qrcode, provider, created_at, colaborador_id, ia_agent
    from public.whatsapp_instances;
grant select on public.whatsapp_instances_safe to authenticated;

-- Indices nas FKs de checkout_orders.
create index if not exists checkout_orders_plan_id_idx on public.checkout_orders (plan_id);
create index if not exists checkout_orders_promo_id_idx on public.checkout_orders (promo_id);
