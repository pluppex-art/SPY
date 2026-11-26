-- API oficial do WhatsApp Business (Cloud API). Cada número conectado fica aqui com o token de acesso e as chaves
-- do webhook. SEGURANÇA: RLS ligada e SEM política: só o servidor (service role) lê e grava; o navegador nunca
-- vê o token. A instância correspondente em whatsapp_instances (provider 'cloud_api') liga o número ao Chat.
create table if not exists public.whatsapp_oficial_numeros (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  instance_id uuid references public.whatsapp_instances(id) on delete set null,
  apelido text,
  phone_number_id text not null,
  waba_id text not null,
  access_token text not null,
  app_secret text,
  telefone text,
  nome_verificado text,
  qualidade text,
  webhook_key text not null,
  verify_token text not null,
  webhook_ativo boolean not null default false,
  ultimo_erro text,
  ultima_mensagem_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists whatsapp_oficial_numeros_phone_uniq on public.whatsapp_oficial_numeros (phone_number_id);
create index if not exists idx_whatsapp_oficial_numeros_tenant on public.whatsapp_oficial_numeros (tenant_id);
create index if not exists idx_whatsapp_oficial_numeros_waba on public.whatsapp_oficial_numeros (waba_id);

alter table public.whatsapp_oficial_numeros enable row level security;
revoke all on public.whatsapp_oficial_numeros from anon, authenticated;

-- A instância pode ser de um número da API oficial.
alter table public.whatsapp_instances drop constraint if exists whatsapp_instances_provider_check;
alter table public.whatsapp_instances add constraint whatsapp_instances_provider_check
  check (provider = any (array['simulator'::text, 'evolution'::text, 'waha'::text, 'cloud_api'::text]));
