/**
 * Radar — o lado BOM: o que está esquentando e o que já deu certo. Função pura (sem rede), testada em
 * tests/chatbot/radar-boas.test.ts. O lado ruim (negócios que esfriaram) continua em pages/crm/Radar.tsx;
 * os três níveis daqui espelham Crítico / Alto / Atenção de lá.
 *
 * Só usa campos que existem no lead: temperature, scoreIA, timeIdle (dias desde a última atualização),
 * status e updated_at. Não existe "data de fechamento" no lead, então "fechado recentemente" usa a
 * última atualização de um lead já Fechado.
 */
import { isLeadOpen } from "./leadStatus";

export const SCORE_CHAMAS = 85;
export const SCORE_QUENTE = 70;
export const JANELA_FECHADOS_DIAS = 30;

export type NivelBom = "chamas" | "quente" | "esquentando";
export const NIVEIS_BONS: NivelBom[] = ["chamas", "quente", "esquentando"];

export interface LeadBom {
  l: any;
  nivel: NivelBom;
  score: number;
  idle: number;
  value: number;
}

export interface FechadoRecente {
  l: any;
  value: number;
  quando: string;
}

export interface RadarBoas {
  chamas: LeadBom[];
  quentes: LeadBom[];
  esquentando: LeadBom[];
  /** Os três níveis juntos, do mais quente para o menos. */
  todos: LeadBom[];
  fechados: FechadoRecente[];
  /** Valor em jogo em todas as oportunidades (os três níveis). */
  valorOportunidades: number;
  valorFechados: number;
}

const scoreDe = (l: any) => Number(l?.scoreIA ?? l?.score_ia) || 0;
const idleDe = (l: any) => Math.max(0, Number(l?.timeIdle) || 0);

/** Quente = temperatura "quente" ou nota da IA alta. */
export const ehQuente = (l: any) => l?.temperature === "quente" || scoreDe(l) >= SCORE_QUENTE;

/** Nível de um lead em aberto, ou null se não há nada de bom nele agora. */
export function nivelDe(l: any): NivelBom | null {
  if (scoreDe(l) >= SCORE_CHAMAS) return "chamas";
  if (ehQuente(l)) return "quente";
  if (idleDe(l) <= 1) return "esquentando"; // mexido nas últimas 24 h
  return null;
}

export function calcularBoas(leads: any[], valorDe: (v: unknown) => number, agora: number = Date.now()): RadarBoas {
  const abertos = (leads || []).filter((l) => !l.deleted_at && isLeadOpen(l.status));

  const porNivel = (n: NivelBom): LeadBom[] =>
    abertos
      .filter((l) => nivelDe(l) === n)
      .map((l) => ({ l, nivel: n, score: scoreDe(l), idle: idleDe(l), value: valorDe(l.value) }))
      .sort(n === "esquentando" ? (a, b) => b.value - a.value || b.score - a.score : (a, b) => b.score - a.score || b.value - a.value);

  const chamas = porNivel("chamas");
  const quentes = porNivel("quente");
  const esquentando = porNivel("esquentando");
  const todos = [...chamas, ...quentes, ...esquentando];

  const corte = agora - JANELA_FECHADOS_DIAS * 86400000;
  const fechados = (leads || [])
    .filter((l) => !l.deleted_at && l.status === "Fechado")
    .map((l) => ({ l, value: valorDe(l.value), quando: String(l.updated_at || l.created_at || "") }))
    .filter((f) => {
      const t = new Date(f.quando).getTime();
      return Number.isFinite(t) && t >= corte;
    })
    .sort((a, b) => b.quando.localeCompare(a.quando));

  return {
    chamas,
    quentes,
    esquentando,
    todos,
    fechados,
    valorOportunidades: todos.reduce((s, r) => s + r.value, 0),
    valorFechados: fechados.reduce((s, r) => s + r.value, 0),
  };
}
