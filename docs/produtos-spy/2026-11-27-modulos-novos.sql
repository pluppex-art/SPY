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
