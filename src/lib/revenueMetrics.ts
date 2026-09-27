import { parseCurrencyBR } from "./utils";

/**
 * Fonte única de verdade pras métricas financeiras/comerciais usadas em todos
 * os dashboards do sistema. Antes desse módulo, cada tela (useDashboard.ts,
 * FinanceiroVisaoGeral.tsx, StrategicalView.tsx, RelatoriosExecutivos.tsx...)
 * tinha sua própria fórmula de MRR/conversão/churn, com pequenas diferenças
 * de filtro que faziam o mesmo número aparecer diferente em cada tela.
 *
 * Todas as funções aqui recebem arrays já escopados por tenant (o filtro por
 * tenant acontece dentro do DataContext, antes desses arrays chegarem em
 * qualquer tela) — não filtram tenant de novo.
 *
 * Os parâmetros usam shapes mínimos (duck-typed), não o `Contract`/`Lead`
 * completo de src/types.ts — várias telas têm suas próprias interfaces locais
 * mais enxutas pra essas entidades, e forçar o tipo completo aqui criaria
 * atrito sem necessidade real (as funções só leem os campos abaixo).
 */

type ContractLike = {
  mrr: string | number;
  status: string;
  client?: string;
  date?: string;
  cancelledAt?: string | null;
  /** Valor total do contrato (recorrente + avulso/implantação) — mesmo campo
   * de src/types.ts Contract.totalValue. Quando ausente, `getFaturamentoContratado`
   * assume igual ao `mrr` (contrato sem componente avulso), nunca inventa um
   * valor maior. */
  totalValue?: number;
};
type LeadLike = { value?: any; status: string; seller?: string };

const isCancelled = (c: ContractLike) => c.status === "Cancelado";
const isActive = (c: ContractLike) => !isCancelled(c) && c.status !== "Perdido";

/** MRR = soma do valor recorrente (mrr_value) dos contratos ativos. Exclui
 * cancelados/perdidos e exclui qualquer valor avulso (implantação/setup),
 * que já não entra em `mrr` desde a Fase 2 (ver Propostas.tsx syncAcceptedProposal). */
export function getMRR(contracts: ContractLike[]): number {
  return contracts.filter(isActive).reduce((sum, c) => sum + parseCurrencyBR(c.mrr), 0);
}

/**
 * Faturamento contratado = MRR + parcela avulsa/implantação que ainda está
 * "no contrato" (Contract.totalValue, quando maior que o `mrr` — contrato sem
 * componente avulso não tem totalValue > mrr, então soma igual ao MRR mesmo).
 *
 * IMPORTANTE — isto NÃO é o mesmo número que "MRR": MRR é só a parcela
 * recorrente; isto é o valor total contratado (recorrente + avulso) dos
 * contratos ativos agora. Mistura os dois sob o mesmo rótulo foi o bug real
 * corrigido em 2026-09-27 (cards "Faturamento Clínico"/"VGV Estimado" do
 * Dashboard mostravam getMRR() como se fosse faturamento total).
 *
 * Também não é "Faturamento do período" (fluxo de caixa recebido em um
 * intervalo de datas) — isso já existe em FinanceiroVisaoGeral.tsx
 * (`receita`/`receitaMes`, somados a partir do livro-caixa `finance_entries`,
 * fonte mais correta pra "quanto entrou de verdade no período"). Esta função
 * é um SALDO do momento atual (mesma convenção de getMRR: "ativo" = agora),
 * útil onde só se tem acesso a `contracts`, não ao livro-caixa financeiro.
 */
export function getFaturamentoContratado(contracts: ContractLike[]): number {
  return contracts.filter(isActive).reduce((sum, c) => {
    const mrrValue = parseCurrencyBR(c.mrr);
    const total = c.totalValue;
    const totalValue = total !== undefined && total !== null ? Number(total) : mrrValue;
    // Nunca deixa o total contar MENOS que o mrr (dado inconsistente não
    // deveria fazer o faturamento parecer menor que a própria recorrência).
    return sum + Math.max(totalValue, mrrValue);
  }, 0);
}

/** Receita recorrente perdida (contratos cancelados), útil pra "MRR em risco"/churn em R$. */
export function getLostMRR(contracts: ContractLike[]): number {
  return contracts.filter(isCancelled).reduce((sum, c) => sum + parseCurrencyBR(c.mrr), 0);
}

/** Clientes ativos = clientes únicos com pelo menos um contrato não cancelado/perdido. */
export function getActiveCustomers(contracts: ContractLike[]): number {
  return new Set(contracts.filter(isActive).map(c => c.client)).size;
}

export function getActiveContractsCount(contracts: ContractLike[]): number {
  return contracts.filter(isActive).length;
}

/** Taxa de churn (%) = contratos cancelados no período / total de contratos
 * existentes no início do período. Usa `cancelledAt` (carimbado automaticamente
 * por updateContract ao marcar Cancelado) — contratos cancelados antes dessa
 * coluna existir não têm `cancelledAt` e não entram nessa contagem por período,
 * só na taxa "geral" (sem filtro de meses). */
