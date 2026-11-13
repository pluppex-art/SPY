-- Chatbot por regras (sem IA): o próprio cliente monta o fluxo no SPY; um único workflow n8n
-- compartilhado executa o fluxo de TODOS os tenants lendo estas tabelas.
--
-- chatbots          → fluxo (grafo JSON), configurações e a sessão WAHA dedicada de cada bot
-- chatbot_sessions  → estado de cada conversa (nó atual, variáveis coletadas, status)
--
-- Aditivo: nenhuma tabela existente é alterada.

create table if not exists public.chatbots (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  description      text not null default '',
  active           boolean not null default false,
  -- Nome da sessão WAHA dedicada a este bot (webhook dela aponta para o motor compartilhado).
  whatsapp_session text,
  -- { "start": "<id do nó>", "nodes": { "<id>": { "type": "...", ... } } } — ver src/lib/chatbot/types.ts
  flow             jsonb not null default '{"start": null, "nodes": {}}'::jsonb,
  -- { fallback_text, restart_keywords[], handoff_keywords[], handoff_text, session_timeout_minutes, ... }
  settings         jsonb not null default '{}'::jsonb,
  -- Funil/etapa do CRM onde os leads criados pelo bot entram (text, igual a leads.pipelineId/stageId).
  funil_id         text,
  etapa_id         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint chatbots_flow_size check (octet_length(flow::text) <= 500000),
  constraint chatbots_flow_shape check (jsonb_typeof(flow) = 'object' and jsonb_typeof(flow->'nodes') = 'object')
);

-- Uma sessão WAHA só pode servir a um bot ativo (o motor resolve o bot pelo nome da sessão).
create unique index if not exists chatbots_session_active_uniq
  on public.chatbots (whatsapp_session)
  where active and whatsapp_session is not null;
create index if not exists chatbots_tenant_idx on public.chatbots (tenant_id);

create table if not exists public.chatbot_sessions (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants(id) on delete cascade,
  chatbot_id      uuid not null references public.chatbots(id) on delete cascade,
  phone_digits    text not null,
  chat_id         text not null,
  current_node    text,
  vars            jsonb not null default '{}'::jsonb,
  -- active: bot conduzindo · handoff: humano assumiu (bot fica em silêncio) · finished: fluxo concluído
  status          text not null default 'active' check (status in ('active', 'handoff', 'finished')),
  last_message_id text,
  last_input_at   timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint chatbot_sessions_chatbot_phone_uniq unique (chatbot_id, phone_digits)
);
create index if not exists chatbot_sessions_tenant_idx on public.chatbot_sessions (tenant_id, status, last_input_at desc);

drop trigger if exists chatbots_set_updated_at on public.chatbots;
create trigger chatbots_set_updated_at before update on public.chatbots
  for each row execute function public.set_updated_at();
drop trigger if exists chatbot_sessions_set_updated_at on public.chatbot_sessions;
create trigger chatbot_sessions_set_updated_at before update on public.chatbot_sessions
  for each row execute function public.set_updated_at();

alter table public.chatbots enable row level security;
alter table public.chatbot_sessions enable row level security;

-- chatbots: qualquer usuário do tenant lê; só admin do tenant (ou master) cria/edita/apaga.
create policy chatbots_select on public.chatbots for select
  using ((select public.has_tenant_access(tenant_id)));
create policy chatbots_insert on public.chatbots for insert
  with check ((select public.has_tenant_access(tenant_id)) and public.is_tenant_admin_or_master());
create policy chatbots_update on public.chatbots for update
  using ((select public.has_tenant_access(tenant_id)) and public.is_tenant_admin_or_master())
  with check ((select public.has_tenant_access(tenant_id)) and public.is_tenant_admin_or_master());
create policy chatbots_delete on public.chatbots for delete
  using ((select public.has_tenant_access(tenant_id)) and public.is_tenant_admin_or_master());

-- chatbot_sessions: usuário do tenant lê; admin pode devolver/encerrar uma conversa (update de status).
-- Criação e avanço de estado são feitos só pelo n8n (service role, que ignora RLS).
create policy chatbot_sessions_select on public.chatbot_sessions for select
  using ((select public.has_tenant_access(tenant_id)));
create policy chatbot_sessions_update on public.chatbot_sessions for update
  using ((select public.has_tenant_access(tenant_id)) and public.is_tenant_admin_or_master())
  with check ((select public.has_tenant_access(tenant_id)) and public.is_tenant_admin_or_master());

revoke all on public.chatbots from anon;
revoke all on public.chatbot_sessions from anon;

comment on table public.chatbots is 'Chatbot por regras (sem IA) montado pelo próprio tenant no SPY. Executado pelo workflow n8n "[SPY] Chatbot - Motor" (compartilhado por todos os tenants).';
comment on table public.chatbot_sessions is 'Estado de cada conversa de um chatbot (nó atual, variáveis coletadas, status). Escrita só pelo n8n (service role); admin do tenant só atualiza status (devolver ao bot / encerrar).';
