-- Relatórios do SPY prontos no banco: a tela ("Gerar relatório") e a Aurora usam a mesma função.
-- Só cria funções de leitura; não altera tabelas nem dados.
--
--   select public.spy_relatorio('<empresa>', 'geral');                              -- mês atual, tudo que a empresa usa
--   select public.spy_relatorio('<empresa>', 'financeiro,vendas', '2026-11-01', '2026-11-30');
--   select public.spy_relatorio_texto('<empresa>', 'financeiro');                    -- texto pronto para mensagem
--
-- Segurança: SECURITY INVOKER. Para quem está logado valem as regras de acesso de cada tabela (empresa, vendedor
-- restrito aos próprios dados, módulo). A chave de serviço (Aurora/n8n) precisa informar a empresa certa.

create schema if not exists relatorios;
revoke all on schema relatorios from public;
grant usage on schema relatorios to authenticated, service_role;

-- ───────────────────────────── blocos ─────────────────────────────

create or replace function relatorios.card(p_titulo text, p_valor numeric, p_formato text default 'numero', p_detalhe text default '', p_alerta boolean default false)
returns jsonb language sql immutable as $$
  select jsonb_build_object('titulo', p_titulo, 'valor', round(coalesce(p_valor, 0), 2), 'formato', p_formato,
                            'detalhe', coalesce(p_detalhe, ''), 'alerta', coalesce(p_alerta, false))
$$;

-- 'chave|Título|formato'
create or replace function relatorios.colunas(variadic p text[]) returns jsonb language sql immutable as $$
  select jsonb_agg(jsonb_build_object('chave', split_part(x, '|', 1), 'titulo', split_part(x, '|', 2),
                   'formato', coalesce(nullif(split_part(x, '|', 3), ''), 'texto')) order by o)
  from unnest(p) with ordinality u(x, o)
$$;

create or replace function relatorios.tabela(p_titulo text, p_colunas jsonb, p_linhas jsonb, p_total bigint default null)
returns jsonb language sql immutable as $$
  select jsonb_build_object('titulo', p_titulo, 'colunas', p_colunas, 'linhas', coalesce(p_linhas, '[]'::jsonb),
    'nota', case when p_total > jsonb_array_length(coalesce(p_linhas, '[]'::jsonb))
                 then 'Mostrando ' || jsonb_array_length(coalesce(p_linhas, '[]'::jsonb)) || ' de ' || p_total || ' registros.' else '' end)
$$;

create or replace function relatorios.grafico(p_titulo text, p_formato text, p_series jsonb, p_pontos jsonb)
returns jsonb language sql immutable as $$
  select jsonb_build_object('titulo', p_titulo, 'formato', p_formato, 'series', p_series, 'pontos', coalesce(p_pontos, '[]'::jsonb))
$$;

create or replace function relatorios.aba(p_id text, p_titulo text, p_cards jsonb default '[]', p_graficos jsonb default '[]', p_tabelas jsonb default '[]', p_nota text default '')
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', p_id, 'titulo', p_titulo, 'cards', coalesce(p_cards, '[]'::jsonb),
    'graficos', coalesce(p_graficos, '[]'::jsonb), 'tabelas', coalesce(p_tabelas, '[]'::jsonb), 'nota', coalesce(p_nota, ''))
$$;

-- Mesma regra da tela: com filial/cliente escolhido entram os registros dele; a filial principal também recebe os sem filial.
create or replace function relatorios.na_filial(p_linha text, p_filial text, p_principal boolean) returns boolean language sql immutable as $$
  select p_filial is null or coalesce(p_linha = p_filial, false) or (p_principal and nullif(p_linha, '') is null)
$$;

-- Data ISO digitada em campo de texto; qualquer outra coisa ("Hoje", vazio) vira nulo.
create or replace function relatorios.dia_texto(p text) returns date language sql immutable as $$
  select case when p ~ '^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])'
    then make_date(substr(p, 1, 4)::int, substr(p, 6, 2)::int, 1) + (substr(p, 9, 2)::int - 1) end
$$;

create or replace function relatorios.pct(p_parte numeric, p_todo numeric) returns numeric language sql immutable as $$
  select case when coalesce(p_todo, 0) = 0 then 0 else round(p_parte * 100.0 / p_todo, 1) end
$$;

-- Canal de aquisição do negócio (mesma regra de src/lib/canalAquisicao.ts).
create or replace function relatorios.canal(p_origem text, p_campos jsonb) returns text language sql immutable as $$
  with u as (select lower(trim(coalesce(p_campos->>'utm_source', ''))) as k)
  select case
    when k <> '' then case regexp_replace(k, '\s*(ads|anúncios|anuncios)$', '')
      when 'facebook' then 'Meta' when 'fb' then 'Meta' when 'instagram' then 'Meta' when 'ig' then 'Meta' when 'meta' then 'Meta'
      when 'google' then 'Google' when 'adwords' then 'Google' when 'youtube' then 'YouTube' when 'tiktok' then 'TikTok'
      when 'linkedin' then 'LinkedIn' when 'email' then 'E-mail' when 'e-mail' then 'E-mail' when 'newsletter' then 'E-mail'
      when 'whatsapp' then 'WhatsApp' when 'wa' then 'WhatsApp' when 'sms' then 'SMS'
      else upper(left(k, 1)) || substr(k, 2, 59) end
    when p_campos->>'veio_do_meta_ads' = 'sim' then 'Meta'
    when p_campos->>'veio_do_google_ads' = 'sim' then 'Google'
    else coalesce(nullif(left(trim(coalesce(p_origem, '')), 60), ''), 'Orgânico') end
  from u
$$;

-- Negócios com a mesma situação e o mesmo valor que as telas mostram (statusPelaEtapa.ts e valorDoLead.ts).
create or replace function relatorios.negocios(p_tenant uuid, p_filial text, p_principal boolean)
returns table (id uuid, nome text, empresa text, vendedor text, canal text, estado text, funil text, etapa text,
               valor numeric, dia_cadastro date, dia_ganho date, motivo text)
language sql stable set search_path = public as $$
  with etapas as (
    select distinct on (stage_id) stage_id, funil, etapa from (
      select case f.id when 'funil-comercial-default' then u.o::text when 'funil-sdr-ia-default' then 'sdr-' || u.o
                  else f.id || '-' || (u.o - 1) end as stage_id, f.nome as funil, u.nome as etapa
      from crm_funis f cross join lateral unnest(f.etapas) with ordinality u(nome, o)
      where f.tenant_id = p_tenant) x
  ),
  prop as (
    select distinct on (p.lead_id) p.lead_id, coalesce(p.valor, 0) as valor from proposals p
    where p.tenant_id = p_tenant and p.lead_id is not null order by p.lead_id, p.created_at desc
  ),
  preco as (select pr.id::text as id, coalesce(pr.price, 0) as price from products pr where pr.tenant_id = p_tenant),
  unidade as (
    select case
      when exists (select 1 from app_settings s where s.tenant_id = p_tenant and s.key = 'integracoes_maxdata_estoque' and s.value->>'filialId' = p_filial) then 'maxdata:estoque'
      when exists (select 1 from app_settings s where s.tenant_id = p_tenant and s.key = 'integracoes_maxdata' and s.value->>'filialId' = p_filial) then 'maxdata:notas'
      else 'maxdata:nenhuma' end as u
  ),
  base as (
    select l.*, e.funil as f_nome, e.etapa as e_nome,
      case
        when l.status in ('Fechado', 'Ganho', 'Ganhou') then 'ganho'
        when l.status = 'Perdido' then 'perdido'
        when l.status = 'Desqualificado' then 'desqualificado'
        when e.etapa ~* 'ganh[oa]' then 'ganho'
        when e.etapa ~* 'perdid[oa]' then 'perdido'
        when e.etapa ~* 'desqualific' then 'desqualificado'
        else 'aberto' end as situacao
    from leads l
    left join etapas e on e.stage_id = l."stageId"
    where l.tenant_id = p_tenant and l.deleted_at is null
      and (p_filial is null or case when l."customFields"->>'origin' = 'maxdata'
             then l."customFields"->>'fonte' = (select u from unidade)
             else relatorios.na_filial(l.filial_id, p_filial, p_principal) end)
  )
  select b.id,
    coalesce(nullif(b."clientName", ''), b.name::text),
    coalesce(b.company, '')::text,
    coalesce(nullif(trim(b.seller), ''), 'Sem vendedor'),
    relatorios.canal(b.source::text, b."customFields"),
    b.situacao,
    coalesce(b.f_nome, 'Sem funil'),
    coalesce(b.e_nome, 'Sem etapa'),
    case
      when pp.lead_id is null and jsonb_typeof(b."customFields"->'produtosInteresseIds') = 'array' then
        coalesce((select sum(pc.price) from jsonb_array_elements_text(b."customFields"->'produtosInteresseIds') i(pid) join preco pc on pc.id = i.pid), 0)
      when coalesce(b.value, 0) > 0 then b.value
      when coalesce(pp.valor, 0) > 0 then pp.valor
      when b.situacao = 'aberto' and b."productIds" is not null then
        coalesce((select sum(pc.price) from preco pc where pc.id = any (b."productIds"::text[])), 0)
      else 0 end,
    coalesce(relatorios.dia_texto(b.date), (b.created_at at time zone 'UTC')::date),
    case when b.situacao = 'ganho' then coalesce(
      (b.closed_at at time zone 'UTC')::date,
      case when b.status not in ('Fechado', 'Ganho', 'Ganhou') then (b.updated_at at time zone 'UTC')::date end,
      relatorios.dia_texto(b.date), (b.created_at at time zone 'UTC')::date) end,
    coalesce(nullif(trim(b.lost_reason), ''), nullif(trim(b.loss_reason), ''), 'Não informado')
  from base b
  left join prop pp on pp.lead_id = b.id
$$;

-- ───────────────────────────── Vendas ─────────────────────────────

