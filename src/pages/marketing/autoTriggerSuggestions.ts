// Cálculos de apoio à Central de Automações (aba "Gatilho → Mensagem") — tudo
// aqui é derivado de dado real já carregado no app (leads/propostas/contratos
// e os gatilhos já criados em tenant_message_triggers via useMessageTriggers).
// Nada aqui fabrica métrica: onde o mockup original pedia algo que o sistema
// não rastreia de verdade (resposta do contato, reunião agendada por gatilho,
// "carrinho abandonado" — conceito que nem existe no domínio do SPY), o
// equivalente real mais próximo foi usado no lugar.

import { parseCurrencyBR } from "../../lib/utils";
import { isLeadOpen } from "../../lib/leadStatus";
import type { MessageTrigger } from "../../hooks/useMessageTriggers";

export interface GatilhoTemplate { id: string; label: string; texto: string }
export const GATILHO_TEMPLATES: GatilhoTemplate[] = [
  { id: "parados", label: "Leads parados", texto: "Quero mandar mensagem pra quem ficou parado há mais de 30 dias" },
  { id: "novos", label: "Novos leads", texto: "Quero mandar mensagem de boas-vindas pros leads que chegaram essa semana" },
  { id: "reativacao", label: "Reativação", texto: "Quero reativar clientes que não compram há mais de 90 dias" },
  { id: "followup", label: "Follow-up", texto: "Quero fazer follow-up de quem recebeu proposta e não respondeu" },
  { id: "personalizado", label: "Personalizado", texto: "" },
];

const CANAIS_DISPONIVEIS = new Set(["whatsapp"]);
export interface CanalEnvio { id: string; label: string; disponivel: boolean }
export const CANAIS_ENVIO: CanalEnvio[] = [
  { id: "whatsapp", label: "WhatsApp", disponivel: true },
  { id: "email", label: "E-mail", disponivel: CANAIS_DISPONIVEIS.has("email") },
  { id: "sms", label: "SMS", disponivel: CANAIS_DISPONIVEIS.has("sms") },
  { id: "instagram", label: "Instagram", disponivel: CANAIS_DISPONIVEIS.has("instagram") },
  { id: "linkedin", label: "LinkedIn", disponivel: CANAIS_DISPONIVEIS.has("linkedin") },
];

export interface JuliaSuggestion { id: string; titulo: string; subtitulo: string; texto: string }

/** Sugestões reais, calculadas na hora a partir dos dados do tenant — mesma
 * regra (não é IA ao vivo) já usada no painel "Aurora recomenda" da Central
 * de Receita, só que virando um texto pronto pra Júlia em vez de uma ação de
 * navegação. */
export function buildJuliaSuggestions(params: {
  leads: any[];
  proposals: any[];
  contracts: any[];
}): JuliaSuggestion[] {
  const { leads, proposals, contracts } = params;
  const leadsAbertos = (leads || []).filter((l: any) => isLeadOpen(l.status));
  const out: JuliaSuggestion[] = [];

  const quentesSemRetorno = leadsAbertos.filter((l: any) => (l.scoreIA ?? 0) > 70 && (Number(l.timeIdle) || 0) > 3);
  if (quentesSemRetorno.length > 0) {
    out.push({
      id: "quentes-sem-retorno",
      titulo: "Leads quentes sem retorno",
      subtitulo: `${quentesSemRetorno.length} lead${quentesSemRetorno.length === 1 ? "" : "s"} com alta intenção, sem resposta há mais de 3 dias.`,
      texto: "Quero mandar mensagem pra quem tem Score IA alto e não teve contato há mais de 3 dias",
    });
  }

  const propostasSemFollowUp = (proposals || []).filter((p: any) => p.status === "Enviada");
  if (propostasSemFollowUp.length > 0) {
    out.push({
      id: "propostas-sem-followup",
      titulo: "Propostas sem follow-up",
      subtitulo: `${propostasSemFollowUp.length} proposta${propostasSemFollowUp.length === 1 ? "" : "s"} enviada${propostasSemFollowUp.length === 1 ? "" : "s"}, aguardando resposta.`,
      texto: "Quero fazer follow-up de quem recebeu proposta e ainda não respondeu",
    });
  }

  const paradas = leadsAbertos.filter((l: any) => (Number(l.timeIdle) || 0) > 30);
  if (paradas.length > 0) {
    out.push({
      id: "oportunidades-paradas",
      titulo: "Oportunidades paradas",
      subtitulo: `${paradas.length} oportunidade${paradas.length === 1 ? "" : "s"} sem nenhum contato há mais de 30 dias.`,
      texto: "Quero mandar mensagem pra quem ficou parado há mais de 30 dias",
    });
  }

  const emRisco = (contracts || []).filter((c: any) => c.status === "Inadimplente");
  if (emRisco.length > 0) {
    const valor = emRisco.reduce((s: number, c: any) => s + parseCurrencyBR(c.mrr), 0);
    out.push({
      id: "clientes-em-risco",
      titulo: "Clientes com risco de churn",
      subtitulo: `${emRisco.length} cliente${emRisco.length === 1 ? "" : "s"} inadimplente${emRisco.length === 1 ? "" : "s"}${valor > 0 ? `, ${valor >= 1000 ? `R$ ${Math.round(valor / 1000)}k` : `R$ ${Math.round(valor)}`} em MRR de risco` : ""}.`,
      texto: "Quero mandar mensagem pros clientes inadimplentes oferecendo ajuda pra regularizar",
    });
  }

  return out;
}

