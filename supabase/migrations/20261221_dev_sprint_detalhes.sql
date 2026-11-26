-- Detalhes das tarefas do Sprint (Dev): o que fazer, o erro, passos, anexos (imagens) e o pedido de origem
-- (ex.: mensagem de grupo lida pelo Agente Secreto Interno). Só acrescenta: nada existente é alterado.
alter table public.dev_sprint_tasks
  add column if not exists description  text,
  add column if not exists error_detail text,
  add column if not exists checklist    jsonb not null default '[]'::jsonb,  -- [{ "texto": "...", "feito": false }]
  add column if not exists attachments  jsonb not null default '[]'::jsonb,  -- [{ "path": "<tenant>/<tarefa>/arquivo.png", "nome": "...", "tipo": "image/png", "tamanho": 123 }]
  add column if not exists source       jsonb;                                -- { "origem": "agente-secreto", "solicitante": "...", "grupo": "...", "mensagem": "...", "recebido_em": "ISO" }

-- Bucket privado dos anexos: o caminho começa pelo id da empresa; só quem tem acesso a ela lê e grava.
insert into storage.buckets (id, name, public, file_size_limit)
values ('dev-anexos', 'dev-anexos', false, 15728640)
on conflict (id) do nothing;

drop policy if exists dev_anexos_read on storage.objects;
create policy dev_anexos_read on storage.objects for select to authenticated
  using (bucket_id = 'dev-anexos' and public.has_tenant_access(((storage.foldername(name))[1])::uuid));

drop policy if exists dev_anexos_write on storage.objects;
create policy dev_anexos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'dev-anexos' and public.has_tenant_access(((storage.foldername(name))[1])::uuid));

drop policy if exists dev_anexos_delete on storage.objects;
create policy dev_anexos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'dev-anexos' and public.has_tenant_access(((storage.foldername(name))[1])::uuid));
