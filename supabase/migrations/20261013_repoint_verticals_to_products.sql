-- Fase 3: imóveis e veículos passam a viver em public.products (type 'Imóvel' / 'Veículo', atributos em
-- type_attributes). Religa os vínculos e as funções que liam imobiliario_imoveis / imobiliario_veiculos.
-- Os ids foram preservados na cópia (20261013_consolidate_vertical_products.sql), então nenhum vínculo se perde.

alter table public.imobiliario_leads drop constraint if exists imobiliario_leads_imovel_id_fkey;
alter table public.imobiliario_leads add constraint imobiliario_leads_imovel_id_fkey
  foreign key (imovel_id) references public.products(id) on delete set null;
alter table public.imobiliario_leads drop constraint if exists imobiliario_leads_veiculo_id_fkey;
alter table public.imobiliario_leads add constraint imobiliario_leads_veiculo_id_fkey
  foreign key (veiculo_id) references public.products(id) on delete set null;
alter table public.imobiliario_visitas drop constraint if exists imobiliario_visitas_imovel_id_fkey;
alter table public.imobiliario_visitas add constraint imobiliario_visitas_imovel_id_fkey
  foreign key (imovel_id) references public.products(id) on delete set null;
alter table public.imobiliario_visitas drop constraint if exists imobiliario_visitas_veiculo_id_fkey;
alter table public.imobiliario_visitas add constraint imobiliario_visitas_veiculo_id_fkey
  foreign key (veiculo_id) references public.products(id) on delete set null;
alter table public.veiculo_financiamentos drop constraint if exists veiculo_financiamentos_veiculo_id_fkey;
alter table public.veiculo_financiamentos add constraint veiculo_financiamentos_veiculo_id_fkey
  foreign key (veiculo_id) references public.products(id) on delete cascade;

create or replace function public.get_public_imovel(p_id uuid) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_imovel record;
  v_corretor record;
begin
  if p_id is null then return null; end if;

  update public.products
  set type_attributes = jsonb_set(coalesce(type_attributes, '{}'::jsonb), '{visitas}',
        to_jsonb(coalesce((type_attributes->>'visitas')::int, 0) + 1))
  where id = p_id and type = 'Imóvel' and deleted_at is null
  returning id, tenant_id, name as titulo, description as descricao, price as valor, type_attributes as a
  into v_imovel;

  if v_imovel.id is null then return null; end if;

  select nome, telefone, email, creci, slug
  into v_corretor
  from public.imobiliario_corretores
  where tenant_id = v_imovel.tenant_id and nome = v_imovel.a->>'corretor' and status = 'Ativo'
  limit 1;

  return jsonb_build_object(
    'id', v_imovel.id,
    'titulo', v_imovel.titulo,
    'tipo', v_imovel.a->>'tipoImovel',
    'operacao', v_imovel.a->>'operacao',
    'status', v_imovel.a->>'statusAtivo',
    'valor', v_imovel.valor,
    'bairro', v_imovel.a->>'bairro',
    'cidade', v_imovel.a->>'cidade',
    'area', (v_imovel.a->>'areaM2')::numeric,
    'quartos', (v_imovel.a->>'quartos')::int,
    'banheiros', (v_imovel.a->>'banheiros')::int,
    'vagas', (v_imovel.a->>'vagas')::int,
    'descricao', v_imovel.descricao,
    'corretorNome', v_imovel.a->>'corretor',
    'corretorTelefone', v_corretor.telefone,
    'corretorEmail', v_corretor.email,
    'corretorCreci', v_corretor.creci,
    'corretorSlug', v_corretor.slug
  );
end;
$$;

