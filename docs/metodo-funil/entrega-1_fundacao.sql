-- MÉTODO DO FUNIL · ENTREGA 1 — FUNDAÇÃO DO BANCO
-- NÃO APLICADA. Aguardando revisão (ver ENTREGA-1.md). Fica fora de supabase/migrations de propósito.
-- Só ACRESCENTA: tabelas novas, colunas novas com padrão neutro e o catálogo de fábrica. Não altera a tabela leads,
-- não converte dados e não liga o método em nenhum funil (crm_funis.metodo_ativo nasce false).
-- Aplicar como UMA transação (o apply_migration já faz isso).

set local lock_timeout = '5s';

-- ─── 1. Funis: tipo canônico e chave do método ────────────────────────────
alter table public.crm_funis
  add column if not exists template text not null default 'personalizado'
    constraint crm_funis_template_check check (template in ('simples', 'completo', 'personalizado')),
  add column if not exists metodo_ativo boolean not null default false;

-- Nome de etapa → tipo canônico. Devolve null quando não reconhece (a pessoa escolhe depois).
create or replace function public.spy_tipo_da_etapa(p_nome text) returns text
language sql immutable set search_path = pg_catalog, pg_temp as $$
  select case
    when n ~ 'aguardando.*pagamento' then 'aguardando_pagamento'
    when n ~ 'repescagem'            then 'repescagem'
    when n ~ 'desqualific'           then 'desqualificado'
    when n ~ 'perdid'                then 'perdido'
    when n ~ 'ganh[oa]'              then 'ganho'
    when n ~ '^novo|novo lead'       then 'novo_lead'
    when n ~ 'atendimento|qualifica' then 'atendimento'
    when n ~ 'orcamento|proposta'    then 'orcamento'
  end
  from (select translate(lower(coalesce(p_nome, '')), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucaaaaaeeeeiiiiooooouuuuc') as n) x
$$;

-- Marca o tipo em cada etapa de UM funil (não liga o método). Etapas já marcadas não mudam.
create or replace function public.spy_metodo_preparar(p_funil text)
returns table (posicao int, etapa text, tipo text)
language plpgsql set search_path = public, pg_temp as $$
declare f public.crm_funis%rowtype; v_config jsonb;
begin
  select * into f from public.crm_funis where id = p_funil for update;
  if not found then raise exception 'Funil não encontrado.'; end if;
  if coalesce(f.tipo, '') not like 'comercial%' then raise exception 'O método vale para funis comerciais.'; end if;

  if f.etapas_config is not null and jsonb_typeof(f.etapas_config) = 'array' and jsonb_array_length(f.etapas_config) > 0 then
    v_config := f.etapas_config;
  else
    select coalesce(jsonb_agg(jsonb_build_object('nome', e.nome, 'cor', 'blue', 'iniciarMinimizado', false) order by e.i), '[]'::jsonb)
      into v_config from unnest(f.etapas) with ordinality as e(nome, i);
  end if;

  select coalesce(jsonb_agg(
           case when c.item ? 'tipo' or public.spy_tipo_da_etapa(c.item ->> 'nome') is null then c.item
                else c.item || jsonb_build_object('tipo', public.spy_tipo_da_etapa(c.item ->> 'nome')) end
           order by c.i), '[]'::jsonb)
    into v_config from jsonb_array_elements(v_config) with ordinality as c(item, i);

  update public.crm_funis set etapas_config = v_config where id = p_funil;

  return query select (c.i - 1)::int, c.item ->> 'nome', c.item ->> 'tipo'
    from jsonb_array_elements(v_config) with ordinality as c(item, i) order by c.i;
end $$;
revoke execute on function public.spy_metodo_preparar(text) from public, anon, authenticated;
grant execute on function public.spy_metodo_preparar(text) to service_role;

-- Editar o funil na tela não pode apagar o tipo: mantém pelo nome ou, numa renomeação, pela posição.
create or replace function public.spy_funil_preserva_tipo() returns trigger
language plpgsql set search_path = public, pg_temp as $$
declare v_novo jsonb := '[]'::jsonb; r record; v_tipo text; v_antigo jsonb;
begin
  if new.etapas_config is null or jsonb_typeof(new.etapas_config) <> 'array'
     or old.etapas_config is null or jsonb_typeof(old.etapas_config) <> 'array' then return new; end if;
  if not exists (select 1 from jsonb_array_elements(old.etapas_config) a where a ? 'tipo') then return new; end if;

  for r in select c.item, (c.i - 1)::int as pos from jsonb_array_elements(new.etapas_config) with ordinality as c(item, i) order by c.i loop
    if not (r.item ? 'tipo') then
      v_tipo := null;
      select a ->> 'tipo' into v_tipo from jsonb_array_elements(old.etapas_config) a
        where a ->> 'nome' = r.item ->> 'nome' and a ? 'tipo' limit 1;
      if v_tipo is null and jsonb_array_length(new.etapas_config) = jsonb_array_length(old.etapas_config) then
        v_antigo := old.etapas_config -> r.pos;
        if not exists (select 1 from jsonb_array_elements(new.etapas_config) n where n ->> 'nome' = v_antigo ->> 'nome') then
          v_tipo := v_antigo ->> 'tipo';
        end if;
      end if;
      if v_tipo is not null then r.item := r.item || jsonb_build_object('tipo', v_tipo); end if;
    end if;
    v_novo := v_novo || jsonb_build_array(r.item);
  end loop;
  new.etapas_config := v_novo;
  return new;
end $$;
-- Nome depois de "crm_funis_etapas_obrigatorias_trg" em ordem alfabética: roda depois dele.
drop trigger if exists crm_funis_preserva_tipo_trg on public.crm_funis;
create trigger crm_funis_preserva_tipo_trg before update of etapas_config on public.crm_funis
  for each row execute function public.spy_funil_preserva_tipo();

-- ─── 2. Catálogo: situações e motivos (tenant_id nulo = padrão de fábrica) ─
create table if not exists public.crm_situacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  funil_id text references public.crm_funis(id) on delete cascade,
  codigo text not null check (codigo in (
    'aguardando_atendimento', 'em_qualificacao', 'orcamento_a_enviar',
    'orcamento_enviado', 'em_negociacao', 'aguardando_pagamento', 'pagamento_expirado',
    'rep_sumiu', 'rep_adiou', 'rep_preco', 'rep_pesquisando', 'rep_sem_estoque',
    'a_entregar', 'concluida',
    'perda_preco', 'perda_concorrente', 'perda_sem_retorno', 'perda_desistiu', 'perda_fora_area', 'perda_pagamento_recusado',
    'nao_lead')),
  etapa_tipo text not null check (etapa_tipo in ('novo_lead', 'atendimento', 'orcamento', 'aguardando_pagamento', 'repescagem', 'ganho', 'perdido', 'desqualificado')),
  etapa_tipo_completo text check (etapa_tipo_completo in ('atendimento', 'aguardando_pagamento')),
  nome_exibido text not null check (length(trim(nome_exibido)) between 1 and 60),
  bola_com text check (bola_com in ('vendedor', 'cliente', 'ambos', 'sistema')),
  timer jsonb not null default '{}'::jsonb check (jsonb_typeof(timer) = 'object'),
  exige_nota boolean not null default false,
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (funil_id is null or tenant_id is not null)
);
create unique index if not exists crm_situacoes_uniq on public.crm_situacoes
  ((coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)), (coalesce(funil_id, '')), codigo);

