-- Telefone no padrão do sistema + unificação de duplicados + promoção de funil para a base de clientes.
--
-- 1) Padrão de telefone: 55 + DDD + número (celular com 9 dígitos). Um gatilho aplica isso em TODA gravação de
--    leads / clientes / contatos (vale também para o agente de WhatsApp, n8n, API e importações).
-- 2) dedupe_merge_log: guarda a linha inteira de tudo que é unificado/removido (dá para desfazer).
-- 3) spy_dedupe_clientes / spy_dedupe_leads: unificam duplicados na linha MAIS ANTIGA, levando notas, tarefas,
--    tags, propostas e demais vínculos. Simulação por padrão (p_apply = false); aplica em lotes (p_limit).
-- 4) spy_promote_funil_para_clientes: leva os leads de um funil para a base de clientes e remove o funil.
-- Nada é apagado sem antes ficar gravado em dedupe_merge_log.

-- ───────────────────────── 1) padrão de telefone ─────────────────────────
create or replace function public.spy_normalize_phone_br(raw text) returns text
language plpgsql immutable as $fn$
declare d text;
begin
  if raw is null then return null; end if;
  d := regexp_replace(raw, '\D', '', 'g');
  if d = '' then return raw; end if;
  d := regexp_replace(d, '^0+', '');
  if d = '' then return raw; end if;
  -- sem DDI: DDD + número. 11 dígitos só com o 9 na frente; 10 dígitos com o 1º dígito de 2 a 9
  -- (assim um número dos EUA, 1 + 10 dígitos, não ganha um 55 indevido)
  if (length(d) = 10 and d ~ '^[1-9][1-9][2-9]') or (length(d) = 11 and d ~ '^[1-9][1-9]9') then
    d := '55' || d;
  end if;
  -- celular antigo (55 + DDD + 8 dígitos começando em 6-9) ganha o nono dígito; fixo (2-5) não muda
  if length(d) = 12 and left(d, 2) = '55' and substr(d, 5, 1) ~ '[6-9]' then
    d := left(d, 4) || '9' || substr(d, 5);
  end if;
  return d;
end
$fn$;

create or replace function public.spy_trg_normalize_phones() returns trigger
language plpgsql as $fn$
begin
  if tg_table_name = 'cliente_contatos' then
    new.telefone := public.spy_normalize_phone_br(new.telefone);
    new.whatsapp := public.spy_normalize_phone_br(new.whatsapp);
  else
    new.phone := public.spy_normalize_phone_br(new.phone);
  end if;
  return new;
end
$fn$;

drop trigger if exists trg_spy_normalize_phone on public.leads;
create trigger trg_spy_normalize_phone before insert or update of phone on public.leads
  for each row execute function public.spy_trg_normalize_phones();
drop trigger if exists trg_spy_normalize_phone on public.clientes;
create trigger trg_spy_normalize_phone before insert or update of phone on public.clientes
  for each row execute function public.spy_trg_normalize_phones();
drop trigger if exists trg_spy_normalize_phone on public.cliente_contatos;
create trigger trg_spy_normalize_phone before insert or update of telefone, whatsapp on public.cliente_contatos
  for each row execute function public.spy_trg_normalize_phones();

