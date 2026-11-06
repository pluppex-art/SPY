-- Ajustes na tabela lead_contatos (criada manualmente). NAO APLICADO: precisa da sua autorizacao.
-- 1) O guard comparava new.phone_digits, mas phone_digits e coluna GERADA: num BEFORE INSERT ela ainda e NULL,
--    entao a checagem "numero ja e o principal de um lead" nunca disparava. Aqui o numero sai de `telefone`.
--    Tambem compara com e sem o "55" do pais (o indice unico so barra o numero identico).
-- 2) A tabela so tinha tenant_isolation: um vendedor restrito aos proprios leads lia contatos de leads de outros
--    vendedores da mesma empresa. A politica restritiva abaixo repete o escopo que lead_activities ja tem.
create or replace function public.lead_contatos_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
  v_digits text := regexp_replace(coalesce(new.telefone, ''), '\D', '', 'g');
  v_alt text;
begin
  select tenant_id into v_tenant from public.leads where id = new.lead_id;
  if v_tenant is distinct from new.tenant_id then
    raise exception 'lead_contatos: tenant_id diferente do tenant do lead' using errcode = '23514';
  end if;
  v_alt := case when v_digits like '55%' then substr(v_digits, 3) else '55' || v_digits end;
  if exists (select 1 from public.leads l where l.tenant_id = new.tenant_id and l.deleted_at is null and l.phone_digits in (v_digits, v_alt)) then
    raise exception 'lead_contatos: telefone % ja e o telefone principal de um lead', new.telefone using errcode = '23505';
  end if;
  if exists (select 1 from public.lead_contatos c where c.tenant_id = new.tenant_id and c.id <> new.id and c.phone_digits in (v_digits, v_alt)) then
    raise exception 'lead_contatos: telefone % ja esta cadastrado em outro card', new.telefone using errcode = '23505';
  end if;
  return new;
end $$;

drop policy if exists lead_visivel on public.lead_contatos;
create policy lead_visivel on public.lead_contatos as restrictive for all to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_contatos.lead_id))
  with check (exists (select 1 from public.leads l where l.id = lead_contatos.lead_id));
