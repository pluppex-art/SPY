-- Planos do S.P.Y. por usuário (3, 5 e 10), implementação recalculada, adicionais e módulos no catálogo.
-- Autorizado pelo dono em 27/11/2026 e aplicado no banco de produção nesse dia.
-- Implementação = horas estimadas x R$ 150 (3 usuários: 20h; 5: 30h; 10: 50h). A hora e as horas são estimativa, não medição.
-- O estado anterior ficou em app_settings, chave 'backup_produtos_20261127' (empresa SPY). Ver reverter.sql.
do $do$
declare
  spy constant uuid := '27ef95ee-84dd-499e-9f25-cd9baecb5fe4';
  tabela constant text := 'Planos do S.P.Y. (mensalidade por quantidade de usuários, R$ 197,00 por usuário): 3 usuários R$ 591,00/mês (implementação R$ 3.000,00) | 5 usuários R$ 985,00/mês (implementação R$ 4.500,00) | 10 usuários R$ 1.970,00/mês (implementação R$ 7.500,00). Acima de 10 usuários: proposta Enterprise.
Adicionais por mês: usuário adicional R$ 197,00; Radar (busca e grupos) R$ 99,90; Agente Secreto Interno R$ 129,90 por agente; Júlia, vendedora de IA, R$ 810,50; acesso extra da Aurora R$ 49,90.
Módulos por mês: Financeiro R$ 149,90; Marketing R$ 149,90; Chatbot R$ 129,90; Equipe e RH R$ 99,90; Engajamento R$ 99,90; BI R$ 99,90; Agendamento online R$ 79,90; módulo de segmento R$ 197,00.
Créditos de IA: pacotes de 10 mil por R$ 199, 30 mil por R$ 497, 75 mil por R$ 997, 150 mil por R$ 1.797 e 300 mil por R$ 2.997.';
  r record;