create or replace function public.get_public_corretor_portfolio(p_slug text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare
  v_corretor record;
  v_imoveis jsonb;
begin
  if p_slug is null or length(p_slug) = 0 then return null; end if;

  select id, tenant_id, nome, creci, telefone, email, especialidade, bio, avaliacao, total_vendas
  into v_corretor
  from public.imobiliario_corretores
  where slug = p_slug and status = 'Ativo';

  if v_corretor.id is null then return null; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', p.id,
           'titulo', p.name,
           'tipo', p.type_attributes->>'tipoImovel',
           'operacao', p.type_attributes->>'operacao',
           'status', p.type_attributes->>'statusAtivo',
           'valor', p.price,
           'bairro', p.type_attributes->>'bairro',
           'cidade', p.type_attributes->>'cidade',
           'area', (p.type_attributes->>'areaM2')::numeric,
           'quartos', (p.type_attributes->>'quartos')::int,
           'banheiros', (p.type_attributes->>'banheiros')::int,
           'vagas', (p.type_attributes->>'vagas')::int,
           'descricao', p.description
         ) order by p.created_at desc), '[]'::jsonb)
  into v_imoveis
  from public.products p
  where p.tenant_id = v_corretor.tenant_id and p.type = 'Imóvel' and p.deleted_at is null
    and p.type_attributes->>'corretor' = v_corretor.nome;

  return jsonb_build_object(
    'nome', v_corretor.nome, 'creci', v_corretor.creci, 'telefone', v_corretor.telefone,
    'email', v_corretor.email, 'especialidade', v_corretor.especialidade, 'bio', v_corretor.bio,
    'avaliacao', v_corretor.avaliacao, 'totalVendas', v_corretor.total_vendas, 'imoveis', v_imoveis
  );
end;
$$;

create or replace function public.increment_veiculo_test_drive() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if NEW.veiculo_id is not null then
    update public.products
       set type_attributes = jsonb_set(coalesce(type_attributes, '{}'::jsonb), '{visitas}',
             to_jsonb(coalesce((type_attributes->>'visitas')::int, 0) + 1))
     where id = NEW.veiculo_id and tenant_id = NEW.tenant_id and type = 'Veículo';
  end if;
  return NEW;
end;
$$;

create or replace function public.registrar_repasse_consignacao(p_veiculo_id uuid) returns finance_entries
language plpgsql set search_path to 'public' as $$
declare
  v_veiculo record;
  v_attr jsonb;
  v_valor_repasse numeric;
  v_entry public.finance_entries;
begin
  select * into v_veiculo from public.products where id = p_veiculo_id and type = 'Veículo' and deleted_at is null;
  if v_veiculo.id is null then
    raise exception 'Veículo % não encontrado', p_veiculo_id;
  end if;
  v_attr := coalesce(v_veiculo.type_attributes, '{}'::jsonb);
  if not coalesce((v_attr->>'isConsignado')::boolean, false) then
    raise exception 'Veículo % não é consignado', p_veiculo_id;
  end if;
  if coalesce(v_attr->>'statusAtivo', '') <> 'Vendido' then
    raise exception 'Só é possível repassar após o veículo ser marcado como Vendido';
  end if;
  if coalesce((v_attr->>'repasseRealizado')::boolean, false) then
    raise exception 'Repasse deste veículo já foi registrado';
  end if;

  v_valor_repasse := v_veiculo.price * (1 - coalesce((v_attr->>'comissaoPercentual')::numeric, 0) / 100.0);

  insert into public.finance_entries (description, category, status, value, type, date, tenant_id)
  values (
    format('Repasse consignação: %s %s — %s', v_attr->>'marca', v_attr->>'modelo', coalesce(v_attr->>'consignanteNome', 'consignante')),
    'Consignação de Veículos', 'Pendente', v_valor_repasse, 'Pagar', to_char(current_date, 'YYYY-MM-DD'), v_veiculo.tenant_id
  )
  returning * into v_entry;

  update public.products
     set type_attributes = jsonb_set(coalesce(type_attributes, '{}'::jsonb), '{repasseRealizado}', 'true'::jsonb)
   where id = p_veiculo_id;

  return v_entry;
end;
$$;
