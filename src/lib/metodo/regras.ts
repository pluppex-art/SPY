/**
 * Método do funil: regras que a tela precisa (sem banco). Quem decide de verdade são as funções spy_* do banco;
 * aqui só se descobre se um lead usa o método e o que uma mudança pedida na tela significa.
 */
import { getStageId } from "../funnelIds";

export type TipoEtapa = "novo_lead" | "atendimento" | "orcamento" | "aguardando_pagamento" | "repescagem" | "ganho" | "perdido" | "desqualificado";

export const NOME_DA_ETAPA: Record<TipoEtapa, string> = {
  novo_lead: "Novo Lead", atendimento: "Em Atendimento", orcamento: "Orçamento", aguardando_pagamento: "Aguardando Pagamento",
  repescagem: "Repescagem", ganho: "Venda ganha", perdido: "Venda perdida", desqualificado: "Desqualificado",
};

export interface Situacao { timer?: Record<string, unknown>; codigo: string; etapa_tipo: TipoEtapa; etapa_tipo_completo: TipoEtapa | null; nome_exibido: string; bola_com: string | null; exige_nota: boolean; ordem: number; ativo: boolean; tenant_id: string | null; funil_id: string | null }
export interface Motivo { codigo: string; uso: "repescagem" | "perda"; nome_exibido: string; ordem: number; ativo: boolean; tenant_id: string | null }
export interface Estado { lead_id: string; situacao_codigo: string | null; situacao_desde: string | null; conversa_status: string | null; sla_vence_em: string | null; pagamento_status: string | null; etapa_origem_tipo: TipoEtapa | null; repescagem_motivo: string | null; repescagem_tentativa: number; pausa_ate: string | null; canal_venda: string | null }

export interface Posicao { funil: any; indice: number; tipo: TipoEtapa }

/** Onde o lead está, se for numa etapa tipada de um funil com o método ligado; senão null (tudo funciona como antes). */
export function posicaoNoMetodo(stageId: unknown, funis: any[] | null | undefined): Posicao | null {
  const id = String(stageId ?? "");
  if (!id) return null;
  for (const funil of funis ?? []) {
    if (!funil?.metodoAtivo || !id.startsWith(`${funil.id}-`)) continue;
    const resto = id.slice(String(funil.id).length + 1);
    if (!/^\d+$/.test(resto)) continue;
    const indice = Number(resto);
    const tipo = funil.etapasConfig?.[indice]?.tipo as TipoEtapa | undefined;
    if (tipo && NOME_DA_ETAPA[tipo]) return { funil, indice, tipo };
  }
  return null;
}

export const etapaDoFunil = (funil: any, tipo: TipoEtapa): { id: string; nome: string } | null => {
  const i = (funil?.etapasConfig ?? []).findIndex((e: any) => e?.tipo === tipo);
  return i < 0 ? null : { id: getStageId(funil.id, i), nome: funil.etapasConfig[i].nome };
};

export type Pedido =
  | { acao: "mover"; destino: TipoEtapa }
  | { acao: "repescagem" }
  | { acao: "perdido"; naoLead: boolean }
  | { acao: "ganho" };

const pedidoPara = (destino: TipoEtapa): Pedido =>
  destino === "repescagem" ? { acao: "repescagem" }
    : destino === "ganho" ? { acao: "ganho" }
      : destino === "perdido" ? { acao: "perdido", naoLead: false }
        : destino === "desqualificado" ? { acao: "perdido", naoLead: true }
          : { acao: "mover", destino };

/** Campos que só as funções do banco gravam num lead do método. */
const DO_METODO = ["stageId", "status", "lost_reason", "loss_reason", "probability"];
const tipoDoStatus = (status: unknown): TipoEtapa | null => {
  const s = String(status ?? "");
  return s === "Fechado" || s === "Ganho" ? "ganho" : s === "Perdido" ? "perdido" : s === "Desqualificado" ? "desqualificado" : null;
};

/**
 * Uma alteração pedida na tela (arrastar o cartão, botão Ganho…) que precisa passar pelo método. Devolve o que pedir à
 * pessoa e o resto da alteração (que segue normal), ou null quando não é assunto do método — inclusive troca de funil.
 */
export function pedidoDaMudanca(lead: { stageId?: string; status?: string }, mudanca: Record<string, any>, funis: any[]): { pedido: Pedido; resto: Record<string, any> } | null {
  const atual = posicaoNoMetodo(lead.stageId, funis);
  if (!atual) return null;
  let destino: TipoEtapa | null = null;
  if (mudanca.stageId !== undefined && String(mudanca.stageId) !== String(lead.stageId)) {
    const alvo = posicaoNoMetodo(mudanca.stageId, funis);
    if (!alvo || alvo.funil.id !== atual.funil.id) return null;
    destino = alvo.tipo;
  } else if (mudanca.status !== undefined && mudanca.status !== lead.status) {
    destino = tipoDoStatus(mudanca.status);
  }
  if (!destino || destino === atual.tipo) return null;
  const resto = Object.fromEntries(Object.entries(mudanca).filter(([k]) => !DO_METODO.includes(k)));
  return { pedido: pedidoPara(destino), resto };
}

