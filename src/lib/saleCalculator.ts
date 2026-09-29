/**
 * Cálculo centralizado de vendas (recorrentes e pontuais) — usado por
 * AddProdutoLeadModal.tsx e reaproveitado (addPeriodo/splitInstallments) por
 * NovaOperacaoModal.tsx e GenericFinanceiroList.tsx, que tinham cópias
 * idênticas espalhadas antes desse arquivo existir.
 *
 * Regra central (auditoria 2026-09-23 — bug real em produção): recorrência
 * NUNCA multiplica o preço pelos ciclos numa cobrança única. "R$ 997/mês por
 * 12 meses" significa 12 cobranças de R$ 997, não 1 cobrança de R$ 11.964.
 * `totalProjectedAmount` existe só como projeção/relatório — nunca é o valor
 * de nenhuma cobrança individual.
 */

export type Frequencia = "semanal" | "quinzenal" | "mensal" | "bimestral" | "trimestral" | "semestral" | "anual" | "personalizado";
export type BillingType = "recurring" | "one_time";
export type DiscountType = "none" | "first_charge" | "recurring" | "total" | "percentage";

export const FREQUENCY_LABELS: Record<Frequencia, string> = {
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
  personalizado: "Personalizado",
};

/** Meses por ciclo de cada frequência — usado pra converter Vigência (meses)
 * em número de ciclos. Frequências semanais/quinzenais não se aplicam aqui
 * (a Vigência deste módulo é sempre em meses); ficam disponíveis só pro
 * addPeriodo() genérico, reaproveitado pelas telas de Financeiro. */
const CYCLE_MONTHS: Partial<Record<Frequencia, number>> = {
  mensal: 1,
  bimestral: 2,
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

export function cycleMonthsFor(freq: Frequencia, customCycleMonths?: number | null): number {
  if (freq === "personalizado") return Math.max(1, customCycleMonths || 1);
  return CYCLE_MONTHS[freq] ?? 1;
}

/** 31/01 + 1 mês tem que cair em 28/02 (ou 29 em ano bissexto), nunca
 * estourar pro dia 3 de março — `setMonth` sozinho soma o overflow do dia
 * no mês seguinte em vez de truncar. */
export function addMonthsClamped(date: Date, n: number): Date {
  const day = date.getDate();
  const firstOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + n, 1);
  const lastDayOfTargetMonth = new Date(firstOfTargetMonth.getFullYear(), firstOfTargetMonth.getMonth() + 1, 0).getDate();
  firstOfTargetMonth.setDate(Math.min(day, lastDayOfTargetMonth));
  return firstOfTargetMonth;
}

/** Avança `n` ciclos de `freq` a partir de `date`. `customMonths` só é usado
 * quando `freq === "personalizado"` (meses por ciclo definidos pelo usuário). */
export function addPeriodo(date: Date, freq: Frequencia, n: number, customMonths?: number): Date {
  const d = new Date(date);
  if (freq === "semanal") { d.setDate(d.getDate() + 7 * n); return d; }
  if (freq === "quinzenal") { d.setDate(d.getDate() + 15 * n); return d; }
  if (freq === "bimestral") return addMonthsClamped(d, 2 * n);
  if (freq === "trimestral") return addMonthsClamped(d, 3 * n);
  if (freq === "semestral") return addMonthsClamped(d, 6 * n);
  if (freq === "anual") return addMonthsClamped(d, 12 * n);
  if (freq === "personalizado") return addMonthsClamped(d, (customMonths || 1) * n);
  return addMonthsClamped(d, n); // mensal
}

/** Última parcela absorve o resto dos centavos — nunca perde 1 centavo por
 * arredondamento (100,00 em 3x = 33,33 + 33,33 + 33,34). */
export function splitInstallments(total: number, count: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: Math.max(1, count) }, (_, i) => (i < count - 1 ? base : base + remainder) / 100);
}

export interface PaymentScheduleItem {
  cycleNumber: number;
  amount: number;
  dueDate: Date;
}

export interface SaleCalculationInput {
  unitPrice: number;
  quantity: number;
  billingType: BillingType;
  /** Ignorado quando billingType === "one_time". */
  frequency: Frequencia;
  /** Só usado quando frequency === "personalizado". */
  customCycleMonths?: number;
  /** Vigência em meses. `null` = "sem prazo / contínua" (só recurring) —
   * nesse caso a geração de cobranças é limitada a OPEN_ENDED_BATCH ciclos
   * (não existe automação de cobrança recorrente real neste sistema ainda;
   * ver nota em AddProdutoLeadModal.tsx). Ignorado quando billingType === "one_time". */
  durationMonths: number | null;
  /** Taxa de implantação/setup — cobrada uma única vez, somada só na 1ª cobrança. */
  setupFee: number;
  discountType: DiscountType;
  /** R$ (first_charge/recurring/total) ou % (percentage). */
  discountValue: number;
  /** Só usado quando billingType === "one_time". */
  installments: number;
  firstDueDate: Date;
}

