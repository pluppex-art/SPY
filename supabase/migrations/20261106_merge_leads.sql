-- Mesclar cards: junta o card "origem" no card "principal" (quem entrou em contato primeiro), a pedido do usuario.
-- Tudo numa transacao: ou mescla por inteiro ou nao muda nada.
--  * leva para o principal TUDO que aponta para o card de origem (FKs e colunas lead_id, descobertas dinamicamente;
--    reunioes usam "leadId", tratado a parte);
--  * notas do app sao um JSON (lista): as duas listas sao juntadas, e as do card de origem ficam na aba da pessoa dele;
--  * a pessoa do card de origem vira "pessoa do negocio" (lead_contatos) do principal;
--  * dois cards no mesmo funil sao o caso normal: o principal mantem o proprio lugar no funil;
--  * completa campos vazios do principal com os do card de origem (o principal manda nos demais);
--  * guarda uma COPIA COMPLETA do card mesclado em customFields.mergedLeads do principal (da para recuperar);
--  * remove o card de origem (mesmo caminho do botao Excluir do app).

create or replace function public.spy__parse_notes(p text) returns jsonb
language plpgsql as $fn$
declare j jsonb;
begin
  if p is null or btrim(p) = '' then return '[]'::jsonb; end if;
  begin
    j := p::jsonb;
    if jsonb_typeof(j) = 'array' then return j; end if;
  exception when others then null;
  end;
  return jsonb_build_array(jsonb_build_object(
    'id', gen_random_uuid()::text, 'text', btrim(p), 'author', 'Sistema',
    'createdAt', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'category', 'geral'));
end
$fn$;

create or replace function public.merge_leads(p_target uuid, p_source uuid)
returns jsonb language plpgsql security definer set search_path = public as $fn$
declare
  t public.leads%rowtype; s public.leads%rowtype;
  v_dt text; v_dt_alt text; v_ds text; v_ds_alt text;
  v_nt jsonb; v_ns jsonb; v_notes jsonb;
  v_cf_t jsonb; v_cf_s jsonb; v_cf jsonb;
  v_contato uuid; v_novo boolean := false;
  r record; n bigint; v_moved jsonb := '{}'::jsonb; v_reunioes bigint := 0; v_extras_removidos bigint := 0;
