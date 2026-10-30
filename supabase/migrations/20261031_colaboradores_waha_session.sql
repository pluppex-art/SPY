-- Liga cada colaborador à sessão WAHA do Agente Secreto dele (status, QR de reconexão e alerta de queda).
alter table public.colaboradores add column if not exists waha_session text;
comment on column public.colaboradores.waha_session is 'Nome da sessão WAHA do Agente Secreto deste colaborador (usado para status, QR de reconexão e alerta de queda).';

-- Negocio Fora da Curva (já aplicado em produção em 2026-10-30)
update public.colaboradores set waha_session = 'agente-secreto-Romulo' where id = '1790778055322' and tenant_id = '85917b01-b7c6-4ca6-95cb-6afe8393f72f';
update public.colaboradores set waha_session = 'agente-secreto-Jakeline' where id = 'kommo-85917b01-15644136' and tenant_id = '85917b01-b7c6-4ca6-95cb-6afe8393f72f';
update public.colaboradores set waha_session = 'agente-secreto-Thaina' where id = 'kommo-85917b01-15927512' and tenant_id = '85917b01-b7c6-4ca6-95cb-6afe8393f72f';
