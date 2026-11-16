/**
 * Radar — retrato do dia de UMA empresa: quantos negócios esfriaram (por gravidade) e quantos estão esquentando
 * (por nível). Função pura, sem rede: é a regra única usada pela tela do Radar (limiares) e pela rotina diária
 * do servidor, que grava o resultado em lead_risk_snapshots. Testada em tests/chatbot/radar-retrato.test.ts.
 */
import { isLeadOpen } from "./leadStatus.js";
import { calcularBoas } from "./radarBoas.js";

/** Dias parado a partir dos quais um negócio é "Crítico" / "Alto"; abaixo disso (já esfriou ≥ 1 dia) é "Atenção". */
export const CRITICO_DIAS = 14;
export const ALTO_DIAS = 7;

export type Risco = "critico" | "alto" | "atencao";

export function riscoDe(idle: number): Risco {
  return idle >= CRITICO_DIAS ? "critico" : idle >= ALTO_DIAS ? "alto" : "atencao";
}

/** Colunas de lead_risk_snapshots (sem tenant_id e snapshot_date). */
export interface RetratoDia {
  critico_count: number;
  alto_count: number;
  atencao_count: number;
  total_count: number;
  valor_em_risco: number;
  chamas_count: number;
  quente_count: number;
  esquentando_count: number;
  total_boas_count: number;
  valor_oportunidades: number;
  fechados_count: number;
}

export function calcularRetrato(leads: any[], valorDe: (v: unknown) => number, agora: number = Date.now()): RetratoDia {
  const parados = (leads || [])
    .filter((l) => !l.deleted_at && isLeadOpen(l.status))
    .map((l) => ({ idle: Math.max(0, Number(l.timeIdle) || 0), value: valorDe(l.value) }))
    .filter((r) => r.idle >= 1);

  const boas = calcularBoas(leads, valorDe, agora);
  const conta = (r: Risco) => parados.filter((p) => riscoDe(p.idle) === r).length;

  return {
    critico_count: conta("critico"),
    alto_count: conta("alto"),
    atencao_count: conta("atencao"),
    total_count: parados.length,
    valor_em_risco: parados.reduce((s, p) => s + p.value, 0),
    chamas_count: boas.chamas.length,
    quente_count: boas.quentes.length,
    esquentando_count: boas.esquentando.length,
    total_boas_count: boas.todos.length,
    valor_oportunidades: boas.valorOportunidades,
    fechados_count: boas.fechados.length,
  };
}
