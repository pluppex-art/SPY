-- P3 — Liga as comparações e equivalências de exames a public.products (PROPOSTO, NÃO APLICADO). Rode DEPOIS do P2.
-- Hoje saude_comparacao_itens.exame_base_id e saude_equivalencias.exame_base_id apontam para saude_exames_base.id.
-- Este script troca esses ids pelos ids dos mesmos exames em products (P2 guardou o id antigo em externo_id) e refaz as chaves.
-- Numa transação: se sobrar algum id sem correspondente, a chave nova falha e NADA muda. Pode rodar de novo sem efeito.
-- ATENÇÃO: só publique o código novo das telas de exames DEPOIS deste script (o código novo usa os ids de products).
begin;

-- 0) Trava de segurança: o P2 precisa ter rodado (todo exame antigo tem cópia em products)
do $$
begin
  if exists (select 1 from public.saude_exames_base e where not exists (
        select 1 from public.products p where p.externo_sistema = 'saude_exames_base' and p.externo_id = e.id::text and p.tenant_id = e.tenant_id)) then
    raise exception 'P2 incompleto: há exame em saude_exames_base sem cópia em products. Rode o P2 antes.';
  end if;
end $$;

-- 1) Solta as chaves antigas (qualquer chave que aponte para saude_exames_base)
do $$
declare c record;
begin
  for c in select conrelid::regclass::text as t, conname from pg_constraint
           where contype = 'f' and confrelid = 'public.saude_exames_base'::regclass loop
    execute format('alter table %s drop constraint %I', c.t, c.conname);
  end loop;
end $$;

-- 2) Troca o id antigo pelo id em products
update public.saude_comparacao_itens i set exame_base_id = p.id
  from public.products p
 where p.externo_sistema = 'saude_exames_base' and p.externo_id = i.exame_base_id::text and p.tenant_id = i.tenant_id;

update public.saude_equivalencias q set exame_base_id = p.id
  from public.products p
 where p.externo_sistema = 'saude_exames_base' and p.externo_id = q.exame_base_id::text and p.tenant_id = q.tenant_id;

-- candidatos (jsonb): [{ "exame_base_id": "...", "score": .., "reason": ".." }]
update public.saude_comparacao_itens i
   set candidatos = (
     select coalesce(jsonb_agg(
              case when p.id is not null then jsonb_set(c.value, '{exame_base_id}', to_jsonb(p.id::text)) else c.value end
              order by c.ord), '[]'::jsonb)
       from jsonb_array_elements(i.candidatos) with ordinality as c(value, ord)
       left join public.products p
              on p.externo_sistema = 'saude_exames_base' and p.externo_id = c.value->>'exame_base_id' and p.tenant_id = i.tenant_id)
 where jsonb_typeof(i.candidatos) = 'array' and jsonb_array_length(i.candidatos) > 0;

-- 3) Chaves novas, com as mesmas regras de antes (item: apaga o vínculo; equivalência: apaga junto)
alter table public.saude_comparacao_itens drop constraint if exists saude_comparacao_itens_exame_base_id_fkey;
alter table public.saude_equivalencias   drop constraint if exists saude_equivalencias_exame_base_id_fkey;
alter table public.saude_comparacao_itens
  add constraint saude_comparacao_itens_exame_base_id_fkey foreign key (exame_base_id) references public.products(id) on delete set null;
alter table public.saude_equivalencias
  add constraint saude_equivalencias_exame_base_id_fkey foreign key (exame_base_id) references public.products(id) on delete cascade;

commit;

-- Conferência: tudo "0" e as duas ligações "ok"
select
  (select count(*) from public.saude_comparacao_itens i where i.exame_base_id is not null and not exists (select 1 from public.products p where p.id = i.exame_base_id)) as itens_sem_exame,
  (select count(*) from public.saude_equivalencias q where not exists (select 1 from public.products p where p.id = q.exame_base_id)) as equivalencias_sem_exame,
  (select count(*) from public.saude_comparacao_itens i, jsonb_array_elements(i.candidatos) c
     where jsonb_typeof(i.candidatos) = 'array' and not exists (select 1 from public.products p where p.id::text = c->>'exame_base_id')) as candidatos_sem_exame;

-- DESFAZER: precisa do mapa inverso (products.externo_id guarda o id antigo):
--   begin;
--   alter table public.saude_comparacao_itens drop constraint saude_comparacao_itens_exame_base_id_fkey;
--   alter table public.saude_equivalencias   drop constraint saude_equivalencias_exame_base_id_fkey;
--   update public.saude_comparacao_itens i set exame_base_id = p.externo_id::uuid from public.products p where p.id = i.exame_base_id and p.externo_sistema = 'saude_exames_base';
--   update public.saude_equivalencias q   set exame_base_id = p.externo_id::uuid from public.products p where p.id = q.exame_base_id and p.externo_sistema = 'saude_exames_base';
--   (candidatos: repetir o jsonb_set do passo 2 usando p.externo_id no lugar de p.id)
--   alter table public.saude_comparacao_itens add constraint saude_comparacao_itens_exame_base_id_fkey foreign key (exame_base_id) references public.saude_exames_base(id) on delete set null;
--   alter table public.saude_equivalencias   add constraint saude_equivalencias_exame_base_id_fkey foreign key (exame_base_id) references public.saude_exames_base(id) on delete cascade;
--   commit;
--   (Exames criados DEPOIS do P3 só existem em products e não têm volta para saude_exames_base.)