create or replace function relatorios.vendas(p_tenant uuid, p_ini date, p_fim date, p_filial text, p_principal boolean, p_hoje date)
returns jsonb language sql stable set search_path = public as $$
  with n as materialized (select * from relatorios.negocios(p_tenant, p_filial, p_principal)),
  -- recorte do período: ganho conta no dia em que foi ganho; os demais no dia do cadastro
  r as materialized (select * from n where (case when estado = 'ganho' then dia_ganho else dia_cadastro end) between p_ini and p_fim),
  t as (
    select (select count(*) from n where dia_cadastro between p_ini and p_fim) as novos,
      count(*) as total, count(*) filter (where estado = 'ganho') as ganhos,
      coalesce(sum(valor) filter (where estado = 'ganho'), 0) as v_ganho,
      count(*) filter (where estado = 'perdido') as perdidos,
      coalesce(sum(valor) filter (where estado = 'perdido'), 0) as v_perdido,
      count(*) filter (where estado = 'desqualificado') as desq
    from r
  ),
  a as (select count(*) as qtd, coalesce(sum(valor), 0) as v from n where estado = 'aberto'),
  meses as (select generate_series(date_trunc('month', p_fim) - interval '5 months', date_trunc('month', p_fim), interval '1 month')::date as m),
  mensal as (
    select to_char(m, 'MM/YY') as rotulo,
      (select count(*) from n where date_trunc('month', dia_cadastro) = m) as novos,
      (select count(*) from n where date_trunc('month', dia_ganho) = m) as ganhos,
      (select coalesce(sum(valor), 0) from n where date_trunc('month', dia_ganho) = m) as valor
    from meses order by m
  ),
  prop as materialized (
    select coalesce(p.titulo, '')::text as titulo, coalesce(p.cliente, '')::text as cliente, coalesce(p.vendedor, '')::text as vendedor,
      coalesce(p.status, 'Sem situação')::text as situacao, coalesce(p.valor, 0) as valor, (p.created_at at time zone 'America/Sao_Paulo')::date as data, p.validade
    from proposals p where p.tenant_id = p_tenant and relatorios.na_filial(p.filial_id, p_filial, p_principal)
      and (p.created_at at time zone 'America/Sao_Paulo')::date between p_ini and p_fim
  ),
  ct as materialized (
    select coalesce(c.title, '')::text as titulo, coalesce(c.status, '')::text as situacao, coalesce(c.value, 0) as valor, coalesce(c.mrr_value, 0) as mrr,
      c.start_date as inicio, c.end_date as fim, (c.cancelled_at at time zone 'America/Sao_Paulo')::date as cancelado_em
    from contracts c where c.tenant_id = p_tenant and c.deleted_at is null and relatorios.na_filial(c.filial_id, p_filial, p_principal)
  )
  select jsonb_build_array(
    relatorios.aba('vendas-resumo', 'Resumo',
      jsonb_build_array(
        relatorios.card('Leads novos', t.novos, 'numero', 'cadastrados no período'),
        relatorios.card('Negócios ganhos', t.ganhos, 'numero', 'pela data do ganho'),
        relatorios.card('Valor ganho', t.v_ganho, 'moeda', 'no período'),
        relatorios.card('Ticket médio', case when t.ganhos > 0 then t.v_ganho / t.ganhos else 0 end, 'moeda', 'por negócio ganho'),
        relatorios.card('Conversão', relatorios.pct(t.ganhos, t.total), 'percentual', t.ganhos || ' de ' || t.total || ' do período'),
        relatorios.card('Perdidos', t.perdidos, 'numero', t.desq || ' desqualificados', t.perdidos > 0),
        relatorios.card('Em aberto', a.qtd, 'numero', 'hoje, em todos os períodos'),
        relatorios.card('Valor em aberto', a.v, 'moeda', 'hoje, em todos os períodos')),
      jsonb_build_array(
        relatorios.grafico('Leads novos e ganhos por mês', 'numero', relatorios.colunas('novos|Novos', 'ganhos|Ganhos'),
          (select jsonb_agg(to_jsonb(x)) from mensal x)),
        relatorios.grafico('Valor ganho por mês', 'moeda', relatorios.colunas('valor|Valor ganho'),
          (select jsonb_agg(to_jsonb(x)) from mensal x)))),
    relatorios.aba('vendas-funil', 'Funil', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Negócios em aberto por etapa', relatorios.colunas('funil|Funil', 'etapa|Etapa', 'qtd|Negócios|numero', 'valor|Valor|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select funil, etapa, count(*) as qtd, sum(valor) as valor from n where estado = 'aberto' group by 1, 2 order by 1, 3 desc limit 150) x)),
      relatorios.tabela('Maiores negócios em aberto', relatorios.colunas('nome|Negócio', 'empresa|Empresa', 'vendedor|Vendedor', 'etapa|Etapa', 'desde|Cadastro|data', 'valor|Valor|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select nome, empresa, vendedor, etapa, dia_cadastro as desde, valor from n where estado = 'aberto' and valor > 0 order by valor desc limit 100) x),
        (select count(*) from n where estado = 'aberto' and valor > 0)))),
    relatorios.aba('vendas-vendedores', 'Vendedores', '[]',
      jsonb_build_array(relatorios.grafico('Valor ganho por vendedor', 'moeda', relatorios.colunas('valor|Valor ganho'),
        (select jsonb_agg(to_jsonb(x)) from (select vendedor as rotulo, sum(valor) as valor from r where estado = 'ganho' group by 1 having sum(valor) > 0 order by 2 desc limit 10) x))),
      jsonb_build_array(relatorios.tabela('Desempenho no período', relatorios.colunas('vendedor|Vendedor', 'leads|Leads|numero', 'ganhos|Ganhos|numero', 'perdidos|Perdidos|numero', 'conversao|Conversão|percentual', 'valor|Valor ganho|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select vendedor, count(*) as leads, count(*) filter (where estado = 'ganho') as ganhos, count(*) filter (where estado = 'perdido') as perdidos,
           relatorios.pct(count(*) filter (where estado = 'ganho'), count(*)) as conversao, coalesce(sum(valor) filter (where estado = 'ganho'), 0) as valor
           from r group by 1 order by 6 desc, 2 desc limit 100) x)))),
    relatorios.aba('vendas-origens', 'Origens', '[]',
      jsonb_build_array(relatorios.grafico('Leads por origem', 'numero', relatorios.colunas('leads|Leads'),
        (select jsonb_agg(to_jsonb(x)) from (select canal as rotulo, count(*) as leads from r group by 1 order by 2 desc limit 10) x))),
      jsonb_build_array(relatorios.tabela('Resultado por origem', relatorios.colunas('origem|Origem', 'leads|Leads|numero', 'ganhos|Ganhos|numero', 'conversao|Conversão|percentual', 'valor|Valor ganho|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select canal as origem, count(*) as leads, count(*) filter (where estado = 'ganho') as ganhos,
           relatorios.pct(count(*) filter (where estado = 'ganho'), count(*)) as conversao, coalesce(sum(valor) filter (where estado = 'ganho'), 0) as valor
           from r group by 1 order by 5 desc, 2 desc limit 100) x)))),
    relatorios.aba('vendas-ganhos', 'Ganhos e perdas',
      jsonb_build_array(relatorios.card('Valor ganho', t.v_ganho, 'moeda', t.ganhos || ' negócios'), relatorios.card('Valor perdido', t.v_perdido, 'moeda', t.perdidos || ' negócios', t.perdidos > 0)),
      '[]', jsonb_build_array(
      relatorios.tabela('Negócios ganhos', relatorios.colunas('data|Ganho em|data', 'nome|Negócio', 'empresa|Empresa', 'vendedor|Vendedor', 'origem|Origem', 'valor|Valor|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select dia_ganho as data, nome, empresa, vendedor, canal as origem, valor from r where estado = 'ganho' order by dia_ganho desc, valor desc limit 300) x), t.ganhos),
      relatorios.tabela('Motivos de perda', relatorios.colunas('motivo|Motivo', 'qtd|Negócios|numero', 'valor|Valor|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select motivo, count(*) as qtd, sum(valor) as valor from r where estado in ('perdido', 'desqualificado') group by 1 order by 2 desc limit 50) x)))),
    relatorios.aba('vendas-propostas', 'Propostas',
      jsonb_build_array(
        relatorios.card('Propostas emitidas', (select count(*) from prop), 'numero', 'no período'),
        relatorios.card('Valor proposto', (select coalesce(sum(valor), 0) from prop), 'moeda'),
        relatorios.card('Aceitas', (select count(*) from prop where situacao ~* '^(aceit|aprovad)'), 'numero'),
        relatorios.card('Valor aceito', (select coalesce(sum(valor), 0) from prop where situacao ~* '^(aceit|aprovad)'), 'moeda')),
      '[]', jsonb_build_array(
      relatorios.tabela('Por situação', relatorios.colunas('situacao|Situação', 'qtd|Propostas|numero', 'valor|Valor|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select situacao, count(*) as qtd, sum(valor) as valor from prop group by 1 order by 2 desc) x)),
      relatorios.tabela('Propostas', relatorios.colunas('data|Emissão|data', 'titulo|Título', 'cliente|Cliente', 'vendedor|Vendedor', 'situacao|Situação', 'validade|Validade|data', 'valor|Valor|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select data, titulo, cliente, vendedor, situacao, validade, valor from prop order by data desc limit 300) x), (select count(*) from prop)))),
    relatorios.aba('vendas-contratos', 'Contratos',
      jsonb_build_array(
        relatorios.card('Receita mensal (MRR)', (select coalesce(sum(mrr), 0) from ct where situacao not in ('Cancelado', 'Perdido')), 'moeda', 'contratos não cancelados'),
        relatorios.card('Contratos ativos', (select count(*) from ct where situacao not in ('Cancelado', 'Perdido')), 'numero'),
        relatorios.card('Cancelados no período', (select count(*) from ct where cancelado_em between p_ini and p_fim), 'numero', '', exists (select 1 from ct where cancelado_em between p_ini and p_fim))),
      '[]', jsonb_build_array(
      relatorios.tabela('Contratos', relatorios.colunas('titulo|Contrato', 'situacao|Situação', 'inicio|Início|data', 'fim|Fim|data', 'mrr|Mensal|moeda', 'valor|Valor|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select titulo, situacao, inicio, fim, mrr, valor from ct order by mrr desc, valor desc limit 300) x), (select count(*) from ct))))
  )
  from t, a
$$;

-- ───────────────────────────── Financeiro ─────────────────────────────

create or replace function relatorios.financeiro(p_tenant uuid, p_ini date, p_fim date, p_filial text, p_principal boolean, p_hoje date)
returns jsonb language sql stable set search_path = public as $$
  with e as materialized (
    select f.type as tipo, f.status = 'Pago' as pago, coalesce(f.value, 0) as valor, f.date_normalized as dia,
      coalesce(f.competencia_date, f.date_normalized) as comp,
      coalesce(nullif(trim(f.category), ''), 'Sem categoria')::text as categoria,
      coalesce(nullif(trim(f.counterparty), ''), 'Não informado') as contato,
      coalesce(f.description, '')::text as descricao, f.conta_bancaria_id, f.category_id, coalesce(f.nao_operacional, false) as nao_op
    from finance_entries f
    where f.tenant_id = p_tenant and f.type in ('Pagar', 'Receber') and relatorios.na_filial(f.filial_id, p_filial, p_principal)
  ),
  p as materialized (select * from e where dia between p_ini and p_fim),
  d as (select p.*, case when pago then 'Pago' when dia < p_hoje then 'Atrasado' else 'Pendente' end as situacao from p),
  tp as (
    select coalesce(sum(valor) filter (where tipo = 'Receber' and pago), 0) as ent,
      coalesce(sum(valor) filter (where tipo = 'Pagar' and pago), 0) as sai,
      count(*) filter (where tipo = 'Receber' and pago) as n_ent, count(*) filter (where tipo = 'Pagar' and pago) as n_sai,
      coalesce(sum(valor) filter (where tipo = 'Receber'), 0) as r_prev, coalesce(sum(valor) filter (where tipo = 'Pagar'), 0) as p_prev,
      count(*) filter (where tipo = 'Receber') as r_n, count(*) filter (where tipo = 'Pagar') as p_n,
      coalesce(sum(valor) filter (where tipo = 'Receber' and not pago and dia >= p_hoje), 0) as r_pend,
      coalesce(sum(valor) filter (where tipo = 'Pagar' and not pago and dia >= p_hoje), 0) as p_pend,
      coalesce(sum(valor) filter (where tipo = 'Receber' and not pago and dia < p_hoje), 0) as r_atr,
      coalesce(sum(valor) filter (where tipo = 'Pagar' and not pago and dia < p_hoje), 0) as p_atr
    from p
  ),
  ab as (
    select coalesce(sum(valor) filter (where tipo = 'Receber'), 0) as receber, coalesce(sum(valor) filter (where tipo = 'Pagar'), 0) as pagar,
      coalesce(sum(valor) filter (where tipo = 'Receber' and dia < p_hoje), 0) as r_atr, coalesce(sum(valor) filter (where tipo = 'Pagar' and dia < p_hoje), 0) as p_atr,
      count(*) filter (where tipo = 'Receber' and dia < p_hoje) as r_atr_n, count(*) filter (where tipo = 'Pagar' and dia < p_hoje) as p_atr_n
    from e where not pago
  ),
  contas as materialized (
    select b.nome::text as conta, coalesce(b.banco, '')::text as banco, coalesce(b.tipo, '')::text as tipo,
      (case b.sinal_saldo_inicial when 'ZERADO' then 0 when 'NEGATIVO' then -abs(coalesce(b.saldo_inicial, 0)) else abs(coalesce(b.saldo_inicial, 0)) end)
      + coalesce((select sum(case when e.tipo = 'Receber' then e.valor else -e.valor end) from e where e.conta_bancaria_id = b.id and e.pago), 0)
      + coalesce((select sum(t.valor) from finance_transfers t where t.tenant_id = p_tenant and t.pago and t.conta_destino_id = b.id), 0)
      - coalesce((select sum(t.valor) from finance_transfers t where t.tenant_id = p_tenant and t.pago and t.conta_origem_id = b.id), 0) as saldo
    from finance_bank_accounts b where b.tenant_id = p_tenant and not coalesce(b.arquivada, false)
  ),
  meses as (select generate_series(date_trunc('month', p_fim) - interval '5 months', date_trunc('month', p_fim), interval '1 month')::date as m),
  mensal as (
    select to_char(m, 'MM/YY') as rotulo,
      (select coalesce(sum(valor), 0) from e where pago and tipo = 'Receber' and date_trunc('month', dia) = m) as entradas,
      (select coalesce(sum(valor), 0) from e where pago and tipo = 'Pagar' and date_trunc('month', dia) = m) as saidas
    from meses order by m
  ),
  passo as (select case when p_fim - p_ini <= 62 then 'day' else 'month' end as u),
  fluxo as (
    select ref, entradas, saidas, entradas - saidas as saldo, sum(entradas - saidas) over (order by ref) as acumulado from (
      select date_trunc((select u from passo), dia)::date as ref,
        coalesce(sum(valor) filter (where tipo = 'Receber'), 0) as entradas, coalesce(sum(valor) filter (where tipo = 'Pagar'), 0) as saidas
      from p where pago group by 1) x
  ),
  fluxo_v as (select case when (select u from passo) = 'day' then to_char(f.ref, 'DD/MM') else to_char(f.ref, 'MM/YY') end as rotulo, f.* from fluxo f order by f.ref desc limit 62),
  res as (
    select coalesce(sum(e.valor) filter (where e.tipo = 'Receber'), 0) as receitas,
      coalesce(sum(e.valor) filter (where e.tipo = 'Pagar' and c.subtipo = 'IMPOSTOS'), 0) as impostos,
      coalesce(sum(e.valor) filter (where e.tipo = 'Pagar' and coalesce(c.subtipo, 'DESPESA_VARIAVEL') = 'DESPESA_VARIAVEL'), 0) as variaveis,
      coalesce(sum(e.valor) filter (where e.tipo = 'Pagar' and c.subtipo = 'PESSOAS'), 0) as pessoas,
      coalesce(sum(e.valor) filter (where e.tipo = 'Pagar' and c.subtipo = 'DESPESA_FIXA'), 0) as fixas
    from e left join finance_categories c on c.id = e.category_id and c.tenant_id = p_tenant
    where not e.nao_op and e.comp between p_ini and p_fim
  )
  select jsonb_build_array(
    relatorios.aba('financeiro-resumo', 'Resumo',
      jsonb_build_array(
        relatorios.card('Entradas', tp.ent, 'moeda', tp.n_ent || ' recebimentos pagos'),
        relatorios.card('Saídas', tp.sai, 'moeda', tp.n_sai || ' despesas pagas'),
        relatorios.card('Resultado de caixa', tp.ent - tp.sai, 'moeda', 'entradas menos saídas pagas', tp.ent - tp.sai < 0),
        relatorios.card('Saldo em contas', (select coalesce(sum(saldo), 0) from contas), 'moeda', (select count(*) from contas) || ' contas, hoje'),
        relatorios.card('A receber', ab.receber, 'moeda', 'em aberto, todos os períodos'),
        relatorios.card('A pagar', ab.pagar, 'moeda', 'em aberto, todos os períodos'),
        relatorios.card('Receber atrasado', ab.r_atr, 'moeda', ab.r_atr_n || ' vencidos', ab.r_atr > 0),
        relatorios.card('Pagar atrasado', ab.p_atr, 'moeda', ab.p_atr_n || ' vencidos', ab.p_atr > 0)),
      jsonb_build_array(relatorios.grafico('Entradas e saídas pagas por mês', 'moeda', relatorios.colunas('entradas|Entradas', 'saidas|Saídas'),
        (select jsonb_agg(to_jsonb(x)) from mensal x))),
      jsonb_build_array(relatorios.tabela('Contas em aberto por vencimento', relatorios.colunas('faixa|Vencimento', 'receber|A receber|moeda', 'pagar|A pagar|moeda'),
        (select jsonb_agg(jsonb_build_object('faixa', faixa, 'receber', receber, 'pagar', pagar) order by ordem) from (
          select ordem, faixa, coalesce(sum(valor) filter (where tipo = 'Receber'), 0) as receber, coalesce(sum(valor) filter (where tipo = 'Pagar'), 0) as pagar
          from (select tipo, valor,
                  case when dia < p_hoje then 1 when dia <= p_hoje + 7 then 2 when dia <= p_hoje + 30 then 3 else 4 end as ordem,
                  case when dia < p_hoje then 'Vencido' when dia <= p_hoje + 7 then 'Próximos 7 dias' when dia <= p_hoje + 30 then 'De 8 a 30 dias' else 'Depois de 30 dias' end as faixa
                from e where not pago) y group by 1, 2) z)))),
    relatorios.aba('financeiro-receitas', 'Receitas',
      jsonb_build_array(
        relatorios.card('Previsto no período', tp.r_prev, 'moeda', tp.r_n || ' lançamentos'),
        relatorios.card('Recebido', tp.ent, 'moeda', relatorios.pct(tp.ent, tp.r_prev) || '% do previsto'),
        relatorios.card('A vencer', tp.r_pend, 'moeda'),
        relatorios.card('Atrasado', tp.r_atr, 'moeda', '', tp.r_atr > 0)),
      jsonb_build_array(relatorios.grafico('Receitas por categoria', 'moeda', relatorios.colunas('valor|Previsto'),
        (select jsonb_agg(to_jsonb(x)) from (select categoria as rotulo, sum(valor) as valor from p where tipo = 'Receber' group by 1 order by 2 desc limit 10) x))),
      jsonb_build_array(
        relatorios.tabela('Por categoria', relatorios.colunas('categoria|Categoria', 'qtd|Lançamentos|numero', 'previsto|Previsto|moeda', 'pago|Recebido|moeda'),
          (select jsonb_agg(to_jsonb(x)) from (select categoria, count(*) as qtd, sum(valor) as previsto, coalesce(sum(valor) filter (where pago), 0) as pago from p where tipo = 'Receber' group by 1 order by 3 desc limit 100) x)),
        relatorios.tabela('Maiores clientes', relatorios.colunas('contato|Cliente', 'qtd|Lançamentos|numero', 'previsto|Previsto|moeda', 'pago|Recebido|moeda'),
          (select jsonb_agg(to_jsonb(x)) from (select contato, count(*) as qtd, sum(valor) as previsto, coalesce(sum(valor) filter (where pago), 0) as pago from p where tipo = 'Receber' group by 1 order by 3 desc limit 30) x)),
        relatorios.tabela('Lançamentos', relatorios.colunas('data|Vencimento|data', 'descricao|Descrição', 'contato|Cliente', 'categoria|Categoria', 'situacao|Situação', 'valor|Valor|moeda'),
          (select jsonb_agg(to_jsonb(x)) from (select dia as data, descricao, contato, categoria, situacao, valor from d where tipo = 'Receber' order by dia desc, valor desc limit 300) x), tp.r_n))),
    relatorios.aba('financeiro-despesas', 'Despesas',
      jsonb_build_array(
        relatorios.card('Previsto no período', tp.p_prev, 'moeda', tp.p_n || ' lançamentos'),
        relatorios.card('Pago', tp.sai, 'moeda', relatorios.pct(tp.sai, tp.p_prev) || '% do previsto'),
        relatorios.card('A vencer', tp.p_pend, 'moeda'),
        relatorios.card('Atrasado', tp.p_atr, 'moeda', '', tp.p_atr > 0)),
      jsonb_build_array(relatorios.grafico('Despesas por categoria', 'moeda', relatorios.colunas('valor|Previsto'),
        (select jsonb_agg(to_jsonb(x)) from (select categoria as rotulo, sum(valor) as valor from p where tipo = 'Pagar' group by 1 order by 2 desc limit 10) x))),
      jsonb_build_array(
        relatorios.tabela('Por categoria', relatorios.colunas('categoria|Categoria', 'qtd|Lançamentos|numero', 'previsto|Previsto|moeda', 'pago|Pago|moeda'),
          (select jsonb_agg(to_jsonb(x)) from (select categoria, count(*) as qtd, sum(valor) as previsto, coalesce(sum(valor) filter (where pago), 0) as pago from p where tipo = 'Pagar' group by 1 order by 3 desc limit 100) x)),
        relatorios.tabela('Maiores fornecedores', relatorios.colunas('contato|Fornecedor', 'qtd|Lançamentos|numero', 'previsto|Previsto|moeda', 'pago|Pago|moeda'),
          (select jsonb_agg(to_jsonb(x)) from (select contato, count(*) as qtd, sum(valor) as previsto, coalesce(sum(valor) filter (where pago), 0) as pago from p where tipo = 'Pagar' group by 1 order by 3 desc limit 30) x)),
        relatorios.tabela('Lançamentos', relatorios.colunas('data|Vencimento|data', 'descricao|Descrição', 'contato|Fornecedor', 'categoria|Categoria', 'situacao|Situação', 'valor|Valor|moeda'),
          (select jsonb_agg(to_jsonb(x)) from (select dia as data, descricao, contato, categoria, situacao, valor from d where tipo = 'Pagar' order by dia desc, valor desc limit 300) x), tp.p_n))),
    relatorios.aba('financeiro-fluxo', 'Fluxo de caixa', '[]',
      jsonb_build_array(relatorios.grafico('Saldo acumulado no período', 'moeda', relatorios.colunas('acumulado|Acumulado'),
        (select jsonb_agg(jsonb_build_object('rotulo', rotulo, 'acumulado', acumulado) order by ref) from fluxo_v))),
      jsonb_build_array(relatorios.tabela('Movimento pago', relatorios.colunas('rotulo|Período', 'entradas|Entradas|moeda', 'saidas|Saídas|moeda', 'saldo|Saldo|moeda', 'acumulado|Acumulado|moeda'),
        (select jsonb_agg(jsonb_build_object('rotulo', rotulo, 'entradas', entradas, 'saidas', saidas, 'saldo', saldo, 'acumulado', acumulado) order by ref) from fluxo_v),
        (select count(*) from fluxo)))),
    relatorios.aba('financeiro-resultado', 'Resultado',
      jsonb_build_array(
        relatorios.card('Receitas', res.receitas, 'moeda', 'por competência'),
        relatorios.card('Despesas', res.impostos + res.variaveis + res.pessoas + res.fixas, 'moeda', 'por competência'),
        relatorios.card('Resultado', res.receitas - res.impostos - res.variaveis - res.pessoas - res.fixas, 'moeda', '',
          res.receitas - res.impostos - res.variaveis - res.pessoas - res.fixas < 0),
        relatorios.card('Margem', relatorios.pct(res.receitas - res.impostos - res.variaveis - res.pessoas - res.fixas, res.receitas), 'percentual')),
      '[]',
      jsonb_build_array(relatorios.tabela('Resumo por tipo de despesa', relatorios.colunas('linha|Linha', 'valor|Valor|moeda', 'parte|% da receita|percentual'),
        jsonb_build_array(
          jsonb_build_object('linha', 'Receitas', 'valor', res.receitas, 'parte', relatorios.pct(res.receitas, res.receitas)),
          jsonb_build_object('linha', '(−) Impostos', 'valor', res.impostos, 'parte', relatorios.pct(res.impostos, res.receitas)),
          jsonb_build_object('linha', '(−) Despesas variáveis', 'valor', res.variaveis, 'parte', relatorios.pct(res.variaveis, res.receitas)),
          jsonb_build_object('linha', '(−) Pessoas', 'valor', res.pessoas, 'parte', relatorios.pct(res.pessoas, res.receitas)),
          jsonb_build_object('linha', '(−) Despesas fixas', 'valor', res.fixas, 'parte', relatorios.pct(res.fixas, res.receitas)),
          jsonb_build_object('linha', '(=) Resultado', 'valor', res.receitas - res.impostos - res.variaveis - res.pessoas - res.fixas,
            'parte', relatorios.pct(res.receitas - res.impostos - res.variaveis - res.pessoas - res.fixas, res.receitas))))),
      'Conta por competência, sem lançamentos não operacionais. Despesa sem categoria vinculada entra como variável. O DRE completo está no Financeiro.'),
    relatorios.aba('financeiro-atrasados', 'Atrasados',
      jsonb_build_array(
        relatorios.card('A receber vencido', ab.r_atr, 'moeda', ab.r_atr_n || ' lançamentos', ab.r_atr > 0),
        relatorios.card('A pagar vencido', ab.p_atr, 'moeda', ab.p_atr_n || ' lançamentos', ab.p_atr > 0)),
      '[]', jsonb_build_array(
        relatorios.tabela('A receber vencido', relatorios.colunas('data|Venceu em|data', 'dias|Dias|numero', 'descricao|Descrição', 'contato|Cliente', 'valor|Valor|moeda'),
          (select jsonb_agg(to_jsonb(x)) from (select dia as data, p_hoje - dia as dias, descricao, contato, valor from e where tipo = 'Receber' and not pago and dia < p_hoje order by valor desc limit 300) x), ab.r_atr_n),
        relatorios.tabela('A pagar vencido', relatorios.colunas('data|Venceu em|data', 'dias|Dias|numero', 'descricao|Descrição', 'contato|Fornecedor', 'valor|Valor|moeda'),
          (select jsonb_agg(to_jsonb(x)) from (select dia as data, p_hoje - dia as dias, descricao, contato, valor from e where tipo = 'Pagar' and not pago and dia < p_hoje order by valor desc limit 300) x), ab.p_atr_n)),
      'Todos os vencidos até hoje, independentemente do período escolhido.'),
    relatorios.aba('financeiro-contas', 'Contas',
      jsonb_build_array(relatorios.card('Saldo total', (select coalesce(sum(saldo), 0) from contas), 'moeda', 'hoje')),
      '[]', jsonb_build_array(relatorios.tabela('Contas bancárias e caixas', relatorios.colunas('conta|Conta', 'banco|Banco', 'tipo|Tipo', 'saldo|Saldo|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select * from contas order by saldo desc) x))))
  )
  from tp, ab, res
$$;

-- ───────────────────────────── Marketing ─────────────────────────────

create or replace function relatorios.marketing(p_tenant uuid, p_ini date, p_fim date, p_filial text, p_principal boolean, p_hoje date)
returns jsonb language sql stable set search_path = public as $$
  with n as materialized (select * from relatorios.negocios(p_tenant, p_filial, p_principal)),
  gasto as materialized (
    select coalesce(nullif(relatorios.canal(s.source, '{}'::jsonb), 'Orgânico'), 'Sem canal') as canal, sum(s.amount) as valor
    from marketing_spend s where s.tenant_id = p_tenant and s.month between date_trunc('month', p_ini)::date and p_fim group by 1
  ),
  canais as materialized (
    select coalesce(a.canal, g.canal) as canal, coalesce(a.leads, 0) as leads, coalesce(a.ganhos, 0) as ganhos, coalesce(a.valor, 0) as valor, coalesce(g.valor, 0) as gasto
    from (select canal, count(*) filter (where dia_cadastro between p_ini and p_fim) as leads,
            count(*) filter (where dia_ganho between p_ini and p_fim) as ganhos,
            coalesce(sum(valor) filter (where dia_ganho between p_ini and p_fim), 0) as valor
          from n group by 1) a
    full join gasto g on lower(g.canal) = lower(a.canal)
    where coalesce(a.leads, 0) + coalesce(a.ganhos, 0) > 0 or coalesce(g.valor, 0) > 0
  ),
  t as (select coalesce(sum(leads), 0) as leads, coalesce(sum(ganhos), 0) as ganhos, coalesce(sum(valor), 0) as valor, coalesce(sum(gasto), 0) as gasto from canais),
  fin as (
    select coalesce(sum(f.value), 0) as v from finance_entries f
    where f.tenant_id = p_tenant and f.type = 'Pagar' and f.status = 'Pago' and f.date_normalized between p_ini and p_fim
      and relatorios.na_filial(f.filial_id, p_filial, p_principal)
      and lower(coalesce(f.category, '')) ~ 'marketing|an[uú]ncio|tr[aá]fego|publicidade|propaganda|\yads\y|meta ads|google ads|influenc'
  ),
  cont as materialized (
    select coalesce(c.title, '')::text as titulo, coalesce(c.platform, '')::text as canal, coalesce(c.extras->>'formato', '') as formato,
      coalesce(c.status, '')::text as situacao, (c.publish_date at time zone 'UTC')::date as data,
      case c.extras->'aprovacao'->>'status' when 'aprovado' then 'Aprovado' when 'ajustes' then 'Ajustes pedidos' when 'aguardando' then 'Aguardando cliente' else '' end as aprovacao,
      coalesce(f.nome, '') as cliente
    from marketing_content c left join empresa_filiais f on f.id = c.extras->>'clienteId' and f.tenant_id = p_tenant
    where c.tenant_id = p_tenant and c.deleted_at is null and relatorios.na_filial(c.extras->>'clienteId', p_filial, p_principal)
  ),
  cont_p as materialized (select * from cont where data between p_ini and p_fim)
  select jsonb_build_array(
    relatorios.aba('marketing-resumo', 'Resumo',
      jsonb_build_array(
        relatorios.card('Leads novos', t.leads, 'numero', 'cadastrados no período'),
        relatorios.card('Vendas', t.ganhos, 'numero', 'ganhos no período'),
        relatorios.card('Valor vendido', t.valor, 'moeda'),
        relatorios.card('Investimento em mídia', t.gasto, 'moeda', 'lançado em Marketing (meses do período)'),
        relatorios.card('Custo por lead', case when t.leads > 0 then t.gasto / t.leads else 0 end, 'moeda'),
        relatorios.card('Custo por venda', case when t.ganhos > 0 then t.gasto / t.ganhos else 0 end, 'moeda'),
        relatorios.card('Despesas de marketing', fin.v, 'moeda', 'pagas, no Financeiro'),
        relatorios.card('Conteúdos no período', (select count(*) from cont_p), 'numero')),
      jsonb_build_array(
        relatorios.grafico('Leads por canal', 'numero', relatorios.colunas('leads|Leads'),
          (select jsonb_agg(to_jsonb(x)) from (select canal as rotulo, leads from canais where leads > 0 order by leads desc limit 10) x)),
        relatorios.grafico('Valor vendido por canal', 'moeda', relatorios.colunas('valor|Valor'),
          (select jsonb_agg(to_jsonb(x)) from (select canal as rotulo, valor from canais where valor > 0 order by valor desc limit 10) x)))),
    relatorios.aba('marketing-canais', 'Canais', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Desempenho por canal', relatorios.colunas('canal|Canal', 'leads|Leads|numero', 'ganhos|Vendas|numero', 'conversao|Conversão|percentual', 'valor|Valor vendido|moeda', 'gasto|Investimento|moeda', 'cpl|Custo por lead|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select canal, leads, ganhos, relatorios.pct(ganhos, leads) as conversao, valor, gasto, case when leads > 0 then round(gasto / leads, 2) else 0 end as cpl
           from canais order by valor desc, leads desc limit 100) x)))),
    relatorios.aba('marketing-campanhas', 'Campanhas', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Campanhas de anúncios', relatorios.colunas('nome|Campanha', 'canal|Canal', 'situacao|Situação', 'orcamento|Orçamento|moeda', 'gasto|Gasto|moeda', 'leads|Leads|numero'),
        (select jsonb_agg(to_jsonb(x)) from (select name as nome, platform as canal, status as situacao, coalesce(budget, 0) as orcamento, coalesce(amount_spent, 0) as gasto, coalesce(leads_generated, 0) as leads
           from marketing_campaigns where tenant_id = p_tenant and deleted_at is null order by created_at desc limit 200) x)),
      relatorios.tabela('Tráfego pago', relatorios.colunas('nome|Ação', 'canal|Canal', 'situacao|Situação', 'inicio|Início|data', 'fim|Fim|data', 'orcamento|Orçamento|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select title as nome, platform as canal, status as situacao, start_date as inicio, end_date as fim, coalesce(budget, 0) as orcamento
           from marketing_trafego where tenant_id = p_tenant and deleted_at is null order by created_at desc limit 200) x)),
      relatorios.tabela('E-mails em massa do período', relatorios.colunas('nome|Campanha', 'situacao|Situação', 'enviados|Enviados|numero', 'falhas|Falhas|numero', 'abertos|Abertos|numero', 'cliques|Cliques|numero'),
        (select jsonb_agg(to_jsonb(x)) from (select name as nome, status as situacao, coalesce(sent, 0) as enviados, coalesce(failed, 0) as falhas, coalesce(opened, 0) as abertos, coalesce(clicked, 0) as cliques
           from email_campaigns where tenant_id = p_tenant and (created_at at time zone 'America/Sao_Paulo')::date between p_ini and p_fim order by created_at desc limit 200) x))),
      case when p_filial is null then '' else 'Campanhas e e-mails são da empresa inteira.' end),
    relatorios.aba('marketing-conteudo', 'Conteúdo',
      jsonb_build_array(
        relatorios.card('Publicações no período', (select count(*) from cont_p), 'numero'),
        relatorios.card('Aprovadas pelo cliente', (select count(*) from cont_p where aprovacao = 'Aprovado'), 'numero'),
        relatorios.card('Aguardando cliente', (select count(*) from cont where aprovacao = 'Aguardando cliente'), 'numero', 'em qualquer data'),
        relatorios.card('Ajustes pedidos', (select count(*) from cont where aprovacao = 'Ajustes pedidos'), 'numero', 'em qualquer data', exists (select 1 from cont where aprovacao = 'Ajustes pedidos'))),
      jsonb_build_array(relatorios.grafico('Publicações por situação', 'numero', relatorios.colunas('qtd|Publicações'),
        (select jsonb_agg(to_jsonb(x)) from (select situacao as rotulo, count(*) as qtd from cont_p group by 1 order by 2 desc) x))),
      jsonb_build_array(relatorios.tabela('Calendário do período', relatorios.colunas('data|Data|data', 'titulo|Título', 'cliente|Cliente', 'canal|Canal', 'formato|Formato', 'situacao|Situação', 'aprovacao|Aprovação'),
        (select jsonb_agg(to_jsonb(x)) from (select data, titulo, cliente, canal, formato, situacao, aprovacao from cont_p order by data limit 300) x), (select count(*) from cont_p)))),
    relatorios.aba('marketing-paginas', 'Páginas e formulários', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Landing pages', relatorios.colunas('nome|Página', 'situacao|Situação', 'visitas|Visitas|numero', 'conversoes|Conversões|numero', 'taxa|Taxa|percentual'),
        (select jsonb_agg(to_jsonb(x)) from (select coalesce(nullif(title, ''), name) as nome, status as situacao, coalesce(views, 0) as visitas, coalesce(conversions, 0) as conversoes, relatorios.pct(coalesce(conversions, 0), coalesce(views, 0)) as taxa
           from marketing_landing_pages where tenant_id = p_tenant and deleted_at is null order by coalesce(views, 0) desc limit 200) x)),
      relatorios.tabela('Formulários', relatorios.colunas('nome|Formulário', 'origem|Origem', 'situacao|Situação'),
        (select jsonb_agg(to_jsonb(x)) from (select name as nome, coalesce(source, '') as origem, case when active then 'Ativo' else 'Desativado' end as situacao
           from marketing_forms where tenant_id = p_tenant order by name limit 200) x))),
      case when p_filial is null then '' else 'Páginas e formulários são da empresa inteira.' end)
  )
  from t, fin
$$;

-- ───────────────────────────── Operação (tarefas, ordens de serviço, agenda) ─────────────────────────────

create or replace function relatorios.operacoes(p_tenant uuid, p_ini date, p_fim date, p_filial text, p_principal boolean, p_hoje date)
returns jsonb language sql stable set search_path = public as $$
  with tk as materialized (
    select coalesce(t.title, '')::text as titulo, coalesce(t.status, '')::text as situacao, coalesce(t.priority, '')::text as prioridade, t.assigned_to,
      (t.due_date at time zone 'UTC')::date as prazo, (t.created_at at time zone 'America/Sao_Paulo')::date as criada,
      (t.completed_at at time zone 'America/Sao_Paulo')::date as concluida_em,
      (t.completed_at is not null or coalesce(t.status, '') ~* '^(done|conclu)') as feita
    from tasks t where t.tenant_id = p_tenant and t.deleted_at is null and relatorios.na_filial(t.filial_id, p_filial, p_principal)
  ),
  resp as materialized (
    select a.assigned_to, coalesce(
      (select u.name::text from users u where u.id = a.assigned_to),
      (select c.nome::text from colaboradores c where c.id = a.assigned_to::text limit 1), 'Sem responsável') as nome
    from (select distinct assigned_to from tk) a
  ),
  tt as (
    select count(*) filter (where criada between p_ini and p_fim) as criadas, count(*) filter (where concluida_em between p_ini and p_fim) as concluidas,
      count(*) filter (where not feita) as abertas, count(*) filter (where not feita and prazo < p_hoje) as atrasadas from tk
  ),
  os as materialized (
    select o.numero, coalesce(o.titulo, '') as titulo, coalesce(o.cliente_nome, '') as cliente, coalesce(o.responsavel, '') as responsavel, coalesce(o.status, '') as situacao,
      coalesce(o.data_abertura, (o.created_at at time zone 'America/Sao_Paulo')::date) as abertura, o.data_prevista as prevista, o.data_conclusao as conclusao, coalesce(o.valor_total, 0) as valor
    from ordens_servico o where o.tenant_id = p_tenant
  ),
  os_p as materialized (select * from os where abertura between p_ini and p_fim),
  rs as materialized (
    select data, coalesce(hora, '') as hora, coalesce(contato_nome, '') as contato, coalesce(status, '') as situacao, coalesce(status_pagamento, '') as pagamento, coalesce(valor_total, 0) as valor
    from agendamento_reservas where tenant_id = p_tenant and data between p_ini and p_fim
  ),
  ru as materialized (
    select ("scheduledAt" at time zone 'America/Sao_Paulo')::date as data, to_char("scheduledAt" at time zone 'America/Sao_Paulo', 'HH24:MI') as hora,
      coalesce("leadName", '') as contato, coalesce("closerName", '') as responsavel, coalesce(status, '') as situacao
    from reunioes where tenant_id = p_tenant and ("scheduledAt" at time zone 'America/Sao_Paulo')::date between p_ini and p_fim
  )
  select jsonb_build_array(
    relatorios.aba('operacoes-resumo', 'Resumo',
      jsonb_build_array(
        relatorios.card('Tarefas concluídas', tt.concluidas, 'numero', 'no período'),
        relatorios.card('Tarefas em aberto', tt.abertas, 'numero', 'hoje'),
        relatorios.card('Tarefas atrasadas', tt.atrasadas, 'numero', 'prazo vencido', tt.atrasadas > 0),
        relatorios.card('Ordens de serviço', (select count(*) from os_p), 'numero', 'abertas no período'),
        relatorios.card('Reuniões', (select count(*) from ru), 'numero', 'no período'),
        relatorios.card('Reservas', (select count(*) from rs), 'numero', 'no período')),
      jsonb_build_array(relatorios.grafico('Tarefas em aberto por responsável', 'numero', relatorios.colunas('qtd|Em aberto'),
        (select jsonb_agg(to_jsonb(x)) from (select resp.nome as rotulo, count(*) as qtd from tk join resp on resp.assigned_to is not distinct from tk.assigned_to where not feita group by 1 order by 2 desc limit 10) x)))),
    relatorios.aba('operacoes-tarefas', 'Tarefas',
      jsonb_build_array(relatorios.card('Criadas', tt.criadas, 'numero', 'no período'), relatorios.card('Concluídas', tt.concluidas, 'numero', 'no período'),
        relatorios.card('Atrasadas', tt.atrasadas, 'numero', '', tt.atrasadas > 0)),
      '[]', jsonb_build_array(
        relatorios.tabela('Por responsável', relatorios.colunas('responsavel|Responsável', 'abertas|Em aberto|numero', 'atrasadas|Atrasadas|numero', 'concluidas|Concluídas no período|numero'),
          (select jsonb_agg(to_jsonb(x)) from (select resp.nome as responsavel, count(*) filter (where not feita) as abertas, count(*) filter (where not feita and prazo < p_hoje) as atrasadas,
             count(*) filter (where concluida_em between p_ini and p_fim) as concluidas
             from tk join resp on resp.assigned_to is not distinct from tk.assigned_to group by 1
             having count(*) filter (where not feita or concluida_em between p_ini and p_fim) > 0 order by 2 desc limit 100) x)),
        relatorios.tabela('Tarefas atrasadas', relatorios.colunas('prazo|Prazo|data', 'titulo|Tarefa', 'responsavel|Responsável', 'prioridade|Prioridade', 'situacao|Situação'),
          (select jsonb_agg(to_jsonb(x)) from (select prazo, titulo, resp.nome as responsavel, prioridade, situacao from tk join resp on resp.assigned_to is not distinct from tk.assigned_to
             where not feita and prazo < p_hoje order by prazo desc limit 200) x), tt.atrasadas))),
    relatorios.aba('operacoes-os', 'Ordens de serviço',
      jsonb_build_array(
        relatorios.card('Abertas no período', (select count(*) from os_p), 'numero'),
        relatorios.card('Valor no período', (select coalesce(sum(valor), 0) from os_p where situacao <> 'Cancelada'), 'moeda', 'sem canceladas'),
        relatorios.card('Concluídas no período', (select count(*) from os where conclusao between p_ini and p_fim), 'numero'),
        relatorios.card('Fora do prazo', (select count(*) from os where prevista < p_hoje and situacao not in ('Concluída', 'Cancelada')), 'numero', 'hoje',
          exists (select 1 from os where prevista < p_hoje and situacao not in ('Concluída', 'Cancelada')))),
      jsonb_build_array(relatorios.grafico('Ordens por situação', 'numero', relatorios.colunas('qtd|Ordens'),
        (select jsonb_agg(to_jsonb(x)) from (select situacao as rotulo, count(*) as qtd from os_p group by 1 order by 2 desc) x))),
      jsonb_build_array(relatorios.tabela('Ordens de serviço', relatorios.colunas('numero|Nº|texto', 'abertura|Abertura|data', 'titulo|Título', 'cliente|Cliente', 'responsavel|Responsável', 'situacao|Situação', 'prevista|Previsão|data', 'valor|Valor|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select numero, abertura, titulo, cliente, responsavel, situacao, prevista, valor from os_p order by abertura desc limit 300) x), (select count(*) from os_p))),
      case when p_filial is null then '' else 'Ordens de serviço são da empresa inteira.' end),
    relatorios.aba('operacoes-agenda', 'Agenda', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Reuniões', relatorios.colunas('data|Data|data', 'hora|Hora', 'contato|Contato', 'responsavel|Responsável', 'situacao|Situação'),
        (select jsonb_agg(to_jsonb(x)) from (select * from ru order by data desc, hora limit 300) x), (select count(*) from ru)),
      relatorios.tabela('Reservas', relatorios.colunas('data|Data|data', 'hora|Hora', 'contato|Contato', 'situacao|Situação', 'pagamento|Pagamento', 'valor|Valor|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select * from rs order by data desc, hora limit 300) x), (select count(*) from rs))),
      case when p_filial is null then '' else 'Reuniões e reservas são da empresa inteira.' end)
  )
  from tt
$$;

-- ───────────────────────────── Varejo ─────────────────────────────

create or replace function relatorios.varejo(p_tenant uuid, p_ini date, p_fim date, p_filial text, p_principal boolean, p_hoje date)
returns jsonb language sql stable set search_path = public as $$
  with un as (
    select case
      when p_filial is null then null
      when exists (select 1 from app_settings s where s.tenant_id = p_tenant and s.key = 'integracoes_maxdata_estoque' and s.value->>'filialId' = p_filial) then 'maxdata:estoque'
      when exists (select 1 from app_settings s where s.tenant_id = p_tenant and s.key = 'integracoes_maxdata' and s.value->>'filialId' = p_filial) then 'maxdata:notas'
      else 'maxdata:nenhuma' end as u
  ),
  v as materialized (
    select x.id, 'PDV'::text as origem, coalesce(x.data_venda, x.created_at) as quando, case when x.cancelada_em is not null then 'cancelada' else x.status end as situacao,
      coalesce(x.valor_total, 0) as valor, coalesce(nullif(x.cliente_nome, ''), 'Consumidor') as cliente, coalesce(nullif(x.vendedor_nome, ''), 'Sem vendedor') as vendedor,
      coalesce(nullif(x.forma_pagamento, ''), 'Não informada') as forma
    from vendas x where x.tenant_id = p_tenant and coalesce(x.data_venda, x.created_at) >= p_ini and coalesce(x.data_venda, x.created_at) < p_fim + 1
    union all
    select m.id, 'Max Data', m.data_venda, m.status, coalesce(m.valor_total, 0), coalesce(nullif(m.cliente_nome, ''), 'Consumidor'),
      coalesce(nullif(m.externo_dados->>'vendedor', ''), 'Sem vendedor'), coalesce(nullif(m.forma_pagamento, ''), 'Não informada')
    from maxdata_vendas m, un where m.tenant_id = p_tenant and m.data_venda >= p_ini and m.data_venda < p_fim + 1
      and m.valor_total <= 1000000 and (un.u is null or m.externo_sistema = un.u)
  ),
  ok as materialized (select * from v where situacao = 'paga'),
  t as (
    select (select count(*) from ok) as qtd, (select coalesce(sum(valor), 0) from ok) as valor,
      (select count(*) from v where situacao = 'cancelada') as canc, (select coalesce(sum(valor), 0) from v where situacao = 'cancelada') as canc_v,
      (select count(*) from v where situacao not in ('paga', 'cancelada')) as abertas, (select count(distinct cliente) from ok) as clientes
  ),
  passo as (select case when p_fim - p_ini <= 62 then 'day' else 'month' end as u),
  serie as (select date_trunc((select u from passo), quando)::date as ref, sum(valor) as valor, count(*) as qtd from ok group by 1),
  serie_v as (select s.ref, case when (select u from passo) = 'day' then to_char(s.ref, 'DD/MM') else to_char(s.ref, 'MM/YY') end as rotulo, s.valor, s.qtd from serie s order by s.ref desc limit 62),
  itens as materialized (
    select coalesce(nullif(i.product_name, ''), 'Produto') as produto, coalesce(i.quantidade_decimal, i.quantidade, 0)::numeric as qtd,
      coalesce(i.quantidade_decimal, i.quantidade, 0) * coalesce(i.preco_unitario, 0) - coalesce(i.valor_desconto, 0) as valor
    from ok join venda_items i on i.venda_id = ok.id where ok.origem = 'PDV'
    union all
    select coalesce(nullif(i.product_name, ''), 'Produto'), coalesce(i.quantidade_decimal, i.quantidade, 0)::numeric,
      coalesce(i.quantidade_decimal, i.quantidade, 0) * coalesce(i.preco_unitario, 0) - coalesce(i.valor_desconto, 0)
    from ok join maxdata_venda_itens i on i.venda_id = ok.id where ok.origem = 'Max Data' and p_fim - p_ini <= 100
  ),
  estoque as materialized (
    select name::text as produto, coalesce(sku, '')::text as codigo, coalesce(stock, "currentStock", 0) as atual, coalesce(stock_min, "stockMin", 0) as minimo
    from products where tenant_id = p_tenant and deleted_at is null and coalesce(active, true) and coalesce(type, 'Físico') = 'Físico'
      and relatorios.na_filial(filial_id, p_filial, p_principal) and coalesce(stock_min, "stockMin", 0) > 0 and coalesce(stock, "currentStock", 0) <= coalesce(stock_min, "stockMin", 0)
  )
  select jsonb_build_array(
    relatorios.aba('varejo-resumo', 'Resumo',
      jsonb_build_array(
        relatorios.card('Faturamento', t.valor, 'moeda', 'vendas pagas no período'),
        relatorios.card('Vendas', t.qtd, 'numero'),
        relatorios.card('Ticket médio', case when t.qtd > 0 then t.valor / t.qtd else 0 end, 'moeda'),
        relatorios.card('Clientes', t.clientes, 'numero', 'que compraram'),
        relatorios.card('Canceladas', t.canc, 'numero', '', t.canc > 0),
        relatorios.card('Valor cancelado', t.canc_v, 'moeda'),
        relatorios.card('Em aberto', t.abertas, 'numero'),
        relatorios.card('Estoque no mínimo', (select count(*) from estoque), 'numero', 'produtos para repor', exists (select 1 from estoque))),
      jsonb_build_array(relatorios.grafico('Faturamento no período', 'moeda', relatorios.colunas('valor|Faturamento'),
        (select jsonb_agg(jsonb_build_object('rotulo', rotulo, 'valor', valor) order by ref) from serie_v))),
      jsonb_build_array(relatorios.tabela('Movimento', relatorios.colunas('rotulo|Período', 'qtd|Vendas|numero', 'valor|Faturamento|moeda'),
        (select jsonb_agg(jsonb_build_object('rotulo', rotulo, 'qtd', qtd, 'valor', valor) order by ref) from serie_v), (select count(*) from serie)))),
    relatorios.aba('varejo-vendedores', 'Vendedores e pagamentos', '[]',
      jsonb_build_array(relatorios.grafico('Faturamento por forma de pagamento', 'moeda', relatorios.colunas('valor|Valor'),
        (select jsonb_agg(to_jsonb(x)) from (select forma as rotulo, sum(valor) as valor from ok group by 1 order by 2 desc limit 10) x))),
      jsonb_build_array(
        relatorios.tabela('Por vendedor', relatorios.colunas('vendedor|Vendedor', 'qtd|Vendas|numero', 'valor|Faturamento|moeda', 'ticket|Ticket médio|moeda'),
          (select jsonb_agg(to_jsonb(x)) from (select vendedor, count(*) as qtd, sum(valor) as valor, round(avg(valor), 2) as ticket from ok group by 1 order by 3 desc limit 100) x)),
        relatorios.tabela('Maiores clientes', relatorios.colunas('cliente|Cliente', 'qtd|Compras|numero', 'valor|Valor|moeda'),
          (select jsonb_agg(to_jsonb(x)) from (select cliente, count(*) as qtd, sum(valor) as valor from ok group by 1 order by 3 desc limit 30) x)))),
    relatorios.aba('varejo-produtos', 'Produtos e estoque', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Mais vendidos', relatorios.colunas('produto|Produto', 'qtd|Quantidade|numero', 'valor|Valor|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select produto, sum(qtd) as qtd, sum(valor) as valor from itens group by 1 order by 3 desc limit 50) x)),
      relatorios.tabela('Para repor', relatorios.colunas('produto|Produto', 'codigo|Código', 'atual|Em estoque|numero', 'minimo|Mínimo|numero'),
        (select jsonb_agg(to_jsonb(x)) from (select * from estoque order by atual - minimo, produto limit 200) x), (select count(*) from estoque))),
      case when p_fim - p_ini > 100 then 'Para períodos acima de 100 dias, o ranking de produtos considera só as vendas feitas no PDV.' else '' end),
    relatorios.aba('varejo-vendas', 'Vendas', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Vendas do período', relatorios.colunas('data|Data|data', 'origem|Origem', 'cliente|Cliente', 'vendedor|Vendedor', 'forma|Pagamento', 'situacao|Situação', 'valor|Valor|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select quando::date as data, origem, cliente, vendedor, forma, situacao, valor from v order by quando desc limit 300) x), (select count(*) from v))))
  )
  from t
$$;

-- ───────────────────────────── Imobiliário ─────────────────────────────

create or replace function relatorios.imobiliario(p_tenant uuid, p_ini date, p_fim date, p_filial text, p_principal boolean, p_hoje date)
returns jsonb language sql stable set search_path = public as $$
  with im as materialized (
    select name::text as imovel, coalesce(type_attributes->>'statusAtivo', 'Disponível') as situacao, coalesce(type_attributes->>'operacao', '') as operacao,
      coalesce(type_attributes->>'bairro', '') as bairro, coalesce(price, 0) as valor
    from products where tenant_id = p_tenant and deleted_at is null and type = 'Imóvel' and relatorios.na_filial(filial_id, p_filial, p_principal)
  ),
  ld as materialized (
    select coalesce(nome, '') as nome, coalesce(etapa, '') as etapa, coalesce(corretor, '') as corretor, coalesce(origem, '') as origem, coalesce(orcamento, 0) as orcamento,
      (created_at at time zone 'America/Sao_Paulo')::date as data
    from imobiliario_leads where tenant_id = p_tenant and veiculo_id is null
  ),
  vi as materialized (
    select data, coalesce(hora, '') as hora, coalesce(imovel, '') as imovel, coalesce(cliente, '') as cliente, coalesce(corretor, '') as corretor, coalesce(status, '') as situacao
    from imobiliario_visitas where tenant_id = p_tenant and veiculo_id is null and data between p_ini and p_fim
  ),
  cap as materialized (
    select data, coalesce(endereco, '') as endereco, coalesce(tipo, '') as tipo, coalesce(corretor, '') as corretor, coalesce(status, '') as situacao, coalesce(valor_pretendido, 0) as valor
    from imobiliario_captacoes where tenant_id = p_tenant and data between p_ini and p_fim
  ),
  com as materialized (
    select coalesce(imovel, '') as imovel, coalesce(corretor, '') as corretor, coalesce(status, '') as situacao, coalesce(valor_venda, 0) as venda, coalesce(comissao_total, 0) as comissao,
      coalesce(comissao_corretor, 0) as corretor_valor
    from imobiliario_comissoes where tenant_id = p_tenant and (created_at at time zone 'America/Sao_Paulo')::date between p_ini and p_fim
  )
  select jsonb_build_array(
    relatorios.aba('imobiliario-resumo', 'Resumo',
      jsonb_build_array(
        relatorios.card('Imóveis na carteira', (select count(*) from im), 'numero'),
        relatorios.card('Valor da carteira', (select coalesce(sum(valor), 0) from im), 'moeda'),
        relatorios.card('Interessados novos', (select count(*) from ld where data between p_ini and p_fim), 'numero', 'no período'),
        relatorios.card('Visitas', (select count(*) from vi), 'numero', 'no período'),
        relatorios.card('Captações', (select count(*) from cap), 'numero', 'no período'),
        relatorios.card('Vendas com comissão', (select coalesce(sum(venda), 0) from com), 'moeda', 'no período'),
        relatorios.card('Comissões', (select coalesce(sum(comissao), 0) from com), 'moeda', 'no período')),
      jsonb_build_array(relatorios.grafico('Imóveis por situação', 'numero', relatorios.colunas('qtd|Imóveis'),
        (select jsonb_agg(to_jsonb(x)) from (select situacao as rotulo, count(*) as qtd from im group by 1 order by 2 desc) x)),
        relatorios.grafico('Interessados por etapa', 'numero', relatorios.colunas('qtd|Interessados'),
        (select jsonb_agg(to_jsonb(x)) from (select etapa as rotulo, count(*) as qtd from ld group by 1 order by 2 desc limit 10) x)))),
    relatorios.aba('imobiliario-imoveis', 'Imóveis', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Carteira', relatorios.colunas('imovel|Imóvel', 'operacao|Operação', 'bairro|Bairro', 'situacao|Situação', 'valor|Valor|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select imovel, operacao, bairro, situacao, valor from im order by valor desc limit 300) x), (select count(*) from im)),
      relatorios.tabela('Empreendimentos', relatorios.colunas('nome|Empreendimento', 'cidade|Cidade', 'situacao|Situação', 'unidades|Unidades|numero', 'disponiveis|Disponíveis|numero', 'vgv|VGV|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select nome, cidade, status as situacao, coalesce(total_unidades, 0) as unidades, coalesce(unidades_disponiveis, 0) as disponiveis, coalesce(vgv_total, 0) as vgv
          from imobiliario_empreendimentos where tenant_id = p_tenant order by nome limit 200) x)))),
    relatorios.aba('imobiliario-leads', 'Interessados e visitas', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Interessados do período', relatorios.colunas('data|Data|data', 'nome|Nome', 'etapa|Etapa', 'corretor|Corretor', 'origem|Origem', 'orcamento|Orçamento|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select data, nome, etapa, corretor, origem, orcamento from ld where data between p_ini and p_fim order by data desc limit 300) x), (select count(*) from ld where data between p_ini and p_fim)),
      relatorios.tabela('Visitas', relatorios.colunas('data|Data|data', 'hora|Hora', 'imovel|Imóvel', 'cliente|Cliente', 'corretor|Corretor', 'situacao|Situação'),
        (select jsonb_agg(to_jsonb(x)) from (select * from vi order by data desc limit 300) x), (select count(*) from vi)))),
    relatorios.aba('imobiliario-captacoes', 'Captações e comissões', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Captações', relatorios.colunas('data|Data|data', 'endereco|Endereço', 'tipo|Tipo', 'corretor|Corretor', 'situacao|Situação', 'valor|Valor pretendido|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select * from cap order by data desc limit 300) x), (select count(*) from cap)),
      relatorios.tabela('Comissões', relatorios.colunas('imovel|Imóvel', 'corretor|Corretor', 'situacao|Situação', 'venda|Venda|moeda', 'comissao|Comissão|moeda', 'corretor_valor|Do corretor|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select * from com order by venda desc limit 300) x), (select count(*) from com)))),
    relatorios.aba('imobiliario-corretores', 'Corretores', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Equipe', relatorios.colunas('nome|Corretor', 'creci|CRECI', 'situacao|Situação', 'vendas|Vendas no mês|numero', 'vgv|VGV no mês|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select nome, coalesce(creci, '') as creci, coalesce(status, '') as situacao, coalesce(vendas_mes, 0) as vendas, coalesce(vgv_mes, 0) as vgv
          from imobiliario_corretores where tenant_id = p_tenant order by vgv_mes desc nulls last limit 200) x))))
  )
