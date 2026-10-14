-- O default 'Tecnologia' fazia todo cliente criado sem setor (integração, importação, lead ganho) nascer como Tecnologia.
alter table public.clientes alter column industry drop default;

-- Quem tem lead vinculado com "Setor de Atuação" preenchido passa a ter esse setor (o do lead mais recente).
with setor as (
  select distinct on (l."clientId") l."clientId" as cliente_id, btrim(l."customFields"->>'setor') as setor
  from public.leads l
  where l."clientId" is not null and nullif(btrim(l."customFields"->>'setor'), '') is not null
  order by l."clientId", l.updated_at desc nulls last
)
update public.clientes c
set industry = s.setor
from setor s
where c.id = s.cliente_id
  and (c.industry is null or c.industry = 'Tecnologia')
  and c.industry is distinct from s.setor;