export interface TriggerStats {
  aguardando: number;
  aguardandoDeltaSemana: number;
  enviados: number;
  enviadosDeltaPct: number | null;
  contatos: number;
  contatosDeltaPct: number | null;
  taxaAprovacao: number | null;
  chart: { name: string; contatos: number; enviados: number }[];
}

/** Todas as métricas desta aba vêm só do que já está em `tenant_message_triggers`
 * — nenhuma resposta de contato, reunião ou oportunidade gerada por gatilho é
 * rastreada hoje (não existe esse vínculo no banco), então esses números do
 * mockup original foram deliberadamente trocados por algo que o sistema
 * realmente mede: taxa de aprovação da Júlia, e contagens por período. */
export function computeTriggerStats(triggers: MessageTrigger[], dateFrom: string | null, dateTo: string | null): TriggerStats {
  const inRange = (iso: string) => {
    const d = iso.slice(0, 10);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    return true;
  };
  const periodo = triggers.filter((t) => inRange(t.createdAt));

  const now = new Date();
  const umaSemanaAtras = new Date(now.getTime() - 7 * 86400000);
  const duasSemanasAtras = new Date(now.getTime() - 14 * 86400000);
  const aguardandoTodos = triggers.filter((t) => t.status === "aguardando_confirmacao");
  const aguardandoEstaSemana = aguardandoTodos.filter((t) => new Date(t.createdAt) >= umaSemanaAtras).length;
  const aguardandoSemanaAnterior = aguardandoTodos.filter((t) => {
    const d = new Date(t.createdAt);
    return d >= duasSemanasAtras && d < umaSemanaAtras;
  }).length;

  const enviados = periodo.filter((t) => t.status === "executado");
  const umMesAtras = new Date(now.getTime() - 30 * 86400000);
  const doisMesesAtras = new Date(now.getTime() - 60 * 86400000);
  const enviadosEsteMes = triggers.filter((t) => t.status === "executado" && new Date(t.createdAt) >= umMesAtras).length;
  const enviadosMesAnterior = triggers.filter((t) => {
    const d = new Date(t.createdAt);
    return t.status === "executado" && d >= doisMesesAtras && d < umMesAtras;
  }).length;

  const contatos = enviados.reduce((s, t) => s + t.leadsEncontrados.length, 0);
  const contatosEsteMes = triggers.filter((t) => t.status === "executado" && new Date(t.createdAt) >= umMesAtras).reduce((s, t) => s + t.leadsEncontrados.length, 0);
  const contatosMesAnterior = triggers.filter((t) => {
    const d = new Date(t.createdAt);
    return t.status === "executado" && d >= doisMesesAtras && d < umMesAtras;
  }).reduce((s, t) => s + t.leadsEncontrados.length, 0);

  const finalizados = triggers.filter((t) => t.status === "executado" || t.status === "rejeitado");
  const taxaAprovacao = finalizados.length > 0 ? Math.round((triggers.filter((t) => t.status === "executado").length / finalizados.length) * 1000) / 10 : null;

  // Gráfico: últimos 14 dias dentro do período filtrado (ou os 14 mais recentes, sem filtro).
  const dias: { name: string; iso: string; contatos: number; enviados: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const iso = d.toISOString().slice(0, 10);
    dias.push({ name: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`, iso, contatos: 0, enviados: 0 });
  }
  const porDia = new Map(dias.map((d) => [d.iso, d]));
  for (const t of triggers) {
    if (t.status !== "executado") continue;
    const iso = t.createdAt.slice(0, 10);
    const bucket = porDia.get(iso);
    if (!bucket) continue;
    bucket.enviados += 1;
    bucket.contatos += t.leadsEncontrados.length;
  }

  const pct = (atual: number, anterior: number): number | null => (anterior > 0 ? Math.round(((atual - anterior) / anterior) * 1000) / 10 : null);

  return {
    aguardando: aguardandoTodos.length,
    aguardandoDeltaSemana: aguardandoEstaSemana - aguardandoSemanaAnterior,
    enviados: enviados.length,
    enviadosDeltaPct: pct(enviadosEsteMes, enviadosMesAnterior),
    contatos,
    contatosDeltaPct: pct(contatosEsteMes, contatosMesAnterior),
    taxaAprovacao,
    chart: dias.map((d) => ({ name: d.name, contatos: d.contatos, enviados: d.enviados })),
  };
}
