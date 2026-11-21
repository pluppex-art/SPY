-- ============================================================================================================
-- M1 · Plano de contas em 2 níveis ligado ao DRE        PROPOSTA — NÃO APLICAR SEM AUTORIZAÇÃO EXPRESSA
-- Evolui public.finance_categories (não cria tabela nova). Não altera nenhum lançamento nem categoria existente.
-- Pré-requisito: nenhum. Aditiva: linhas atuais ficam com as colunas novas vazias (NULL / false / true).
-- ============================================================================================================
begin;

-- 1) Colunas novas (todas opcionais para as linhas antigas) ----------------------------------------------------
alter table public.finance_categories
  add column if not exists parent_id text references public.finance_categories(id),
  add column if not exists codigo    text,
  add column if not exists linha_dre text,
  add column if not exists nivel     smallint,
  add column if not exists padrao    boolean not null default false,   -- true = veio do plano padrão do SPY
  add column if not exists ativa     boolean not null default true;    -- "apagar" conta usada vira inativar

alter table public.finance_categories
  add constraint finance_categories_linha_dre_check check (linha_dre is null or linha_dre in (
    'RECEITA_BRUTA','DEDUCOES','CMV','DESP_COMERCIAL','DESP_ADMINISTRATIVA','DESP_PESSOAL',
    'DEPRECIACAO','RESULTADO_FINANCEIRO','IR_CSLL','FORA_DRE'));
alter table public.finance_categories
  add constraint finance_categories_nivel_check check (nivel is null or nivel in (1, 2));

-- Código único por empresa (só vale para contas que têm código; as antigas continuam livres)
create unique index if not exists finance_categories_tenant_codigo_uq
  on public.finance_categories (tenant_id, codigo) where codigo is not null;
create index if not exists finance_categories_parent_idx
  on public.finance_categories (parent_id) where parent_id is not null;

-- 2) Regras: a conta (nível 2) herda a linha do DRE do grupo (nível 1); a empresa nunca escolhe a linha -----------
create or replace function public.finance_categories_regras()
returns trigger language plpgsql set search_path to 'public' as $$
declare
  v_pai record;
begin
  if tg_op = 'DELETE' then
    if old.padrao then
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

drop trigger if exists trg_finance_categories_regras on public.finance_categories;
create trigger trg_finance_categories_regras
  before insert or update or delete on public.finance_categories
  for each row execute function public.finance_categories_regras();

-- 3) Plano padrão: aplicado só por chamada explícita, empresa por empresa. Idempotente. -----------------------
--    (as empresas atuais NÃO recebem nada sozinhas; os lançamentos antigos não são tocados)
create or replace function public.finance_aplicar_plano_padrao(p_tenant uuid)
returns integer language plpgsql set search_path to 'public' as $$
declare
  g record; c record;
  v_n integer := 0;
  v_id text;
  v_pref text := 'pc_' || replace(p_tenant::text, '-', '') || '_';
  v_rows integer;
