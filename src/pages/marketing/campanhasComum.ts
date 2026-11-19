/** Tipos e formatadores compartilhados pela lista de campanhas e pelo detalhe da campanha. */
import type { BadgeProps } from "../../components/ui/badge";

export interface Campanha {
  id: string; nome: string; status: string; statusRotulo: string; objetivo: string; objetivoRotulo: string;
  orcamento: { tipo: "diario" | "total" | null; valor: number };
  gasto: number; impressoes: number; alcance: number; cliques: number; ctr: number; cpc: number; cpm: number;
  resultados: number; resultadoRotulo: string; custoPorResultado: number; inicio: string | null; fim: string | null;
  campanhaId?: string; campanhaNome?: string; conjuntoId?: string; conjuntoNome?: string; otimizacao?: string; miniatura?: string | null;
  compra?: string; lance?: string; criadaEm?: string | null;
}
export type Nivel = "campaign" | "adset" | "ad";

export const grupoStatus = (s: string): "ativas" | "pausadas" | "outras" => (s === "ACTIVE" ? "ativas" : /PAUSED/.test(s) ? "pausadas" : "outras");
export const varianteStatus = (s: string): NonNullable<BadgeProps["variant"]> => (s === "ACTIVE" ? "success" : /PAUSED/.test(s) ? "neutral" : /ISSUES|DISAPPROVED|PENDING_BILLING/.test(s) ? "destructive" : "warning");

export const formatadores = (moeda: string) => ({
  brl: (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: moeda }),
  num: (v: number) => v.toLocaleString("pt-BR"),
  pct: (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`,
});

/** Mesma regra do servidor: o UTM da campanha costuma ser o nome dela, escrito de forma simples. */
export const slugCampanha = (t: unknown) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** O lead veio desta campanha? Vale o ID da campanha ou o nome (igual ao utm_campaign, sem acento/maiúscula). */
export function leadDaCampanha(lead: { customFields?: Record<string, any> | null }, c: { id: string; nome: string }): boolean {
  const u = lead?.customFields?.utm_campaign;
  if (!u) return false;
  const t = String(u).trim();
  return t === c.id || (slugCampanha(t) !== "" && slugCampanha(t) === slugCampanha(c.nome));
}
