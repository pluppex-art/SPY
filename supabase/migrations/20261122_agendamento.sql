-- =============================================================
-- Módulo AGENDAMENTO (origem: sistema do Tô Na Pista Boliche).
-- Reserva de recursos por hora (pistas, quadras, salas…) com capacidade, preço, mesas, check-in por unidade,
-- pagamento (balcão, comanda e online) e página pública de agendamento.
--
-- SEGURANÇA: as telas só LEEM estas tabelas (policy de SELECT por empresa). Toda escrita passa pelo servidor
-- (service role), que valida regras, permissões e preço. As funções abaixo gravam com trava por dia para que duas
-- pessoas nunca consigam reservar a mesma última vaga ao mesmo tempo, e só o service role pode executá-las.
-- Tudo é aditivo (create if not exists): pode rodar mais de uma vez.
-- =============================================================

-- ─── configuração (1 linha por empresa) ──────────────────────
create table if not exists public.agendamento_config (
  tenant_id uuid primary key references public.tenants(id) on delete cascade default public.current_tenant_id(),
  slug text,
  ativo boolean not null default true,
  nome_estabelecimento text,
  endereco text,
  telefone text,
  whatsapp text,
  logo_url text,
  recurso_singular text not null default 'Pista',
  recurso_plural text not null default 'Pistas',
  qtd_recursos integer not null default 1 check (qtd_recursos between 1 and 200),
  pessoas_por_recurso integer not null default 6 check (pessoas_por_recurso between 1 and 200),
  preco_dia_util numeric(12,2) not null default 0 check (preco_dia_util >= 0),
  preco_fim_semana numeric(12,2) not null default 0 check (preco_fim_semana >= 0),
  dias_fim_semana integer[] not null default '{0,5,6}',
  -- 7 itens (0 = domingo): {"aberto":true,"inicio":18,"fim":0}
  horarios jsonb not null default '[{"aberto":true,"inicio":17,"fim":0},{"aberto":false,"inicio":18,"fim":0},{"aberto":true,"inicio":18,"fim":0},{"aberto":true,"inicio":18,"fim":0},{"aberto":true,"inicio":18,"fim":0},{"aberto":true,"inicio":18,"fim":0},{"aberto":true,"inicio":17,"fim":0}]'::jsonb,
  datas_bloqueadas date[] not null default '{}',
  tipos_evento text[] not null default '{"Jogo normal","Aniversário","Empresa","Família","Outro"}',
  expiracao_pendente_min integer not null default 30 check (expiracao_pendente_min between 5 and 240),
  fuso text not null default 'America/Sao_Paulo',
  pagamento_online boolean not null default false,
  mesas_ativo boolean not null default false,
  mesas_max_por_dia integer not null default 25 check (mesas_max_por_dia between 0 and 500),
  cadeiras_max integer not null default 25 check (cadeiras_max between 1 and 36),
  -- O que quem não é administrador pode fazer (administrador pode tudo).
  permissoes_equipe jsonb not null default '{"criar":true,"editar":true,"cancelar":false,"receber":true,"sem_contato":false}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agendamento_config_slug_formato check (slug is null or slug ~ '^[a-z0-9][a-z0-9-]{2,60}$')
);
create unique index if not exists agendamento_config_slug_uq on public.agendamento_config (lower(slug)) where slug is not null;