-- ───────────────────────── 2) log reversível ─────────────────────────
create table if not exists public.dedupe_merge_log (
  id          bigserial primary key,
  tenant_id   uuid not null,
  entity      text not null check (entity in ('clientes', 'leads', 'funil_removido')),
  keeper_id   text not null,
  merged_id   text not null,
  merged_row  jsonb not null,
  refs_moved  jsonb not null default '{}'::jsonb,
  merged_at   timestamptz not null default now(),
  merged_by   uuid default auth.uid()
);
create unique index if not exists dedupe_merge_log_uq on public.dedupe_merge_log (tenant_id, entity, merged_id);
create index if not exists dedupe_merge_log_keeper on public.dedupe_merge_log (tenant_id, entity, keeper_id);
alter table public.dedupe_merge_log enable row level security;
drop policy if exists dedupe_merge_log_select on public.dedupe_merge_log;
create policy dedupe_merge_log_select on public.dedupe_merge_log for select using (public.has_tenant_access(tenant_id));

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.spy__norm_name(n text) returns text
language sql immutable as $fn$
  select btrim(regexp_replace(lower(translate(coalesce(n, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn')), '\s+', ' ', 'g'), ' .-')
$fn$;

create or replace function public.spy__is_generic_name(nk text) returns boolean
language sql immutable as $fn$
  select coalesce(nk, '') in ('', 'company name not specified', 'sem nome', 'lead whatsapp', 'lead') or length(coalesce(nk, '')) < 3
$fn$;

-- Quem pode rodar: administrador da empresa / master (sessão de usuário), service role, ou o editor SQL (postgres).
create or replace function public.spy__assert_admin(p_tenant uuid) returns void
language plpgsql security definer set search_path = public as $fn$
declare v_ok boolean;
begin
  if auth.uid() is not null then
    select (coalesce(u.is_master, false) or (coalesce(u.is_tenant_admin, false) and u.tenant_id = p_tenant))
      into v_ok from public.users u where u.id = auth.uid();
    if not coalesce(v_ok, false) then raise exception 'Sem permissão: apenas administradores da empresa.'; end if;
  elsif coalesce(auth.role(), '') = 'service_role' or session_user in ('postgres', 'supabase_admin') then
    return;
  else
    raise exception 'Sem permissão.';
  end if;
end
$fn$;

-- Tudo que aponta para o registro (FK + colunas lead_id / "clientId"), para levar junto na unificação.
create or replace function public.spy__refs(p_entity text)
returns table(tbl text, col text, typ text) language sql stable as $fn$
  select c.conrelid::regclass::text, a.attname::text, format_type(a.atttypid, a.atttypmod)
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f' and array_length(c.conkey, 1) = 1
     and c.confrelid = (case p_entity when 'clientes' then 'public.clientes' else 'public.leads' end)::regclass
  union
  select format('public.%I', cl.relname), a.attname::text, format_type(a.atttypid, a.atttypmod)
    from pg_attribute a
    join pg_class cl on cl.oid = a.attrelid
    join pg_namespace n on n.oid = cl.relnamespace
   where n.nspname = 'public' and cl.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
     and cl.relname <> 'dedupe_merge_log'
     and ((p_entity = 'leads' and a.attname = 'lead_id')
       or (p_entity = 'clientes' and (cl.relname, a.attname) in (('leads', 'clientId'), ('products', 'clientId'))))
$fn$;

-- Funde UM duplicado no registro mantido: completa campos vazios, leva todos os vínculos, grava o log e apaga o duplicado.
create or replace function public.spy__merge_pair(p_entity text, p_tenant uuid, p_keeper text, p_dupe text)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  v_tbl text := case p_entity when 'clientes' then 'public.clientes' else 'public.leads' end;
  k jsonb; d jsonb; m jsonb; key text; val jsonb;
  setlist text; r record; n bigint; moved jsonb := '{}'::jsonb;
  protected text[] := array['id', 'tenant_id', 'created_at', 'updated_at', 'deleted_at'];
  kp jsonb; dp jsonb; kc jsonb; dc jsonb;
begin
  execute format('select to_jsonb(t) from %s t where t.id::text = $1 and t.tenant_id = $2', v_tbl) into k using p_keeper, p_tenant;
  execute format('select to_jsonb(t) from %s t where t.id::text = $1 and t.tenant_id = $2', v_tbl) into d using p_dupe, p_tenant;
  if k is null or d is null then raise exception 'Registro não encontrado (% / %).', p_keeper, p_dupe; end if;

  -- campos vazios do mantido são completados com os do duplicado (o mais antigo vence nos demais)
  m := k;
  for key, val in select * from jsonb_each(d) loop
    if key = any (protected) then continue; end if;
    if (m -> key) is null or m -> key = 'null'::jsonb or m ->> key = '' or m -> key = '[]'::jsonb or m -> key = '{}'::jsonb then
      if val <> 'null'::jsonb and val <> '""'::jsonb and val <> '[]'::jsonb and val <> '{}'::jsonb then
        m := jsonb_set(m, array[key], val);
      end if;
    end if;
  end loop;

  if p_entity = 'leads' then
    if public.spy__is_generic_name(public.spy__norm_name(k ->> 'name'))
       and not public.spy__is_generic_name(public.spy__norm_name(d ->> 'name')) then
      m := jsonb_set(m, '{name}', d -> 'name');
    end if;
    if coalesce((k ->> 'value')::numeric, 0) = 0 and coalesce((d ->> 'value')::numeric, 0) > 0 then
      m := jsonb_set(m, '{value}', d -> 'value');
    end if;
    kc := case when jsonb_typeof(k -> 'customFields') = 'object' then k -> 'customFields' else '{}'::jsonb end;
    dc := case when jsonb_typeof(d -> 'customFields') = 'object' then d -> 'customFields' else '{}'::jsonb end;
    m := jsonb_set(m, '{customFields}', dc || kc);
    m := jsonb_set(m, '{customFields,mergedLeads}',
      case when jsonb_typeof(kc -> 'mergedLeads') = 'array' then kc -> 'mergedLeads' else '[]'::jsonb end || jsonb_build_array(jsonb_build_object(
        'id', d ->> 'id', 'kommoLeadId', d -> 'customFields' -> 'kommo' -> 'leadId', 'stageId', d ->> 'stageId',
        'status', d ->> 'status', 'value', d -> 'value', 'mergedAt', now())), true);
    kp := case when jsonb_typeof(k -> 'productIds') = 'array' then k -> 'productIds' else '[]'::jsonb end;
    dp := case when jsonb_typeof(d -> 'productIds') = 'array' then d -> 'productIds' else '[]'::jsonb end;
    m := jsonb_set(m, '{productIds}', (select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements(kp || dp) x));
    if coalesce(d ->> 'notes', '') <> '' and coalesce(d ->> 'notes', '') <> coalesce(k ->> 'notes', '') then
      m := jsonb_set(m, '{notes}', to_jsonb(btrim(coalesce(k ->> 'notes', '') || E'\n\n— unificado de lead duplicado —\n' || (d ->> 'notes'), E'\n')));
    end if;
  end if;

  select string_agg(format('%I = r.%I', a.attname, a.attname), ', ') into setlist
    from pg_attribute a
   where a.attrelid = v_tbl::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
     and a.attname <> all (protected);
  execute format('update %s t set %s from jsonb_populate_record(null::%s, $1) r where t.id::text = $2', v_tbl, setlist, v_tbl)
    using m, p_keeper;

  -- leva todos os vínculos do duplicado para o mantido
  for r in select * from public.spy__refs(p_entity) loop
    if r.tbl like '%lead_tags' then
      execute 'delete from public.lead_tags a using public.lead_tags b where a.lead_id::text = $1 and b.lead_id::text = $2 and a.tag_id = b.tag_id' using p_dupe, p_keeper;
    elsif r.tbl like '%lead_custom_values' then
      execute 'delete from public.lead_custom_values a using public.lead_custom_values b where a.lead_id::text = $1 and b.lead_id::text = $2 and a.custom_field_id = b.custom_field_id' using p_dupe, p_keeper;
    end if;
    execute format('update %s set %I = $1::%s where %I::text = $2', r.tbl, r.col, r.typ, r.col) using p_keeper, p_dupe;
    get diagnostics n = row_count;
    if n > 0 then moved := moved || jsonb_build_object(r.tbl || '.' || r.col, n); end if;
  end loop;

  if p_entity = 'clientes' then
    update public.leads set "clientName" = m ->> 'name'
     where tenant_id = p_tenant and "clientId" = p_keeper and "clientName" is distinct from (m ->> 'name');
  else
    insert into public.lead_activities (id, tenant_id, lead_id, type, title, description, date, seller)
    values ('dedupe-' || p_dupe, p_tenant, p_keeper, 'Outro', 'Lead duplicado unificado',
            format('O lead duplicado "%s" (criado em %s) foi unificado neste. Notas, tarefas e etiquetas foram trazidas para cá.', d ->> 'name', d ->> 'created_at'),
            to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), 'Sistema')
    on conflict (id) do nothing;
  end if;

  insert into public.dedupe_merge_log (tenant_id, entity, keeper_id, merged_id, merged_row, refs_moved)
  values (p_tenant, p_entity, p_keeper, p_dupe, d, moved)
  on conflict (tenant_id, entity, merged_id) do update
    set keeper_id = excluded.keeper_id, merged_row = excluded.merged_row, refs_moved = excluded.refs_moved, merged_at = now();

  execute format('delete from %s t where t.id::text = $1 and t.tenant_id = $2', v_tbl) using p_dupe, p_tenant;
  return moved;
end
$fn$;

-- ───────────────────────── 3a) clientes duplicados (mesmo nome) ─────────────────────────
create or replace function public.spy_dedupe_clientes(p_tenant uuid, p_apply boolean default false, p_limit int default 300)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  g record; r record; v_keeper text; kdoc text; ddoc text;
  v_grupos int; v_extras int; v_mesclados int := 0; v_conflito_doc int := 0; v_erros int := 0; v_msg text;
  v_exemplos jsonb;
begin
  perform public.spy__assert_admin(p_tenant);
  drop table if exists _dd_cli;
  create temp table _dd_cli on commit drop as
    select c.id, c.created_at, public.spy__norm_name(c.name) nk, c.name from public.clientes c where c.tenant_id = p_tenant;
  create index on _dd_cli (nk);
  delete from _dd_cli where public.spy__is_generic_name(nk);

  select count(*), coalesce(sum(n - 1), 0) into v_grupos, v_extras
    from (select nk, count(*) n from _dd_cli group by nk having count(*) > 1) x;
  select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'ocorrencias', n) order by n desc), '[]'::jsonb) into v_exemplos
    from (select min(name) nome, count(*) n from _dd_cli group by nk having count(*) > 1 order by count(*) desc limit 15) x;

  if not p_apply then
    return jsonb_build_object('modo', 'simulacao', 'clientes_no_cadastro', (select count(*) from public.clientes where tenant_id = p_tenant),
      'grupos_com_duplicata', v_grupos, 'registros_a_unificar', v_extras, 'exemplos', v_exemplos);
  end if;

  for g in select nk from _dd_cli group by nk having count(*) > 1 order by nk limit greatest(p_limit, 1) loop
    select id into v_keeper from _dd_cli where nk = g.nk order by created_at asc nulls last, id limit 1;
    for r in select id from _dd_cli where nk = g.nk and id <> v_keeper order by created_at asc nulls last, id loop
      select documento into kdoc from public.clientes where id = v_keeper;
      select documento into ddoc from public.clientes where id = r.id;
      -- documentos (CNPJ/CPF) diferentes = pessoas/empresas diferentes com o mesmo nome: não unifica
      if coalesce(regexp_replace(kdoc, '\D', '', 'g'), '') <> '' and coalesce(regexp_replace(ddoc, '\D', '', 'g'), '') <> ''
         and regexp_replace(kdoc, '\D', '', 'g') <> regexp_replace(ddoc, '\D', '', 'g') then
        v_conflito_doc := v_conflito_doc + 1; continue;
      end if;
      begin
        perform public.spy__merge_pair('clientes', p_tenant, v_keeper, r.id);
        v_mesclados := v_mesclados + 1;
      exception when others then
        v_erros := v_erros + 1; v_msg := sqlerrm;
      end;
    end loop;
  end loop;

  return jsonb_build_object('modo', 'aplicado', 'mesclados_nesta_chamada', v_mesclados, 'ignorados_documento_diferente', v_conflito_doc,
    'erros', v_erros, 'ultimo_erro', v_msg, 'grupos_antes', v_grupos, 'registros_a_unificar_antes', v_extras,
    'repita_ate_mesclados_ser_zero', v_mesclados > 0);
