-- As visões da Aurora são só de leitura: o padrão do Supabase dá escrita a quem estiver logado.
revoke all on public.aurora_google_agenda, public.aurora_google_tasks from anon, authenticated;
grant select on public.aurora_google_agenda, public.aurora_google_tasks to authenticated;
