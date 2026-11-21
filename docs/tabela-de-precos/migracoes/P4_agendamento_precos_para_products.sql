-- P4 — Preço da hora de reserva (agendamento) em public.products (PROPOSTO, NÃO APLICADO)
-- Cria, para cada empresa com agendamento_config, 2 produtos tipo 'Reserva' (hora em dia útil / hora em fim de semana)
-- com o preço que hoje está na configuração. Não apaga nem altera agendamento_config. Pode rodar de novo (não duplica).
-- O código novo já cria essas linhas sozinho ao salvar a configuração; este script só adianta isso para quem não salvou ainda.
begin;

insert into public.products (tenant_id, name, type, category, price, cost, externo_sistema, externo_id, type_attributes)
select c.tenant_id, v.nome, 'Reserva', 'Agendamento', v.preco, 0, 'agendamento_config', c.tenant_id::text || ':' || v.sufixo, '{"unidade":"h"}'::jsonb
  from public.agendamento_config c
 cross join lateral (values
   ('dia_util',    'Reserva — hora em dia útil',      coalesce(c.preco_dia_util, 0)),
   ('fim_semana',  'Reserva — hora em fim de semana', coalesce(c.preco_fim_semana, 0))) as v(sufixo, nome, preco)
 where not exists (select 1 from public.products p
                    where p.tenant_id = c.tenant_id and p.externo_sistema = 'agendamento_config' and p.externo_id = c.tenant_id::text || ':' || v.sufixo);

comment on column public.agendamento_config.preco_dia_util   is 'LEGADO: o preço vive em public.products (externo_sistema=agendamento_config, tipo Reserva). Só vale se não houver a linha lá.';
comment on column public.agendamento_config.preco_fim_semana is 'LEGADO: o preço vive em public.products (externo_sistema=agendamento_config, tipo Reserva). Só vale se não houver a linha lá.';

commit;

-- Conferência: deve haver 2 linhas por empresa
select (select count(*) from public.agendamento_config) as empresas,
       (select count(*) from public.products where externo_sistema = 'agendamento_config') as produtos_reserva;

-- DESFAZER:
--   delete from public.products where externo_sistema = 'agendamento_config' and type = 'Reserva';
--   comment on column public.agendamento_config.preco_dia_util is null;
--   comment on column public.agendamento_config.preco_fim_semana is null;
