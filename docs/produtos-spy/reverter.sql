-- Desfaz 2026-11-27-planos-por-usuario.sql: devolve produtos, planos e checkout ao que estava e desativa os adicionais novos.
begin;
with b as (select value from app_settings where tenant_id = '27ef95ee-84dd-499e-9f25-cd9baecb5fe4' and key = 'backup_produtos_20261127'),
     p as (select r.* from b, jsonb_populate_recordset(null::products, b.value->'products') r)
update products x set name = p.name, description = p.description, type = p.type, category = p.category, price = p.price,
  is_recurring = p.is_recurring, recurring_period = p.recurring_period, tags = p.tags, type_attributes = p.type_attributes
from p where x.id = p.id;
with b as (select value from app_settings where tenant_id = '27ef95ee-84dd-499e-9f25-cd9baecb5fe4' and key = 'backup_produtos_20261127'),
     s as (select r.* from b, jsonb_populate_recordset(null::subscription_plans, b.value->'plans') r)
update subscription_plans x set name = s.name, tagline = s.tagline, features_header = s.features_header, features = s.features, cta_text = s.cta_text,
  badge = s.badge, highlight = s.highlight, sort_order = s.sort_order, limits = s.limits, modules = s.modules, price_cents = s.price_cents,
  setup_price_cents = s.setup_price_cents, billing_interval = s.billing_interval, active = s.active, updated_at = now()
from s where x.id = s.id;
update checkout_config set single_plan_code = (select value->'checkout'->>'single_plan_code' from app_settings where tenant_id = '27ef95ee-84dd-499e-9f25-cd9baecb5fe4' and key = 'backup_produtos_20261127') where id = 'main';
update products set active = false where tenant_id = '27ef95ee-84dd-499e-9f25-cd9baecb5fe4' and (sku like 'SPY-ADD-%' or sku like 'SPY-MOD-%');
commit;
