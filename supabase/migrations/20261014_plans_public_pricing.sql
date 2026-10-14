-- Vitrine de preços: os planos da landing passam a vir do próprio sistema (login master → Assinaturas).
-- subscription_plans ganha os campos de vitrine; credit_tiers guarda a tabela de créditos de IA.
-- A landing lê só planos ativos com show_on_site = true, por um endpoint público (sem expor o resto da tabela).

alter table public.subscription_plans
  add column if not exists tagline text,
  add column if not exists setup_price_cents integer not null default 0 check (setup_price_cents >= 0),
  add column if not exists badge text,
  add column if not exists features_header text,
  add column if not exists cta_text text,
  add column if not exists highlight boolean not null default false,
  add column if not exists show_on_site boolean not null default false,
  add column if not exists sort_order integer not null default 0;

create table if not exists public.credit_tiers (
  id uuid primary key default gen_random_uuid(),
  credits integer not null check (credits > 0),
  price_cents integer not null check (price_cents >= 0),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.credit_tiers enable row level security;
create policy credit_tiers_read  on public.credit_tiers for select to authenticated using (true);
create policy credit_tiers_admin on public.credit_tiers for all to authenticated
  using ((select public.is_super_admin())) with check ((select public.is_super_admin()));
revoke all on public.credit_tiers from anon;
revoke truncate, references, trigger on public.credit_tiers from authenticated;

-- Semente com os valores comerciais que já estavam na landing (idempotente).
insert into public.subscription_plans
  (code, name, price_cents, billing_interval, trial_days, features, active, tagline, setup_price_cents, badge, features_header, cta_text, highlight, show_on_site, sort_order)
values
  ('start', 'START', 99700, 'monthly', 0,
   '["CRM","Gestão de leads","Pipeline comercial","Gestão de clientes","Histórico de interações","Integração WhatsApp","Inteligência sobre leads","Identificação de oportunidades","Análise de conversas","Score de oportunidade","Próxima melhor ação"]'::jsonb,
   true, 'Para empresas que querem organizar e enxergar melhor sua operação comercial.', 299700, null, 'Inclui:', 'Começar Agora', false, true, 1),
  ('autopilot', 'AUTOPILOT', 199700, 'monthly', 0,
   '["Agentes de IA","Qualificação automática","Follow-up automático","Recuperação de oportunidades","Agendamento automático","Distribuição de leads","Ações comerciais automatizadas"]'::jsonb,
   true, 'Para empresas que querem que a inteligência comece a trabalhar as oportunidades.', 499700, 'MAIS ESCOLHIDO', 'Tudo do START +', 'Quero o Autopilot', true, true, 2),
  ('autonomous', 'AUTONOMOUS', 399700, 'monthly', 0,
   '["Múltiplos agentes especializados","Propostas comerciais","Negociação com regras","Reativação de clientes","Expansão de carteira","Operação comercial autônoma","Maior capacidade de processamento","Configurações avançadas"]'::jsonb,
   true, 'Para transformar o S.P.Y. em parte ativa e autônoma da sua operação comercial.', 999700, null, 'Tudo do AUTOPILOT +', 'Quero Conhecer', false, true, 3)
on conflict (code) do nothing;

insert into public.credit_tiers (credits, price_cents, sort_order)
select v.credits, v.price_cents, v.sort_order
from (values (10000, 19900, 1), (30000, 49700, 2), (75000, 99700, 3), (150000, 179700, 4), (300000, 299700, 5)) as v(credits, price_cents, sort_order)
where not exists (select 1 from public.credit_tiers);
