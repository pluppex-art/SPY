// Cálculos compartilhados entre as telas da Central de Receita (Mapa da
// Receita, Oportunidades, Vazamentos, Inteligência Aurora, Previsão &
// Decisão) — extraído pra não duplicar a mesma lógica (já usada em
// CentralReceita.tsx) em cada tela nova. Tudo aqui é derivado de dado real
// já carregado no DataContext (leads/contracts/proposals/proposalItems/
// products/clienteBase) — nenhuma métrica é inventada ou fixa por tenant.

import { parseCurrencyBR } from "../../lib/utils";
import { buildStagesForFunil } from "../../lib/funilStages";
import { FUNIS_DEFAULT } from "../settings/sections/crm/funisTypes";

export function diasDesde(iso?: string | null): number {
  if (!iso) return 0;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.round((Date.now() - t) / 86400000));
}

export function situacaoDe(l: any): { label: string; tone: "destructive" | "warning" | "success" | "neutral" } {
  const idle = Number(l.timeIdle) || 0;
  if (idle > 10) return { label: "Estagnada", tone: "destructive" };
  if (idle > 5) return { label: "Em risco", tone: "warning" };
  if ((l.scoreIA ?? 0) > 80) return { label: "Quente", tone: "success" };
  return { label: "Em andamento", tone: "neutral" };
}

export function recomendacaoDe(situacaoLabel: string): string {
  switch (situacaoLabel) {
    case "Estagnada": return "Intervenção imediata";
    case "Em risco": return "Retomar contato";
    case "Quente": return "Acelerar fechamento";
    default: return "Novo follow-up";
  }
}

/** Nome de cada etapa do funil comercial ativo, indexado por stageId real
 * (mesma convenção de usePipeline.ts/useDashboard.ts) — usado pra mostrar
 * "Negociação" em vez do stageId cru numa tabela. */
export function getComercialFunilStageNames(funis: any[]): Record<string, string> {
  const funisConfig: any[] = funis && funis.length > 0 ? funis : FUNIS_DEFAULT;
  const comercial =
    funisConfig.find((f: any) => f.tipo === "comercial" && f.ativo !== false) ??
    funisConfig.find((f: any) => f.tipo === "comercial") ??
    FUNIS_DEFAULT[0];
  const map: Record<string, string> = {};
  buildStagesForFunil(comercial).forEach((s) => { map[s.id] = s.name; });
  return map;
}

export interface ChannelRevenueRow { origem: string; leads: number; fechados: number; conversao: number; receita: number; ticketMedio: number; }
export function computeChannelRevenue(leads: any[]): ChannelRevenueRow[] {
  const map = new Map<string, { leads: number; fechados: number; receita: number }>();
  (leads || []).forEach((l: any) => {
    const origem = l.source || "Outros";
    const row = map.get(origem) || { leads: 0, fechados: 0, receita: 0 };
    row.leads += 1;
    if (l.status === "Fechado") { row.fechados += 1; row.receita += parseCurrencyBR(l.value); }
    map.set(origem, row);
  });
  return [...map.entries()]
    .map(([origem, r]) => ({
      origem, leads: r.leads, fechados: r.fechados,
      conversao: r.leads > 0 ? Math.round((r.fechados / r.leads) * 1000) / 10 : 0,
      receita: r.receita,
      ticketMedio: r.fechados > 0 ? r.receita / r.fechados : 0,
    }))
    .sort((a, b) => b.receita - a.receita);
}

export interface ProductRevenueRow { produto: string; receita: number; margem: number | null; pct: number; }
export function computeProductRevenue(proposals: any[], proposalItems: any[], products: any[]): ProductRevenueRow[] {
  const acceptedIds = new Set((proposals || []).filter((p: any) => p.status === "Aceita").map((p: any) => p.id));
  const productMap = new Map<string, number>();
  (proposalItems || []).forEach((it: any) => {
    if (!acceptedIds.has(it.proposal_id)) return;
    const nome = it.product_name || "Outros";
    const valor = (Number(it.preco_unitario) || 0) * (Number(it.quantidade) || 1);
    productMap.set(nome, (productMap.get(nome) || 0) + valor);
  });
  const total = [...productMap.values()].reduce((s, v) => s + v, 0) || 1;
  return [...productMap.entries()]
    .map(([produto, receita]) => {
      const prod = (products || []).find((p: any) => p.name === produto);
      const margemRaw = prod?.margin;
      const margem = margemRaw !== undefined && margemRaw !== null && margemRaw !== "" ? Number(margemRaw) : null;
      return { produto, receita, margem, pct: Math.round((receita / total) * 1000) / 10 };
    })
    .sort((a, b) => b.receita - a.receita)
    .slice(0, 8);
}