$$;

-- ───────────────────────────── Automotivo ─────────────────────────────

create or replace function relatorios.automotivo(p_tenant uuid, p_ini date, p_fim date, p_filial text, p_principal boolean, p_hoje date)
returns jsonb language sql stable set search_path = public as $$
  with ve as materialized (
    select name::text as veiculo, coalesce(type_attributes->>'statusAtivo', 'Disponível') as situacao, coalesce(type_attributes->>'placa', '') as placa, coalesce(price, 0) as valor
    from products where tenant_id = p_tenant and deleted_at is null and type = 'Veículo' and relatorios.na_filial(filial_id, p_filial, p_principal)
  ),
  av as materialized (
    select data, coalesce(veiculo, '') as veiculo, coalesce(cliente, '') as cliente, coalesce(avaliador, '') as avaliador, coalesce(status, '') as situacao, coalesce(fipe, 0) as fipe, coalesce(oferta, 0) as oferta
    from automotivo_avaliacoes where tenant_id = p_tenant and data between p_ini and p_fim
  ),
  fi as materialized (
    select (created_at at time zone 'America/Sao_Paulo')::date as data, coalesce(cliente, '') as cliente, coalesce(banco_financeira, '') as banco, coalesce(status, '') as situacao,
      coalesce(valor_veiculo, 0) as valor, coalesce(valor_financiado, 0) as financiado
    from veiculo_financiamentos where tenant_id = p_tenant and (created_at at time zone 'America/Sao_Paulo')::date between p_ini and p_fim
  ),
  vi as materialized (
    select v.data, coalesce(v.hora, '') as hora, coalesce(p.name::text, v.imovel, '') as veiculo, coalesce(v.cliente, '') as cliente, coalesce(v.corretor, '') as vendedor, coalesce(v.status, '') as situacao
    from imobiliario_visitas v left join products p on p.id::text = v.veiculo_id::text and p.tenant_id = p_tenant
    where v.tenant_id = p_tenant and v.veiculo_id is not null and v.data between p_ini and p_fim
  )
  select jsonb_build_array(
    relatorios.aba('automotivo-resumo', 'Resumo',
      jsonb_build_array(
        relatorios.card('Veículos cadastrados', (select count(*) from ve), 'numero'),
        relatorios.card('Disponíveis', (select count(*) from ve where situacao = 'Disponível'), 'numero'),
        relatorios.card('Valor disponível', (select coalesce(sum(valor), 0) from ve where situacao = 'Disponível'), 'moeda'),
        relatorios.card('Avaliações', (select count(*) from av), 'numero', 'no período'),
        relatorios.card('Financiamentos', (select count(*) from fi), 'numero', 'no período'),
        relatorios.card('Valor financiado', (select coalesce(sum(financiado), 0) from fi), 'moeda', 'no período'),
        relatorios.card('Test-drives', (select count(*) from vi), 'numero', 'no período')),
      jsonb_build_array(relatorios.grafico('Veículos por situação', 'numero', relatorios.colunas('qtd|Veículos'),
        (select jsonb_agg(to_jsonb(x)) from (select situacao as rotulo, count(*) as qtd from ve group by 1 order by 2 desc) x)))),
    relatorios.aba('automotivo-veiculos', 'Estoque', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Veículos', relatorios.colunas('veiculo|Veículo', 'placa|Placa', 'situacao|Situação', 'valor|Valor|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select veiculo, placa, situacao, valor from ve order by valor desc limit 300) x), (select count(*) from ve)))),
    relatorios.aba('automotivo-negocios', 'Avaliações e financiamentos', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Avaliações de usados', relatorios.colunas('data|Data|data', 'veiculo|Veículo', 'cliente|Cliente', 'avaliador|Avaliador', 'situacao|Situação', 'fipe|FIPE|moeda', 'oferta|Oferta|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select * from av order by data desc limit 300) x), (select count(*) from av)),
      relatorios.tabela('Financiamentos', relatorios.colunas('data|Data|data', 'cliente|Cliente', 'banco|Banco', 'situacao|Situação', 'valor|Veículo|moeda', 'financiado|Financiado|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select * from fi order by data desc limit 300) x), (select count(*) from fi)))),
    relatorios.aba('automotivo-visitas', 'Test-drives', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Agendamentos', relatorios.colunas('data|Data|data', 'hora|Hora', 'veiculo|Veículo', 'cliente|Cliente', 'vendedor|Vendedor', 'situacao|Situação'),
        (select jsonb_agg(to_jsonb(x)) from (select * from vi order by data desc limit 300) x), (select count(*) from vi))))
  )