-- ─── reservas ────────────────────────────────────────────────
create table if not exists public.agendamento_reservas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  -- Uma compra com várias faixas de horário vira várias reservas do mesmo grupo (o pagamento confirma o grupo todo).
  grupo_id uuid not null default gen_random_uuid(),
  data date not null,
  hora text not null check (hora ~ '^\d{1,2}:[0-5]\d$'),
  inicio_min integer not null default 0,
  duracao numeric(4,1) not null check (duracao > 0 and duracao <= 24),
  qtd_recursos integer not null check (qtd_recursos >= 1),
  qtd_pessoas integer not null default 0 check (qtd_pessoas >= 0),
  valor_total numeric(12,2) not null default 0 check (valor_total >= 0),
  tipo_evento text,
  observacoes text,
  status text not null default 'Pendente' check (status in ('Pendente','Confirmada','Check-in','Cancelada','No-show')),
  status_pagamento text not null default 'Pendente' check (status_pagamento in ('Pendente','Pago','Reembolsado','Pendente Estorno')),
  forma_pagamento text,
  detalhes_pagamento jsonb not null default '[]'::jsonb,
  pagar_no_local boolean not null default false,
  comanda text,
  mesa boolean not null default false,
  mesa_cadeiras integer,
  aniversariante text,
  checkin_ids text[] not null default '{}',
  noshow_ids text[] not null default '{}',
  recursos_atribuidos integer[] not null default '{}',
  origem text not null default 'equipe' check (origem in ('site','equipe','importacao')),
  criado_por uuid,
  criado_por_nome text,
  lead_id uuid,
  contato_nome text not null,
  contato_telefone text,
  contato_email text,
  motivo_cancelamento text,
  mp_preference_id text,
  mp_payment_id text,
  -- Id da reserva no sistema de origem (importação do Tô Na Pista): impede duplicar ao importar de novo.
  externo_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agendamento_reservas_dia_idx on public.agendamento_reservas (tenant_id, data);
create index if not exists agendamento_reservas_grupo_idx on public.agendamento_reservas (grupo_id);
create index if not exists agendamento_reservas_pendentes_idx on public.agendamento_reservas (tenant_id, created_at) where status = 'Pendente';
create unique index if not exists agendamento_reservas_externo_uq on public.agendamento_reservas (tenant_id, externo_id) where externo_id is not null;

create or replace function public.agendamento_set_inicio_min() returns trigger language plpgsql as $$
begin
  new.inicio_min := split_part(new.hora, ':', 1)::int * 60 + split_part(new.hora, ':', 2)::int;
  return new;
end $$;
drop trigger if exists agendamento_reservas_inicio_min on public.agendamento_reservas;
create trigger agendamento_reservas_inicio_min before insert or update of hora on public.agendamento_reservas
  for each row execute function public.agendamento_set_inicio_min();

-- ─── auditoria (quem fez o quê) ──────────────────────────────
create table if not exists public.agendamento_auditoria (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null default public.current_tenant_id() references public.tenants(id) on delete cascade,
  reserva_id uuid,
  user_id uuid,
  user_nome text,
  acao text not null,
  detalhes text,
  created_at timestamptz not null default now()
);
create index if not exists agendamento_auditoria_idx on public.agendamento_auditoria (tenant_id, created_at desc);
create index if not exists agendamento_auditoria_reserva_idx on public.agendamento_auditoria (reserva_id);

-- ─── segurança por empresa: telas só leem; escrita só pelo servidor ───
alter table public.agendamento_config enable row level security;
alter table public.agendamento_reservas enable row level security;
alter table public.agendamento_auditoria enable row level security;

drop policy if exists agendamento_config_select on public.agendamento_config;
create policy agendamento_config_select on public.agendamento_config for select to authenticated
  using ((select public.has_tenant_access(agendamento_config.tenant_id)));
drop policy if exists agendamento_reservas_select on public.agendamento_reservas;
create policy agendamento_reservas_select on public.agendamento_reservas for select to authenticated
  using ((select public.has_tenant_access(agendamento_reservas.tenant_id)));
drop policy if exists agendamento_auditoria_select on public.agendamento_auditoria;
create policy agendamento_auditoria_select on public.agendamento_auditoria for select to authenticated
  using ((select public.has_tenant_access(agendamento_auditoria.tenant_id)));

-- Atualização em tempo real da agenda (a policy de SELECT continua valendo para quem assina).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'agendamento_reservas') then
    alter publication supabase_realtime add table public.agendamento_reservas;
  end if;
end $$;