export interface SegmentRevenueRow { segmento: string; receita: number; pct: number; }
export function computeSegmentRevenue(contracts: any[], clienteBase: any[]): SegmentRevenueRow[] {
  const clienteByName = new Map<string, any>();
  (clienteBase || []).forEach((c: any) => { if (c.name) clienteByName.set(c.name, c); });
  const map = new Map<string, number>();
  (contracts || []).filter((c: any) => c.status !== "Cancelado" && c.status !== "Perdido").forEach((c: any) => {
    const cliente = clienteByName.get(c.client);
    const segmento = cliente?.industry || "Outros";
    map.set(segmento, (map.get(segmento) || 0) + parseCurrencyBR(c.mrr));
  });
  const total = [...map.values()].reduce((s, v) => s + v, 0) || 1;
  return [...map.entries()]
    .map(([segmento, receita]) => ({ segmento, receita, pct: Math.round((receita / total) * 1000) / 10 }))
    .sort((a, b) => b.receita - a.receita);
}

export interface VazamentoRow { motivo: string; valor: number; qtd: number; }
export function computeVazamentos(params: {
  contratosEmRisco: any[]; oportunidadesParadas: any[]; leadsQuentesParados: any[];
  propostasSemFollowUp: any[]; propostasSemFollowUpValue: number;
}): VazamentoRow[] {
  const { contratosEmRisco, oportunidadesParadas, leadsQuentesParados, propostasSemFollowUp, propostasSemFollowUpValue } = params;
  const churnValue = contratosEmRisco.reduce((s, c) => s + parseCurrencyBR(c.mrr), 0);
  const paradasValue = oportunidadesParadas.reduce((s: number, l: any) => s + parseCurrencyBR(l.value), 0);
  const quentesValue = leadsQuentesParados.reduce((s: number, l: any) => s + parseCurrencyBR(l.value), 0);
  return [
    { motivo: "Propostas sem follow-up", valor: propostasSemFollowUpValue, qtd: propostasSemFollowUp.length },
    { motivo: "Leads quentes sem contato", valor: quentesValue, qtd: leadsQuentesParados.length },
    { motivo: "Oportunidades paradas (+30d)", valor: paradasValue, qtd: oportunidadesParadas.length },
    { motivo: "Clientes com risco de churn", valor: churnValue, qtd: contratosEmRisco.length },
  ].filter((v) => v.qtd > 0).sort((a, b) => b.valor - a.valor);
}

export type AuroraAcaoIcon = "flame" | "sparkles" | "userx" | "filewarning";
export interface AuroraAcao { icon: AuroraAcaoIcon; titulo: string; subtitulo: string; valor: number; target: string; }

/** Mesma regra usada em CentralReceita (não é IA ao vivo — ranking por
 * impacto real em R$ a partir de sinais já presentes nos dados). */
export function buildAuroraAcoes(params: {
  leadsAbertos: any[]; oportunidadesRecuperaveis: any[]; recuperavelValue: number;
  contratosEmRisco: any[]; propostasSemFollowUp: any[]; propostasSemFollowUpValue: number;
}): AuroraAcao[] {
  const { leadsAbertos, oportunidadesRecuperaveis, recuperavelValue, contratosEmRisco, propostasSemFollowUp, propostasSemFollowUpValue } = params;
  const acoes: AuroraAcao[] = [];
  const topParado = [...leadsAbertos]
    .filter((l: any) => (Number(l.timeIdle) || 0) > 5 && parseCurrencyBR(l.value) > 0)
    .sort((a: any, b: any) => parseCurrencyBR(b.value) - parseCurrencyBR(a.value))[0];
  if (topParado) {
    acoes.push({
      icon: "flame", titulo: `Retomar negociação com ${topParado.company || topParado.name}`,
      subtitulo: `Último contato há ${topParado.timeIdle} dias`, valor: parseCurrencyBR(topParado.value),
      target: `/app/crm/pipeline?leadId=${topParado.id}`,
    });
  }
  if (oportunidadesRecuperaveis.length > 0) {
    acoes.push({
      icon: "sparkles", titulo: `Apresentar proposta para ${oportunidadesRecuperaveis.length} lead${oportunidadesRecuperaveis.length > 1 ? "s" : ""} de alta intenção`,
      subtitulo: "Sinal de compra identificado", valor: recuperavelValue, target: "/app/crm/pipeline",
    });
  }
  if (contratosEmRisco.length > 0) {
    const top = [...contratosEmRisco].sort((a, b) => parseCurrencyBR(b.mrr) - parseCurrencyBR(a.mrr))[0];
    acoes.push({
      icon: "userx", titulo: `Evitar perda: ${top.client}`,
      subtitulo: "Sinal de inadimplência", valor: parseCurrencyBR(top.mrr), target: "/app/financeiro/contratos",
    });
  }
  if (propostasSemFollowUp.length > 0) {
    acoes.push({
      icon: "filewarning", titulo: `${propostasSemFollowUp.length} proposta${propostasSemFollowUp.length > 1 ? "s" : ""} sem follow-up`,
      subtitulo: "Enviadas há mais de 5 dias", valor: propostasSemFollowUpValue, target: "/app/crm/propostas",
    });
  }
  return acoes.slice(0, 5);
}
