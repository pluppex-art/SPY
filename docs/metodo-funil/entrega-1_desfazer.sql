-- Desfaz a ENTREGA 1. ATENÇÃO: apaga as tabelas novas e o que tiver sido gravado nelas.
-- Use só enquanto o método não estiver em uso. Rodar como uma transação.
set local lock_timeout = '5s';

drop table if exists public.lead_estado, public.lead_notas, public.lead_status_historico, public.lead_timers,
  public.lead_sugestoes_ia, public.lead_pagamentos, public.contato_status, public.crm_situacoes, public.crm_motivos;
drop function if exists public.spy_confere_empresa_do_lead();
drop function if exists public.spy_historico_imutavel();

drop trigger if exists crm_funis_preserva_tipo_trg on public.crm_funis;
drop function if exists public.spy_funil_preserva_tipo();
drop function if exists public.spy_metodo_preparar(text);
drop function if exists public.spy_tipo_da_etapa(text);
update public.crm_funis set etapas_config = (
    select coalesce(jsonb_agg(c.item - 'tipo' order by c.i), '[]'::jsonb) from jsonb_array_elements(etapas_config) with ordinality as c(item, i))
  where jsonb_typeof(etapas_config) = 'array' and exists (select 1 from jsonb_array_elements(etapas_config) a where a ? 'tipo');
alter table public.crm_funis drop column if exists template, drop column if exists metodo_ativo;

alter table public.tasks drop column if exists origem, drop column if exists tipo, drop column if exists situacao_codigo, drop column if exists fecha_sozinha;
alter table public.notifications drop column if exists nivel, drop column if exists lead_id, drop column if exists dedupe_key, drop column if exists canais;
alter table public.products drop column if exists ciclo_recompra_dias;
-- Se já houver automação com gatilho "situacao", a restrição antiga não volta: apague-a antes.
alter table public.automation_connections drop constraint if exists automation_connections_gatilho_tipo_check;
alter table public.automation_connections add constraint automation_connections_gatilho_tipo_check
  check (gatilho_tipo = any (array['funil_etapa', 'produto_categoria', 'produto', 'os_etapa']));
alter table public.automation_connections drop column if exists gatilho_etapa_tipo, drop column if exists gatilho_situacao_codigo;