$$;

-- ───────────────────────────── Energia solar ─────────────────────────────

create or replace function relatorios.solar(p_tenant uuid, p_ini date, p_fim date, p_filial text, p_principal boolean, p_hoje date)
returns jsonb language sql stable set search_path = public as $$
  with an as materialized (
    select coalesce(cliente, '') as cliente, coalesce(distribuidora, '') as distribuidora, coalesce(status, '') as situacao, coalesce(potencia_estimada_kwp, 0) as kwp,
      coalesce(valor_proposta, 0) as valor, (created_at at time zone 'America/Sao_Paulo')::date as data
    from solar_analises where tenant_id = p_tenant
  ),
  ap as materialized (select * from an where data between p_ini and p_fim)
  select jsonb_build_array(
    relatorios.aba('solar-resumo', 'Resumo',
      jsonb_build_array(
        relatorios.card('Análises no período', (select count(*) from ap), 'numero'),
        relatorios.card('Concluídas', (select count(*) from ap where situacao = 'Concluído'), 'numero'),
        relatorios.card('Valor concluído', (select coalesce(sum(valor), 0) from ap where situacao = 'Concluído'), 'moeda'),
        relatorios.card('Em andamento', (select count(*) from an where situacao <> 'Concluído'), 'numero', 'hoje'),
        relatorios.card('Valor em andamento', (select coalesce(sum(valor), 0) from an where situacao <> 'Concluído'), 'moeda', 'hoje'),
        relatorios.card('Potência analisada (kWp)', (select coalesce(sum(kwp), 0) from ap), 'numero', 'no período')),
      jsonb_build_array(relatorios.grafico('Análises por estágio', 'numero', relatorios.colunas('qtd|Análises'),
        (select jsonb_agg(to_jsonb(x)) from (select situacao as rotulo, count(*) as qtd from an group by 1 order by 2 desc limit 12) x)))),
    relatorios.aba('solar-analises', 'Análises e propostas', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Análises do período', relatorios.colunas('data|Data|data', 'cliente|Cliente', 'distribuidora|Distribuidora', 'situacao|Estágio', 'kwp|kWp|numero', 'valor|Proposta|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select data, cliente, distribuidora, situacao, kwp, valor from ap order by data desc limit 300) x), (select count(*) from ap)),
      relatorios.tabela('Projetos', relatorios.colunas('data|Data|data', 'cliente|Cliente', 'cidade|Cidade', 'situacao|Situação', 'kwp|kWp|numero', 'valor|Contrato|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select data, cliente, cidade, status as situacao, coalesce(potencia_kwp, 0) as kwp, coalesce(valor_contrato, 0) as valor
          from solar_projetos where tenant_id = p_tenant order by data desc nulls last limit 300) x)))),
    relatorios.aba('solar-obras', 'Vistorias e instalações', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Vistorias do período', relatorios.colunas('data|Data|data', 'cliente|Cliente', 'responsavel|Responsável', 'situacao|Situação'),
        (select jsonb_agg(to_jsonb(x)) from (select data_agendada as data, cliente, responsavel, status as situacao from solar_vistorias where tenant_id = p_tenant and data_agendada between p_ini and p_fim order by data_agendada desc limit 300) x)),
      relatorios.tabela('Instalações', relatorios.colunas('cliente|Cliente', 'equipe|Equipe', 'situacao|Situação', 'progresso|Progresso|percentual', 'inicio|Início|data', 'previsao|Previsão|data'),
        (select jsonb_agg(to_jsonb(x)) from (select cliente, equipe, status as situacao, coalesce(progresso, 0) as progresso, inicio, previsao_conclusao as previsao from solar_instalacoes where tenant_id = p_tenant order by created_at desc limit 300) x)))),
    relatorios.aba('solar-posvenda', 'Homologação e pós-venda', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Homologações', relatorios.colunas('cliente|Cliente', 'concessionaria|Concessionária', 'protocolo|Protocolo', 'etapa|Etapa', 'situacao|Situação'),
        (select jsonb_agg(to_jsonb(x)) from (select cliente, concessionaria, protocolo, etapa, status as situacao from solar_homologacoes where tenant_id = p_tenant order by created_at desc limit 300) x)),
      relatorios.tabela('Manutenções do período', relatorios.colunas('data|Data|data', 'usina|Usina', 'servico|Serviço', 'situacao|Situação'),
        (select jsonb_agg(to_jsonb(x)) from (select data, usina, servico, status as situacao from solar_manutencoes where tenant_id = p_tenant and data between p_ini and p_fim order by data desc limit 300) x))))
  )
