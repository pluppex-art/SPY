-- Cada número de WhatsApp (instância) pode ser o "WhatsApp" de uma IA: SDR, CS ou Chatbot.
-- A Mensageria usa isso para filtrar as conversas por IA. NULL = número comum, sem IA.
alter table public.whatsapp_instances add column if not exists ia_agent text;
alter table public.whatsapp_instances drop constraint if exists whatsapp_instances_ia_agent_check;
alter table public.whatsapp_instances add constraint whatsapp_instances_ia_agent_check
  check (ia_agent is null or ia_agent in ('sdr','cs','chatbot'));
comment on column public.whatsapp_instances.ia_agent is 'IA que atende este número de WhatsApp (sdr | cs | chatbot). NULL = número comum, sem IA.';
