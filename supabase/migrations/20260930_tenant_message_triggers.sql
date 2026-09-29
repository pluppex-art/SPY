-- Gatilhos de mensagem em linguagem natural (Fase 4 da customizacao de agentes, 2026-09-30).
-- Tenant descreve em texto livre uma regra tipo "mandar mensagem pra quem nao tem contato
-- ha 2 meses" -- a Julia (via n8n) interpreta, monta a lista de leads que bateriam com a
-- regra e o texto que mandaria, e PARA AI: nada e enviado de verdade ate um admin do tenant
-- aprovar explicitamente essa lista+mensagem especifica. Nunca broadcast automatico -- mesma
-- regra ja seguida em toda ferramenta de envio da Aurora/Julia neste projeto.
create table if not exists public.tenant_message_triggers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  descricao text not null,
  status text not null default 'pendente_interpretacao'
    check (status in ('pendente_interpretacao', 'aguardando_confirmacao', 'aprovado', 'executado', 'rejeitado', 'erro')),
  -- Filtro estruturado que a IA derivou da descricao (ex: {"tipo":"sem_contato_dias","dias":60}).
  -- Vocabulario fechado (ver Tool - SPY Interpretar Gatilho de Mensagem no n8n), nunca SQL livre.
  criterio jsonb,
  resumo_interpretado text,
  mensagem_sugerida text,
  -- Snapshot dos leads encontrados no momento da interpretacao (id/nome/telefone) -- o que foi
  -- aprovado e exatamente essa lista congelada, nao uma nova consulta na hora de enviar.
  leads_encontrados jsonb not null default '[]',
  erro text,
  aprovado_por uuid references public.users(id) on delete set null,
  aprovado_em timestamptz,
  executado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenant_message_triggers is 'Gatilhos de mensagem em linguagem natural por tenant (Fase 4, 2026-09-30). Fluxo: tenant descreve -> n8n interpreta e monta lista+mensagem (aguardando_confirmacao) -> admin do tenant aprova -> n8n executa via Julia. Nunca envia sem o passo de aprovacao explicita.';

create index if not exists tenant_message_triggers_tenant_status_idx
  on public.tenant_message_triggers (tenant_id, status);

alter table public.tenant_message_triggers enable row level security;

-- Leitura: qualquer pessoa com acesso ao tenant ve os gatilhos dele.
drop policy if exists tenant_message_triggers_select on public.tenant_message_triggers;
create policy tenant_message_triggers_select on public.tenant_message_triggers
  for select using (public.has_tenant_access(tenant_id));

-- Criacao: qualquer membro do tenant pode DESCREVER um gatilho (so cria o pedido,
-- sempre nasce em pendente_interpretacao -- nunca ja aprovado/executado).
drop policy if exists tenant_message_triggers_insert on public.tenant_message_triggers;
create policy tenant_message_triggers_insert on public.tenant_message_triggers
  for insert
  with check (
    public.has_tenant_access(tenant_id)
    and status = 'pendente_interpretacao'
    and aprovado_por is null
    and aprovado_em is null
    and executado_em is null
  );

-- Atualizacao pelo app: so tenant admin, e so pra aprovar/rejeitar (nunca escrever o
-- resultado da interpretacao -- isso e sempre o n8n, via service role, que bypassa RLS).
drop policy if exists tenant_message_triggers_update on public.tenant_message_triggers;
create policy tenant_message_triggers_update on public.tenant_message_triggers
  for update
  using (
    public.has_tenant_access(tenant_id)
    and coalesce((select is_tenant_admin from public.users where id = auth.uid()), false)
  )
  with check (
    public.has_tenant_access(tenant_id)
    and coalesce((select is_tenant_admin from public.users where id = auth.uid()), false)
  );

drop policy if exists tenant_message_triggers_delete on public.tenant_message_triggers;
create policy tenant_message_triggers_delete on public.tenant_message_triggers
  for delete
  using (
    public.has_tenant_access(tenant_id)
    and coalesce((select is_tenant_admin from public.users where id = auth.uid()), false)
  );
