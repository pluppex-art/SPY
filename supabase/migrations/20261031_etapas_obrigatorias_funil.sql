-- Etapas obrigatórias de todo funil comercial/SDR, para qualquer empresa (multi-tenant):
--   Ganho · Perdido · Desqualificado
-- Desqualificado é onde o Agente Secreto joga as conversas que não são comerciais (não são venda de produto).
-- A regra vive no banco, não só na tela, para valer também para o que o n8n e a sincronização do Kommo gravam direto:
--   * funil novo (ou legado sem alguma delas) ganha as que faltam, no FIM da lista (os ids das etapas dependem da posição);
--   * não dá para remover nem renomear uma dessas etapas num funil que já a tinha.
-- Reconhece o papel pelo nome, então "Venda ganha"/"Venda perdida" (Kommo) contam como Ganho/Perdido.
-- Funis de outros tipos (ex.: Serviço, comercial_arquivado_kommo) ficam de fora.
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
  if new.tipo is null or new.tipo not in ('comercial', 'sdr_ia') then
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

drop trigger if exists crm_funis_etapas_obrigatorias_trg on public.crm_funis;
create trigger crm_funis_etapas_obrigatorias_trg
  before insert or update of etapas, etapas_config, tipo on public.crm_funis
  for each row execute function public.crm_funis_etapas_obrigatorias();
