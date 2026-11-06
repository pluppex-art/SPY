-- Teste automatizado de isolamento cross-tenant.
--
-- Prova, via RLS de verdade (mesmo mecanismo que o PostgREST usa em
-- produção — request.jwt.claims lido por auth.uid()), que:
--   1. Tenant A nunca LÊ um registro do Tenant B.
--   2. Tenant A nunca EDITA um registro do Tenant B (UPDATE afeta 0 linhas).
--   3. Tenant A nunca APAGA um registro do Tenant B (DELETE afeta 0 linhas).
--   4. O espelho (Tenant B vs Tenant A) vale também.
--   5. Uma conta is_master=true vê os dois tenants — isso é o comportamento
--      DOCUMENTADO de has_tenant_access() (ver AUDITORIA.md ou o comentário
--      na função no banco), não um bug: o teste confirma que continua sendo
--      esse o comportamento esperado, não que ele mudou sem querer.
--
-- Cria 2 tenants + 3 usuários + 2 leads de teste, roda as asserções, e
-- limpa tudo no final — sucesso ou falha (RAISE EXCEPTION aborta a função
-- antes da limpeza rodar, então numa falha real o dado de teste pode
-- precisar de limpeza manual; rode a query de verificação no fim do
-- arquivo pra conferir).
--
-- Uso: cole no SQL editor do Supabase (projeto do banco do S.P.Y.) e rode.
-- Isolado por convenção de UUID (todos começam com aaaaaaaa-/bbbbbbbb-) pra
-- nunca colidir com dado real.

do $$
declare
  tenant_a uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  tenant_b uuid := 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  user_a   uuid := 'aaaaaaaa-1111-1111-1111-111111111111';
  user_b   uuid := 'bbbbbbbb-2222-2222-2222-222222222222';
  master   uuid := 'aaaaaaaa-9999-9999-9999-999999999999';
  lead_a   uuid := 'aaaaaaaa-3333-3333-3333-333333333333';
  lead_b   uuid := 'bbbbbbbb-4444-4444-4444-444444444444';
  v_count int;
  v_rows int;
  r record;
begin
  insert into public.tenants (id, name, niche) values (tenant_a, '__TEST TENANT A ISOLATION__', 'geral'), (tenant_b, '__TEST TENANT B ISOLATION__', 'geral');
  insert into public.users (id, tenant_id, name, email, is_master) values
    (user_a, tenant_a, 'Test User A', 'isolation-test-a@invalid.test', false),
    (user_b, tenant_b, 'Test User B', 'isolation-test-b@invalid.test', false),
    (master, tenant_a, 'Test Master', 'isolation-test-master@invalid.test', true);
  insert into public.leads (id, tenant_id, name) values (lead_a, tenant_a, '__LEAD TENANT A__'), (lead_b, tenant_b, '__LEAD TENANT B__');

  -- ── Sessão simulada: Tenant A ──
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', user_a::text, 'role', 'authenticated')::text, true);

  select count(*) into v_count from public.leads where id in (lead_a, lead_b);
  if v_count <> 1 then raise exception 'FALHA: Tenant A deveria ver 1 lead (o seu), viu %', v_count; end if;

  select count(*) into v_count from public.leads where id = lead_b;
  if v_count <> 0 then raise exception 'FALHA CRITICA: Tenant A conseguiu LER o lead do Tenant B!'; end if;

  update public.leads set name = 'HACKED' where id = lead_b;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FALHA CRITICA: Tenant A conseguiu ESCREVER no lead do Tenant B!'; end if;

  delete from public.leads where id = lead_b;
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then raise exception 'FALHA CRITICA: Tenant A conseguiu APAGAR o lead do Tenant B!'; end if;

  raise notice 'PASS 1/4: Tenant A nao le/edita/apaga dado do Tenant B (SELECT/UPDATE/DELETE bloqueados)';

  -- ── Sessão simulada: Tenant B (espelho) ──
  perform set_config('request.jwt.claims', json_build_object('sub', user_b::text, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.leads where id in (lead_a, lead_b);
  if v_count <> 1 then raise exception 'FALHA: Tenant B deveria ver 1 lead (o seu), viu %', v_count; end if;
  select count(*) into v_count from public.leads where id = lead_a;
  if v_count <> 0 then raise exception 'FALHA CRITICA: Tenant B conseguiu ver o lead do Tenant A!'; end if;
  raise notice 'PASS 2/4: Tenant B nao ve o lead do Tenant A (espelho confirmado)';

  -- ── Sessão simulada: master (is_master=true, tenant_id=A) ──
  perform set_config('request.jwt.claims', json_build_object('sub', master::text, 'role', 'authenticated')::text, true);
  select count(*) into v_count from public.leads where id in (lead_a, lead_b);
  if v_count <> 2 then raise exception 'INESPERADO: master deveria ver os 2 leads (comportamento documentado), viu %', v_count; end if;
  raise notice 'PASS 3/4: master ve os dois tenants (comportamento documentado e confirmado, nao um bug novo)';

  raise notice 'PASS 4/4: isolamento de leitura/escrita/exclusao comprovado end-to-end via RLS real (mesmo mecanismo do PostgREST em producao)';

  -- ── Limpeza ──
  perform set_config('role', 'postgres', true);
  reset request.jwt.claims;
  delete from public.leads where id in (lead_a, lead_b);
  delete from public.users where id in (user_a, user_b, master);
  -- Tabelas criadas depois do teste (ex.: aurora_events) ganham linhas dos tenants de teste por gatilho e tem FK para tenants:
  -- limpa, pelas FKs, tudo que aponta so para os dois tenants ficticios (UUIDs aaaaaaaa-/bbbbbbbb-) antes de apagar os tenants.
  for r in
    select c.conrelid::regclass::text as tbl, a.attname::text as col
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.tenants'::regclass and c.conrelid <> 'public.tenants'::regclass
       and array_length(c.conkey, 1) = 1
  loop
    execute format('delete from %s where %I = any($1)', r.tbl, r.col) using array[tenant_a, tenant_b];
  end loop;
  delete from public.tenants where id in (tenant_a, tenant_b);

  raise notice 'CLEANUP OK: nenhum dado de teste restante no banco.';
end $$;

-- Verificação manual pós-falha (só necessária se o bloco acima abortou com
-- exceção antes de rodar a limpeza):
-- delete from public.leads where id in ('aaaaaaaa-3333-3333-3333-333333333333','bbbbbbbb-4444-4444-4444-444444444444');
-- delete from public.users where id in ('aaaaaaaa-1111-1111-1111-111111111111','bbbbbbbb-2222-2222-2222-222222222222','aaaaaaaa-9999-9999-9999-999999999999');
-- delete from public.tenants where id in ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