create table if not exists public.crm_motivos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  codigo text not null check (codigo in ('sumiu', 'adiou', 'preco', 'pesquisando', 'sem_estoque', 'concorrente', 'sem_retorno', 'desistiu', 'fora_area', 'pagamento_recusado', 'nao_lead')),
  uso text not null check (uso in ('repescagem', 'perda')),
  nome_exibido text not null check (length(trim(nome_exibido)) between 1 and 60),
  cadencia_dias int[] not null default '{}',
  conta_na_conversao boolean not null default true,
  ordem int not null default 0,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists crm_motivos_uniq on public.crm_motivos
  ((coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid)), uso, codigo);

-- ─── 3. Estado e registros por lead ───────────────────────────────────────
-- Os status calculados ficam numa tabela 1:1 e NÃO em leads: cada mensagem atualiza a conversa, e escrever em leads
-- dispararia os 18 gatilhos dela e recarregaria o quadro de todo mundo.
create table if not exists public.lead_estado (
  lead_id uuid primary key references public.leads(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  situacao_codigo text,
  situacao_desde timestamptz,
  conversa_status text check (conversa_status in ('aguardando_vendedor', 'aguardando_cliente', 'sem_conversa')),
  conversa_desde timestamptz,
  sla_status text check (sla_status in ('em_dia', 'atencao', 'estourado')),
  sla_vence_em timestamptz,
  pagamento_status text check (pagamento_status in ('sem_cobranca', 'cobranca_enviada', 'pago', 'expirado', 'recusado', 'estornado')),
  etapa_origem_tipo text check (etapa_origem_tipo in ('novo_lead', 'atendimento', 'orcamento', 'aguardando_pagamento')),
  repescagem_motivo text,
  repescagem_tentativa int not null default 0 check (repescagem_tentativa >= 0),
  pausa_ate timestamptz,
  canal_venda text check (canal_venda in ('whatsapp', 'presencial')),
  venda_id uuid,
  updated_at timestamptz not null default now()
);
create index if not exists lead_estado_situacao_idx on public.lead_estado (tenant_id, situacao_codigo);
create index if not exists lead_estado_sla_idx on public.lead_estado (tenant_id, sla_vence_em) where sla_vence_em is not null;

create table if not exists public.lead_notas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  etapa_tipo text not null,
  situacao_codigo text,
  motivo_codigo text,
  texto text not null check (length(trim(texto)) between 1 and 4000),
  valor_esperado numeric check (valor_esperado >= 0),
  concorrente text,
  data_retorno date,
  autor_tipo text not null check (autor_tipo in ('ia', 'usuario')),
  autor_id uuid,
  revisada_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lead_notas_lead_idx on public.lead_notas (tenant_id, lead_id, created_at desc);

create table if not exists public.lead_status_historico (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  dimensao text not null check (dimensao in ('etapa', 'situacao', 'conversa', 'sla', 'pagamento', 'temperatura', 'relacionamento', 'permissao')),
  de text,
  para text,
  autor_tipo text not null check (autor_tipo in ('ia', 'sistema', 'usuario')),
  autor_id uuid,
  confianca numeric(4,3) check (confianca between 0 and 1),
  motivo text,
  desfaz_id uuid, -- sem chave estrangeira de propósito: nada nesta tabela é atualizado
  created_at timestamptz not null default now()
);
create index if not exists lead_hist_lead_idx on public.lead_status_historico (tenant_id, lead_id, created_at);
create index if not exists lead_hist_dim_idx on public.lead_status_historico (tenant_id, dimensao, created_at);

-- Log imutável: ninguém altera. (Apagar só acontece junto com o lead ou com a empresa.)
create or replace function public.spy_historico_imutavel() returns trigger
language plpgsql set search_path = pg_catalog, pg_temp as $$
begin raise exception 'O histórico de status não pode ser alterado.' using errcode = '42501'; end $$;
drop trigger if exists lead_status_historico_imutavel on public.lead_status_historico;
create trigger lead_status_historico_imutavel before update on public.lead_status_historico
  for each row execute function public.spy_historico_imutavel();

create table if not exists public.lead_timers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  tipo text not null check (tipo in ('sla', 'followup', 'cadencia', 'pos_venda', 'recompra')),
  executar_em timestamptz not null,
  status text not null default 'pendente' check (status in ('pendente', 'executado', 'cancelado', 'pausado')),
  situacao_codigo text,
  payload jsonb not null default '{}'::jsonb,
  executado_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lead_timers_fila_idx on public.lead_timers (executar_em) where status = 'pendente';
create index if not exists lead_timers_lead_idx on public.lead_timers (tenant_id, lead_id);

create table if not exists public.lead_sugestoes_ia (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  tipo text not null check (tipo in ('situacao', 'etapa', 'nota', 'temperatura')),
  valor_sugerido jsonb not null,
  confianca numeric(4,3) check (confianca between 0 and 1),
  justificativa text,
  status text not null default 'pendente' check (status in ('pendente', 'aceita', 'recusada', 'expirada')),
  respondida_por uuid,
  respondida_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists lead_sugestoes_pendentes_idx on public.lead_sugestoes_ia (tenant_id, lead_id) where status = 'pendente';

create table if not exists public.lead_pagamentos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  metodo text check (metodo in ('pix', 'link', 'cartao', 'boleto', 'dinheiro', 'outro')),
  valor numeric not null check (valor >= 0),
  status text not null check (status in ('cobranca_enviada', 'pago', 'expirado', 'recusado', 'estornado')),
  vencimento timestamptz,
  origem text not null check (origem in ('webhook', 'manual')),
  gateway text,
  gateway_id text,
  confirmado_por uuid,
  confirmado_em timestamptz,
  created_at timestamptz not null default now(),
  check (gateway_id is null or gateway is not null)
);
create unique index if not exists lead_pagamentos_gateway_uniq on public.lead_pagamentos (tenant_id, gateway, gateway_id) where gateway_id is not null;
create index if not exists lead_pagamentos_lead_idx on public.lead_pagamentos (tenant_id, lead_id);

create table if not exists public.contato_status (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  phone_digits text not null check (phone_digits ~ '^[0-9]{8,15}$'),
  relacionamento text not null default 'lead_novo' check (relacionamento in ('lead_novo', 'cliente', 'recorrente', 'inativo', 'reativado')),
  permissao_contato text not null default 'liberado' check (permissao_contato in ('liberado', 'janela_fechada', 'optout')),
  optout_em timestamptz,
  total_compras int not null default 0 check (total_compras >= 0),
  ltv numeric not null default 0,
  ultima_compra_em timestamptz,
  proxima_recompra_em timestamptz,
  vendedor_carteira_id uuid,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, phone_digits)
);

