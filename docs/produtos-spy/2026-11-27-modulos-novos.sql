-- Aplicado em 27/11/2026 no tenant SPY | IA, com autorização: 8 produtos novos e o "Módulo de segmento" genérico
-- desativado. Todos Digital/Interno, mensais, R$ 197,00. Os dados ficam no cadastro de produtos.
--   SPY-MOD-IMOBILIARIA, -AUTOMOTIVO, -VAREJO, -SOLAR, -CLINICA, -EDUCACAO  (implantação R$ 1.200,00)
--   SPY-ADD-CLOSER, SPY-ADD-CS                                              (implantação R$ 900,00)

-- Para desfazer (os produtos novos são desativados, não apagados):
update products set active = false, updated_at = now()
 where tenant_id = '27ef95ee-84dd-499e-9f25-cd9baecb5fe4'
   and sku in ('SPY-MOD-IMOBILIARIA','SPY-MOD-AUTOMOTIVO','SPY-MOD-VAREJO','SPY-MOD-SOLAR','SPY-MOD-CLINICA','SPY-MOD-EDUCACAO','SPY-ADD-CLOSER','SPY-ADD-CS');
update products set active = true, updated_at = now()
 where tenant_id = '27ef95ee-84dd-499e-9f25-cd9baecb5fe4' and sku = 'SPY-MOD-SEGMENTO';

-- Também aplicado, com autorização: texto de preços lido pela IA (type_attributes.ia_planos_valores) em
-- IMPL-AUTONOMOUS, IMPL-AUTOPILOT, PROD-1410, PROD-3567, SPY-AUTONOMOUS e SPY-AUTOPILOT, com os seis segmentos,
-- Closer, Sucesso do Cliente e o desconto do anual.
-- Para desfazer esse texto:
update products set type_attributes = jsonb_set(type_attributes, '{ia_planos_valores}', to_jsonb(
    replace(replace(type_attributes->>'ia_planos_valores',
      'Imobiliária R$ 197,00; Automotivo R$ 197,00; Varejo R$ 197,00; Energia Solar R$ 197,00; Clínica R$ 197,00; Educação R$ 197,00.' || E'\n' ||
      'No plano anual, pago de uma vez, a mensalidade, os adicionais e os módulos têm 20% de desconto; a implementação não muda.',
      'módulo de segmento R$ 197,00.'),
      '; Agente Closer R$ 197,00; Sucesso do Cliente R$ 197,00.', '.'))), updated_at = now()
 where tenant_id = '27ef95ee-84dd-499e-9f25-cd9baecb5fe4'
   and sku in ('IMPL-AUTONOMOUS','IMPL-AUTOPILOT','PROD-1410','PROD-3567','SPY-AUTONOMOUS','SPY-AUTOPILOT');
