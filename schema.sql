create table if not exists public.ai_knowledge_base (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  title character varying(255) not null,
  content text not null,
  category character varying(100) null default 'general'::character varying,
  is_active boolean null default true,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint ai_knowledge_base_pkey primary key (id),
  constraint ai_knowledge_base_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create or replace trigger update_ai_knowledge_modtime BEFORE
update on ai_knowledge_base for EACH row
execute FUNCTION update_modified_column ();
create table if not exists public.app_settings (
  id text not null default (gen_random_uuid ())::text,
  tenant_id uuid null,
  key character varying(255) not null,
  value jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint app_settings_pkey primary key (id),
  constraint app_settings_tenant_id_key_key unique (tenant_id, key),
  constraint app_settings_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create or replace trigger app_settings_updated_at BEFORE
update on app_settings for EACH row
execute FUNCTION set_updated_at ();

create or replace trigger update_app_settings_modtime BEFORE
update on app_settings for EACH row
execute FUNCTION update_modified_column ();
create table if not exists public.appointments (
  id text not null default (gen_random_uuid ())::text,
  tenant_id uuid null,
  patient character varying(255) not null,
  phone character varying(50) null,
  dr_id text null,
  dr_name character varying(255) null,
  specialty character varying(100) null,
  room character varying(100) null,
  type character varying(100) null,
  status character varying(50) null default 'Confirmado'::character varying,
  date date not null,
  time character varying(10) not null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint appointments_pkey primary key (id),
  constraint appointments_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_appointments_date on public.appointments using btree (tenant_id, date desc) TABLESPACE pg_default;
create table if not exists public.cargos (
  id uuid not null default gen_random_uuid (),
  tenant_id uuid null,
  nome text not null,
  descricao text null default ''::text,
  nivel text null default 'Operacional'::text,
  modulos text[] null default '{}'::text[],
  created_at timestamp with time zone null default now(),
  constraint cargos_pkey primary key (id),
  constraint cargos_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;
create table if not exists public.certificates (
  id text not null default (gen_random_uuid ())::text,
  tenant_id uuid null,
  created_at timestamp with time zone null default now(),
  constraint certificates_pkey primary key (id),
  constraint certificates_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;
create table if not exists public.clientes (
  id text not null default (gen_random_uuid ())::text,
  name text not null default ''::text,
  industry text null default 'Tecnologia'::text,
  city text null default ''::text,
  state text null default ''::text,
  phone text null default ''::text,
  email text null default ''::text,
  status text null default 'Ativo'::text,
  tenant_id uuid null,
  created_at timestamp with time zone null default now(),
  constraint clientes_pkey primary key (id),
  constraint clientes_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;
create table if not exists public.colaboradores (
  id text not null default (gen_random_uuid ())::text,
  tenant_id uuid null,
  user_id uuid null,
  nome character varying(255) not null,
  cargo character varying(100) null,
  departamento character varying(100) null,
  status character varying(50) null default 'Ativo'::character varying,
  data_admissao date null,
  email character varying(255) null,
  avatar character varying(1024) null,
  desempenho integer null default 0,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  deals integer null default 0,
  revenue text null default 'R$ 0'::text,
  squad text null default 'Sem squad'::text,
  "dataAdmissao" text null,
  phone text null default ''::text,
  constraint colaboradores_pkey primary key (id),
  constraint colaboradores_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE,
  constraint colaboradores_user_id_fkey foreign KEY (user_id) references users (id) on delete set null
) TABLESPACE pg_default;

create or replace trigger update_colaboradores_modtime BEFORE
update on colaboradores for EACH row
execute FUNCTION update_modified_column ();
create table if not exists public.contracts (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  lead_id uuid null,
  user_id uuid null,
  title character varying(255) not null,
  value numeric(15, 2) not null,
  mrr_value numeric(15, 2) null default 0.00,
  status character varying(50) not null default 'Draft'::character varying,
  signed_date date null,
  start_date date null,
  end_date date null,
  file_url character varying(2048) null,
  notes text null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  deleted_at timestamp with time zone null,
  constraint contracts_pkey primary key (id),
  constraint contracts_lead_id_fkey foreign KEY (lead_id) references leads (id) on delete set null,
  constraint contracts_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE,
  constraint contracts_user_id_fkey foreign KEY (user_id) references users (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_contracts_revenue_dashboard on public.contracts using btree (tenant_id, status, mrr_value) TABLESPACE pg_default
where
  (deleted_at is null);

create index IF not exists idx_contracts_agent_lookup on public.contracts using btree (user_id, status) TABLESPACE pg_default
where
  (deleted_at is null);

create or replace trigger update_contracts_modtime BEFORE
update on contracts for EACH row
execute FUNCTION update_modified_column ();
create table if not exists public.crm_funis (
  id text not null,
  nome text not null,
  tipo text not null default 'comercial'::text,
  etapas text[] null default '{}'::text[],
  etapas_config jsonb null default '[]'::jsonb,
  ativo boolean null default true,
  sdr_etapa_entrada text null default ''::text,
  sdr_etapa_handoff text null default ''::text,
  sdr_score_minimo integer null default 65,
  sdr_delay_resposta integer null default 2,
  sdr_msg_boas_vindas text null default ''::text,
  sdr_criterio_desqualificacao text null default 'sem_interesse'::text,
  tenant_id text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint crm_funis_pkey primary key (id)
) TABLESPACE pg_default;
create table if not exists public.crm_pipeline_stages (
  id text not null,
  funil_id text null,
  nome text not null,
  cor text null default '#3b82f6'::text,
  ordem integer null default 0,
  iniciar_minimizado boolean null default false,
  tipo text null default 'comercial'::text,
  tenant_id text null,
  created_at timestamp with time zone null default now(),
  constraint crm_pipeline_stages_pkey primary key (id),
  constraint crm_pipeline_stages_funil_id_fkey foreign KEY (funil_id) references crm_funis (id) on delete CASCADE
) TABLESPACE pg_default;
create table if not exists public.custom_fields (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  entity_type character varying(50) null default 'lead'::character varying,
  field_name character varying(100) not null,
  field_type character varying(50) null default 'text'::character varying,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint custom_fields_pkey primary key (id),
  constraint custom_fields_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;
create table if not exists public.dev_environments (
  id uuid not null default gen_random_uuid (),
  env_id text not null,
  name text not null,
  type text not null default 'Development'::text,
  status text not null default 'operacional'::text,
  url text null default ''::text,
  version text null default 'v1.0.0'::text,
  last_deploy text null default ''::text,
  uptime text null default '-'::text,
  region text null default 'sa-east-1 (São Paulo)'::text,
  metrics jsonb null default '{"cpu": 0, "memory": 0, "latency": "0ms", "requests": "0/min"}'::jsonb,
  services jsonb null default '[]'::jsonb,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint dev_environments_pkey primary key (id),
  constraint dev_environments_env_id_key unique (env_id)
) TABLESPACE pg_default;
create table if not exists public.dev_projects (
  id uuid not null default gen_random_uuid (),
  name text not null,
  description text null default ''::text,
  status text not null default 'Em Planejamento'::text,
  progress integer null default 0,
  stack text[] null default '{}'::text[],
  team text[] null default '{}'::text[],
  last_commit text null default ''::text,
  open_issues integer null default 0,
  sprints integer null default 0,
  stars integer null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  tenant_id uuid null,
  constraint dev_projects_pkey primary key (id),
  constraint dev_projects_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists dev_projects_status_idx on public.dev_projects using btree (status) TABLESPACE pg_default;

create index IF not exists idx_dev_projects_status on public.dev_projects using btree (status) TABLESPACE pg_default;

create or replace trigger trg_dev_projects_updated_at BEFORE
update on dev_projects for EACH row
execute FUNCTION set_updated_at ();

create or replace trigger update_dev_projects_modtime BEFORE
update on dev_projects for EACH row
execute FUNCTION update_modified_column ();
create sequence if not exists public.dev_issue_number_seq;
create table if not exists public.dev_issues (
  id uuid not null default gen_random_uuid (),
  issue_number integer null default nextval('dev_issue_number_seq'::regclass),
  title text not null,
  description text null default ''::text,
  severity text not null default 'médio'::text,
  status text not null default 'aberto'::text,
  project uuid null,
  assignee text null default '-'::text,
  reporter text null default ''::text,
  labels text[] null default '{}'::text[],
  comments integer null default 0,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  tenant_id uuid null,
  constraint dev_issues_pkey primary key (id),
  constraint dev_issues_project_fkey foreign KEY (project) references dev_projects (id) on delete set null,
  constraint dev_issues_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists dev_issues_project_idx on public.dev_issues using btree (project) TABLESPACE pg_default;

create index IF not exists dev_issues_status_idx on public.dev_issues using btree (status) TABLESPACE pg_default;

create index IF not exists dev_issues_issue_number_idx on public.dev_issues using btree (issue_number) TABLESPACE pg_default;

create index IF not exists idx_dev_issues_status on public.dev_issues using btree (status) TABLESPACE pg_default;

create index IF not exists idx_dev_issues_project on public.dev_issues using btree (project) TABLESPACE pg_default;

create or replace trigger trg_dev_issues_updated_at BEFORE
update on dev_issues for EACH row
execute FUNCTION set_updated_at ();

create or replace trigger update_dev_issues_modtime BEFORE
update on dev_issues for EACH row
execute FUNCTION update_modified_column ();
create table if not exists public.dev_repositories (
  id uuid not null default gen_random_uuid (),
  project uuid null,
  name text not null,
  description text null default ''::text,
  language text null default 'TypeScript'::text,
  visibility text null default 'private'::text,
  status text null default 'ativo'::text,
  branches integer null default 1,
  stars integer null default 0,
  forks integer null default 0,
  last_commit text null default ''::text,
  open_prs integer null default 0,
  contributors text[] null default '{}'::text[],
  size text null default '0 MB'::text,
  url text null default ''::text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  tenant_id uuid null,
  constraint dev_repositories_pkey primary key (id),
  constraint dev_repositories_project_fkey foreign KEY (project) references dev_projects (id) on delete set null,
  constraint dev_repositories_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists dev_repositories_visibility_idx on public.dev_repositories using btree (visibility) TABLESPACE pg_default;

create index IF not exists dev_repositories_status_idx on public.dev_repositories using btree (status) TABLESPACE pg_default;

create index IF not exists idx_dev_repositories_status on public.dev_repositories using btree (status) TABLESPACE pg_default;

create or replace trigger trg_dev_repositories_updated_at BEFORE
update on dev_repositories for EACH row
execute FUNCTION set_updated_at ();

create or replace trigger update_dev_repositories_modtime BEFORE
update on dev_repositories for EACH row
execute FUNCTION update_modified_column ();
create or replace function public.sync_sprint_task_project_from_issue()
returns trigger
language plpgsql
as $$
begin
  if NEW.issue is not null then
    SELECT project INTO NEW.project FROM public.dev_issues WHERE id = NEW.issue;
  end if;
  return NEW;
end;
$$;

create table if not exists public.dev_sprint_tasks (
  id uuid not null default gen_random_uuid (),
  title text not null,
  type text not null default 'feature'::text,
  priority text not null default 'média'::text,
  points integer null default 1,
  assignee text null default ''::text,
  tags text[] null default '{}'::text[],
  column_id text not null default 'backlog'::text,
  issue uuid null,
  project uuid null,
  sprint_id uuid null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  tenant_id uuid null,
  constraint dev_sprint_tasks_pkey primary key (id),
  constraint dev_sprint_tasks_issue_fkey foreign KEY (issue) references dev_issues (id) on delete set null,
  constraint dev_sprint_tasks_project_fkey foreign KEY (project) references dev_projects (id) on delete set null,
  constraint dev_sprint_tasks_sprint_fkey foreign KEY (sprint_id) references dev_projects (id) on delete set null,
  constraint dev_sprint_tasks_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists dev_sprint_tasks_project_idx on public.dev_sprint_tasks using btree (project) TABLESPACE pg_default;

create index IF not exists dev_sprint_tasks_issue_idx on public.dev_sprint_tasks using btree (issue) TABLESPACE pg_default;

create index IF not exists dev_sprint_tasks_column_id_idx on public.dev_sprint_tasks using btree (column_id) TABLESPACE pg_default;

create index IF not exists dev_sprint_tasks_sprint_id_idx on public.dev_sprint_tasks using btree (sprint_id) TABLESPACE pg_default;

create index IF not exists idx_dev_sprint_tasks_column on public.dev_sprint_tasks using btree (column_id) TABLESPACE pg_default;

create or replace trigger trg_dev_sprint_tasks_updated_at BEFORE
update on dev_sprint_tasks for EACH row
execute FUNCTION set_updated_at ();

create or replace trigger trg_sync_sprint_task_project_from_issue BEFORE INSERT
or
update OF issue,
project on dev_sprint_tasks for EACH row
execute FUNCTION sync_sprint_task_project_from_issue ();

create or replace trigger update_dev_sprint_tasks_modtime BEFORE
update on dev_sprint_tasks for EACH row
execute FUNCTION update_modified_column ();
create table if not exists public.estoque_items (
  id uuid not null default gen_random_uuid (),
  name text not null,
  category text not null default 'Geral'::text,
  qty integer not null default 0,
  min_qty integer not null default 0,
  status text not null default 'Normal'::text,
  price text null default 'R$ 0,00'::text,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint estoque_items_pkey primary key (id)
) TABLESPACE pg_default;
create table if not exists public.exames_pedidos (
  id uuid not null default gen_random_uuid (),
  patient text not null,
  exam text not null,
  date text not null,
  lab text null default ''::text,
  status text not null default 'Aguardando Coleta'::text,
  result text null default '-'::text,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint exames_pedidos_pkey primary key (id)
) TABLESPACE pg_default;
create table if not exists public.finance_entries (
  id text not null default (gen_random_uuid ())::text,
  tenant_id uuid null,
  description character varying(255) not null,
  category character varying(100) null,
  status character varying(50) null default 'A Vencer'::character varying,
  value numeric(15, 2) not null default 0,
  type character varying(20) not null,
  date character varying(20) null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint finance_entries_pkey primary key (id),
  constraint finance_entries_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_finance_entries_tenant on public.finance_entries using btree (tenant_id, type, status) TABLESPACE pg_default;
create table if not exists public.financial_goals (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  squad_name character varying(255) not null,
  monthly_goal numeric(15, 2) not null,
  commission_percent numeric(5, 2) null default 0.00,
  bonus_superador numeric(15, 2) null default 0.00,
  valid_month date not null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint financial_goals_pkey primary key (id),
  constraint financial_goals_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_financial_goals_lookup on public.financial_goals using btree (tenant_id, valid_month desc) TABLESPACE pg_default;
create table if not exists public.interactions (
  id uuid not null default extensions.uuid_generate_v4 (),
  lead_id uuid not null,
  user_id uuid null,
  type character varying(50) not null,
  description text not null,
  duration_seconds integer null,
  outcome character varying(100) null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint interactions_pkey primary key (id),
  constraint interactions_lead_id_fkey foreign KEY (lead_id) references leads (id) on delete CASCADE,
  constraint interactions_user_id_fkey foreign KEY (user_id) references users (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_interactions_chronology on public.interactions using btree (lead_id, created_at desc) TABLESPACE pg_default;
create table if not exists public.lead_activities (
  id text not null default (gen_random_uuid ())::text,
  tenant_id uuid null,
  lead_id text not null,
  type character varying(50) not null,
  title character varying(255) not null,
  description text null,
  date character varying(100) null,
  seller character varying(255) null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint lead_activities_pkey primary key (id),
  constraint lead_activities_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_lead_activities_lead on public.lead_activities using btree (lead_id, created_at desc) TABLESPACE pg_default;
create table if not exists public.lead_custom_values (
  lead_id uuid not null,
  custom_field_id uuid not null,
  value text null,
  constraint lead_custom_values_pkey primary key (lead_id, custom_field_id),
  constraint lead_custom_values_custom_field_id_fkey foreign KEY (custom_field_id) references custom_fields (id) on delete CASCADE,
  constraint lead_custom_values_lead_id_fkey foreign KEY (lead_id) references leads (id) on delete CASCADE
) TABLESPACE pg_default;
create table if not exists public.tags (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  name character varying(100) not null,
  color character varying(20) null default '#6B7280'::character varying,
  constraint tags_pkey primary key (id),
  constraint tags_tenant_id_name_key unique (tenant_id, name),
  constraint tags_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;
create table if not exists public.lead_tags (
  lead_id uuid not null,
  tag_id uuid not null,
  constraint lead_tags_pkey primary key (lead_id, tag_id),
  constraint lead_tags_lead_id_fkey foreign KEY (lead_id) references leads (id) on delete CASCADE,
  constraint lead_tags_tag_id_fkey foreign KEY (tag_id) references tags (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_lead_tags_tag_id on public.lead_tags using btree (tag_id) TABLESPACE pg_default;
create table if not exists public.leads (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  pipeline_id uuid null,
  stage_id uuid null,
  name character varying(255) not null,
  company character varying(255) null,
  email character varying(255) null,
  phone character varying(50) null,
  mobile_wa character varying(50) null,
  document_id character varying(50) null,
  value numeric(15, 2) null default 0.00,
  status character varying(50) null default 'Open'::character varying,
  priority character varying(50) null default 'Medium'::character varying,
  temperature character varying(50) null default 'Warm'::character varying,
  score_ia integer null,
  seller_id uuid null,
  sdr_ia_id uuid null,
  source character varying(100) null,
  loss_reason character varying(255) null,
  last_contact_at timestamp with time zone null,
  next_action_at timestamp with time zone null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  deleted_at timestamp with time zone null,
  "iaSummary" text null default ''::text,
  lead_interesse_cliente text null default ''::text,
  "timeIdle" integer null default 0,
  "customFields" jsonb null default '{}'::jsonb,
  "tenantName" text null default ''::text,
  "pipelineId" text null default 'comercial'::text,
  "stageId" text null default ''::text,
  "scoreIA" integer null default 50,
  constraint leads_pkey primary key (id),
  constraint leads_pipeline_id_fkey foreign KEY (pipeline_id) references pipelines (id) on delete set null,
  constraint leads_sdr_ia_id_fkey foreign KEY (sdr_ia_id) references users (id) on delete set null,
  constraint leads_seller_id_fkey foreign KEY (seller_id) references users (id) on delete set null,
  constraint leads_stage_id_fkey foreign KEY (stage_id) references stages (id) on delete set null,
  constraint leads_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone null;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS status character varying(50) null default 'Open'::character varying;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS pipeline_id uuid null;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS stage_id uuid null;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS priority character varying(50) null default 'Medium'::character varying;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS temperature character varying(50) null default 'Warm'::character varying;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS score_ia integer null;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS seller_id uuid null;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sdr_ia_id uuid null;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS source character varying(100) null;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS loss_reason character varying(255) null;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS last_contact_at timestamp with time zone null;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS next_action_at timestamp with time zone null;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone null default CURRENT_TIMESTAMP;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS "iaSummary" text null default ''::text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_interesse_cliente text null default ''::text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS "timeIdle" integer null default 0;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS "customFields" jsonb null default '{}'::jsonb;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS "tenantName" text null default ''::text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS "pipelineId" text null default 'comercial'::text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS "stageId" text null default ''::text;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS "scoreIA" integer null default 50;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS document_id character varying(50) null;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS company character varying(255) null;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS mobile_wa character varying(50) null;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS value numeric(15, 2) null default 0.00;

create index IF not exists idx_leads_composite_kanban on public.leads using btree (tenant_id, pipeline_id, stage_id) TABLESPACE pg_default
where
  (deleted_at is null);

create index IF not exists idx_leads_primary_filters on public.leads using btree (tenant_id, status, created_at desc) TABLESPACE pg_default
where
  (deleted_at is null);

create index IF not exists idx_leads_sdr_ia_lookup on public.leads using btree (sdr_ia_id, tenant_id) TABLESPACE pg_default
where
  (
    (deleted_at is null)
    and ((status)::text = 'Open'::text)
  );

create index IF not exists idx_leads_seller_lookup on public.leads using btree (seller_id, tenant_id) TABLESPACE pg_default
where
  (
    (deleted_at is null)
    and ((status)::text = 'Open'::text)
  );

create index IF not exists idx_leads_document_search on public.leads using btree (tenant_id, document_id) TABLESPACE pg_default
where
  (
    (deleted_at is null)
    and (document_id is not null)
  );

create or replace trigger update_leads_modtime BEFORE
update on leads for EACH row
execute FUNCTION update_modified_column ();
create table if not exists public.marketing_automations (
  id text not null default (gen_random_uuid ())::text,
  tenant_id uuid null,
  created_at timestamp with time zone null default now(),
  constraint marketing_automations_pkey primary key (id),
  constraint marketing_automations_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;
create table if not exists public.marketing_campaigns (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  name character varying(255) not null,
  platform character varying(50) not null,
  status character varying(50) null default 'Draft'::character varying,
  budget numeric(15, 2) null default 0.00,
  amount_spent numeric(15, 2) null default 0.00,
  leads_generated integer null default 0,
  cpl numeric(10, 2) null default 0.00,
  roi_percent numeric(5, 2) null default 0.00,
  start_date date null,
  end_date date null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  deleted_at timestamp with time zone null,
  constraint marketing_campaigns_pkey primary key (id),
  constraint marketing_campaigns_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_marketing_campaigns_lookup on public.marketing_campaigns using btree (tenant_id, status) TABLESPACE pg_default
where
  (deleted_at is null);

create or replace trigger update_marketing_campaigns_modtime BEFORE
update on marketing_campaigns for EACH row
execute FUNCTION update_modified_column ();
create table if not exists public.marketing_content (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  title character varying(255) not null,
  description text null,
  platform character varying(50) null default 'Instagram'::character varying,
  status character varying(50) null default 'Ideation'::character varying,
  author_id uuid null,
  publish_date timestamp with time zone null,
  likes integer null default 0,
  comments integer null default 0,
  shares integer null default 0,
  views integer null default 0,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  deleted_at timestamp with time zone null,
  constraint marketing_content_pkey primary key (id),
  constraint marketing_content_author_id_fkey foreign KEY (author_id) references users (id) on delete set null,
  constraint marketing_content_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_marketing_content_status on public.marketing_content using btree (tenant_id, status) TABLESPACE pg_default
where
  (deleted_at is null);

create or replace trigger update_marketing_content_modtime BEFORE
update on marketing_content for EACH row
execute FUNCTION update_modified_column ();
create table if not exists public.marketing_landing_pages (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  name character varying(255) not null,
  url character varying(512) null,
  status character varying(50) null default 'Draft'::character varying,
  views integer null default 0,
  conversions integer null default 0,
  conversion_rate numeric(5, 2) null default 0.00,
  meta_pixel_id character varying(100) null,
  google_analytics_id character varying(100) null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  deleted_at timestamp with time zone null,
  constraint marketing_landing_pages_pkey primary key (id),
  constraint marketing_landing_pages_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_marketing_landing_pages_lookup on public.marketing_landing_pages using btree (tenant_id, status) TABLESPACE pg_default
where
  (deleted_at is null);

create or replace trigger update_marketing_landing_pages_modtime BEFORE
update on marketing_landing_pages for EACH row
execute FUNCTION update_modified_column ();
create table if not exists public.messages (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  lead_id uuid null,
  whatsapp_instance_id uuid null,
  channel character varying(50) null default 'whatsapp'::character varying,
  direction character varying(20) not null,
  content text not null,
  message_type character varying(50) null default 'text'::character varying,
  media_url character varying(2048) null,
  status character varying(50) null default 'sent'::character varying,
  external_id character varying(255) null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint messages_pkey primary key (id),
  constraint messages_lead_id_fkey foreign KEY (lead_id) references leads (id) on delete set null,
  constraint messages_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE,
  constraint messages_whatsapp_instance_id_fkey foreign KEY (whatsapp_instance_id) references whatsapp_instances (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_messages_lead_feed on public.messages using btree (lead_id, created_at desc) TABLESPACE pg_default;

create index IF not exists idx_messages_external_sync on public.messages using btree (tenant_id, external_id) TABLESPACE pg_default
where
  (external_id is not null);

create index IF not exists idx_messages_instance_lookup on public.messages using btree (whatsapp_instance_id, created_at desc) TABLESPACE pg_default;
create table if not exists public.notifications (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  user_id uuid null,
  title character varying(255) not null,
  description text null,
  type character varying(50) null default 'info'::character varying,
  link_url character varying(1024) null,
  is_read boolean null default false,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint notifications_pkey primary key (id),
  constraint notifications_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE,
  constraint notifications_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_notifications_user_unread on public.notifications using btree (user_id, is_read, created_at desc) TABLESPACE pg_default;
create table if not exists public.pipelines (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  name character varying(100) not null,
  type character varying(50) null default 'comercial'::character varying,
  is_default boolean null default false,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint pipelines_pkey primary key (id),
  constraint pipelines_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;
create table if not exists public.products (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  name character varying(255) not null,
  sku character varying(100) null,
  description text null,
  price numeric(15, 2) null default 0.00,
  currency character varying(10) null default 'BRL'::character varying,
  active boolean null default true,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  deleted_at timestamp with time zone null,
  constraint products_pkey primary key (id),
  constraint products_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create or replace trigger update_products_modtime BEFORE
update on products for EACH row
execute FUNCTION update_modified_column ();
create table if not exists public.proposals (
  id text not null default (gen_random_uuid ())::text,
  tenant_id uuid null,
  lead_id uuid null,
  titulo character varying(255) not null,
  valor numeric(15, 2) null default 0.00,
  status character varying(50) null default 'Enviada'::character varying,
  validade date null,
  link_pdf character varying(1024) null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint proposals_pkey primary key (id),
  constraint proposals_lead_id_fkey foreign KEY (lead_id) references leads (id) on delete set null,
  constraint proposals_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;
create table if not exists public.squads (
  id text not null default (gen_random_uuid ())::text,
  tenant_id uuid null,
  nome character varying(255) not null,
  meta numeric(15, 2) null default 0,
  orcamento_mensal numeric(15, 2) null default 0,
  faturamento_alcancado numeric(15, 2) null default 0,
  sdr_count integer null default 0,
  closers_count integer null default 0,
  foco_comercial text null,
  membros text[] null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  departamento text null default 'Geral'::text,
  leader text null default ''::text,
  cor text null default '#6366f1'::text,
  logo text null default ''::text,
  membros_funcoes jsonb null default '{}'::jsonb,
  clientes text[] null default '{}'::text[],
  constraint squads_pkey primary key (id),
  constraint squads_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_squads_tenant on public.squads using btree (tenant_id) TABLESPACE pg_default;
create table if not exists public.squad_metas (
  id text not null default (gen_random_uuid ())::text,
  squad_id text null,
  tenant_id uuid null,
  created_at timestamp with time zone null default now(),
  constraint squad_metas_pkey primary key (id),
  constraint squad_metas_squad_id_fkey foreign KEY (squad_id) references squads (id) on delete CASCADE,
  constraint squad_metas_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;
create table if not exists public.stages (
  id uuid not null default extensions.uuid_generate_v4 (),
  pipeline_id uuid not null,
  name character varying(100) not null,
  "order" integer not null,
  color character varying(20) null default '#3B82F6'::character varying,
  require_reason_on_loss boolean null default false,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint stages_pkey primary key (id),
  constraint stages_pipeline_id_order_key unique (pipeline_id, "order"),
  constraint stages_pipeline_id_fkey foreign KEY (pipeline_id) references pipelines (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_stages_pipeline_order on public.stages using btree (pipeline_id, "order") TABLESPACE pg_default;
create table if not exists public.turmas (
  id text not null default (gen_random_uuid ())::text,
  tenant_id uuid null,
  nome character varying(255) not null,
  curso character varying(255) not null,
  status character varying(50) null default 'Em Andamento'::character varying,
  data_inicio date null,
  data_fim date null,
  professor character varying(255) null,
  vagas integer null default 0,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint turmas_pkey primary key (id),
  constraint turmas_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;
create table if not exists public.students (
  id text not null default (gen_random_uuid ())::text,
  tenant_id uuid null,
  turma_id text null,
  nome character varying(255) not null,
  email character varying(255) null,
  telefone character varying(50) null,
  status character varying(50) null default 'Ativo'::character varying,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint students_pkey primary key (id),
  constraint students_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE,
  constraint students_turma_id_fkey foreign KEY (turma_id) references turmas (id) on delete set null
) TABLESPACE pg_default;
create table if not exists public.tasks (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  lead_id uuid null,
  assigned_to uuid null,
  creator_id uuid null,
  title character varying(255) not null,
  description text null,
  status character varying(50) null default 'To Do'::character varying,
  priority character varying(50) null default 'Medium'::character varying,
  due_date timestamp with time zone null,
  completed_at timestamp with time zone null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  deleted_at timestamp with time zone null,
  constraint tasks_pkey primary key (id),
  constraint tasks_assigned_to_fkey foreign KEY (assigned_to) references users (id) on delete set null,
  constraint tasks_creator_id_fkey foreign KEY (creator_id) references users (id) on delete set null,
  constraint tasks_lead_id_fkey foreign KEY (lead_id) references leads (id) on delete set null,
  constraint tasks_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_tasks_pending_schedule on public.tasks using btree (assigned_to, status, due_date) TABLESPACE pg_default
where
  (
    (deleted_at is null)
    and ((status)::text <> 'Done'::text)
  );

create or replace trigger update_tasks_modtime BEFORE
update on tasks for EACH row
execute FUNCTION update_modified_column ();
create table if not exists public.tenants (
  id uuid not null default extensions.uuid_generate_v4 (),
  name character varying(255) not null,
  niche character varying(100) not null,
  plan character varying(50) null default 'Standard'::character varying,
  status character varying(50) null default 'Active'::character varying,
  timezone character varying(100) null default 'America/Sao_Paulo'::character varying,
  webhook_url character varying(2048) null,
  evolution_api_url character varying(2048) null,
  primary_color character varying(50) null default '#7C3AED'::character varying,
  module_crm boolean null default true,
  module_sdr_ia boolean null default false,
  module_adv_dashboard boolean null default false,
  module_education boolean null default false,
  module_finance boolean null default false,
  module_tasks boolean null default false,
  module_marketing boolean null default false,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  deleted_at timestamp with time zone null,
  modules jsonb null,
  constraint tenants_pkey primary key (id)
) TABLESPACE pg_default;

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone null;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS modules jsonb null;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone null default CURRENT_TIMESTAMP;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS webhook_url character varying(2048) null;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS evolution_api_url character varying(2048) null;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS primary_color character varying(50) null default '#7C3AED'::character varying;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS module_crm boolean null default true;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS module_sdr_ia boolean null default false;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS module_adv_dashboard boolean null default false;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS module_education boolean null default false;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS module_finance boolean null default false;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS module_tasks boolean null default false;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS module_marketing boolean null default false;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS status character varying(50) null default 'Active'::character varying;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS niche character varying(100) null default ''::character varying;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS plan character varying(50) null default 'Standard'::character varying;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS timezone character varying(100) null default 'America/Sao_Paulo'::character varying;

create index IF not exists idx_tenants_status_active on public.tenants using btree (status) TABLESPACE pg_default
where
  (deleted_at is null);
create table if not exists public.users (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  default_whatsapp_instance_id uuid null,
  name character varying(255) not null,
  email character varying(255) not null,
  password_hash character varying(255) not null,
  role character varying(100) not null default 'Agente'::character varying,
  is_master boolean null default false,
  avatar_url character varying(1024) null,
  active boolean null default true,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  last_login timestamp with time zone null,
  deleted_at timestamp with time zone null,
  constraint users_pkey primary key (id),
  constraint users_tenant_id_email_key unique (tenant_id, email),
  constraint users_default_whatsapp_instance_id_fkey foreign KEY (default_whatsapp_instance_id) references whatsapp_instances (id) on delete set null,
  constraint users_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS deleted_at timestamp with time zone null;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS active boolean null default true;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_login timestamp with time zone null;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_master boolean null default false;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url character varying(1024) null;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone null default CURRENT_TIMESTAMP;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS default_whatsapp_instance_id uuid null;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS role character varying(100) null default 'Agente'::character varying;

create index IF not exists idx_users_active_lookup on public.users using btree (tenant_id, email) TABLESPACE pg_default
where
  (
    (deleted_at is null)
    and (active = true)
  );

create or replace trigger update_users_modtime BEFORE
update on users for EACH row
execute FUNCTION update_modified_column ();
create table if not exists public.webhooks (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  event character varying(100) not null,
  endpoint_url character varying(2048) not null,
  active boolean null default true,
  secret_key character varying(255) null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint webhooks_pkey primary key (id),
  constraint webhooks_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_webhooks_active_triggers on public.webhooks using btree (tenant_id, event) TABLESPACE pg_default
where
  (active = true);
create table if not exists public.webhook_logs (
  id uuid not null default extensions.uuid_generate_v4 (),
  webhook_id uuid null,
  tenant_id uuid not null,
  status_code integer null,
  payload text null,
  response text null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint webhook_logs_pkey primary key (id),
  constraint webhook_logs_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE,
  constraint webhook_logs_webhook_id_fkey foreign KEY (webhook_id) references webhooks (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_webhook_logs_lookup on public.webhook_logs using btree (tenant_id, created_at desc) TABLESPACE pg_default;
  create table if not exists public.whatsapp_instances (
  id uuid not null default extensions.uuid_generate_v4 (),
  tenant_id uuid not null,
  name character varying(100) not null,
  phone_number character varying(50) null,
  status character varying(50) null default 'disconnected'::character varying,
  evolution_api_instance_name character varying(255) not null,
  evolution_api_token character varying(255) null,
  is_default boolean null default false,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  deleted_at timestamp with time zone null,
  constraint whatsapp_instances_pkey primary key (id),
  constraint whatsapp_instances_tenant_id_evolution_api_instance_name_key unique (tenant_id, evolution_api_instance_name),
  constraint whatsapp_instances_tenant_id_fkey foreign KEY (tenant_id) references tenants (id) on delete CASCADE
) TABLESPACE pg_default;

create or replace trigger update_whatsapp_instances_modtime BEFORE
update on whatsapp_instances for EACH row
execute FUNCTION update_modified_column ();