-- Exclusão completa de uma empresa (fase 3 do ciclo de vida). Só o servidor (service_role) executa; a tela é só do master.
--
-- Travas: a empresa dona do sistema nunca é excluída; empresa com usuário master não é excluída; a empresa precisa estar
-- desabilitada; se um registro de OUTRA empresa apontar para um registro desta, nada começa. O apagamento é feito em
-- etapas (cada chamada é uma transação e respeita um orçamento de tempo), porque há empresas com mais de 1 milhão de registros.
-- Pagamento confirmado e conta do plano padrão continuam sem poder ser apagados no dia a dia: a única exceção é esta função.

-- Registro de cada exclusão. A coluna NÃO se chama tenant_id de propósito: o registro tem que sobreviver à exclusão.
create table if not exists public.empresa_exclusoes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  empresa_nome text not null,
  backup_id text not null,
  excluido_por uuid not null,
  status text not null default 'iniciada' check (status in ('iniciada','apagando','banco_apagado','com_pendencias','concluida','cancelada')),
  -- O que falta limpar fora do banco (logins, arquivos, sessões de WhatsApp, fluxos do n8n, cobrança) e o resultado.
  plano jsonb not null default '{}'::jsonb,
  registros_apagados bigint not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create unique index if not exists empresa_exclusoes_uma_por_empresa on public.empresa_exclusoes (empresa_id) where status <> 'cancelada';
alter table public.empresa_exclusoes enable row level security; -- sem política: o navegador não lê nem escreve
revoke all on public.empresa_exclusoes from public, anon, authenticated;
grant select, insert, update on public.empresa_exclusoes to service_role;

-- Toda tabela com a coluna tenant_id (uuid), inclusive as cópias guardadas no esquema backups.
create or replace function public.spy_exclusao_tabelas()
returns table (tabela regclass, nome text)
language sql stable set search_path = pg_catalog, pg_temp as $$
  select c.oid::regclass, case when n.nspname = 'public' then c.relname::text else n.nspname || '.' || c.relname end
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped and a.atttypid = 'uuid'::regtype
   where n.nspname in ('public', 'backups') and c.relkind in ('r', 'p') and not c.relispartition
   order by 2
$$;

-- Só lê: o que impede a exclusão e quantos registros a empresa tem em cada tabela.
create or replace function public.spy_exclusao_conferir(p_tenant uuid)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp set statement_timeout = '55s' as $$
declare
  v_bloqueios text[] := '{}';
  v_tabelas jsonb := '{}'::jsonb;
  v_total bigint := 0;
  n bigint;
  r record;
begin
  if not exists (select 1 from public.tenants where id = p_tenant) then
    return jsonb_build_object('existe', false);
  end if;
  if p_tenant = '27ef95ee-84dd-499e-9f25-cd9baecb5fe4'::uuid then
    v_bloqueios := v_bloqueios || 'Esta é a empresa dona do sistema e nunca pode ser excluída.'::text;
  end if;
  if exists (select 1 from public.users where tenant_id = p_tenant and is_master) then
    v_bloqueios := v_bloqueios || 'A empresa tem usuário master. Mova o master para outra empresa antes.'::text;
  end if;

  for r in
    select n2.nspname || '.' || c.relname as nome
      from pg_class c join pg_namespace n2 on n2.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped and a.atttypid <> 'uuid'::regtype
     where n2.nspname in ('public', 'backups') and c.relkind in ('r', 'p')
  loop
    v_bloqueios := v_bloqueios || format('A tabela %s guarda a empresa em um formato que a exclusão não trata.', r.nome);
  end loop;

  -- Registro de outra empresa apontando para um registro desta (apagaria ou quebraria dado alheio).
  for r in
    select con.conrelid::regclass as filha, con.confrelid::regclass as pai,
           (select string_agg(format('f.%I = p.%I', fa.attname, pa.attname), ' and ' order by k.i)
              from unnest(con.conkey, con.confkey) with ordinality as k(f, p, i)
              join pg_attribute fa on fa.attrelid = con.conrelid and fa.attnum = k.f
              join pg_attribute pa on pa.attrelid = con.confrelid and pa.attnum = k.p) as ligacao
      from pg_constraint con
     where con.contype = 'f'
       and con.conrelid in (select t.tabela from public.spy_exclusao_tabelas() t)
       and con.confrelid in (select t.tabela from public.spy_exclusao_tabelas() t)
  loop
    execute format('select count(*) from %s f join %s p on %s where p.tenant_id = $1 and f.tenant_id is distinct from $1', r.filha, r.pai, r.ligacao)
      into n using p_tenant;
    if n > 0 then
      v_bloqueios := v_bloqueios || format('%s registro(s) de outra empresa em %s apontam para %s desta empresa.', n, r.filha, r.pai);
    end if;
  end loop;

  -- O mesmo para quem aponta para o cadastro da empresa por uma coluna que não é a dona do registro.
  for r in
    select con.conrelid::regclass as filha, a.attname as coluna
      from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = con.conkey[1]
     where con.contype = 'f' and con.confrelid = 'public.tenants'::regclass and con.confdeltype <> 'n' and a.attname <> 'tenant_id'
       and con.conrelid in (select t.tabela from public.spy_exclusao_tabelas() t)
  loop
    execute format('select count(*) from %s where %I = $1 and tenant_id is distinct from $1', r.filha, r.coluna) into n using p_tenant;
    if n > 0 then
      v_bloqueios := v_bloqueios || format('%s registro(s) de outra empresa em %s apontam para esta empresa.', n, r.filha);
    end if;
  end loop;

  for r in select * from public.spy_exclusao_tabelas() loop
    execute format('select count(*) from %s where tenant_id = $1', r.tabela) into n using p_tenant;
    if n > 0 then
      v_tabelas := v_tabelas || jsonb_build_object(r.nome, n);
      v_total := v_total + n;
    end if;
  end loop;

  return jsonb_build_object('existe', true, 'bloqueios', to_jsonb(v_bloqueios), 'tabelas', v_tabelas, 'registros', v_total);
