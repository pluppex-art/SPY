alter table public.reunioes
  add column if not exists tipo text,
  add column if not exists convidados text[];

with classified as (
  select id,
    lower(coalesce(pauta,'') || ' ' || coalesce("leadName",'') || ' ' || coalesce("companyName",'')) as txt
  from public.reunioes
  where tipo is null
)
update public.reunioes r
set tipo = case
  when c.txt ilike '%fechamento%' or c.txt ilike '%contrato%' or c.txt ilike '%assinatura%' or c.txt ilike '%closing%' or c.txt ilike '%renovação%' or c.txt ilike '%renovacao%' then 'Fechamento'
  when c.txt ilike '%demonstração%' or c.txt ilike '%demonstracao%' or c.txt ilike '%demo%' then 'Demonstração'
  when c.txt ilike '%follow-up%' or c.txt ilike '%followup%' or c.txt ilike '%follow up%' or c.txt ilike '%retorno%' or c.txt ilike '%acompanhamento%' or c.txt ilike '%check-in%' or c.txt ilike '%checkin%' then 'Follow-up'
  when c.txt ilike '%reunião%' or c.txt ilike '%reuniao%' or c.txt ilike '%meeting%' or c.txt ilike '%alinhamento%' or c.txt ilike '%kickoff%' or c.txt ilike '%kick-off%' or c.txt ilike '%sync%' or c.txt ilike '%daily%' or c.txt ilike '%negociação%' or c.txt ilike '%negociacao%' or c.txt ilike '%proposta%' or c.txt ilike '%onboarding%' or c.txt ilike '%apresentação%' or c.txt ilike '%apresentacao%' then 'Reunião'
  else 'Outros'
end
from classified c
where r.id = c.id;

update public.reunioes set tipo = 'Outros' where tipo is null;

alter table public.reunioes alter column tipo set default 'Outros';

revoke select on public.reunioes from anon;