-- ─── ocupação de uma hora (mesma regra de src/lib/agendamento/engine.ts) ───
create or replace function public.agendamento_ocupados_hora(p_tenant uuid, p_data date, p_hora integer, p_excluir uuid, p_exp_min integer)
returns integer language sql stable set search_path = public as $$
  select coalesce(sum(r.qtd_recursos), 0)::int
  from public.agendamento_reservas r
  where r.tenant_id = p_tenant
    and r.data = p_data
    and r.status <> 'Cancelada'
    and (p_excluir is null or r.id <> p_excluir)
    -- pendente do site/equipe sem pagamento só segura a vaga dentro do prazo
    and not (r.status = 'Pendente' and not r.pagar_no_local and r.created_at < now() - make_interval(mins => p_exp_min))
    and r.inicio_min < (p_hora + 1) * 60
    and r.inicio_min + round(r.duracao * 60)::int > p_hora * 60
$$;

-- Confere TODAS as horas do intervalo; levanta 'sem_vaga:HH:MM' se alguma não comporta.
create or replace function public.agendamento_checar_vaga(p_tenant uuid, p_data date, p_inicio_min integer, p_duracao numeric, p_qtd integer, p_excluir uuid)
returns void language plpgsql stable set search_path = public as $$
declare
  cfg public.agendamento_config;
  fim_min integer := p_inicio_min + round(p_duracao * 60)::int;
  h integer;
begin
  select * into cfg from public.agendamento_config where tenant_id = p_tenant;
  if not found then raise exception 'sem_config'; end if;
  if p_qtd > cfg.qtd_recursos then raise exception 'recursos_demais'; end if;
  for h in (p_inicio_min / 60) .. ((fim_min + 59) / 60 - 1) loop
    if public.agendamento_ocupados_hora(p_tenant, p_data, h, p_excluir, cfg.expiracao_pendente_min) + p_qtd > cfg.qtd_recursos then
      raise exception 'sem_vaga:%', lpad((h % 24)::text, 2, '0') || ':00';
    end if;
  end loop;
end $$;

-- Cria uma ou mais reservas (faixas de horário) de uma vez, tudo ou nada, com trava por dia.
create or replace function public.agendamento_reservar(p_tenant uuid, p_itens jsonb)
returns setof public.agendamento_reservas language plpgsql security definer set search_path = public as $$
declare
  it jsonb;
  d date;
  ini integer;
  rec public.agendamento_reservas;
begin
  if jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then raise exception 'itens_invalidos'; end if;
  -- trava ordenada por data: evita corrida entre pedidos simultâneos e impasse entre eles
  for d in select distinct (x ->> 'data')::date from jsonb_array_elements(p_itens) x order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(p_tenant::text || ':' || d::text, 0));
  end loop;
  for it in select * from jsonb_array_elements(p_itens) loop
    ini := split_part(it ->> 'hora', ':', 1)::int * 60 + split_part(it ->> 'hora', ':', 2)::int;
    perform public.agendamento_checar_vaga(p_tenant, (it ->> 'data')::date, ini, (it ->> 'duracao')::numeric, (it ->> 'qtd_recursos')::int, null);
    insert into public.agendamento_reservas (
      tenant_id, grupo_id, data, hora, duracao, qtd_recursos, qtd_pessoas, valor_total, tipo_evento, observacoes, status, status_pagamento,
      forma_pagamento, detalhes_pagamento, pagar_no_local, comanda, mesa, mesa_cadeiras, aniversariante, origem, criado_por, criado_por_nome,
      lead_id, contato_nome, contato_telefone, contato_email, externo_id, mp_preference_id
    ) values (
      p_tenant, coalesce((it ->> 'grupo_id')::uuid, gen_random_uuid()), (it ->> 'data')::date, it ->> 'hora', (it ->> 'duracao')::numeric,
      (it ->> 'qtd_recursos')::int, coalesce((it ->> 'qtd_pessoas')::int, 0), coalesce((it ->> 'valor_total')::numeric, 0),
      it ->> 'tipo_evento', it ->> 'observacoes', coalesce(it ->> 'status', 'Pendente'), coalesce(it ->> 'status_pagamento', 'Pendente'),
      it ->> 'forma_pagamento', coalesce(it -> 'detalhes_pagamento', '[]'::jsonb), coalesce((it ->> 'pagar_no_local')::boolean, false),
      it ->> 'comanda', coalesce((it ->> 'mesa')::boolean, false), (it ->> 'mesa_cadeiras')::int, it ->> 'aniversariante',
      coalesce(it ->> 'origem', 'equipe'), (it ->> 'criado_por')::uuid, it ->> 'criado_por_nome', (it ->> 'lead_id')::uuid,
      it ->> 'contato_nome', it ->> 'contato_telefone', it ->> 'contato_email', it ->> 'externo_id', it ->> 'mp_preference_id'
    ) returning * into rec;
    return next rec;
  end loop;