end $$;

-- Apaga os dados da empresa registrada em empresa_exclusoes. Chamar de novo até "concluido" ser verdadeiro.
create or replace function public.spy_exclusao_executar(p_exclusao uuid, p_tempo_ms integer default 20000, p_lote integer default 5000)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp set statement_timeout = '55s' set lock_timeout = '8s' as $$
declare
  e public.empresa_exclusoes%rowtype;
  v_pendentes regclass[];
  v_tabela regclass;
  v_fim timestamptz;
  v_apagados bigint := 0;
  v_progrediu boolean;
  v_sem_ordem boolean := false;
  v_concluido boolean := false;
  v_existe boolean;
  v_erro text;
  v_bloqueios jsonb;
  n bigint;
begin
  select * into e from public.empresa_exclusoes where id = p_exclusao for update;
  if not found then raise exception 'Exclusão não encontrada.'; end if;
  if e.status in ('banco_apagado', 'com_pendencias', 'concluida') then
    return jsonb_build_object('concluido', true, 'apagados', 0, 'restantes', 0);
  end if;
  if e.status not in ('iniciada', 'apagando') then raise exception 'Esta exclusão foi cancelada.'; end if;

  -- Travas repetidas a cada chamada.
  if e.empresa_id = '27ef95ee-84dd-499e-9f25-cd9baecb5fe4'::uuid then raise exception 'A empresa dona do sistema nunca pode ser excluída.'; end if;
  if exists (select 1 from public.users where tenant_id = e.empresa_id and is_master) then raise exception 'A empresa tem usuário master.'; end if;
  if exists (select 1 from public.tenants where id = e.empresa_id and name is distinct from e.empresa_nome) then
    raise exception 'O nome da empresa mudou depois da confirmação. Comece de novo.';
  end if;
  if exists (select 1 from public.tenants where id = e.empresa_id and coalesce(status, 'Active') = 'Active') then
    raise exception 'Desabilite a empresa antes de excluir.';
  end if;
  if e.status = 'iniciada' then
    v_bloqueios := public.spy_exclusao_conferir(e.empresa_id) -> 'bloqueios';
    if jsonb_array_length(coalesce(v_bloqueios, '[]'::jsonb)) > 0 then
      raise exception '%', (select string_agg(x, ' ') from jsonb_array_elements_text(v_bloqueios) x);
    end if;
  end if;

  -- Libera, só dentro desta transação, as travas de "pagamento não se apaga" e "conta padrão não se exclui".
  perform set_config('spy.excluindo_empresa', e.empresa_id::text, true);

  v_fim := clock_timestamp() + make_interval(secs => greatest(p_tempo_ms, 1) / 1000.0);
  select coalesce(array_agg(t.tabela), '{}') into v_pendentes from public.spy_exclusao_tabelas() t;

  loop
    v_progrediu := false;
    foreach v_tabela in array v_pendentes loop
      exit when clock_timestamp() > v_fim;
      execute format('select exists (select 1 from %s where tenant_id = $1)', v_tabela) into v_existe using e.empresa_id;
      if not v_existe then
        v_pendentes := array_remove(v_pendentes, v_tabela);
        v_progrediu := true;
        continue;
      end if;
      -- Filhas primeiro: espera enquanto outra tabela pendente aponta para esta.
      if not v_sem_ordem and exists (
        select 1 from pg_constraint c where c.contype = 'f' and c.confrelid = v_tabela and c.conrelid <> v_tabela and c.conrelid = any (v_pendentes)
      ) then
        continue;
      end if;
      begin
        execute format('delete from %s where ctid = any (array(select ctid from %s where tenant_id = $1 limit $2))', v_tabela, v_tabela)
          using e.empresa_id, greatest(p_lote, 1);
        get diagnostics n = row_count;
      exception when foreign_key_violation or restrict_violation then
        -- Tabela que aponta para si mesma: o lote separa pai e filho, então apaga tudo dela de uma vez.
        begin
          execute format('delete from %s where tenant_id = $1', v_tabela) using e.empresa_id;
          get diagnostics n = row_count;
        exception when foreign_key_violation or restrict_violation then
          n := 0;
          v_erro := format('%s: %s', v_tabela, sqlerrm);
        end;
      end;
      if n > 0 then
        v_apagados := v_apagados + n;
        v_progrediu := true;
      end if;
    end loop;

    if cardinality(v_pendentes) = 0 then
      -- Confere de novo: um gatilho ou uma automação pode ter gravado algo enquanto apagava.
      for v_tabela in select t.tabela from public.spy_exclusao_tabelas() t loop
        execute format('select exists (select 1 from %s where tenant_id = $1)', v_tabela) into v_existe using e.empresa_id;
        if v_existe then v_pendentes := v_pendentes || v_tabela; end if;
      end loop;
      if cardinality(v_pendentes) = 0 then
        delete from public.tenants where id = e.empresa_id;
        v_concluido := true;
        exit;
      end if;
    end if;
    exit when clock_timestamp() > v_fim;

    if v_progrediu then
      v_sem_ordem := false;
    elsif not v_sem_ordem then
      v_sem_ordem := true; -- tabelas que apontam uma para a outra: tenta sem esperar
    else
      raise exception 'Não foi possível apagar: %', coalesce(v_erro, array_to_string(v_pendentes, ', '));
    end if;
  end loop;

  update public.empresa_exclusoes
     set status = case when v_concluido then 'banco_apagado' else 'apagando' end,
         registros_apagados = registros_apagados + v_apagados, atualizado_em = now()
   where id = e.id;

  return jsonb_build_object('concluido', v_concluido, 'apagados', v_apagados, 'restantes', cardinality(v_pendentes));
