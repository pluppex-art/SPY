-- 20260924_a_users_privilege_guard.sql
-- Fecha o caminho de escalada de privilégio via public.users (auditoria SPY, lead c01).
-- Não destrutivo: só adiciona um trigger. NÃO mexe em senhas nem em password_hash.
-- Regras (para chamadas com JWT de usuário; service role / SQL editor, auth.uid() nulo, seguem livres):
--   * is_master, partner_id e tenant_id nunca mudam por usuário comum (só super admin).
--   * is_tenant_admin, role e active só mudam por admin do MESMO tenant (ou super admin).
--   * INSERT: só admin cria usuário; auto-cadastro nunca nasce admin/master/partner.
-- Rollback: drop trigger if exists a_guard_users_privileged_columns on public.users;
--           drop function if exists public.guard_users_privileged_columns();

create or replace function public.guard_users_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_tenant uuid;
  v_master boolean := false;
  v_admin boolean := false;
begin
  -- Backend (service role), migrations e SQL editor: sem usuário JWT.
  if v_uid is null then
    return NEW;
  end if;

  select u.tenant_id, coalesce(u.is_master, false), coalesce(u.is_tenant_admin, false)
    into v_tenant, v_master, v_admin
    from public.users u where u.id = v_uid;

  if v_master then
    return NEW;
  end if;

  if TG_OP = 'INSERT' then
    if coalesce(NEW.is_master, false) or NEW.partner_id is not null then
      raise exception 'Sem permissão: is_master/partner_id só podem ser definidos por super admin.' using errcode = '42501';
    end if;
    if NEW.id is distinct from v_uid and not v_admin then
      raise exception 'Sem permissão: apenas administradores criam usuários.' using errcode = '42501';
    end if;
    if NEW.id = v_uid and coalesce(NEW.is_tenant_admin, false) and not v_admin then
      raise exception 'Sem permissão: não é possível se auto-atribuir administrador.' using errcode = '42501';
    end if;
    return NEW;
  end if;

  -- UPDATE
  if NEW.is_master is distinct from OLD.is_master
     or NEW.partner_id is distinct from OLD.partner_id
     or NEW.tenant_id is distinct from OLD.tenant_id then
    raise exception 'Sem permissão: is_master, partner_id e tenant_id só podem ser alterados por super admin.' using errcode = '42501';
  end if;

  if NEW.is_tenant_admin is distinct from OLD.is_tenant_admin
     or NEW.role is distinct from OLD.role
     or NEW.active is distinct from OLD.active then
    if not (v_admin and OLD.tenant_id = v_tenant) then
      raise exception 'Sem permissão: is_tenant_admin, role e active só podem ser alterados por administrador do próprio tenant.' using errcode = '42501';
    end if;
  end if;

  return NEW;
end;
$$;

revoke all on function public.guard_users_privileged_columns() from public, anon, authenticated;

drop trigger if exists a_guard_users_privileged_columns on public.users;
create trigger a_guard_users_privileged_columns
  before insert or update on public.users
  for each row execute function public.guard_users_privileged_columns();