export interface SaleCalculationResult {
  /** Valor de cada ciclo recorrente, líquido de desconto recorrente/percentual
   * (mas SEM o setup e SEM o desconto exclusivo da 1ª cobrança). Pra venda
   * pontual, é o valor total da venda (antes de dividir em parcelas). */
  cycleAmount: number;
  setupAmount: number;
  /** Valor da 1ª cobrança — cycleAmount + setup - desconto de 1ª cobrança
   * (recorrente), ou a 1ª parcela (pontual). */
  firstChargeAmount: number;
  /** Valor de cada cobrança recorrente a partir da 2ª (nunca inclui setup).
   * Pra venda pontual, é o valor de uma parcela "padrão" (2ª em diante). */
  recurringChargeAmount: number;
  /** Soma de todas as cobranças projetadas — projeção/relatório, nunca o
   * valor de uma cobrança individual. */
  totalProjectedAmount: number;
  numberOfCycles: number;
  isOpenEnded: boolean;
  nextDueDate: Date | null;
  paymentSchedule: PaymentScheduleItem[];
}

/** Ciclos gerados de fato (finance_entries) quando a vigência é "sem prazo /
 * contínua" — não existe automação de cobrança recorrente real neste sistema
 * pra criar os próximos ciclos sozinha, então gera um lote inicial e deixa
 * explícito na tela que os ciclos seguintes precisam ser gerados depois. */
export const OPEN_ENDED_BATCH_CYCLES = 12;

/** Valor real de UM item já configurado no formulário (antes de virar
 * `proposal_items`) — nunca o "lote de OPEN_ENDED_BATCH_CYCLES ciclos"
 * (`totalProjectedAmount`) que existe só como projeção/relatório (ver
 * comentário no topo do arquivo). Pra item recorrente SEM PRAZO, o valor real
 * do negócio é o ciclo (`cycleAmount`) — não existe um "total" de verdade
 * quando não há data de término. Pra item com prazo fechado ou pontual,
 * `totalProjectedAmount` já É o total real (contrato tem fim, ou é uma venda
 * única) — comportamento inalterado.
 *
 * Achado real (2026-09-29): `AddProdutoLeadModal.tsx` somava
 * `totalProjectedAmount` de TODO item pra formar `proposals.valor`/
 * `leads.value` — pra item sem prazo isso inflava o valor do negócio em até
 * OPEN_ENDED_BATCH_CYCLES vezes (ex.: R$997/mês virava "R$11.964" só porque
 * o sistema precisa gerar um lote inicial de cobranças, sem ter uma automação
 * de recorrência real). Esse valor inflado se propagava pro Kanban ("valor de
 * ganho"), Propostas, ranking de vendas, ticket médio etc. — em vez de
 * corrigir cada um desses ~20 lugares, corrige na origem: o valor que sai
 * daqui pra `proposals.valor`/`leads.value` já nasce certo. */
export function getSaleRealValue(sale: Pick<SaleCalculationResult, "isOpenEnded" | "cycleAmount" | "totalProjectedAmount">): number {
  return sale.isOpenEnded ? sale.cycleAmount : sale.totalProjectedAmount;
}

/** Mesma correção que `getSaleRealValue`, só que a partir de uma linha já
 * persistida em `proposal_items` (preco_unitario/quantidade/contract_months),
 * pra telas que releem a proposta em vez de terem o `SaleCalculationResult`
 * em mãos (ex.: PropostasTable.tsx). `quantidade` guarda ciclos × unidades
 * pra item recorrente (ver AddProdutoLeadModal.tsx) — pra item SEM PRAZO
 * (contract_months null) criado pelo fluxo atual, ciclos = sempre
 * OPEN_ENDED_BATCH_CYCLES, então `quantidade` é sempre um múltiplo exato de
 * 12. Só desfaz o lote quando essa condição bate — protege dados antigos/de
 * outra origem (ex.: proposta criada antes dessa convenção existir, com
 * `quantidade` = unidades puras, nunca multiplicada por ciclo nenhum) de
 * serem divididos por engano. */
export function getProposalItemRealValue(item: { preco_unitario: any; quantidade: any; billing_type?: string | null; contract_months?: number | null }): number {
  const precoUnitario = Number(item.preco_unitario) || 0;
  const quantidade = Number(item.quantidade) || 0;
  const raw = precoUnitario * quantidade;
  if (item.billing_type === "one_time") return raw;
  if (item.contract_months && item.contract_months > 0) return raw;
  const isBatchScaled = quantidade > 0 && quantidade % OPEN_ENDED_BATCH_CYCLES === 0;
  return isBatchScaled ? raw / OPEN_ENDED_BATCH_CYCLES : raw;
}