end $$;

revoke all on function public.spy_exclusao_tabelas() from public, anon, authenticated;
revoke all on function public.spy_exclusao_conferir(uuid) from public, anon, authenticated;
revoke all on function public.spy_exclusao_executar(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.spy_exclusao_tabelas() to service_role;
grant execute on function public.spy_exclusao_conferir(uuid) to service_role;
grant execute on function public.spy_exclusao_executar(uuid, integer, integer) to service_role;

-- As duas travas abaixo ganham uma única exceção: dentro de spy_exclusao_executar (que roda como o dono do banco) e só
-- para a empresa que está sendo excluída. Usuário logado e chave de serviço continuam barrados como antes.
create or replace function public.finance_entries_nao_apagar_pago()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if current_user = 'postgres' and current_setting('spy.excluindo_empresa', true) = old.tenant_id::text then
    return old;
  end if;
  if old.origem_registro is not null and old.status = 'Pago' then
    raise exception 'Pagamento confirmado não se apaga: faça o estorno.' using errcode = '42501';
  end if;
  return old;
end $$;

create or replace function public.finance_categories_regras()
returns trigger language plpgsql set search_path to 'public' as $$
declare
  v_pai record;
begin
  if tg_op = 'DELETE' then
    if old.padrao and not (current_user = 'postgres' and coalesce(current_setting('spy.excluindo_empresa', true), '') = coalesce(old.tenant_id::text, '-')) then
      raise exception 'Conta do plano padrão não pode ser excluída. Inative-a.' using errcode = '42501';
    end if;
    return old;
  end if;

  -- Conta do plano padrão: a empresa só pode mudar o nome e ativar/inativar
  if tg_op = 'UPDATE' and old.padrao then
    if new.codigo is distinct from old.codigo or new.linha_dre is distinct from old.linha_dre
       or new.parent_id is distinct from old.parent_id or new.nivel is distinct from old.nivel
       or new.tipo is distinct from old.tipo or new.padrao is distinct from old.padrao then
      raise exception 'Em conta do plano padrão só é possível renomear ou inativar.' using errcode = '42501';
    end if;
  end if;

  if new.parent_id is not null then
    select id, tenant_id, nivel, linha_dre into v_pai from public.finance_categories where id = new.parent_id;
    if v_pai.id is null or v_pai.tenant_id is distinct from new.tenant_id then
      raise exception 'Grupo (pai) inválido para esta empresa.';
    end if;
    if v_pai.nivel is distinct from 1 then
      raise exception 'Só existem dois níveis: a conta precisa estar dentro de um grupo.';
    end if;
    new.nivel := 2;
    new.linha_dre := v_pai.linha_dre;           -- herdada; ignora o que foi enviado
  elsif new.nivel = 1 and new.linha_dre is null then
    raise exception 'Grupo precisa de uma linha do DRE.';
  end if;
  return new;
end $$;