$$;

-- ───────────────────────────── Clínica ─────────────────────────────

create or replace function relatorios.clinicas(p_tenant uuid, p_ini date, p_fim date, p_filial text, p_principal boolean, p_hoje date)
returns jsonb language sql stable set search_path = public as $$
  with ag as materialized (
    select "date" as data, coalesce("time", '')::text as hora, coalesce(patient, '')::text as paciente, coalesce(dr_name, '')::text as profissional,
      coalesce(specialty, '')::text as especialidade, coalesce("type", '')::text as tipo, coalesce(status, '')::text as situacao
    from appointments where tenant_id = p_tenant and "date" between p_ini and p_fim and relatorios.na_filial(filial_id, p_filial, p_principal)
  ),
  pc as materialized (select (created_at at time zone 'America/Sao_Paulo')::date as data from pacientes where tenant_id = p_tenant)
  select jsonb_build_array(
    relatorios.aba('clinicas-resumo', 'Resumo',
      jsonb_build_array(
        relatorios.card('Atendimentos', (select count(*) from ag), 'numero', 'agendados no período'),
        relatorios.card('Pacientes atendidos', (select count(distinct paciente) from ag), 'numero'),
        relatorios.card('Pacientes cadastrados', (select count(*) from pc), 'numero', 'total'),
        relatorios.card('Pacientes novos', (select count(*) from pc where data between p_ini and p_fim), 'numero', 'no período'),
        relatorios.card('Prontuários', (select count(*) from prontuarios where tenant_id = p_tenant and data between p_ini and p_fim), 'numero', 'no período')),
      jsonb_build_array(
        relatorios.grafico('Atendimentos por situação', 'numero', relatorios.colunas('qtd|Atendimentos'),
          (select jsonb_agg(to_jsonb(x)) from (select situacao as rotulo, count(*) as qtd from ag group by 1 order by 2 desc) x)),
        relatorios.grafico('Atendimentos por especialidade', 'numero', relatorios.colunas('qtd|Atendimentos'),
          (select jsonb_agg(to_jsonb(x)) from (select especialidade as rotulo, count(*) as qtd from ag group by 1 order by 2 desc limit 10) x)))),
    relatorios.aba('clinicas-profissionais', 'Profissionais', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Atendimentos por profissional', relatorios.colunas('profissional|Profissional', 'qtd|Atendimentos|numero', 'pacientes|Pacientes|numero'),
        (select jsonb_agg(to_jsonb(x)) from (select profissional, count(*) as qtd, count(distinct paciente) as pacientes from ag group by 1 order by 2 desc limit 100) x)))),
    relatorios.aba('clinicas-agenda', 'Agenda', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Atendimentos', relatorios.colunas('data|Data|data', 'hora|Hora', 'paciente|Paciente', 'profissional|Profissional', 'especialidade|Especialidade', 'tipo|Tipo', 'situacao|Situação'),
        (select jsonb_agg(to_jsonb(x)) from (select * from ag order by data desc, hora limit 300) x), (select count(*) from ag)))),
    relatorios.aba('clinicas-exames', 'Exames', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Pedidos de exame do período', relatorios.colunas('paciente|Paciente', 'exame|Exame', 'laboratorio|Laboratório', 'data|Data', 'situacao|Situação'),
        (select jsonb_agg(to_jsonb(x)) from (select patient as paciente, exam as exame, lab as laboratorio, "date" as data, status as situacao from exames_pedidos
          where tenant_id = p_tenant and (created_at at time zone 'America/Sao_Paulo')::date between p_ini and p_fim order by created_at desc limit 300) x))))
  )
