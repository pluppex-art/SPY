-- Contexto de IA (aba "Contexto para IA" do produto) e cadastro completo dos produtos de planos AUTOPILOT / AUTONOMOUS
-- e dos pacotes de créditos de IA. Tudo sai dos dados já cadastrados (recursos, preços, implantação, pacotes):
-- nada de número ou promessa inventada. Idempotente: valores que a pessoa já preencheu à mão NÃO são sobrescritos.

create or replace function pg_temp.brl(cents bigint) returns text language sql immutable as $$
  select 'R$ ' || translate(to_char(cents / 100.0, 'FM999G999G990D00'), ',.', '.,');
$$;

create or replace function pg_temp.num(n bigint) returns text language sql immutable as $$
  select translate(to_char(n, 'FM999G999G999'), ',.', '.,');
$$;

create or replace function pg_temp.feats(f jsonb) returns text language sql immutable as $$
  select coalesce(string_agg(v, ', '), '') from jsonb_array_elements_text(coalesce(f, '[]'::jsonb)) v;
$$;

-- ── Planos (AUTOPILOT e AUTONOMOUS) ───────────────────────────────────────────────────────────────
with base as (
  select s.id plan_id, s.product_id, s.code, s.name, s.price_cents, s.setup_price_cents, s.tagline, s.features,
         (select features from public.subscription_plans where code = 'start')     as f_start,
         (select features from public.subscription_plans where code = 'autopilot') as f_autopilot
    from public.subscription_plans s
   where s.code in ('autopilot', 'autonomous') and s.product_id is not null
), textos as (
  select b.product_id, b.code, b.name, b.tagline, b.features, b.price_cents, b.setup_price_cents,
    case b.code
      when 'autopilot' then 'Plano AUTOPILOT do S.P.Y.: tudo do START (CRM, funil, WhatsApp, score de oportunidade) e mais agentes de IA que começam a trabalhar as oportunidades: qualificação, follow-up, recuperação e agendamento automáticos.'
      else 'Plano AUTONOMOUS do S.P.Y.: tudo do AUTOPILOT e mais uma operação comercial conduzida por múltiplos agentes especializados, com propostas, negociação com regras, reativação de clientes e expansão de carteira.'
    end as oque_e,
    case b.code
      when 'autopilot' then 'Empresas que já organizam o comercial no CRM e querem que a inteligência passe a trabalhar as oportunidades sozinha: responder, qualificar, fazer follow-up e agendar, sem depender de alguém lembrar de cada lead.'
      else 'Empresas com volume de leads e carteira de clientes que querem uma operação comercial que roda quase sozinha, com agentes especializados cuidando de propostas, negociação, reativação e expansão, e o gestor acompanhando pela Aurora.'
    end as para_quem,
    case b.code
      when 'autopilot' then 'Nenhuma oportunidade esquecida: o lead é qualificado e recebe follow-up automático, oportunidades paradas são recuperadas e a reunião é agendada sem digitação. A equipe humana foca em fechar.'
      else 'A operação comercial deixa de depender de tarefa manual: propostas, negociação dentro das regras da empresa, reativação de clientes e expansão de carteira são conduzidas pelos agentes, com mais capacidade de processamento e configurações avançadas.'
    end as beneficios,
    case b.code
      when 'autopilot' then
        'O QUE VEM NO PLANO AUTOPILOT:' || E'\n' ||
        '- Tudo do START: ' || pg_temp.feats(b.f_start) || '.' || E'\n' ||
        '- Além disso: ' || pg_temp.feats(b.features) || '.' || E'\n' ||
        'COMO COMEÇA: a implementação desenha o processo comercial junto com a empresa, ativa o sistema e os agentes e acompanha o início.'
      else
        'O QUE VEM NO PLANO AUTONOMOUS:' || E'\n' ||
        '- Tudo do AUTOPILOT (que inclui tudo do START): ' || pg_temp.feats(b.f_autopilot) || '.' || E'\n' ||
        '- Além disso: ' || pg_temp.feats(b.features) || '.' || E'\n' ||
        'COMO COMEÇA: a implementação desenha o processo comercial junto com a empresa, ativa o sistema e os agentes e acompanha o início.'
    end as como_funciona,
    case b.code
      when 'autopilot' then 'Se o cliente achar caro: compare com o tempo e as oportunidades que hoje se perdem por falta de resposta e follow-up. Se perguntar se a IA substitui o vendedor: ela trabalha as oportunidades e agenda, o vendedor fecha. A assinatura eletrônica ainda está em desenvolvimento: nunca ofereça como disponível.'
      else 'Se o cliente achar caro: compare com o custo de manter essa operação manualmente e com a carteira que hoje fica parada. Se perguntar sobre autonomia: a negociação segue as regras definidas pela empresa. A assinatura eletrônica ainda está em desenvolvimento: nunca ofereça como disponível.'
    end as objecoes
  from base b
)
update public.products p
   set description = coalesce(nullif(p.description, ''), t.tagline),
       tags = case when 'agentes-ia' = any(coalesce(p.tags, '{}')) then p.tags
                   else coalesce(p.tags, '{}') || array['crm', 'aurora', 'agentes-ia', 'licenca'] end,
       type_attributes = jsonb_build_object(
         'ia_oque_e', t.oque_e,
         'ia_para_quem', t.para_quem,
         'ia_beneficios', t.beneficios,
         'ia_como_funciona', t.como_funciona,
         'ia_objecoes', t.objecoes,
         'ia_planos_valores',
           'PLANO ' || t.name || ' - ' || pg_temp.brl(t.price_cents) || ' por mês.' ||
           case when t.setup_price_cents > 0 then ' Implantação (paga uma vez): ' || pg_temp.brl(t.setup_price_cents) || '.' else '' end || E'\n' ||
           'Planos do S.P.Y.: ' ||
           (select string_agg(x.name || ' ' || pg_temp.brl(x.price_cents) || '/mês (implantação ' || pg_temp.brl(x.setup_price_cents) || ')', ' | ' order by x.price_cents)
              from public.subscription_plans x where x.active) || '.' || E'\n' ||
           'Créditos de IA são pagos à parte, conforme o uso: ' ||
           (select string_agg(pg_temp.num(c.credits) || ' por ' || pg_temp.brl(c.price_cents), ' | ' order by c.credits)
              from public.credit_tiers c where c.active) || '.'
       ) || coalesce(p.type_attributes, '{}'::jsonb)   -- o que já estava preenchido vence
  from textos t
 where p.id = t.product_id;

