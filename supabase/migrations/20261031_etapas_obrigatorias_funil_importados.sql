-- Estende a regra das etapas obrigatórias (Ganho · Perdido · Desqualificado) a TODO funil comercial, inclusive
-- importados (Kommo) e arquivados ("comercial_arquivado_kommo"): arquivar um funil não o tira mais da regra.
-- Mesma função de 20261031_etapas_obrigatorias_funil.sql; só muda a condição de tipo (sdr_ia ou comercial%).
-- Funis de Serviço/OS ficam de fora. (Aplicado em produção em 2026-10-30.)
create or replace function public.crm_funis_etapas_obrigatorias() returns trigger
language plpgsql as $$
declare
  papeis text[] := array['ganh[oa]', 'perdid[oa]', 'desqualific'];
  nomes  text[] := array['Ganho', 'Perdido', 'Desqualificado'];
  cores  text[] := array['emerald', 'rose', 'slate'];
  i int;
  ja_tem boolean;
  tinha_antes boolean;
begin
  if new.tipo is null or not (new.tipo = 'sdr_ia' or new.tipo like 'comercial%') then
    return new;
  end if;
  new.etapas := coalesce(new.etapas, '{}');
  for i in 1..3 loop
    select exists (select 1 from unnest(new.etapas) e where e ~* papeis[i]) into ja_tem;
    if ja_tem then continue; end if;
    if tg_op = 'UPDATE' then
      select exists (select 1 from unnest(coalesce(old.etapas, '{}')) e where e ~* papeis[i]) into tinha_antes;
      if tinha_antes then
        raise exception 'A etapa "%" é obrigatória em todo funil e não pode ser removida nem renomeada.', nomes[i]
          using errcode = '23514';
      end if;
    end if;
    new.etapas := array_append(new.etapas, nomes[i]);
    if new.etapas_config is not null and jsonb_typeof(new.etapas_config) = 'array' then
      new.etapas_config := new.etapas_config
        || jsonb_build_array(jsonb_build_object('cor', cores[i], 'nome', nomes[i], 'iniciarMinimizado', true));
    end if;
  end loop;
  return new;
end $$;