end $$;

-- Atualiza campos de uma reserva. Quando muda algo que afeta a vaga (data, hora, duração, quantidade ou volta de
-- "Cancelada" para ativa), confere a capacidade com a mesma trava por dia.
create or replace function public.agendamento_atualizar(p_tenant uuid, p_id uuid, p_patch jsonb)
returns public.agendamento_reservas language plpgsql security definer set search_path = public as $$
declare
  atual public.agendamento_reservas;
  novo public.agendamento_reservas;
  nova_data date;
  nova_hora text;
  nova_dur numeric;
  nova_qtd integer;
  novo_status text;
  d date;
begin
  select * into atual from public.agendamento_reservas where id = p_id and tenant_id = p_tenant;
  if not found then raise exception 'reserva_nao_encontrada'; end if;

  nova_data := coalesce((p_patch ->> 'data')::date, atual.data);
  nova_hora := coalesce(p_patch ->> 'hora', atual.hora);
  nova_dur := coalesce((p_patch ->> 'duracao')::numeric, atual.duracao);
  nova_qtd := coalesce((p_patch ->> 'qtd_recursos')::int, atual.qtd_recursos);
  novo_status := coalesce(p_patch ->> 'status', atual.status);

  -- trava a data antiga e a nova (em ordem, para não gerar impasse entre pedidos)
  for d in select distinct x from unnest(array[atual.data, nova_data]) x order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(p_tenant::text || ':' || d::text, 0));
  end loop;

  if novo_status <> 'Cancelada' and (
       nova_data <> atual.data or nova_hora <> atual.hora or nova_dur <> atual.duracao or nova_qtd <> atual.qtd_recursos or atual.status = 'Cancelada') then
    perform public.agendamento_checar_vaga(p_tenant, nova_data, split_part(nova_hora, ':', 1)::int * 60 + split_part(nova_hora, ':', 2)::int, nova_dur, nova_qtd, p_id);
  end if;

  update public.agendamento_reservas r set
    data = nova_data,
    hora = nova_hora,
    duracao = nova_dur,
    qtd_recursos = nova_qtd,
    status = novo_status,
    qtd_pessoas = coalesce((p_patch ->> 'qtd_pessoas')::int, r.qtd_pessoas),
    valor_total = coalesce((p_patch ->> 'valor_total')::numeric, r.valor_total),
    tipo_evento = case when p_patch ? 'tipo_evento' then p_patch ->> 'tipo_evento' else r.tipo_evento end,
    observacoes = case when p_patch ? 'observacoes' then p_patch ->> 'observacoes' else r.observacoes end,
    status_pagamento = coalesce(p_patch ->> 'status_pagamento', r.status_pagamento),
    forma_pagamento = case when p_patch ? 'forma_pagamento' then p_patch ->> 'forma_pagamento' else r.forma_pagamento end,
    detalhes_pagamento = coalesce(p_patch -> 'detalhes_pagamento', r.detalhes_pagamento),
    pagar_no_local = coalesce((p_patch ->> 'pagar_no_local')::boolean, r.pagar_no_local),
    comanda = case when p_patch ? 'comanda' then p_patch ->> 'comanda' else r.comanda end,
    mesa = coalesce((p_patch ->> 'mesa')::boolean, r.mesa),
    mesa_cadeiras = case when p_patch ? 'mesa_cadeiras' then (p_patch ->> 'mesa_cadeiras')::int else r.mesa_cadeiras end,
    aniversariante = case when p_patch ? 'aniversariante' then p_patch ->> 'aniversariante' else r.aniversariante end,
    checkin_ids = case when p_patch ? 'checkin_ids' then array(select jsonb_array_elements_text(p_patch -> 'checkin_ids')) else r.checkin_ids end,
    noshow_ids = case when p_patch ? 'noshow_ids' then array(select jsonb_array_elements_text(p_patch -> 'noshow_ids')) else r.noshow_ids end,
    recursos_atribuidos = case when p_patch ? 'recursos_atribuidos' then array(select (jsonb_array_elements_text(p_patch -> 'recursos_atribuidos'))::int) else r.recursos_atribuidos end,
    motivo_cancelamento = case when p_patch ? 'motivo_cancelamento' then p_patch ->> 'motivo_cancelamento' else r.motivo_cancelamento end,
    mp_preference_id = case when p_patch ? 'mp_preference_id' then p_patch ->> 'mp_preference_id' else r.mp_preference_id end,
    mp_payment_id = case when p_patch ? 'mp_payment_id' then p_patch ->> 'mp_payment_id' else r.mp_payment_id end,
    contato_nome = coalesce(p_patch ->> 'contato_nome', r.contato_nome),
    contato_telefone = case when p_patch ? 'contato_telefone' then p_patch ->> 'contato_telefone' else r.contato_telefone end,
    contato_email = case when p_patch ? 'contato_email' then p_patch ->> 'contato_email' else r.contato_email end,
    lead_id = case when p_patch ? 'lead_id' then (p_patch ->> 'lead_id')::uuid else r.lead_id end,
    updated_at = now()
  where r.id = p_id and r.tenant_id = p_tenant
  returning * into novo;
  return novo;
