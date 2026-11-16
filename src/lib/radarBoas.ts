/**
 * Radar — o lado BOM: o que está esquentando e o que já deu certo. Função pura (sem rede), testada em
 * tests/chatbot/radar-boas.test.ts. O lado ruim (negócios que esfriaram) continua em pages/crm/Radar.tsx.
 *
 * Só usa campos que existem no lead: temperature, scoreIA, timeIdle (dias desde a última atualização),
 * status e updated_at. Não existe "data de fechamento" no lead, então "fechado recentemente" usa a
 * última atualização de um lead já Fechado.
 */
import { isLeadOpen } from "./leadStatus";

export const SCORE_QUENTE = 70;
export const JANELA_FECHADOS_DIAS = 30;

export type MotivoBom = "quente" | "esquentando";

export interface LeadBom {
  l: any;
  motivo: MotivoBom;
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
  quentes: LeadBom[];
  esquentando: LeadBom[];
  fechados: FechadoRecente[];
  valorQuentes: number;
  valorFechados: number;
}

const scoreDe = (l: any) => Number(l?.scoreIA ?? l?.score_ia) || 0;
const idleDe = (l: any) => Math.max(0, Number(l?.timeIdle) || 0);

/** Quente = temperatura "quente" ou nota da IA alta. */
export const ehQuente = (l: any) => l?.temperature === "quente" || scoreDe(l) >= SCORE_QUENTE;

export function calcularBoas(leads: any[], valorDe: (v: unknown) => number, agora: number = Date.now()): RadarBoas {
  const abertos = (leads || []).filter((l) => !l.deleted_at && isLeadOpen(l.status));

  const montar = (l: any, motivo: MotivoBom): LeadBom => ({ l, motivo, score: scoreDe(l), idle: idleDe(l), value: valorDe(l.value) });

  const quentes = abertos
    .filter(ehQuente)
    .map((l) => montar(l, "quente"))
    .sort((a, b) => b.score - a.score || b.value - a.value);

  // Esquentando: mexido nas últimas 24 h (hoje ou ontem) e ainda não é quente.
  const esquentando = abertos
    .filter((l) => !ehQuente(l) && idleDe(l) <= 1)
    .map((l) => montar(l, "esquentando"))
    .sort((a, b) => b.value - a.value || b.score - a.score);

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
    quentes,
    esquentando,
    fechados,
    valorQuentes: quentes.reduce((s, r) => s + r.value, 0),
    valorFechados: fechados.reduce((s, r) => s + r.value, 0),
  };
}