/** Valor MENSAL real de um item de `proposal_items` — `null` pra item
 * pontual (não tem "mês"). Mesma proteção de `getProposalItemRealValue`
 * contra dividir `quantidade` que não é, de fato, um lote de ciclos. */
export function getProposalItemMonthlyValue(item: { preco_unitario: any; quantidade: any; billing_type?: string | null; contract_months?: number | null }): number | null {
  if (item.billing_type === "one_time") return null;
  const precoUnitario = Number(item.preco_unitario) || 0;
  const quantidade = Number(item.quantidade) || 0;
  const raw = precoUnitario * quantidade;
  const months = Number(item.contract_months) || 0;
  if (months > 1) return raw / months;
  if (months === 1) return null; // total já É a mensalidade, não duplica
  const isBatchScaled = quantidade > 0 && quantidade % OPEN_ENDED_BATCH_CYCLES === 0;
  return isBatchScaled ? raw / OPEN_ENDED_BATCH_CYCLES : raw;
}

export function calculateSale(input: SaleCalculationInput): SaleCalculationResult {
  const { unitPrice, quantity, billingType, setupFee, discountType, discountValue, firstDueDate } = input;
  const baseAmount = Math.max(0, unitPrice) * Math.max(1, quantity);

  if (billingType === "one_time") {
    let total = baseAmount;
    if (discountType === "percentage") {
      total = total * (1 - Math.max(0, Math.min(100, discountValue)) / 100);
    } else if (discountType !== "none") {
      total = Math.max(0, total - Math.max(0, discountValue));
    }
    total = Math.max(0, total) + Math.max(0, setupFee);

    const count = Math.max(1, Math.round(input.installments) || 1);
    const amounts = splitInstallments(total, count);
    const paymentSchedule: PaymentScheduleItem[] = amounts.map((amount, i) => ({
      cycleNumber: i + 1,
      amount,
      dueDate: i === 0 ? firstDueDate : addPeriodo(firstDueDate, "mensal", i),
    }));

    return {
      cycleAmount: total,
      setupAmount: Math.max(0, setupFee),
      firstChargeAmount: amounts[0] ?? 0,
      recurringChargeAmount: count > 1 ? amounts[1] ?? 0 : 0,
      totalProjectedAmount: total,
      numberOfCycles: count,
      isOpenEnded: false,
      nextDueDate: paymentSchedule[1]?.dueDate ?? null,
      paymentSchedule,
    };
  }

  // RECORRENTE
  const isOpenEnded = input.durationMonths === null || input.durationMonths === undefined;
  const cycleMonths = cycleMonthsFor(input.frequency, input.customCycleMonths);
  const numberOfCycles = isOpenEnded
    ? OPEN_ENDED_BATCH_CYCLES
    : Math.max(1, Math.round((input.durationMonths as number) / cycleMonths));

  let perCycleDiscount = 0;
  let firstChargeExtraDiscount = 0;
  if (discountType === "recurring") {
    perCycleDiscount = Math.max(0, discountValue);
  } else if (discountType === "total") {
    perCycleDiscount = numberOfCycles > 0 ? Math.max(0, discountValue) / numberOfCycles : 0;
  } else if (discountType === "percentage") {
    perCycleDiscount = baseAmount * (Math.max(0, Math.min(100, discountValue)) / 100);
  } else if (discountType === "first_charge") {
    firstChargeExtraDiscount = Math.max(0, discountValue);
  }

  const cycleAmount = Math.max(0, baseAmount - perCycleDiscount);
  const recurringChargeAmount = cycleAmount;
  const firstCycleNet = Math.max(0, cycleAmount - firstChargeExtraDiscount);
  const firstChargeAmount = firstCycleNet + Math.max(0, setupFee);
  const totalProjectedAmount = firstChargeAmount + recurringChargeAmount * (numberOfCycles - 1);

  const paymentSchedule: PaymentScheduleItem[] = Array.from({ length: numberOfCycles }, (_, i) => ({
    cycleNumber: i + 1,
    amount: i === 0 ? firstChargeAmount : recurringChargeAmount,
    dueDate: i === 0 ? firstDueDate : addPeriodo(firstDueDate, input.frequency, i, input.customCycleMonths),
  }));

  return {
    cycleAmount,
    setupAmount: Math.max(0, setupFee),
    firstChargeAmount,
    recurringChargeAmount,
    totalProjectedAmount,
    numberOfCycles,
    isOpenEnded,
    nextDueDate: paymentSchedule[1]?.dueDate ?? null,
    paymentSchedule,
  };
}