begin
  insert into app_settings (tenant_id, key, value)
  select spy, 'backup_produtos_20261127', jsonb_build_object(
    'products', (select jsonb_agg(to_jsonb(p)) from products p where p.id in ('526bf3f5-2666-4582-8f4c-d59a39167035','35bdcf7a-5ca7-42da-940a-19d604e6b9cb','377bc485-0894-4d51-afbf-6abf9abf49a8','d79bbdec-be76-4356-a640-03b047ccaf4f','157373ba-eb72-4119-a45b-6790e928f1bb','c1866734-e2e7-444e-8d61-30469e894592')),
    'plans', (select jsonb_agg(to_jsonb(s)) from subscription_plans s),
    'checkout', (select jsonb_build_object('single_plan_code', single_plan_code, 'offer_cents', offer_cents) from checkout_config where id = 'main'))
  on conflict (tenant_id, key) do nothing;

  for r in select * from (values
    ('start', 3, 591, 3000, 20, '591,00', '3.000,00', '526bf3f5-2666-4582-8f4c-d59a39167035'::uuid, '35bdcf7a-5ca7-42da-940a-19d604e6b9cb'::uuid, 1,
     'Para equipes pequenas que querem enxergar cada conversa de venda.', 'Equipes pequenas que vendem pelo WhatsApp e querem enxergar cada conversa de venda.'),
    ('autopilot', 5, 985, 4500, 30, '985,00', '4.500,00', '377bc485-0894-4d51-afbf-6abf9abf49a8'::uuid, 'd79bbdec-be76-4356-a640-03b047ccaf4f'::uuid, 2,
     'Para o time comercial que quer captar e retomar mais oportunidades.', 'Times comerciais que querem captar, retomar e acompanhar as oportunidades no mesmo lugar.'),
    ('autonomous', 10, 1970, 7500, 50, '1.970,00', '7.500,00', '157373ba-eb72-4119-a45b-6790e928f1bb'::uuid, 'c1866734-e2e7-444e-8d61-30469e894592'::uuid, 3,
     'Para operações com vários vendedores e gestão sobre o time inteiro.', 'Operações com vários vendedores que precisam de gestão sobre o time inteiro.')
  ) as d(code, n, mensal, impl, horas, mensal_txt, impl_txt, prod, prod_impl, ordem, tagline, publico)
  loop
    update products set name = format('S.P.Y. | %s usuários', r.n),
      description = format('S.P.Y. para %s usuários: Agente Secreto de Vendas e Aurora para cada pessoa, com CRM, agenda, tarefas e catálogo.', r.n),
      type = 'Digital', category = 'Software', price = r.mensal, is_recurring = true, recurring_period = 'monthly',
      tags = array['spy','plano','assinatura','usuarios','crm','aurora','agente-secreto','licenca'],
      type_attributes = type_attributes || jsonb_build_object(
        'ia_oque_e', format('Plano de %s usuários do S.P.Y., Plataforma de Inteligência e Gestão Empresarial, com quatro pilares: Inteligência, Recuperação, Dados e Gestão. Cada usuário tem o Agente Secreto de Vendas e a Aurora, com CRM, agenda, tarefas e catálogo.', r.n),
        'ia_como_funciona', format(E'O QUE VEM NO PLANO DE %s USUÁRIOS:\n- Agente Secreto de Vendas: acompanha o WhatsApp conectado de cada vendedor e alimenta o funil.\n- Aurora: responde sobre funil, leads, reuniões, tarefas e propostas.\n- CRM, funil e clientes; agenda e tarefas; catálogo; propostas e contratos.\nCONTRATADO À PARTE: Radar, Agente Secreto Interno, Júlia, módulos e pacotes de créditos de IA.\nCOMO COMEÇA: a implementação configura o ambiente, conecta o WhatsApp de cada usuário, treina a equipe e acompanha os primeiros 30 dias.', r.n),
        'ia_planos_valores', format(E'PLANO DE %s USUÁRIOS: R$ %s por mês. Implementação (paga uma vez): R$ %s.\n%s', r.n, r.mensal_txt, r.impl_txt, tabela),
        'ia_para_quem', r.publico,
        'ia_beneficios', 'Informação de venda captada da conversa, negócios parados à vista para retomar, tudo centralizado no CRM e indicadores para o gestor decidir.',
        'ia_objecoes', 'Se o cliente achar caro: compare com as oportunidades que hoje se perdem por falta de resposta e de retomada. A assinatura eletrônica ainda está em desenvolvimento: nunca ofereça como disponível.',
        'isRecurring', true, 'billingCycle', 'Mensal', 'usuarios', r.n)
    where id = r.prod;

    update products set name = format('Implementação S.P.Y. | %s usuários', r.n),
      description = format('Implementação do S.P.Y. no plano de %s usuários (cerca de %s horas): configuração, integrações, treinamento e acompanhamento por 30 dias.', r.n, r.horas),
      price = r.impl,
      type_attributes = type_attributes || jsonb_build_object(
        'ia_como_funciona', format('Implementação do plano de %s usuários, com cerca de %s horas de trabalho: diagnóstico, ambiente, funil e permissões, integrações e importação de dados, Aurora e agentes, WhatsApp e Agente Secreto de cada usuário, treinamento e acompanhamento por 30 dias.', r.n, r.horas),
        'ia_planos_valores', format(E'Implementação do plano de %s usuários: R$ %s, pagamento único (a mensalidade é cobrada à parte).\n%s', r.n, r.impl_txt, tabela),
        'duracao', r.horas || 'h')
    where id = r.prod_impl;

    update subscription_plans set name = format('%s usuários', r.n), tagline = r.tagline, features_header = 'Inclui:',
      features = jsonb_build_array(format('Agente Secreto de Vendas para %s pessoas', r.n), format('Aurora para %s pessoas', r.n), 'CRM, funil e clientes', 'Agenda e tarefas', 'Catálogo de produtos', 'Propostas e contratos'),
      cta_text = format('Quero %s usuários', r.n), badge = case when r.n = 5 then 'RECOMENDADO' end, highlight = (r.n = 5), sort_order = r.ordem,
      limits = jsonb_build_object('users', r.n),
      modules = '{"crm": true, "aurora": true, "agente_secreto": true, "produtividade": true, "catalogo": true}'::jsonb, updated_at = now()
    where code = r.code;
  end loop;

  for r in select * from (values
    ('SPY-ADD-USUARIO', 'Usuário adicional', 197.00, 0, '197,00', '', 'agente_secreto', 'Mais uma pessoa com Agente Secreto de Vendas e Aurora.'),
    ('SPY-ADD-RADAR', 'Radar (busca e grupos)', 99.90, 150, '99,90', '150,00', 'radar', 'Busca empresas no Google Maps e acompanha os grupos de WhatsApp cadastrados, avisando o vendedor quando acha uma oportunidade.'),
    ('SPY-ADD-INTERNO', 'Agente Secreto Interno', 129.90, 450, '129,90', '450,00', 'agente_interno', 'Acompanha os grupos da equipe por departamento e cria tarefas, ordens de serviço e pedidos a partir das mensagens.'),
    ('SPY-ADD-JULIA', 'Júlia, vendedora de IA', 810.50, 1500, '810,50', '1.500,00', 'julia', 'Vendedora de inteligência artificial que atende e qualifica quem chega.'),
    ('SPY-ADD-AURORA', 'Acesso extra da Aurora', 49.90, 0, '49,90', '', 'aurora', 'Acesso à Aurora para uma pessoa além dos usuários do plano.'),
    ('SPY-MOD-FINANCEIRO', 'Módulo Financeiro', 149.90, 900, '149,90', '900,00', 'financeiro', 'Contas a pagar e a receber, cobranças, fluxo de caixa e DRE.'),
    ('SPY-MOD-MARKETING', 'Módulo Marketing', 149.90, 600, '149,90', '600,00', 'marketing', 'Campanhas, conteúdo, analytics, landing pages e formulários.'),
    ('SPY-MOD-CHATBOT', 'Módulo Chatbot', 129.90, 900, '129,90', '900,00', 'chatbot', 'Atendimento automático por mensagens.'),
    ('SPY-MOD-RH', 'Módulo Equipe e RH', 99.90, 450, '99,90', '450,00', 'rh', 'Colaboradores, cargos e permissões de acesso.'),
    ('SPY-MOD-ENGAJAMENTO', 'Módulo Engajamento', 99.90, 450, '99,90', '450,00', 'engajamento', 'Modelos de mensagem e automações de contato.'),
    ('SPY-MOD-BI', 'Módulo BI', 99.90, 450, '99,90', '450,00', 'bi', 'Indicadores e relatórios avançados.'),
    ('SPY-MOD-AGENDAMENTO', 'Módulo Agendamento online', 79.90, 300, '79,90', '300,00', 'agendamento', 'O cliente marca o horário por um link.'),
    ('SPY-MOD-SEGMENTO', 'Módulo de segmento', 197.00, 1200, '197,00', '1.200,00', 'segmento', 'Recursos do segmento: imobiliária, automotivo, varejo, energia solar, clínica ou educação.')
  ) as d(sku, nome, mensal, impl, mensal_txt, impl_txt, modulo, descricao)
  loop
    insert into products (tenant_id, name, description, type, category, sku, provider, tags, price, implementation_fee, is_recurring, recurring_period, type_attributes, active)
    select spy, 'S.P.Y. | ' || r.nome, r.descricao, 'Digital', case when r.sku like 'SPY-ADD-%' then 'Adicionais S.P.Y.' else 'Módulos S.P.Y.' end, r.sku, 'Interno',
      array['spy', case when r.sku like 'SPY-ADD-%' then 'adicional' else 'modulo' end], r.mensal, r.impl, true, 'monthly',
      jsonb_build_object('isRecurring', true, 'billingCycle', 'Mensal', 'modulo', r.modulo, 'ia_oque_e', r.descricao,
        'ia_planos_valores', r.nome || ': R$ ' || r.mensal_txt || ' por mês'
          || case when r.impl > 0 then ', mais implementação de R$ ' || r.impl_txt || ' paga uma vez.' else ', sem taxa de implementação.' end
          || ' Exige um plano de usuários do S.P.Y.'), true
    where not exists (select 1 from products where tenant_id = spy and sku = r.sku);
  end loop;

  update checkout_config set single_plan_code = null, updated_at = now() where id = 'main';
end
$do$;