$$;

-- ───────────────────────────── Educação ─────────────────────────────

create or replace function relatorios.educacao(p_tenant uuid, p_ini date, p_fim date, p_filial text, p_principal boolean, p_hoje date)
returns jsonb language sql stable set search_path = public as $$
  with tu as materialized (select id, nome::text as turma, coalesce(curso, '')::text as curso, coalesce(status, '')::text as situacao, coalesce(professor, '')::text as professor, coalesce(vagas, 0) as vagas from turmas where tenant_id = p_tenant),
  al as materialized (select id, turma_id, nome::text as aluno, coalesce(status, '')::text as situacao, coalesce(progress, 0) as progresso, (created_at at time zone 'America/Sao_Paulo')::date as data from students where tenant_id = p_tenant),
  me as materialized (select student_id, vencimento, coalesce(valor, 0) as valor, coalesce(status, '') as situacao, data_pagamento, (data_pagamento is not null or coalesce(status, '') ~* '^pag') as paga from mensalidades where tenant_id = p_tenant),
  mp as materialized (select * from me where vencimento between p_ini and p_fim)
  select jsonb_build_array(
    relatorios.aba('educacao-resumo', 'Resumo',
      jsonb_build_array(
        relatorios.card('Turmas', (select count(*) from tu), 'numero'),
        relatorios.card('Alunos', (select count(*) from al), 'numero', 'total'),
        relatorios.card('Alunos novos', (select count(*) from al where data between p_ini and p_fim), 'numero', 'no período'),
        relatorios.card('Mensalidades previstas', (select coalesce(sum(valor), 0) from mp), 'moeda', 'vencimento no período'),
        relatorios.card('Recebido', (select coalesce(sum(valor), 0) from mp where paga), 'moeda'),
        relatorios.card('Vencidas', (select coalesce(sum(valor), 0) from me where not paga and vencimento < p_hoje and situacao !~* '^cancel'), 'moeda', 'até hoje',
          exists (select 1 from me where not paga and vencimento < p_hoje and situacao !~* '^cancel')),
        relatorios.card('Certificados', (select count(*) from certificates where tenant_id = p_tenant and (created_at at time zone 'America/Sao_Paulo')::date between p_ini and p_fim), 'numero', 'no período')),
      jsonb_build_array(relatorios.grafico('Alunos por situação', 'numero', relatorios.colunas('qtd|Alunos'),
        (select jsonb_agg(to_jsonb(x)) from (select situacao as rotulo, count(*) as qtd from al group by 1 order by 2 desc) x)))),
    relatorios.aba('educacao-turmas', 'Turmas', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Turmas', relatorios.colunas('turma|Turma', 'curso|Curso', 'professor|Professor', 'situacao|Situação', 'alunos|Alunos|numero', 'vagas|Vagas|numero'),
        (select jsonb_agg(to_jsonb(x)) from (select turma, curso, professor, situacao, (select count(*) from al where al.turma_id = tu.id) as alunos, vagas from tu order by turma limit 200) x)))),
    relatorios.aba('educacao-alunos', 'Alunos', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Alunos', relatorios.colunas('aluno|Aluno', 'turma|Turma', 'situacao|Situação', 'progresso|Progresso|percentual'),
        (select jsonb_agg(to_jsonb(x)) from (select aluno, coalesce(tu.turma, '') as turma, al.situacao, progresso from al left join tu on tu.id = al.turma_id order by aluno limit 300) x), (select count(*) from al)))),
    relatorios.aba('educacao-mensalidades', 'Mensalidades', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Vencidas e não pagas', relatorios.colunas('vencimento|Vencimento|data', 'aluno|Aluno', 'situacao|Situação', 'valor|Valor|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select vencimento, coalesce(al.aluno, '') as aluno, me.situacao, valor from me left join al on al.id = me.student_id where not paga and vencimento < p_hoje and me.situacao !~* '^cancel' order by vencimento limit 300) x)),
      relatorios.tabela('Do período', relatorios.colunas('vencimento|Vencimento|data', 'aluno|Aluno', 'situacao|Situação', 'pagamento|Pago em|data', 'valor|Valor|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select vencimento, coalesce(al.aluno, '') as aluno, mp.situacao, data_pagamento as pagamento, valor from mp left join al on al.id = mp.student_id order by vencimento limit 300) x), (select count(*) from mp))))
  )
$$;

-- ───────────────────────────── Dev ─────────────────────────────

create or replace function relatorios.dev(p_tenant uuid, p_ini date, p_fim date, p_filial text, p_principal boolean, p_hoje date)
returns jsonb language sql stable set search_path = public as $$
  with pj as materialized (select id, name as projeto, coalesce(status, '') as situacao, coalesce(progress, 0) as progresso, coalesce(valor_estimado, 0) as valor from dev_projects where tenant_id = p_tenant),
  tk as materialized (
    select title as tarefa, coalesce(type, '') as tipo, coalesce(priority, '') as prioridade, coalesce(points, 0) as pontos, coalesce(assignee, '') as responsavel, coalesce(column_id, '') as coluna,
      coalesce(project_id, project) as projeto_id, (created_at at time zone 'America/Sao_Paulo')::date as criada, (coalesce(updated_at, created_at) at time zone 'America/Sao_Paulo')::date as atualizada
    from dev_sprint_tasks where tenant_id = p_tenant
  ),
  iss as materialized (select issue_number as numero, title as titulo, coalesce(severity, '') as severidade, coalesce(status, '') as situacao, coalesce(assignee, '') as responsavel, (created_at at time zone 'America/Sao_Paulo')::date as data from dev_issues where tenant_id = p_tenant),
  col as (select * from (values ('backlog', 'Backlog'), ('todo', 'A fazer'), ('inprogress', 'Em andamento'), ('review', 'Revisão'), ('done', 'Concluído')) c(id, nome))
  select jsonb_build_array(
    relatorios.aba('dev-resumo', 'Resumo',
      jsonb_build_array(
        relatorios.card('Projetos', (select count(*) from pj), 'numero'),
        relatorios.card('Tarefas em aberto', (select count(*) from tk where coluna <> 'done'), 'numero', 'hoje'),
        relatorios.card('Em andamento', (select count(*) from tk where coluna in ('inprogress', 'review')), 'numero', 'hoje'),
        relatorios.card('Concluídas', (select count(*) from tk where coluna = 'done' and atualizada between p_ini and p_fim), 'numero', 'atualizadas no período'),
        relatorios.card('Pontos entregues', (select coalesce(sum(pontos), 0) from tk where coluna = 'done' and atualizada between p_ini and p_fim), 'numero', 'no período'),
        relatorios.card('Erros em aberto', (select count(*) from tk where coluna <> 'done' and tipo = 'bug') + (select count(*) from iss where situacao <> 'fechado'), 'numero', 'tarefas e pendências',
          exists (select 1 from iss where situacao <> 'fechado') or exists (select 1 from tk where coluna <> 'done' and tipo = 'bug'))),
      jsonb_build_array(relatorios.grafico('Tarefas por etapa', 'numero', relatorios.colunas('qtd|Tarefas'),
        (select jsonb_agg(to_jsonb(x)) from (select coalesce(col.nome, tk.coluna) as rotulo, count(*) as qtd from tk left join col on col.id = tk.coluna group by 1 order by 2 desc) x)))),
    relatorios.aba('dev-projetos', 'Projetos', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Projetos', relatorios.colunas('projeto|Projeto', 'situacao|Situação', 'progresso|Progresso|percentual', 'abertas|Tarefas abertas|numero', 'feitas|Concluídas|numero', 'valor|Valor estimado|moeda'),
        (select jsonb_agg(to_jsonb(x)) from (select projeto, situacao, progresso, (select count(*) from tk where tk.projeto_id = pj.id and coluna <> 'done') as abertas,
          (select count(*) from tk where tk.projeto_id = pj.id and coluna = 'done') as feitas, valor from pj order by projeto limit 200) x)))),
    relatorios.aba('dev-tarefas', 'Tarefas', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Tarefas em aberto', relatorios.colunas('tarefa|Tarefa', 'tipo|Tipo', 'prioridade|Prioridade', 'responsavel|Responsável', 'etapa|Etapa', 'pontos|Pontos|numero', 'criada|Criada em|data'),
        (select jsonb_agg(to_jsonb(x)) from (select tarefa, tipo, prioridade, responsavel, coalesce(col.nome, tk.coluna) as etapa, pontos, criada from tk left join col on col.id = tk.coluna where coluna <> 'done' order by criada desc limit 300) x), (select count(*) from tk where coluna <> 'done')))),
    relatorios.aba('dev-pendencias', 'Pendências e erros', '[]', '[]', jsonb_build_array(
      relatorios.tabela('Em aberto', relatorios.colunas('numero|Nº', 'titulo|Título', 'severidade|Severidade', 'situacao|Situação', 'responsavel|Responsável', 'data|Aberta em|data'),
        (select jsonb_agg(to_jsonb(x)) from (select * from iss where situacao <> 'fechado' order by data desc limit 300) x), (select count(*) from iss where situacao <> 'fechado'))))
  )
