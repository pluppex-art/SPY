-- Radar: o lado bom (negócios em chamas / quentes / esquentando) passa a ter histórico diário, igual ao lado
-- ruim. Só acrescenta colunas ao retrato diário que já existe (lead_risk_snapshots); nada é apagado ou alterado.
alter table public.lead_risk_snapshots
  add column if not exists chamas_count integer not null default 0,
  add column if not exists quente_count integer not null default 0,
  add column if not exists esquentando_count integer not null default 0,
  add column if not exists total_boas_count integer not null default 0,
  add column if not exists valor_oportunidades numeric not null default 0,
  add column if not exists fechados_count integer not null default 0;
