-- Vendedor restrito aos próprios dados: MESMA regra de visibilidade, reescrita para não estourar o tempo limite.
-- Antes, para quem era restrito, a leitura de leads/atividades/tarefas/reuniões da empresa levava 12 s ou mais (erro 500 /
-- "canceling statement due to statement timeout"), porque:
--  1) a regra chamava uma função pesada POR LINHA (comparar nome em cada um dos ~15 mil leads);
--  2) atividades/tarefas/reuniões usavam EXISTS correlacionado sobre leads (varria os leads para cada linha).
-- Agora: flag e nome do usuário saem uma vez por consulta (initplan); a comparação de nome roda só sobre os NOMES DISTINTOS
-- de responsável (função com CTE materializada); "o lead é visível para mim" vira IN (subconsulta) resolvido com hash.
-- Resultado medido para os 4 vendedores do Negócio Fora da Curva: de 12 s+ / estouro para 70-270 ms por consulta.
alter function public.vendedor_confere_nome(text, text) cost 500;

create or replace function public.vendedor_nomes_do_usuario()
returns text[]
language sql
stable
security definer
set search_path to 'public'
as $$
  with nome as materialized (
    select public.usuario_nome_atual() as n
  ),
  distintos as materialized (
    select distinct l.seller
    from public.leads l
    where l.tenant_id = (select u.tenant_id from public.users u where u.id = auth.uid())
      and l.seller is not null and l.seller <> ''
  )
  select coalesce(array_agg(d.seller), array[]::text[])
  from distintos d, nome
  where public.vendedor_confere_nome(d.seller, nome.n)
$$;

alter policy vendedor_escopo_select on public.leads using (
  (not (select public.usuario_restrito_aos_proprios_dados()))
  or seller_id = (select auth.uid())
  or seller = any (((select public.vendedor_nomes_do_usuario()))::text[])
);
alter policy vendedor_escopo_update on public.leads using (
  (not (select public.usuario_restrito_aos_proprios_dados()))
  or seller_id = (select auth.uid())
  or seller = any (((select public.vendedor_nomes_do_usuario()))::text[])
);
alter policy vendedor_escopo_delete on public.leads using (
  (not (select public.usuario_restrito_aos_proprios_dados()))
  or seller_id = (select auth.uid())
  or seller = any (((select public.vendedor_nomes_do_usuario()))::text[])
);

alter policy vendedor_escopo_select on public.lead_activities using ((not (select public.usuario_restrito_aos_proprios_dados())) or lead_id in (select l.id::text from public.leads l));
alter policy vendedor_escopo_update on public.lead_activities using ((not (select public.usuario_restrito_aos_proprios_dados())) or lead_id in (select l.id::text from public.leads l));
alter policy vendedor_escopo_delete on public.lead_activities using ((not (select public.usuario_restrito_aos_proprios_dados())) or lead_id in (select l.id::text from public.leads l));

alter policy vendedor_escopo_select on public.reunioes using ((not (select public.usuario_restrito_aos_proprios_dados())) or "leadId" in (select l.id::text from public.leads l) or public.vendedor_confere_nome("closerName", (select public.usuario_nome_atual())));
alter policy vendedor_escopo_update on public.reunioes using ((not (select public.usuario_restrito_aos_proprios_dados())) or "leadId" in (select l.id::text from public.leads l) or public.vendedor_confere_nome("closerName", (select public.usuario_nome_atual())));
alter policy vendedor_escopo_delete on public.reunioes using ((not (select public.usuario_restrito_aos_proprios_dados())) or "leadId" in (select l.id::text from public.leads l) or public.vendedor_confere_nome("closerName", (select public.usuario_nome_atual())));

alter policy vendedor_escopo_select on public.tasks using ((not (select public.usuario_restrito_aos_proprios_dados())) or lead_id in (select l.id from public.leads l) or creator_id = (select auth.uid()) or assigned_to = (select auth.uid()) or assigned_to::text in (select c.id from public.colaboradores c where c.user_id = (select auth.uid())));
alter policy vendedor_escopo_update on public.tasks using ((not (select public.usuario_restrito_aos_proprios_dados())) or lead_id in (select l.id from public.leads l) or creator_id = (select auth.uid()) or assigned_to = (select auth.uid()) or assigned_to::text in (select c.id from public.colaboradores c where c.user_id = (select auth.uid())));
alter policy vendedor_escopo_delete on public.tasks using ((not (select public.usuario_restrito_aos_proprios_dados())) or lead_id in (select l.id from public.leads l) or creator_id = (select auth.uid()) or assigned_to = (select auth.uid()) or assigned_to::text in (select c.id from public.colaboradores c where c.user_id = (select auth.uid())));
