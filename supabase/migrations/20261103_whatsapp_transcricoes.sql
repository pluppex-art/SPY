-- Cache das transcrições (IA) de áudios do WhatsApp mostradas na aba Conversas do lead (já aplicado em produção em 2026-11-03).
create table if not exists public.whatsapp_transcricoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  wa_message_id text not null,
  texto text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, wa_message_id)
);
alter table public.whatsapp_transcricoes enable row level security;
drop policy if exists tenant_isolation on public.whatsapp_transcricoes;
create policy tenant_isolation on public.whatsapp_transcricoes for all using (has_tenant_access(tenant_id)) with check (has_tenant_access(tenant_id));