end
$fn$;

-- ───────────────────────── 3b) leads duplicados (mesmo funil) ─────────────────────────
-- Chave: celular (55 + DDD + 9 dígitos) ou e-mail; fixo só junto com o mesmo nome. Dentro do MESMO funil
-- (a mesma pessoa em funis diferentes é negócio diferente e não é tocada).
create or replace function public.spy_dedupe_leads(p_tenant uuid, p_apply boolean default false, p_limit int default 300)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  g record; r record; v_keeper text;
  v_grupos int; v_extras int; v_mesclados int := 0; v_erros int := 0; v_msg text; v_exemplos jsonb;
begin
  perform public.spy__assert_admin(p_tenant);
  drop table if exists _dd_lead;
  create temp table _dd_lead on commit drop as
    select l.id::text id, l.created_at, l.name,
      (case when l."stageId" ~ '-[0-9]+$' then regexp_replace(l."stageId", '-[0-9]+$', '') else coalesce(l."pipelineId", '') end) funil,
      (case
        when l.phone ~ '^55[0-9]{2}9[0-9]{8}$' then 'p:' || l.phone
        when coalesce(l.email, '') <> '' then 'e:' || lower(btrim(l.email))
        when length(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g')) >= 10
             and not public.spy__is_generic_name(public.spy__norm_name(l.name))
          then 'f:' || regexp_replace(l.phone, '\D', '', 'g') || '|' || public.spy__norm_name(l.name)
      end) k
    from public.leads l where l.tenant_id = p_tenant;
  delete from _dd_lead where k is null;
  create index on _dd_lead (funil, k);

  select count(*), coalesce(sum(n - 1), 0) into v_grupos, v_extras
    from (select funil, k, count(*) n from _dd_lead group by funil, k having count(*) > 1) x;
  select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'funil', funil, 'ocorrencias', n) order by n desc), '[]'::jsonb) into v_exemplos
    from (select min(name) nome, funil, count(*) n from _dd_lead group by funil, k having count(*) > 1 order by count(*) desc limit 15) x;

  if not p_apply then
    return jsonb_build_object('modo', 'simulacao', 'leads_no_cadastro', (select count(*) from public.leads where tenant_id = p_tenant),
      'grupos_com_duplicata', v_grupos, 'registros_a_unificar', v_extras, 'exemplos', v_exemplos);
  end if;

  for g in select funil, k from _dd_lead group by funil, k having count(*) > 1 order by funil, k limit greatest(p_limit, 1) loop
    select id into v_keeper from _dd_lead where funil = g.funil and k = g.k order by created_at asc nulls last, id limit 1;
    for r in select id from _dd_lead where funil = g.funil and k = g.k and id <> v_keeper order by created_at asc nulls last, id loop
      begin
        perform public.spy__merge_pair('leads', p_tenant, v_keeper, r.id);
        v_mesclados := v_mesclados + 1;
      exception when others then
        v_erros := v_erros + 1; v_msg := sqlerrm;
      end;
    end loop;
  end loop;

  return jsonb_build_object('modo', 'aplicado', 'mesclados_nesta_chamada', v_mesclados, 'erros', v_erros, 'ultimo_erro', v_msg,
    'grupos_antes', v_grupos, 'registros_a_unificar_antes', v_extras, 'repita_ate_mesclados_ser_zero', v_mesclados > 0);
