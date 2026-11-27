-- Limite mensal de IA dos planos (antes: 1.000, 10.000 e 10.000 tokens) e reativação dos 13 adicionais e módulos.
-- Autorizado pelo dono em 27/11/2026 e aplicado no banco de produção nesse dia.
do $do$
declare
  spy constant uuid := '27ef95ee-84dd-499e-9f25-cd9baecb5fe4';
begin
  update subscription_plans set ai_monthly_tokens = case code when 'start' then 12000000 when 'autopilot' then 20000000 when 'autonomous' then 40000000 end, updated_at = now()
  where code in ('start', 'autopilot', 'autonomous');
  update products set active = true where tenant_id = spy and (sku like 'SPY-ADD-%' or sku like 'SPY-MOD-%') and deleted_at is null;
end
$do$;
