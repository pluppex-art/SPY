-- A carga inicial do app lê lead_activities sem os eventos do Kommo (id not like 'kommo-evt-%'). Num tenant com
-- ~54 mil linhas, quase todas de Kommo, a consulta varria o tenant inteiro e estourava o statement timeout (500).
-- Índice parcial só com as atividades que não são eventos do Kommo: a mesma consulta passa a ler ~500 linhas.
create index if not exists idx_lead_activities_tenant_sem_kommo
  on public.lead_activities (tenant_id, created_at desc)
  where not (id like 'kommo-evt-%');
analyze public.lead_activities;
