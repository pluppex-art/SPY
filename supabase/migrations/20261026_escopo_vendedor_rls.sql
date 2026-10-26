-- Escopo de vendedor no banco: quem tem um cargo com "Restringir aos próprios dados"
-- (cargos.restringir_aos_proprios_dados) só enxerga/edita os leads dele e o que nasce
-- deles (propostas, itens, tarefas, atividades, reuniões, contratos). Master e admin
-- do tenant nunca são restringidos. service_role (n8n, integrações) ignora RLS como
-- sempre. Policies RESTRICTIVE só de SELECT/UPDATE/DELETE: INSERT fica como está
-- (o vendedor cria lead; quem recebe é decidido pelo round-robin).
--
-- O vínculo lead↔vendedor é o texto leads.seller ("GUSTAVO OLIVEIRA DA SILVA" num lead,
-- "Gustavo Oliveira" no usuário), então o casamento é por nome: todas as palavras do
-- nome mais curto aparecem no mais longo. leads.seller_id (uuid), quando preenchido,
-- tem prioridade. Mesmo critério de src/lib/sellerScope.ts.

create or replace function public.norm_nome(s text)
returns text language sql immutable as $$
  select trim(regexp_replace(
    lower(translate(coalesce(s, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
      'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')),
    '[^a-z0-9]+', ' ', 'g'))
$$;

create or replace function public.vendedor_confere_nome(a text, b text)
returns boolean language sql immutable as $$
  with ta as (select distinct t from unnest(string_to_array(public.norm_nome(a), ' ')) t where t <> ''),
       tb as (select distinct t from unnest(string_to_array(public.norm_nome(b), ' ')) t where t <> '')
  select (select count(*) from ta) > 0 and (select count(*) from tb) > 0 and (
    not exists (select 1 from ta where t not in (select t from tb))
    or not exists (select 1 from tb where t not in (select t from ta))
  )
$$;

create or replace function public.usuario_restrito_aos_proprios_dados()
returns boolean language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select not coalesce(u.is_master, false)
       and not coalesce(u.is_tenant_admin, false)
       and coalesce(c.restringir_aos_proprios_dados, false)
    from public.users u
    left join public.cargos c on c.tenant_id = u.tenant_id and c.nome = u.role
    where u.id = auth.uid()
  ), false)
$$;

create or replace function public.usuario_nome_atual()
returns text language sql stable security definer set search_path to 'public' as $$
  select u.name from public.users u where u.id = auth.uid()
$$;

create or replace function public.lead_e_do_usuario(p_seller text, p_seller_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $$
  select (p_seller_id is not null and p_seller_id = auth.uid())
      or public.vendedor_confere_nome(p_seller, public.usuario_nome_atual())
$$;

-- ── leads ────────────────────────────────────────────────────────────────────
drop policy if exists vendedor_escopo_select on public.leads;
drop policy if exists vendedor_escopo_update on public.leads;
drop policy if exists vendedor_escopo_delete on public.leads;
create policy vendedor_escopo_select on public.leads as restrictive for select to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados()) or public.lead_e_do_usuario(seller, seller_id));
create policy vendedor_escopo_update on public.leads as restrictive for update to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados()) or public.lead_e_do_usuario(seller, seller_id));
create policy vendedor_escopo_delete on public.leads as restrictive for delete to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados()) or public.lead_e_do_usuario(seller, seller_id));

-- ── propostas e itens ────────────────────────────────────────────────────────
drop policy if exists vendedor_escopo_select on public.proposals;
drop policy if exists vendedor_escopo_update on public.proposals;
drop policy if exists vendedor_escopo_delete on public.proposals;
create policy vendedor_escopo_select on public.proposals as restrictive for select to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados())
         or exists (select 1 from public.leads l where l.id = proposals.lead_id)
         or public.vendedor_confere_nome(vendedor, public.usuario_nome_atual()));
create policy vendedor_escopo_update on public.proposals as restrictive for update to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados())
         or exists (select 1 from public.leads l where l.id = proposals.lead_id)
         or public.vendedor_confere_nome(vendedor, public.usuario_nome_atual()));
create policy vendedor_escopo_delete on public.proposals as restrictive for delete to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados())
         or exists (select 1 from public.leads l where l.id = proposals.lead_id)
         or public.vendedor_confere_nome(vendedor, public.usuario_nome_atual()));

