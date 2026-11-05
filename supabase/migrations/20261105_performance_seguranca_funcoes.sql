-- 1) Índice em toda chave estrangeira que ainda não tem um (66 no momento). Evita varredura completa
--    em JOIN e em DELETE em cascata quando as tabelas passarem de 100 mil linhas.
do $$
declare
  r record;
  cols text;
  nome text;
begin
  for r in
    select c.oid as cid, c.conrelid, c.conkey, t.relname, n.nspname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where c.contype = 'f' and n.nspname = 'public'
      and not exists (
        select 1 from pg_index i
        where i.indrelid = c.conrelid
          and (string_to_array(i.indkey::text, ' ')::int2[])[1:array_length(c.conkey, 1)] = c.conkey
      )
  loop
    select string_agg(quote_ident(a.attname), ', ' order by k.ord), string_agg(a.attname, '_' order by k.ord)
      into cols, nome
    from unnest(r.conkey) with ordinality as k(attnum, ord)
    join pg_attribute a on a.attrelid = r.conrelid and a.attnum = k.attnum;
    execute format('create index if not exists %I on %I.%I (%s)', left('ix_' || r.relname || '_' || nome, 63), r.nspname, r.relname, cols);
  end loop;
end $$;

-- 2) Funções sem search_path fixo (alerta do Supabase): fixa em public + extensions (pg_trgm).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as assinatura
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and p.proconfig is null
      and p.proname in ('spy_touch_updated_at','_dedup_notes','_dedup_notes_text','_repair_unified_notes','_fix_notes',
        'crm_funis_etapas_obrigatorias','spy_normalize_lead_customfields','implementations_touch','norm_nome',
        'vendedor_confere_nome','notas_entrada_touch','ordens_servico_before_insert','ordens_servico_touch','saude_touch_updated_at')
  loop
    execute format('alter function %s set search_path = public, extensions, pg_temp', f.assinatura);
  end loop;
end $$;
