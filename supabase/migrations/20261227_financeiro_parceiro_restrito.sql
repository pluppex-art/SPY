-- Parceiro sem ser master nem administrador deixa de VER o financeiro de outra empresa (autorizado em 26/11/2026).
-- JÁ ESTÁ NO BANCO (conferido em 26/11/2026), sem registro em supabase_migrations. Pode rodar de novo sem efeito colateral.
-- Antes: o vínculo de parceiro (users.partner_id) liberava o financeiro dos clientes para qualquer cargo.
-- O resto do acesso de parceiro (CRM, tarefas etc.) continua igual.
--
-- A política é RESTRICTIVE (soma-se à tenant_isolation) e só de LEITURA: assim o lançamento automático de um negócio
-- ganho continua sendo gravado. UPDATE e DELETE ficam bloqueados na prática, porque dependem de enxergar a linha.
-- A chave de serviço (Aurora/n8n/rotinas) ignora RLS.
--
-- Desfazer: drop policy financeiro_parceiro_restrito on public.<tabela>; (em cada tabela abaixo)

do $$
declare t record;
begin
  for t in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and (c.relname like 'finance\_%' or c.relname in ('financial_goals', 'caixa_operacoes'))
      and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped)
  loop
    execute format('drop policy if exists financeiro_parceiro_restrito on public.%I', t.relname);
    execute format(
      'create policy financeiro_parceiro_restrito on public.%I as restrictive for select to authenticated
         using (tenant_id = (select public.current_tenant_id()) or (select public.is_tenant_admin_or_master()))', t.relname);
  end loop;
end $$;

-- O total de receita da plataforma (tela de Parceiros) segue a mesma regra.
create or replace function public.platform_metrics_overview()
returns table(total_tenants bigint, total_leads bigint, total_clientes bigint, total_propostas bigint, total_receita numeric)
language plpgsql security definer set search_path to 'public'
as $function$
begin
  if public.current_partner_id() is null and not public.is_super_admin() then
    raise exception 'access denied: partner or super admin required';
  end if;

  return query
  select
    (select count(*) from public.tenants where deleted_at is null),
    (select count(*) from public.leads),
    (select count(*) from public.clientes),
    (select count(*) from public.proposals),
    case when public.is_tenant_admin_or_master()
      then (select coalesce(sum(value), 0) from public.finance_entries where type = 'Receber')
      else 0::numeric end;
end;
$function$;

-- Trava contra lançar a mesma proposta duas vezes: precisa responder certo mesmo para quem não enxerga o financeiro.
-- Devolve só sim/não, e apenas para empresa a que o usuário já tem acesso.
create or replace function public.proposta_tem_lancamentos(p_proposta text)
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (select 1 from public.finance_entries f where f.proposal_id = p_proposta and public.has_tenant_access(f.tenant_id))
$$;
revoke all on function public.proposta_tem_lancamentos(text) from public, anon;
grant execute on function public.proposta_tem_lancamentos(text) to authenticated, service_role;