begin
  -- grupos (nível 1): codigo, nome, tipo, linha do DRE
  for g in select * from (values
    ('1',  'Receita bruta',                 'Receita', 'RECEITA_BRUTA'),
    ('2',  'Deduções da receita',           'Despesa', 'DEDUCOES'),
    ('3',  'Custo das vendas (CMV/CSP)',    'Despesa', 'CMV'),
    ('4',  'Despesas comerciais',           'Despesa', 'DESP_COMERCIAL'),
    ('5',  'Despesas administrativas',      'Despesa', 'DESP_ADMINISTRATIVA'),
    ('6',  'Despesas com pessoal',          'Despesa', 'DESP_PESSOAL'),
    ('7',  'Depreciação e amortização',     'Despesa', 'DEPRECIACAO'),
    ('8',  'Resultado financeiro',          'Despesa', 'RESULTADO_FINANCEIRO'),
    ('9',  'IRPJ e CSLL',                   'Despesa', 'IR_CSLL'),
    ('10', 'Fora do resultado (não entra no DRE)', 'Despesa', 'FORA_DRE')
  ) as t(codigo, nome, tipo, linha) loop
    insert into public.finance_categories (id, tenant_id, nome, tipo, codigo, linha_dre, nivel, padrao)
    values (v_pref || g.codigo, p_tenant, g.nome, g.tipo, g.codigo, g.linha, 1, true)
    on conflict (tenant_id, codigo) where codigo is not null do nothing;
    get diagnostics v_rows = row_count; v_n := v_n + v_rows;
  end loop;

  -- contas (nível 2): codigo, grupo, nome, tipo
  for c in select * from (values
    ('1.01','1','Venda de produtos','Receita'),   ('1.02','1','Venda de serviços','Receita'),
    ('1.03','1','Mensalidades e contratos recorrentes','Receita'), ('1.04','1','Outras receitas operacionais','Receita'),
    ('2.01','2','Impostos sobre vendas (DAS, ICMS, ISS, PIS/COFINS)','Despesa'),
    ('2.02','2','Devoluções e estornos de vendas','Despesa'), ('2.03','2','Descontos concedidos','Despesa'),
    ('3.01','3','Custo das mercadorias vendidas','Despesa'), ('3.02','3','Custo dos serviços prestados','Despesa'),
    ('3.03','3','Fretes sobre compras','Despesa'),        ('3.04','3','Embalagens e insumos diretos','Despesa'),
    ('4.01','4','Marketing e anúncios','Despesa'),        ('4.02','4','Comissões de vendedores','Despesa'),
    ('4.03','4','Frete e entrega de vendas','Despesa'),   ('4.04','4','Taxas de cartão e meios de pagamento','Despesa'),
    ('4.05','4','Brindes e eventos','Despesa'),
    ('5.01','5','Aluguel e condomínio','Despesa'),        ('5.02','5','Energia, água e internet','Despesa'),
    ('5.03','5','Software e assinaturas','Despesa'),      ('5.04','5','Contabilidade e jurídico','Despesa'),
    ('5.05','5','Material de escritório','Despesa'),      ('5.06','5','Manutenção e conservação','Despesa'),
    ('5.07','5','Seguros','Despesa'),                     ('5.08','5','Veículos e combustível','Despesa'),
    ('5.09','5','Outras despesas administrativas','Despesa'),
    ('6.01','6','Salários','Despesa'),                    ('6.02','6','Encargos (INSS, FGTS)','Despesa'),
    ('6.03','6','Benefícios','Despesa'),                  ('6.04','6','Pró-labore','Despesa'),
    ('6.05','6','Férias e 13º salário','Despesa'),        ('6.06','6','Terceirizados e freelancers','Despesa'),
    ('6.07','6','Treinamento','Despesa'),
    ('7.01','7','Depreciação','Despesa'),                 ('7.02','7','Amortização','Despesa'),
    ('8.01','8','Receitas financeiras (rendimentos, juros recebidos)','Receita'),
    ('8.02','8','Juros e multas pagos','Despesa'),        ('8.03','8','Tarifas bancárias','Despesa'),
    ('8.04','8','IOF','Despesa'),
    ('9.01','9','IRPJ','Despesa'),                        ('9.02','9','CSLL','Despesa'),
    ('10.01','10','Empréstimos recebidos','Receita'),     ('10.02','10','Pagamento de empréstimos (principal)','Despesa'),
    ('10.03','10','Aportes de sócios','Receita'),         ('10.04','10','Retiradas de sócios / distribuição de lucros','Despesa'),
    ('10.05','10','Investimentos e compra de imobilizado','Despesa'),
    ('10.06','10','Compra de mercadoria para estoque','Despesa')
  ) as t(codigo, grupo, nome, tipo) loop
    insert into public.finance_categories (id, tenant_id, nome, tipo, codigo, parent_id, nivel, padrao)
    values (v_pref || replace(c.codigo, '.', '_'), p_tenant, c.nome, c.tipo, c.codigo, v_pref || c.grupo, 2, true)
    on conflict (tenant_id, codigo) where codigo is not null do nothing;
    get diagnostics v_rows = row_count; v_n := v_n + v_rows;
  end loop;

  return v_n;   -- quantas linhas foram criadas (0 se o plano já estava aplicado)
end $$;

revoke all on function public.finance_aplicar_plano_padrao(uuid) from public, anon;
grant execute on function public.finance_aplicar_plano_padrao(uuid) to authenticated, service_role;
-- RLS: a função é "security invoker"; quem chama só consegue inserir na própria empresa (policy tenant_isolation).

commit;

-- ============================================================================================================
-- Verificação depois de aplicar (somente SELECT):
--   select count(*) filter (where padrao) from public.finance_categories;                       -- 0 até alguém aplicar o plano
--   select public.finance_aplicar_plano_padrao('<tenant>'); select public.finance_aplicar_plano_padrao('<tenant>');  -- 2ª chamada = 0
-- ============================================================================================================
-- DESFAZER (só funciona se nenhum lançamento usar as contas do plano e a empresa não tiver criado contas próprias nos grupos; havendo uso, inative em vez de apagar):
--   begin;
--   drop trigger if exists trg_finance_categories_regras on public.finance_categories;
--   delete from public.finance_categories where padrao;               -- remove só as contas criadas pelo plano padrão
--   drop function if exists public.finance_aplicar_plano_padrao(uuid);
--   drop function if exists public.finance_categories_regras();
--   drop index if exists public.finance_categories_tenant_codigo_uq, public.finance_categories_parent_idx;
--   alter table public.finance_categories drop constraint if exists finance_categories_linha_dre_check,
--                                         drop constraint if exists finance_categories_nivel_check;
--   alter table public.finance_categories drop column if exists ativa, drop column if exists padrao, drop column if exists nivel,
--                                         drop column if exists linha_dre, drop column if exists codigo, drop column if exists parent_id;
--   commit;