-- O registro precisa ser da mesma empresa do lead.
create or replace function public.spy_confere_empresa_do_lead() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not exists (select 1 from public.leads l where l.id = new.lead_id and l.tenant_id = new.tenant_id) then
    raise exception 'O lead não é desta empresa.' using errcode = '23514';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['lead_estado', 'lead_notas', 'lead_timers', 'lead_sugestoes_ia', 'lead_pagamentos'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_empresa', t);
    execute format('create trigger %I before insert or update of tenant_id, lead_id on public.%I for each row execute function public.spy_confere_empresa_do_lead()', t || '_empresa', t);
  end loop;
  execute 'drop trigger if exists lead_status_historico_empresa on public.lead_status_historico';
  execute 'create trigger lead_status_historico_empresa before insert on public.lead_status_historico for each row execute function public.spy_confere_empresa_do_lead()';
  foreach t in array array['crm_situacoes', 'crm_motivos', 'lead_estado', 'contato_status'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_touch', t);
  end loop;
end $$;

-- ─── 4. Colunas novas em tabelas existentes ───────────────────────────────
alter table public.tasks
  add column if not exists origem text constraint tasks_origem_check check (origem in ('manual', 'automacao')),
  add column if not exists tipo text,
  add column if not exists situacao_codigo text,
  add column if not exists fecha_sozinha boolean not null default false;

alter table public.notifications
  add column if not exists nivel text constraint notifications_nivel_check check (nivel in ('critico', 'importante', 'informativo')),
  add column if not exists lead_id uuid references public.leads(id) on delete set null,
  add column if not exists dedupe_key text,
  add column if not exists canais text[];
create index if not exists notifications_dedupe_idx on public.notifications (tenant_id, user_id, dedupe_key, created_at desc) where dedupe_key is not null;

alter table public.products
  add column if not exists ciclo_recompra_dias int constraint products_ciclo_check check (ciclo_recompra_dias > 0);

alter table public.automation_connections
  add column if not exists gatilho_etapa_tipo text,
  add column if not exists gatilho_situacao_codigo text;
alter table public.automation_connections drop constraint if exists automation_connections_gatilho_tipo_check;
alter table public.automation_connections add constraint automation_connections_gatilho_tipo_check
  check (gatilho_tipo = any (array['funil_etapa', 'produto_categoria', 'produto', 'os_etapa', 'situacao']));

-- ─── 5. Acesso (RLS) ──────────────────────────────────────────────────────
-- Catálogo: todos leem o padrão de fábrica e o da própria empresa; só administrador altera o da empresa.
do $$
declare t text;
begin
  foreach t in array array['crm_situacoes', 'crm_motivos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists catalogo_leitura on public.%I', t);
    execute format('create policy catalogo_leitura on public.%I for select to authenticated using (tenant_id is null or (select public.has_tenant_access(tenant_id)))', t);
    execute format('drop policy if exists catalogo_inclusao on public.%I', t);
    execute format('create policy catalogo_inclusao on public.%I for insert to authenticated with check (tenant_id is not null and (select public.has_tenant_access(tenant_id)) and (select public.is_tenant_admin_or_master()))', t);
    execute format('drop policy if exists catalogo_alteracao on public.%I', t);
    execute format('create policy catalogo_alteracao on public.%I for update to authenticated using (tenant_id is not null and (select public.has_tenant_access(tenant_id)) and (select public.is_tenant_admin_or_master())) with check (tenant_id is not null and (select public.has_tenant_access(tenant_id)) and (select public.is_tenant_admin_or_master()))', t);
    execute format('drop policy if exists catalogo_exclusao on public.%I', t);
    execute format('create policy catalogo_exclusao on public.%I for delete to authenticated using (tenant_id is not null and (select public.has_tenant_access(tenant_id)) and (select public.is_tenant_admin_or_master()))', t);
  end loop;

  -- Registros do lead: a tela só LÊ (quem grava são as funções da entrega 2 e o servidor). Vendedor restrito vê só os seus.
  foreach t in array array['lead_estado', 'lead_notas', 'lead_status_historico', 'lead_timers', 'lead_sugestoes_ia', 'lead_pagamentos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('drop policy if exists leitura_do_lead on public.%I', t);
    execute format('create policy leitura_do_lead on public.%I for select to authenticated using ((select public.has_tenant_access(tenant_id)) and (not (select public.usuario_restrito_aos_proprios_dados()) or lead_id in (select l.id from public.leads l)))', t);
  end loop;
end $$;

alter table public.contato_status enable row level security;
revoke all on public.contato_status from anon, authenticated;
grant select on public.contato_status to authenticated;
grant all on public.contato_status to service_role;
drop policy if exists leitura_do_contato on public.contato_status;
create policy leitura_do_contato on public.contato_status for select to authenticated using (
  (select public.has_tenant_access(tenant_id))
  and (not (select public.usuario_restrito_aos_proprios_dados())
       or exists (select 1 from public.leads l where l.tenant_id = contato_status.tenant_id and l.phone_digits = contato_status.phone_digits)));

-- ─── 6. Padrão de fábrica ─────────────────────────────────────────────────
-- Tempos em minutos; cadências em dias.
insert into public.crm_situacoes (codigo, etapa_tipo, etapa_tipo_completo, nome_exibido, bola_com, timer, exige_nota, ordem) values
  ('aguardando_atendimento',   'novo_lead', null,                    'Aguardando 1º atendimento', 'vendedor', '{"prazo_min":5,"escala_gestor_min":15}', false, 1),
  ('em_qualificacao',          'novo_lead', 'atendimento',           'Em qualificação',           'vendedor', '{"prazo_min":1440}', false, 2),
  ('orcamento_a_enviar',       'novo_lead', 'atendimento',           'Orçamento a enviar',        'vendedor', '{"prazo_min":120}', false, 3),
  ('orcamento_enviado',        'orcamento', null,                    'Orçamento enviado',         'cliente',  '{"followups_min":[120,1440,4320],"sem_resposta_min":4320,"destino":"rep_sumiu"}', false, 1),
  ('em_negociacao',            'orcamento', null,                    'Em negociação',             'ambos',    '{"prazo_min":1440}', true, 2),
  ('aguardando_pagamento',     'orcamento', 'aguardando_pagamento',  'Aguardando pagamento',      'cliente',  '{"por_metodo_min":{"pix":120,"cartao":1440},"boleto":"vencimento"}', false, 3),
  ('pagamento_expirado',       'orcamento', 'aguardando_pagamento',  'Pagamento expirado',        'vendedor', '{"prazo_min":120}', false, 4),
  ('rep_sumiu',                'repescagem', null,                   'Sumiu',                     'sistema',  '{"cadencia_dias":[1,2,4,7,10,15,21],"destino":"perda_sem_retorno"}', true, 1),
  ('rep_adiou',                'repescagem', null,                   'Adiou',                     'sistema',  '{"na_data":true}', true, 2),
  ('rep_preco',                'repescagem', null,                   'Preço / condição',          'sistema',  '{"cadencia_dias":[7]}', true, 3),
  ('rep_pesquisando',          'repescagem', null,                   'Vai pesquisar / comparar',  'sistema',  '{"cadencia_dias":[3]}', true, 4),
  ('rep_sem_estoque',          'repescagem', null,                   'Sem estoque',               'sistema',  '{"quando":"reposicao"}', true, 5),
  ('a_entregar',               'ganho', null,                        'A entregar / retirar',      'vendedor', '{"quando":"prazo_entrega"}', false, 1),
  ('concluida',                'ganho', null,                        'Concluída',                 'sistema',  '{}', false, 2),
  ('perda_preco',              'perdido', null,                      'Preço',                     null, '{}', true, 1),
  ('perda_concorrente',        'perdido', null,                      'Concorrente',               null, '{}', true, 2),
  ('perda_sem_retorno',        'perdido', null,                      'Sem retorno',               null, '{}', true, 3),
  ('perda_desistiu',           'perdido', null,                      'Desistiu / sem necessidade',null, '{}', true, 4),
  ('perda_fora_area',          'perdido', null,                      'Fora de área / frete',      null, '{}', true, 5),
  ('perda_pagamento_recusado', 'perdido', null,                      'Pagamento recusado',        null, '{}', true, 6),
  ('nao_lead',                 'desqualificado', null,               'Não-lead (spam, engano)',   null, '{}', false, 1)
on conflict do nothing;

insert into public.crm_motivos (uso, codigo, nome_exibido, cadencia_dias, conta_na_conversao, ordem) values
  ('repescagem', 'sumiu',              'Sumiu',                      '{1,2,4,7,10,15,21}', true, 1),
  ('repescagem', 'adiou',              'Adiou',                      '{}',  true, 2),
  ('repescagem', 'preco',              'Preço / condição',           '{7}', true, 3),
  ('repescagem', 'pesquisando',        'Vai pesquisar / comparar',   '{3}', true, 4),
  ('repescagem', 'sem_estoque',        'Sem estoque',                '{}',  true, 5),
  ('perda',      'preco',              'Preço',                      '{}',  true, 1),
  ('perda',      'concorrente',        'Concorrente',                '{}',  true, 2),
  ('perda',      'sem_retorno',        'Sem retorno',                '{}',  true, 3),
  ('perda',      'desistiu',           'Desistiu / sem necessidade', '{}',  true, 4),
  ('perda',      'fora_area',          'Fora de área / frete',       '{}',  true, 5),
  ('perda',      'pagamento_recusado', 'Pagamento recusado',         '{}',  true, 6),
  ('perda',      'nao_lead',           'Não-lead (spam, engano)',    '{}',  false, 7)
on conflict do nothing;