export function getChurnRate(contracts: ContractLike[], opts?: { months?: number }): number {
  const months = opts?.months;
  if (!months) {
    if (contracts.length === 0) return 0;
    return parseFloat(((contracts.filter(isCancelled).length / contracts.length) * 100).toFixed(1));
  }
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - months);
  const cancelledInPeriod = contracts.filter(c => isCancelled(c) && c.cancelledAt && new Date(c.cancelledAt) >= cutoff);
  const baseCount = contracts.filter(c => !c.cancelledAt || new Date(c.cancelledAt) >= cutoff).length || contracts.length;
  if (baseCount === 0) return 0;
  return parseFloat(((cancelledInPeriod.length / baseCount) * 100).toFixed(1));
}

const isWon = (l: LeadLike) => l.status === "Fechado";
const isOpen = (l: LeadLike) => l.status !== "Fechado" && l.status !== "Perdido";
// "Ativo" = ainda não marcado como perdido (inclui Fechado — cliente convertido
// continua contando como ativo). Diferente de isOpen: pipeline em aberto/hot
// leads continuam sem contar Fechado, só essa contagem de leads muda.
const isNotLost = (l: LeadLike) => l.status !== "Perdido";

/** Valor real de um lead (para agrupamentos por vendedor/produto/etc.):
 * `value` gravado é a fonte de verdade (soma de todas as propostas aceitas,
 * mantida sincronizada em DataContext.tsx); só cai pra proposta vinculada
 * mais recente quando o lead genuinamente não tem valor nenhum ainda.
 *
 * NUNCA usa o preço de CATÁLOGO dos produtos vinculados (`productIds`) como
 * fallback — esse campo também é usado por "produto de interesse" (tag que
 * nunca virou venda) e por vendas reais com desconto/quantidade diferente do
 * preço de tabela. Tratar o preço de catálogo como se fosse o valor fechado
 * inflava totais que deveriam bater com o Pipeline (bugs reais corrigidos em
 * 2026-09: Kanban "Total de Ganhos", Ranking de Vendas do Dashboard). Qualquer
 * agrupamento novo por valor de lead fechado deve usar esta função, não
 * reimplementar o fallback. */
export function getLeadRealValue(
  l: { value?: any; valor?: any; id?: string },
  proposals: { lead_id?: string; valor?: any; created_at?: string }[]
): number {
  const parsed = parseCurrencyBR(l.value ?? l.valor);
  if (parsed > 0) return parsed;
  const linkedProposal = (proposals || [])
    .filter((p) => p.lead_id === l.id)
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())[0];
  return linkedProposal?.valor ? Number(linkedProposal.valor) || 0 : 0;
}

export function getWonDeals(leads: LeadLike[]): { count: number; value: number } {
  const won = leads.filter(isWon);
  return { count: won.length, value: won.reduce((s, l) => s + parseCurrencyBR(l.value), 0) };
}

export function getActiveLeadsCount(leads: LeadLike[]): number {
  return leads.filter(isNotLost).length;
}

export function getConversionRate(leads: LeadLike[]): number {
  if (leads.length === 0) return 0;
  return parseFloat(((leads.filter(isWon).length / leads.length) * 100).toFixed(1));
}

export function getPipelineValue(leads: LeadLike[]): number {
  return leads.filter(isOpen).reduce((s, l) => s + parseCurrencyBR(l.value), 0);
}

export type RevenueProjectionMonth = { month: number; label: string; mrr: number };
export type RevenueProjectionResult =
  | { insufficientData: true; currentMRR: number }
  | { insufficientData: false; currentMRR: number; monthlyChurnRate: number; months: RevenueProjectionMonth[] };

const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/**
 * Projeção de MRR pros próximos N meses, a partir de dados reais de contrato
 * (sem número inventado): MRR atual composto pela taxa de churn mensal
 * observada nos últimos 3 meses. Sem pelo menos 2 meses de histórico de
 * contrato (criado ou cancelado), não há base estatística real pra projetar
 * — retorna `insufficientData: true` em vez de chutar um número.
 */
export function getRevenueProjection(contracts: ContractLike[], opts?: { horizonMonths?: number[] }): RevenueProjectionResult {
  const currentMRR = getMRR(contracts);
  const horizons = opts?.horizonMonths ?? [0, 1, 3, 6, 12];

  const datesWithSignal = contracts
    .map(c => c.date)
    .filter((d): d is string => !!d && /^\d{2}\/\d{2}\/\d{4}$/.test(d))
    .map(d => {
      const [dd, mm, yyyy] = d.split("/");
      return new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    });
  const oldestSignal = datesWithSignal.length > 0 ? new Date(Math.min(...datesWithSignal.map(d => d.getTime()))) : null;
  const monthsOfHistory = oldestSignal
    ? (new Date().getFullYear() - oldestSignal.getFullYear()) * 12 + (new Date().getMonth() - oldestSignal.getMonth())
    : 0;

  if (!oldestSignal || monthsOfHistory < 2) {
    return { insufficientData: true, currentMRR };
  }

  const monthlyChurnRate = getChurnRate(contracts, { months: 3 }) / 100;
  const now = new Date();
  const months = horizons.map(n => {
    const projected = currentMRR * Math.pow(1 - monthlyChurnRate, n);
    const d = new Date(now.getFullYear(), now.getMonth() + n, 1);
    return { month: n, label: `${MONTH_NAMES[d.getMonth()]}/${d.getFullYear()}`, mrr: Math.round(projected) };
  });

  return { insufficientData: false, currentMRR, monthlyChurnRate: parseFloat((monthlyChurnRate * 100).toFixed(2)), months };
}