end $$;

-- Libera as vagas de reservas do site que ficaram sem pagamento (prazo + 15 min de margem para o aviso do banco).
create or replace function public.agendamento_expirar_pendentes(p_tenant uuid default null)
returns integer language plpgsql security definer set search_path = public as $$
declare qtd integer;
begin
  with expiradas as (
    update public.agendamento_reservas r
       set status = 'Cancelada', motivo_cancelamento = 'Expirada: pagamento não realizado no prazo', updated_at = now()
      from public.agendamento_config c
     where c.tenant_id = r.tenant_id
       and (p_tenant is null or r.tenant_id = p_tenant)
       and r.status = 'Pendente' and r.status_pagamento = 'Pendente' and not r.pagar_no_local
       and r.created_at < now() - make_interval(mins => c.expiracao_pendente_min + 15)
    returning r.id
  ) select count(*) into qtd from expiradas;
  return qtd;
end $$;

-- Só o servidor (service role) executa as funções que gravam.
revoke all on function public.agendamento_reservar(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.agendamento_atualizar(uuid, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.agendamento_expirar_pendentes(uuid) from public, anon, authenticated;
revoke all on function public.agendamento_checar_vaga(uuid, date, integer, numeric, integer, uuid) from public, anon, authenticated;
revoke all on function public.agendamento_ocupados_hora(uuid, date, integer, uuid, integer) from public, anon, authenticated;
grant execute on function public.agendamento_reservar(uuid, jsonb) to service_role;
grant execute on function public.agendamento_atualizar(uuid, uuid, jsonb) to service_role;
grant execute on function public.agendamento_expirar_pendentes(uuid) to service_role;
grant execute on function public.agendamento_checar_vaga(uuid, date, integer, numeric, integer, uuid) to service_role;
grant execute on function public.agendamento_ocupados_hora(uuid, date, integer, uuid, integer) to service_role;
