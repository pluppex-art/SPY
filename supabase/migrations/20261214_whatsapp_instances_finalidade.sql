-- Cada colaborador pode ter duas sessões de WhatsApp: a de vendas (Agente Secreto, padrão) e a interna (Agente Secreto Interno, lê os grupos da equipe).
-- Só adiciona uma coluna com padrão 'vendas': as sessões existentes continuam sendo de vendas.
alter table public.whatsapp_instances add column if not exists finalidade text not null default 'vendas';
alter table public.whatsapp_instances drop constraint if exists whatsapp_instances_finalidade_check;
alter table public.whatsapp_instances add constraint whatsapp_instances_finalidade_check check (finalidade in ('vendas','interno'));
