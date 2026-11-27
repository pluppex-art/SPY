-- Envio de e-mail de marketing continua sozinho: o banco chama o servidor a cada 5 minutos, só quando há algo na fila.
-- O segredo é gerado aqui mesmo e só o servidor (service role) e o agendamento o leem; ninguém precisa copiá-lo.

create table if not exists public.cron_segredos (
  nome text primary key,
  segredo text not null,
  created_at timestamptz not null default now()
);
alter table public.cron_segredos enable row level security;
revoke all on public.cron_segredos from public, anon, authenticated;

insert into public.cron_segredos (nome, segredo)
values ('email_continuar', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (nome) do nothing;

select cron.schedule('spy-email-continuar', '*/5 * * * *', $job$
  select net.http_get(
    url := 'https://www.spycrm.com.br/api/email-campaigns/cron/continuar',
    headers := jsonb_build_object('Authorization', 'Bearer ' || s.segredo),
    timeout_milliseconds := 60000
  )
  from public.cron_segredos s
  where s.nome = 'email_continuar' and (
    exists (select 1 from public.email_campaigns c where c.status = 'sending' and coalesce(c.audience->>'pausada', 'false') <> 'true'
      and exists (select 1 from public.email_campaign_recipients r where r.campaign_id = c.id and ((r.status = 'pending' and (r.claimed_at is null or r.claimed_at < now())) or r.status = 'sending')))
    or exists (select 1 from public.email_campaigns c where c.status = 'ready' and c.agendada_para <= now())
    or (extract(hour from now() at time zone 'America/Sao_Paulo') between 8 and 19
      and exists (select 1 from public.email_sequence_enrollments e join public.email_sequences q on q.id = e.sequence_id where q.status = 'active' and e.status = 'active' and e.next_send_at <= now()))
  );
$job$);
