-- Limites de plano aplicados NO BANCO (vale para tela, API, importação, sincronização — qualquer entrada).
--
-- Escala: trigger de STATEMENT (não por linha) com tabela de transição -> uma checagem por operação, mesmo que a
-- importação insira milhares de leads de uma vez. Empresa sem assinatura/plano/limite não paga custo nenhum além de
-- um lookup por tenant distinto. A contagem usa índice (tenant_id) — sem contadores que possam divergir.
--
-- Limites vêm de subscription_plans.limits: {"leads": 50000, "users": 10}. Chave ausente = ilimitado.
-- Assinatura suspensa/cancelada é tratada em outra camada (acesso bloqueado), por isso só trial/active/past_due contam aqui.

create or replace function public.spy_plan_limit(p_tenant uuid, p_key text) returns bigint
language sql stable security definer set search_path = public as $$
  select nullif(p.limits ->> p_key, '')::bigint
  from public.tenant_subscriptions s
  join public.subscription_plans p on p.id = s.plan_id
  where s.tenant_id = p_tenant and s.status in ('trial', 'active', 'past_due')
$$;
revoke execute on function public.spy_plan_limit(uuid, text) from public, anon;
grant execute on function public.spy_plan_limit(uuid, text) to authenticated, service_role;

create or replace function public.enforce_plan_limit_leads() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; lim bigint; cnt bigint;
begin
  for r in select distinct tenant_id from new_rows where tenant_id is not null loop
    lim := public.spy_plan_limit(r.tenant_id, 'leads');
    if lim is null then continue; end if;
    select count(*) into cnt from public.leads where tenant_id = r.tenant_id and deleted_at is null;
    if cnt > lim then
      raise exception 'PLAN_LIMIT_LEADS: o plano permite até % leads e a empresa já tem %.', lim, cnt using errcode = 'P0001';
    end if;
  end loop;
  return null;
end $$;

create or replace function public.enforce_plan_limit_users() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; lim bigint; cnt bigint;
begin
  for r in select distinct tenant_id from new_rows where tenant_id is not null loop
    lim := public.spy_plan_limit(r.tenant_id, 'users');
    if lim is null then continue; end if;
    select count(*) into cnt from public.users where tenant_id = r.tenant_id and deleted_at is null and coalesce(active, true);
    if cnt > lim then
      raise exception 'PLAN_LIMIT_USERS: o plano permite até % usuários e a empresa já tem %.', lim, cnt using errcode = 'P0001';
    end if;
  end loop;
  return null;
end $$;

drop trigger if exists trg_plan_limit_leads on public.leads;
create trigger trg_plan_limit_leads after insert on public.leads
  referencing new table as new_rows for each statement execute function public.enforce_plan_limit_leads();

drop trigger if exists trg_plan_limit_users on public.users;
create trigger trg_plan_limit_users after insert on public.users
  referencing new table as new_rows for each statement execute function public.enforce_plan_limit_users();