-- Liga a implementação própria de cada plano (produto de categoria Implantação com o nome do plano), se já existir.
update public.products p
   set linked_product_ids = array[i.id]
  from public.subscription_plans s, public.products i
 where s.product_id = p.id and s.code in ('autopilot', 'autonomous')
   and i.tenant_id = p.tenant_id and i.deleted_at is null and i.category = 'Implantação'
   and i.name ilike '%' || s.name || '%';

-- ── Pacotes de créditos de IA ─────────────────────────────────────────────────────────────────────
with c as (
  select t.product_id, t.credits, t.price_cents,
         pg_temp.num(t.credits) as cr_txt,
         pg_temp.brl(round(t.price_cents * 1000.0 / t.credits)::bigint) as por_mil
    from public.credit_tiers t where t.product_id is not null
)
update public.products p
   set description = case
         -- só troca o texto automático antigo; descrição editada à mão fica como está
         when p.description is null or p.description ~ 'créditos de inteligência artificial\.$'
         then 'Pacote de ' || c.cr_txt || ' créditos de inteligência artificial para os agentes de IA e a Aurora do S.P.Y., pagos uma única vez e usados conforme o consumo.'
         else p.description end,
       tags = case when 'pacote' = any(coalesce(p.tags, '{}')) then p.tags else coalesce(p.tags, '{}') || array['pacote', 'aurora', 'agentes-ia'] end,
       type_attributes = jsonb_build_object(
         'ia_oque_e', 'Pacote avulso de ' || c.cr_txt || ' créditos de inteligência artificial. Os créditos são o combustível dos agentes de IA e da Aurora: cada atendimento, análise e ação da IA consome créditos.',
         'ia_para_quem', 'Clientes do S.P.Y. cujos agentes de IA e a Aurora estão consumindo mais do que o contratado, ou que querem ampliar o uso da inteligência sem trocar de plano.',
         'ia_beneficios', 'A IA continua trabalhando sem parar quando o consumo passa do contratado, sem surpresa na fatura. Quanto maior o pacote, menor o preço por mil créditos.',
         'ia_como_funciona', 'A IA consome créditos conforme o uso. A Aurora acompanha o consumo: se a empresa gastar além do contratado, ela trava o uso e o cliente adquire um pacote adicional. Este pacote soma ' || c.cr_txt || ' créditos ao saldo da empresa.',
         'ia_objecoes', 'Se achar caro: o preço por mil créditos cai nos pacotes maiores e só se paga o que a IA realmente usa. Se perguntar se precisa comprar: só quando o consumo passar do contratado no plano. O cliente também pode usar a própria chave de API das IAs (OpenAI, Google Gemini ou compatíveis).',
         'ia_planos_valores', 'Este pacote: ' || c.cr_txt || ' créditos por ' || pg_temp.brl(c.price_cents) || ' (' || c.por_mil || ' por mil créditos). ' ||
           'Todos os pacotes: ' ||
           (select string_agg(pg_temp.num(x.credits) || ' por ' || pg_temp.brl(x.price_cents) || ' (' || pg_temp.brl(round(x.price_cents * 1000.0 / x.credits)::bigint) || '/mil)', ' | ' order by x.credits)
              from public.credit_tiers x where x.active) || '.'
       ) || coalesce(p.type_attributes, '{}'::jsonb)   -- o que já estava preenchido vence
  from c
 where p.id = c.product_id;