drop policy if exists vendedor_escopo_select on public.proposal_items;
drop policy if exists vendedor_escopo_update on public.proposal_items;
drop policy if exists vendedor_escopo_delete on public.proposal_items;
create policy vendedor_escopo_select on public.proposal_items as restrictive for select to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados()) or exists (select 1 from public.proposals p where p.id = proposal_items.proposal_id));
create policy vendedor_escopo_update on public.proposal_items as restrictive for update to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados()) or exists (select 1 from public.proposals p where p.id = proposal_items.proposal_id));
create policy vendedor_escopo_delete on public.proposal_items as restrictive for delete to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados()) or exists (select 1 from public.proposals p where p.id = proposal_items.proposal_id));

-- ── tarefas ──────────────────────────────────────────────────────────────────
drop policy if exists vendedor_escopo_select on public.tasks;
drop policy if exists vendedor_escopo_update on public.tasks;
drop policy if exists vendedor_escopo_delete on public.tasks;
create policy vendedor_escopo_select on public.tasks as restrictive for select to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados())
         or exists (select 1 from public.leads l where l.id = tasks.lead_id)
         or creator_id = auth.uid() or assigned_to = auth.uid()
         or assigned_to::text in (select c.id from public.colaboradores c where c.user_id = auth.uid()));
create policy vendedor_escopo_update on public.tasks as restrictive for update to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados())
         or exists (select 1 from public.leads l where l.id = tasks.lead_id)
         or creator_id = auth.uid() or assigned_to = auth.uid()
         or assigned_to::text in (select c.id from public.colaboradores c where c.user_id = auth.uid()));
create policy vendedor_escopo_delete on public.tasks as restrictive for delete to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados())
         or exists (select 1 from public.leads l where l.id = tasks.lead_id)
         or creator_id = auth.uid() or assigned_to = auth.uid()
         or assigned_to::text in (select c.id from public.colaboradores c where c.user_id = auth.uid()));

-- ── atividades, reuniões e contratos ligados aos leads dele ──────────────────
drop policy if exists vendedor_escopo_select on public.lead_activities;
drop policy if exists vendedor_escopo_update on public.lead_activities;
drop policy if exists vendedor_escopo_delete on public.lead_activities;
create policy vendedor_escopo_select on public.lead_activities as restrictive for select to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados()) or exists (select 1 from public.leads l where l.id::text = lead_activities.lead_id));
create policy vendedor_escopo_update on public.lead_activities as restrictive for update to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados()) or exists (select 1 from public.leads l where l.id::text = lead_activities.lead_id));
create policy vendedor_escopo_delete on public.lead_activities as restrictive for delete to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados()) or exists (select 1 from public.leads l where l.id::text = lead_activities.lead_id));

drop policy if exists vendedor_escopo_select on public.reunioes;
drop policy if exists vendedor_escopo_update on public.reunioes;
drop policy if exists vendedor_escopo_delete on public.reunioes;
create policy vendedor_escopo_select on public.reunioes as restrictive for select to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados())
         or exists (select 1 from public.leads l where l.id::text = reunioes."leadId")
         or public.vendedor_confere_nome(reunioes."closerName", public.usuario_nome_atual()));
create policy vendedor_escopo_update on public.reunioes as restrictive for update to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados())
         or exists (select 1 from public.leads l where l.id::text = reunioes."leadId")
         or public.vendedor_confere_nome(reunioes."closerName", public.usuario_nome_atual()));
create policy vendedor_escopo_delete on public.reunioes as restrictive for delete to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados())
         or exists (select 1 from public.leads l where l.id::text = reunioes."leadId")
         or public.vendedor_confere_nome(reunioes."closerName", public.usuario_nome_atual()));

drop policy if exists vendedor_escopo_select on public.contracts;
drop policy if exists vendedor_escopo_update on public.contracts;
drop policy if exists vendedor_escopo_delete on public.contracts;
create policy vendedor_escopo_select on public.contracts as restrictive for select to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados())
         or exists (select 1 from public.proposals p where p.id = contracts.proposal_id)
         or exists (select 1 from public.leads l where l.id = contracts.lead_id));
create policy vendedor_escopo_update on public.contracts as restrictive for update to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados())
         or exists (select 1 from public.proposals p where p.id = contracts.proposal_id)
         or exists (select 1 from public.leads l where l.id = contracts.lead_id));
create policy vendedor_escopo_delete on public.contracts as restrictive for delete to authenticated
  using (not (select public.usuario_restrito_aos_proprios_dados())
         or exists (select 1 from public.proposals p where p.id = contracts.proposal_id)
         or exists (select 1 from public.leads l where l.id = contracts.lead_id));