$$;

-- ───────────────────────────── entrada ─────────────────────────────

-- p_area: 'geral' ou uma lista separada por vírgula: vendas, financeiro, marketing, operacoes, varejo, imobiliario,
-- automotivo, solar, clinicas, educacao, dev. Sem datas: do dia 1º do mês até hoje.
create or replace function public.spy_relatorio(p_tenant uuid, p_area text default 'geral', p_inicio date default null, p_fim date default null, p_filial text default null)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare
  nomes constant jsonb := '{"vendas":"Vendas","financeiro":"Financeiro","marketing":"Marketing","operacoes":"Operação","varejo":"Varejo","imobiliario":"Imobiliário","automotivo":"Automotivo","solar":"Energia Solar","clinicas":"Clínica","educacao":"Educação","dev":"Dev"}';
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_fim date;
  v_ini date;
  v_filial text := nullif(trim(coalesce(p_filial, '')), '');
  v_filial_nome text := '';
  v_principal boolean := false;
  v_empresa text;
  v_modulos jsonb;
  v_areas text[];
  v_area text;
  v_abas jsonb;
  v_lista jsonb := '[]'::jsonb;
  v_avisos jsonb := '[]'::jsonb;
begin
  if p_tenant is null then raise exception 'Informe a empresa.' using errcode = '22023'; end if;
  if coalesce(auth.role(), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin')
     and not exists (select 1 from public.tenant_ids_acessiveis() x(id) where x.id = p_tenant) then
    raise exception 'Sem acesso a esta empresa.' using errcode = '42501';
  end if;

  v_fim := coalesce(p_fim, v_hoje);
  v_ini := coalesce(p_inicio, date_trunc('month', v_fim)::date);
  if v_ini > v_fim then raise exception 'A data inicial é depois da final.' using errcode = '22023'; end if;
  -- Períodos muito longos passam do tempo limite do banco (lojas com centenas de milhares de vendas).
  if v_fim - v_ini > 731 then
    v_ini := v_fim - 731;
    v_avisos := v_avisos || to_jsonb('O relatório cobre no máximo 2 anos; o início foi ajustado.'::text);
  end if;

  select t.name, coalesce(t.modules, '{}'::jsonb) into v_empresa, v_modulos from tenants t where t.id = p_tenant;
  if v_empresa is null then raise exception 'Empresa não encontrada.' using errcode = '22023'; end if;

  if v_filial is not null then
    select f.nome, f.status = 'Principal' into v_filial_nome, v_principal from empresa_filiais f where f.id = v_filial and f.tenant_id = p_tenant;
    if v_filial_nome is null then raise exception 'Filial ou cliente não encontrado.' using errcode = '22023'; end if;
  end if;

  if coalesce(nullif(trim(lower(p_area)), ''), 'geral') = 'geral' then
    v_areas := array_remove(array[
      case when v_modulos->>'crm' = 'true' then 'vendas' end,
      case when v_modulos->>'financeiro' = 'true' then 'financeiro' end,
      case when v_modulos->>'marketing' = 'true' then 'marketing' end,
      'operacoes',
      case when v_modulos->>'varejo' = 'true' then 'varejo' end,
      case when v_modulos->>'imobiliaria' = 'true' then 'imobiliario' end,
      case when v_modulos->>'automotivo' = 'true' or v_modulos->>'concessionaria' = 'true' then 'automotivo' end,
      case when v_modulos->>'solar' = 'true' then 'solar' end,
      case when v_modulos->>'clinica' = 'true' then 'clinicas' end,
      case when v_modulos->>'educacao' = 'true' then 'educacao' end,
      case when v_modulos->>'dev' = 'true' then 'dev' end], null);
  else
    select array_agg(a order by o) into v_areas from (
      select trim(x) as a, min(o) as o from unnest(string_to_array(lower(p_area), ',')) with ordinality u(x, o) where trim(x) <> '' group by 1) s;
  end if;

  foreach v_area in array coalesce(v_areas, '{}'::text[]) loop
    if not nomes ? v_area then
      raise exception 'Área desconhecida: %. Use: geral, vendas, financeiro, marketing, operacoes, varejo, imobiliario, automotivo, solar, clinicas, educacao ou dev.', v_area using errcode = '22023';
    end if;
    begin
      -- v_area só chega aqui se for uma das chaves fixas acima
      execute format('select relatorios.%I($1, $2, $3, $4, $5, $6)', v_area) into v_abas using p_tenant, v_ini, v_fim, v_filial, v_principal, v_hoje;
      v_lista := v_lista || jsonb_build_object('id', v_area, 'titulo', nomes->>v_area, 'abas', v_abas);
    exception when others then
      raise warning 'spy_relatorio(%): %', v_area, sqlerrm;
      v_avisos := v_avisos || to_jsonb('Não foi possível montar a área ' || (nomes->>v_area) || '.');
    end;
  end loop;

  if coalesce(auth.role(), '') = 'authenticated' and public.usuario_restrito_aos_proprios_dados() then
    v_avisos := v_avisos || to_jsonb('Seu cargo mostra apenas os seus próprios negócios, propostas, tarefas e contratos.'::text);
  end if;

  return jsonb_build_object('empresa', v_empresa, 'filial', coalesce(v_filial_nome, ''), 'periodo', jsonb_build_object('inicio', v_ini, 'fim', v_fim),
    'gerado_em', now(), 'areas', v_lista, 'avisos', v_avisos);
end $$;

create or replace function relatorios.valor_texto(p_valor numeric, p_formato text) returns text language sql immutable as $$
  select case p_formato
    when 'moeda' then case when p_valor < 0 then '-' else '' end || 'R$ ' || translate(to_char(abs(p_valor), 'FM999,999,999,990.00'), ',.', '.,')
    when 'percentual' then translate(trim(trailing '.' from to_char(p_valor, 'FM999,999,990.9')), ',.', '.,') || '%'
    else translate(trim(trailing '.' from to_char(p_valor, 'FM999,999,999,990.99')), ',.', '.,') end
$$;

-- Texto pronto para a Aurora repassar numa conversa, sem precisar processar os dados no modelo de IA.
-- p_detalhado = false: só o resumo de cada área. true: os indicadores de todas as abas.
create or replace function public.spy_relatorio_texto(p_tenant uuid, p_area text default 'geral', p_inicio date default null, p_fim date default null, p_filial text default null, p_detalhado boolean default false)
returns text language plpgsql stable security invoker set search_path = public as $$
declare
  r jsonb := public.spy_relatorio(p_tenant, p_area, p_inicio, p_fim, p_filial);
  a jsonb; ab jsonb; c jsonb; txt text; i int;
begin
  txt := '*Relatório — ' || (r->>'empresa') || case when r->>'filial' <> '' then ' (' || (r->>'filial') || ')' else '' end || '*' || E'\n'
    || 'Período: ' || to_char((r->'periodo'->>'inicio')::date, 'DD/MM/YYYY') || ' a ' || to_char((r->'periodo'->>'fim')::date, 'DD/MM/YYYY');
  for a in select value from jsonb_array_elements(r->'areas') loop
    txt := txt || E'\n\n*' || (a->>'titulo') || '*';
    i := 0;
    for ab in select value from jsonb_array_elements(a->'abas') loop
      i := i + 1;
      exit when i > 1 and not p_detalhado;
      continue when jsonb_array_length(ab->'cards') = 0;
      if i > 1 then txt := txt || E'\n_' || (ab->>'titulo') || '_'; end if;
      for c in select value from jsonb_array_elements(ab->'cards') loop
        txt := txt || E'\n• ' || (c->>'titulo') || ': ' || relatorios.valor_texto((c->>'valor')::numeric, c->>'formato')
          || case when c->>'detalhe' <> '' then ' (' || (c->>'detalhe') || ')' else '' end;
      end loop;
    end loop;
  end loop;
  for a in select value from jsonb_array_elements(r->'avisos') loop txt := txt || E'\n\n' || (a #>> '{}'); end loop;
  return txt;
end $$;

-- ───────────────────────────── permissões ─────────────────────────────

revoke all on all functions in schema relatorios from public, anon;
grant execute on all functions in schema relatorios to authenticated, service_role;
revoke all on function public.spy_relatorio(uuid, text, date, date, text) from public, anon;
revoke all on function public.spy_relatorio_texto(uuid, text, date, date, text, boolean) from public, anon;
grant execute on function public.spy_relatorio(uuid, text, date, date, text) to authenticated, service_role;
grant execute on function public.spy_relatorio_texto(uuid, text, date, date, text, boolean) to authenticated, service_role;
comment on function public.spy_relatorio(uuid, text, date, date, text) is 'Relatório do SPY por área (cards, gráficos e tabelas prontos). Usado pela tela e pela Aurora.';
comment on function public.spy_relatorio_texto(uuid, text, date, date, text, boolean) is 'Relatório do SPY em texto pronto para mensagem (Aurora).';