begin
  if auth.uid() is null then raise exception 'Faça login para mesclar cards.' using errcode = '28000'; end if;
  if p_target is null or p_source is null or p_target = p_source then
    raise exception 'Escolha dois cards diferentes.' using errcode = '22023';
  end if;

  -- trava os dois em ordem fixa (evita deadlock se alguem mesclar o par ao contrario ao mesmo tempo)
  perform 1 from public.leads where id in (p_target, p_source) order by id for update;
  select * into t from public.leads where id = p_target and deleted_at is null;
  select * into s from public.leads where id = p_source and deleted_at is null;
  if t.id is null or s.id is null then raise exception 'Card não encontrado (já foi mesclado ou excluído).' using errcode = 'P0002'; end if;
  if t.tenant_id is distinct from s.tenant_id then raise exception 'Os dois cards precisam ser da mesma empresa.' using errcode = '22023'; end if;
  if not public.has_tenant_access(t.tenant_id) then raise exception 'Sem acesso a esta empresa.' using errcode = '42501'; end if;
  if public.usuario_restrito_aos_proprios_dados()
     and not (public.lead_e_do_usuario(t.seller, t.seller_id) and public.lead_e_do_usuario(s.seller, s.seller_id)) then
    raise exception 'Seu perfil só pode mesclar cards que são seus.' using errcode = '42501';
  end if;

  v_dt  := regexp_replace(coalesce(t.phone, ''), '\D', '', 'g');
  v_ds  := regexp_replace(coalesce(s.phone, ''), '\D', '', 'g');
  v_dt_alt := case when v_dt like '55%' then substr(v_dt, 3) else '55' || v_dt end;
  v_ds_alt := case when v_ds like '55%' then substr(v_ds, 3) else '55' || v_ds end;

  -- conflitos: numero repetido entre as pessoas, funil, memoria comercial, etiquetas e campos extras
  delete from public.lead_contatos where lead_id = p_source and phone_digits in (v_dt, v_dt_alt);
  get diagnostics v_extras_removidos = row_count;
  delete from public.lead_funis where lead_id = p_source;
  delete from public.lead_commercial_memory
   where lead_id = p_source and exists (select 1 from public.lead_commercial_memory m where m.lead_id = p_target);
  delete from public.lead_tags a using public.lead_tags b
   where a.lead_id = p_source and b.lead_id = p_target and a.tag_id = b.tag_id;
  delete from public.lead_custom_values a using public.lead_custom_values b
   where a.lead_id = p_source and b.lead_id = p_target and a.custom_field_id = b.custom_field_id;

  -- a pessoa do card de origem vira pessoa do negocio do principal (se tiver telefone e nao for o mesmo numero)
  select id into v_contato from public.lead_contatos
   where tenant_id = t.tenant_id and phone_digits in (v_ds, v_ds_alt) and lead_id in (p_source, p_target) limit 1;
  if v_contato is null and length(v_ds) >= 8 and v_dt not in (v_ds, v_ds_alt) then
    if exists (select 1 from public.lead_contatos where tenant_id = t.tenant_id and phone_digits in (v_ds, v_ds_alt)) then
      raise exception 'O telefone do card escolhido já está cadastrado como pessoa em outro card.' using errcode = '23505';
    end if;
    v_contato := gen_random_uuid();
    v_novo := true;
  end if;

  -- notas: junta as duas listas; as do card de origem ficam na aba da pessoa dele
  v_nt := public.spy__parse_notes(t.notes);
  v_ns := public.spy__parse_notes(s.notes);
  v_ns := coalesce((
    select jsonb_agg(case when jsonb_typeof(e) = 'object' and not (e ? 'pessoaId') and v_contato is not null
             then e || jsonb_build_object('pessoaId', v_contato::text, 'pessoa', coalesce(nullif(btrim(s.name), ''), 'Sem nome'))
             else e end)
      from jsonb_array_elements(v_ns) e), '[]'::jsonb);
  v_notes := coalesce((
    select jsonb_agg(x.e order by x.e ->> 'createdAt' desc nulls last)
      from (select e from jsonb_array_elements(v_nt) e union all select e from jsonb_array_elements(v_ns) e) x), '[]'::jsonb);

  -- leva todos os vinculos do card de origem para o principal
  for r in
    select c.conrelid::regclass::text as tbl, a.attname::text as col, format_type(a.atttypid, a.atttypmod) as typ
      from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and array_length(c.conkey, 1) = 1 and c.confrelid = 'public.leads'::regclass
    union
    select format('public.%I', cl.relname), a.attname::text, format_type(a.atttypid, a.atttypmod)
      from pg_attribute a join pg_class cl on cl.oid = a.attrelid join pg_namespace ns on ns.oid = cl.relnamespace
     where ns.nspname = 'public' and cl.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped and a.attname = 'lead_id'
  loop
    execute format('update %s set %I = $1::%s where %I::text = $2', r.tbl, r.col, r.typ, r.col) using p_target::text, p_source::text;
    get diagnostics n = row_count;
    if n > 0 then v_moved := v_moved || jsonb_build_object(r.tbl || '.' || r.col, n); end if;
  end loop;

  -- reunioes guardam o card em "leadId" (texto)
  update public.reunioes set "leadId" = p_target::text where "leadId" = p_source::text;
  get diagnostics v_reunioes = row_count;

  -- campos extras: o principal manda; a copia completa do card mesclado fica guardada para recuperar
  v_cf_t := case when jsonb_typeof(t."customFields") = 'object' then t."customFields" else '{}'::jsonb end;
  v_cf_s := case when jsonb_typeof(s."customFields") = 'object' then s."customFields" else '{}'::jsonb end;
  v_cf := v_cf_s || v_cf_t;
  v_cf := jsonb_set(v_cf, '{mergedLeads}',
    case when jsonb_typeof(v_cf_t -> 'mergedLeads') = 'array' then v_cf_t -> 'mergedLeads' else '[]'::jsonb end
    || jsonb_build_array(jsonb_build_object('id', s.id, 'name', s.name, 'phone', s.phone, 'mergedAt', now(),
         'mergedBy', auth.uid(), 'movido', v_moved, 'row', to_jsonb(s))), true);

  update public.leads set
    notes = v_notes::text,
    email = coalesce(nullif(t.email, ''), s.email),
    company = coalesce(nullif(t.company, ''), s.company),
    cnpj = coalesce(nullif(t.cnpj, ''), s.cnpj),
    "clientId" = coalesce(nullif(t."clientId", ''), s."clientId"),
    "clientName" = coalesce(nullif(t."clientName", ''), s."clientName"),
    value = case when coalesce(t.value, 0) = 0 then s.value else t.value end,
    "productIds" = (select coalesce(array_agg(distinct x), '{}'::text[]) from unnest(coalesce(t."productIds", '{}'::text[]) || coalesce(s."productIds", '{}'::text[])) x),
    "customFields" = v_cf,
    updated_at = now()
   where id = p_target;

  insert into public.lead_activities (id, tenant_id, lead_id, type, title, description, date, seller)
  values ('merge-' || p_source, t.tenant_id, p_target::text, 'Outro', 'Cards mesclados',
          format('O card "%s" (%s) foi mesclado neste card. Notas, tarefas, propostas, contratos, reuniões e histórico foram trazidos para cá.',
                 coalesce(nullif(btrim(s.name), ''), 'sem nome'), coalesce(nullif(s.phone, ''), 'sem telefone')),
          to_char(now() at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'), 'Sistema')
  on conflict (id) do nothing;

  -- remove o card de origem (os vinculos ja foram movidos) e so entao cadastra a pessoa dele (o guard compara com leads existentes)
  delete from public.leads where id = p_source and tenant_id = t.tenant_id;

  if v_novo then
    insert into public.lead_contatos (id, tenant_id, lead_id, nome, telefone)
    values (v_contato, t.tenant_id, p_target, coalesce(nullif(btrim(s.name), ''), 'Sem nome'), s.phone);
  end if;

  return jsonb_build_object('ok', true, 'principal', p_target, 'mesclado', p_source,
    'movido', v_moved, 'reunioes', v_reunioes, 'pessoa_criada', v_novo,
    'notas', jsonb_array_length(v_notes), 'telefones_repetidos_removidos', v_extras_removidos);
end
$fn$;

revoke execute on function public.merge_leads(uuid, uuid) from public, anon;
grant execute on function public.merge_leads(uuid, uuid) to authenticated, service_role;
revoke execute on function public.spy__parse_notes(text) from public, anon;