/** Situação, motivo etc. valendo para a empresa: o ajuste do funil vence o da empresa, que vence o de fábrica. */
export function vigentes<T extends { codigo: string; tenant_id: string | null; funil_id?: string | null; ordem: number; ativo: boolean }>(linhas: T[], funilId?: string, chave: (l: T) => string = (l) => l.codigo): T[] {
  const peso = (l: T) => (l.funil_id ? 2 : 0) + (l.tenant_id ? 1 : 0);
  const m = new Map<string, T>();
  for (const l of linhas) {
    if (l.funil_id && l.funil_id !== funilId) continue;
    const k = chave(l); const antes = m.get(k);
    if (!antes || peso(l) > peso(antes)) m.set(k, l);
  }
  return [...m.values()].filter((l) => l.ativo).sort((a, b) => a.ordem - b.ordem);
}

export const etapaDaSituacao = (funil: any, s: Situacao): TipoEtapa => (funil?.template === "completo" && s.etapa_tipo_completo) || s.etapa_tipo;

/** Situações que pedem uma data: retorno combinado (obrigatória) ou prazo de entrega (opcional). */
export const dataDaSituacao = (s: Situacao | undefined): "obrigatoria" | "opcional" | null =>
  s?.timer?.na_data ? "obrigatoria" : s?.timer?.quando === "prazo_entrega" ? "opcional" : null;

export const ETAPAS_ATIVAS: TipoEtapa[] = ["novo_lead", "atendimento", "orcamento", "aguardando_pagamento"];

export type Sla = "em_dia" | "atencao" | "estourado";
export const NOME_DO_SLA: Record<Sla, string> = { em_dia: "Em dia", atencao: "Atenção", estourado: "Estourado" };

/** Calculado na hora pela data de vencimento. Atenção: falta menos de 1/4 do prazo (no máximo 1 hora). */
export function situacaoDoPrazo(estado: Pick<Estado, "sla_vence_em" | "situacao_desde"> | null | undefined, agora: number = Date.now()): Sla | null {
  const vence = Date.parse(estado?.sla_vence_em ?? "");
  if (!Number.isFinite(vence)) return null;
  if (vence <= agora) return "estourado";
  const desde = Date.parse(estado?.situacao_desde ?? "");
  const janela = Number.isFinite(desde) && vence > desde ? (vence - desde) / 4 : 3600_000;
  return vence - agora <= Math.min(janela, 3600_000) ? "atencao" : "em_dia";
}

export const NOME_DA_BOLA: Record<string, string> = { vendedor: "Com o vendedor", cliente: "Com o cliente", ambos: "Com os dois", sistema: "Automático" };
export const NOME_DO_PAGAMENTO: Record<string, string> = { sem_cobranca: "Sem cobrança", cobranca_enviada: "Cobrança enviada", pago: "Pago", expirado: "Expirado", recusado: "Recusado", estornado: "Estornado" };

/** Primeiro quem estourou o prazo, depois quem está perto, e entre iguais o lead quente. */
export function pesoDeAtencao(estado: Estado | null | undefined, temperatura: unknown, agora: number = Date.now()): number {
  const sla = situacaoDoPrazo(estado, agora);
  return (sla === "estourado" ? 0 : sla === "atencao" ? 2 : 4) + (String(temperatura ?? "").toLowerCase() === "quente" ? 0 : 1);
}

/** "Minhas de hoje": abertas, da pessoa, com prazo até o fim do dia — a mais atrasada primeiro. */
export function minhasDeHoje<T extends { assigned_to?: string | null; status: string; due_date?: string | null }>(tarefas: T[], usuarioId: string, agora: Date = new Date()): T[] {
  const fimDoDia = new Date(agora); fimDoDia.setHours(23, 59, 59, 999);
  const prazo = (t: T) => Date.parse(t.due_date ?? "");
  return tarefas
    .filter((t) => !!usuarioId && t.assigned_to === usuarioId && t.status !== "Concluída" && t.status !== "Cancelado" && prazo(t) <= fimDoDia.getTime())
    .sort((a, b) => prazo(a) - prazo(b));
}

/** Avisos que pedem para a pessoa chamar o cliente (repescagem, retorno combinado, fim da pausa). */
export const ehChamado = (aviso: { dedupe_key?: string | null } | null | undefined): boolean => /^(repescagem|retorno|retomar):/.test(aviso?.dedupe_key ?? "");

/** Começo de mensagem para o vendedor completar; nome que é só número ou genérico fica de fora. */
export function saudacao(nome: unknown): string {
  const primeiro = String(nome ?? "").trim().split(/\s+/)[0] ?? "";
  const serve = /^\p{L}{2,}$/u.test(primeiro) && !/^(lead|novo|sem|cliente|contato)$/i.test(primeiro);
  return serve ? `Olá, ${primeiro}! Tudo bem?` : "Olá! Tudo bem?";
}

/** Link para abrir a conversa no WhatsApp, com a mensagem começada; número brasileiro sem o 55 ganha o 55. */
export function linkDoWhatsApp(telefone: unknown, texto?: string): string | null {
  const d = String(telefone ?? "").replace(/\D/g, "");
  if (d.length < 10 || d.length > 15) return null;
  return `https://wa.me/${d.length <= 11 ? "55" : ""}${d}${texto ? `?text=${encodeURIComponent(texto)}` : ""}`;
}