end
$fn$;

-- ───────────────────────── 4) funil → base de clientes ─────────────────────────
-- Cada lead do funil vira (ou se liga a) um cliente: pelo vínculo atual, depois CNPJ/CPF, e-mail e nome. Com p_apply:
-- grava o lead no log, apaga os leads e o funil, e marca o funil como "ignorado" nas importações (não volta no
-- próximo "Importar").
create or replace function public.spy_promote_funil_para_clientes(p_tenant uuid, p_funil text, p_apply boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  lr record; v_cli text; v_nk text; v_total int := 0; v_ja int := 0; v_casou int := 0; v_criar int := 0; v_removidos int := 0;
  v_doc text; v_ids jsonb;
begin
  perform public.spy__assert_admin(p_tenant);
  if coalesce(p_funil, '') = '' then raise exception 'Informe o funil.'; end if;

  for lr in select id, name, company, email, phone, cnpj, "clientId" cid from public.leads
            where tenant_id = p_tenant and "stageId" like p_funil || '-%' order by created_at asc, id loop
    v_total := v_total + 1; v_cli := null;
    if coalesce(lr.cid, '') <> '' then select id into v_cli from public.clientes where id = lr.cid and tenant_id = p_tenant; end if;
    if v_cli is not null then v_ja := v_ja + 1; continue; end if;

    v_doc := regexp_replace(coalesce(lr.cnpj, ''), '\D', '', 'g');
    v_nk := public.spy__norm_name(coalesce(nullif(lr.company, ''), lr.name));
    if v_doc <> '' then
      select id into v_cli from public.clientes where tenant_id = p_tenant and regexp_replace(coalesce(documento, ''), '\D', '', 'g') = v_doc order by created_at limit 1;
    end if;
    if v_cli is null and coalesce(lr.email, '') <> '' then
      select id into v_cli from public.clientes where tenant_id = p_tenant and lower(btrim(email)) = lower(btrim(lr.email)) order by created_at limit 1;
    end if;
    if v_cli is null and not public.spy__is_generic_name(v_nk) then
      select id into v_cli from public.clientes where tenant_id = p_tenant and public.spy__norm_name(name) = v_nk order by created_at limit 1;
    end if;

    if v_cli is not null then
      v_casou := v_casou + 1;
    else
      v_criar := v_criar + 1;
      if p_apply then
        v_cli := gen_random_uuid()::text;
        insert into public.clientes (id, tenant_id, name, phone, email, documento, status)
        values (v_cli, p_tenant, coalesce(nullif(lr.company, ''), lr.name), nullif(lr.phone, ''), nullif(lr.email, ''), nullif(lr.cnpj, ''), 'Ativo');
      end if;
    end if;

    if p_apply and v_cli is not null then
      update public.leads set "clientId" = v_cli, "clientName" = (select name from public.clientes where id = v_cli) where id = lr.id;
    end if;
  end loop;

  if not p_apply then
    return jsonb_build_object('modo', 'simulacao', 'leads_no_funil', v_total, 'ja_ligados_a_cliente', v_ja,
      'ligar_a_cliente_existente', v_casou, 'criar_cliente', v_criar);
  end if;

  insert into public.dedupe_merge_log (tenant_id, entity, keeper_id, merged_id, merged_row)
  select p_tenant, 'funil_removido', coalesce(l."clientId", ''), l.id::text, to_jsonb(l)
    from public.leads l where l.tenant_id = p_tenant and l."stageId" like p_funil || '-%'
  on conflict (tenant_id, entity, merged_id) do nothing;
  delete from public.leads where tenant_id = p_tenant and "stageId" like p_funil || '-%';
  get diagnostics v_removidos = row_count;
  delete from public.crm_funis where id = p_funil and tenant_id::text = p_tenant::text;

  select coalesce(value -> 'ids', '[]'::jsonb) into v_ids from public.app_settings where tenant_id = p_tenant and key = 'funis_importacao_ignorados';
  v_ids := coalesce(v_ids, '[]'::jsonb);
  if not (v_ids ? p_funil) then v_ids := v_ids || to_jsonb(p_funil); end if;
  insert into public.app_settings (tenant_id, key, value) values (p_tenant, 'funis_importacao_ignorados', jsonb_build_object('ids', v_ids))
  on conflict (tenant_id, key) do update set value = excluded.value;

  return jsonb_build_object('modo', 'aplicado', 'leads_no_funil', v_total, 'ja_ligados_a_cliente', v_ja,
    'ligados_a_cliente_existente', v_casou, 'clientes_criados', v_criar, 'leads_removidos', v_removidos, 'funil_removido', p_funil);
end
$fn$;

-- Só administradores (a função confere) e o service role; nunca o papel anônimo.
revoke execute on function public.spy_dedupe_clientes(uuid, boolean, int) from public, anon;
revoke execute on function public.spy_dedupe_leads(uuid, boolean, int) from public, anon;
revoke execute on function public.spy_promote_funil_para_clientes(uuid, text, boolean) from public, anon;
revoke execute on function public.spy__merge_pair(text, uuid, text, text) from public, anon, authenticated;
revoke execute on function public.spy__assert_admin(uuid) from public, anon;
grant execute on function public.spy_dedupe_clientes(uuid, boolean, int) to authenticated, service_role;
grant execute on function public.spy_dedupe_leads(uuid, boolean, int) to authenticated, service_role;
grant execute on function public.spy_promote_funil_para_clientes(uuid, text, boolean) to authenticated, service_role;
