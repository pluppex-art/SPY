import { parseEntryDate } from "./financeDates";
import { calcularDRELegado } from "../../../lib/dre/dre";

/**
 * Serviço único de cálculo financeiro. Todo número que aparece em qualquer
 * tela do módulo (dashboard, DRE, relatórios, listagens) tem que vir daqui —
 * nunca de um somatório reimplementado na tela. O motivo é estrutural: antes
 * do DRE ter esse serviço, ele somava receita/despesa por um caminho (sliders
 * manuais × multiplicação por 3/6/12) enquanto o dashboard somava por outro
 * (lançamentos reais pagos no mês), e os dois nunca batiam.
 *
 * REGIME DE CAIXA vs. COMPETÊNCIA (a distinção mais importante do módulo):
 *   CAIXA        → só lançamentos com status "Pago". Usado por: saldo de
 *                  conta, resultado atual, extrato "somente pagos".
 *   COMPETÊNCIA  → todos os lançamentos, pago ou não. Usado por: DRE,
 *                  resultado previsto, previsto×realizado, comparativos.
 * Confundir os dois é o erro mais caro do domínio — ver cada função abaixo
 * pra saber qual regime ela aplica.
 */

export interface FinanceEntryLike {
  id: string;
  type: "Pagar" | "Receber";
  status: string; // "Pago" | "A Vencer" | "Atrasado"
  value: number;
  date: string;
  category_id?: string | null;
  category?: string;
}

export interface FinanceCategoryLike {
  id: string;
  tipo: "Receita" | "Despesa";
  subtipo?: "DESPESA_FIXA" | "DESPESA_VARIAVEL" | "PESSOAS" | "IMPOSTOS" | null;
}

export type DreTipo = "RECEBIMENTO" | "DESPESA_FIXA" | "DESPESA_VARIAVEL" | "PESSOAS" | "IMPOSTOS";

export const isPago = (e: FinanceEntryLike) => e.status === "Pago";
export const isPendente = (e: FinanceEntryLike) => e.status !== "Pago";

/** Arredonda pra 2 casas evitando o acúmulo de erro de ponto flutuante do
 * JS puro (0.1 + 0.2 !== 0.3) — não é decimal de precisão arbitrária, mas
 * garante que toda soma/exibição de dinheiro feche em centavos exatos. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function isInMonth(dateStr: string | undefined, year: number, month: number): boolean {
  const d = parseEntryDate(dateStr);
  return !!d && d.getFullYear() === year && d.getMonth() === month;
}

/**
 * Classifica um lançamento na linha de DRE que ele ocupa. Depende da
 * categoria estar de fato vinculada (`category_id`) — lançamentos antigos
 * sem vínculo (categoria em texto livre, pré-migração) caem em
 * DESPESA_VARIAVEL por padrão, nunca ficam de fora da soma.
 */
export function dreTipoDe(entry: FinanceEntryLike, categoriesById: Map<string, FinanceCategoryLike>): DreTipo {
  if (entry.type === "Receber") return "RECEBIMENTO";
  const cat = entry.category_id ? categoriesById.get(entry.category_id) : undefined;
  return cat?.subtipo ?? "DESPESA_VARIAVEL";
}

export function categoriesById(categories: FinanceCategoryLike[]): Map<string, FinanceCategoryLike> {
  return new Map(categories.map(c => [c.id, c]));
}

export interface TransferLike {
  valor: number;
  pago: boolean;
  conta_origem_id: string;
  conta_destino_id: string;
}

/** Separa as transferências PAGAS que entraram/saíram de uma conta — pronto
 * pra passar direto em `saldoDaConta`. Transferência nunca é receita nem
 * despesa, então isso não entra em nenhuma outra soma do motor. */
export function transferenciasDaConta(transfers: TransferLike[], contaId: string): { recebidas: number[]; enviadas: number[] } {
  const pagas = transfers.filter(t => t.pago);
  return {
    recebidas: pagas.filter(t => t.conta_destino_id === contaId).map(t => t.valor),
    enviadas: pagas.filter(t => t.conta_origem_id === contaId).map(t => t.valor),
  };
}

// ─────────────────────────────────────────── CAIXA ───────────────────────────────────────────

/** Resultado do mês em regime de CAIXA: só o que já foi efetivamente pago. */
export function resultadoAtualDoMes(entries: FinanceEntryLike[], ref: Date): number {
  const y = ref.getFullYear(), m = ref.getMonth();
  const receita = entries.filter(e => e.type === "Receber" && isPago(e) && isInMonth(e.date, y, m)).reduce((s, e) => s + e.value, 0);
  const despesa = entries.filter(e => e.type === "Pagar" && isPago(e) && isInMonth(e.date, y, m)).reduce((s, e) => s + e.value, 0);
  return round2(receita - despesa);
}

/**
 * Saldo de uma conta bancária em regime de CAIXA. Lançamentos pendentes
 * NUNCA afetam o saldo — só pago = true entra na conta.
 *   saldo = saldo_inicial (com sinal) + Σ recebimentos pagos − Σ despesas
 *           pagas + transferências recebidas pagas − transferências
 *           enviadas pagas (nesta conta)
 */
export function saldoDaConta(params: {
  saldoInicial: number;
  sinalSaldoInicial: "POSITIVO" | "NEGATIVO" | "ZERADO";
  entriesDaConta: FinanceEntryLike[];
  transferenciasRecebidasPagas?: number[];
  transferenciasEnviadasPagas?: number[];
}): number {
  const base =
    params.sinalSaldoInicial === "ZERADO" ? 0 :
    params.sinalSaldoInicial === "NEGATIVO" ? -Math.abs(params.saldoInicial) :
    Math.abs(params.saldoInicial);

  const recebido = params.entriesDaConta.filter(e => e.type === "Receber" && isPago(e)).reduce((s, e) => s + e.value, 0);
  const pago = params.entriesDaConta.filter(e => e.type === "Pagar" && isPago(e)).reduce((s, e) => s + e.value, 0);
  const transfIn = (params.transferenciasRecebidasPagas ?? []).reduce((s, v) => s + v, 0);
  const transfOut = (params.transferenciasEnviadasPagas ?? []).reduce((s, v) => s + v, 0);

  return round2(base + recebido - pago + transfIn - transfOut);
}

// ────────────────────────────────────────── COMPETÊNCIA ──────────────────────────────────────

/** Resultado do mês em regime de COMPETÊNCIA: todos os lançamentos do mês,
 * pagos ou não. */
export function resultadoPrevistoDoMes(entries: FinanceEntryLike[], ref: Date): number {
  const y = ref.getFullYear(), m = ref.getMonth();
  const receita = entries.filter(e => e.type === "Receber" && isInMonth(e.date, y, m)).reduce((s, e) => s + e.value, 0);
  const despesa = entries.filter(e => e.type === "Pagar" && isInMonth(e.date, y, m)).reduce((s, e) => s + e.value, 0);
  return round2(receita - despesa);
}

/** Previsão de fechamento do mês = saldo atual (caixa) + pendentes do mês
 * (o que ainda vai entrar/sair até o fim do mês, na mesma conta). */
export function previsaoFechamentoDoMes(saldoAtual: number, entries: FinanceEntryLike[], ref: Date): number {
  const y = ref.getFullYear(), m = ref.getMonth();
  const pendentes = entries.filter(e => isPendente(e) && isInMonth(e.date, y, m));
  const aReceber = pendentes.filter(e => e.type === "Receber").reduce((s, e) => s + e.value, 0);
  const aPagar = pendentes.filter(e => e.type === "Pagar").reduce((s, e) => s + e.value, 0);
  return round2(saldoAtual + aReceber - aPagar);
}

export interface PrevistoRealizado {
  previsto: number;
  realizado: number;
  falta: number;
  /** 0–100, arredondado. 0 quando previsto = 0 (nunca divide por zero). */
  percentual: number;
}

/** Previsto × Realizado de um tipo (Receber/Pagar) dentro do mês.
 * previsto = todos os lançamentos do tipo no mês (competência).
 * realizado = só os pagos (caixa). */
export function previstoRealizado(entries: FinanceEntryLike[], type: "Pagar" | "Receber", ref: Date): PrevistoRealizado {
  const y = ref.getFullYear(), m = ref.getMonth();
  const doMes = entries.filter(e => e.type === type && isInMonth(e.date, y, m));
  const previsto = round2(doMes.reduce((s, e) => s + e.value, 0));
  const realizado = round2(doMes.filter(isPago).reduce((s, e) => s + e.value, 0));
  const falta = round2(previsto - realizado);
  const percentual = previsto === 0 ? 0 : Math.round((realizado / previsto) * 100);
  return { previsto, realizado, falta, percentual };
}

/** Agenda do dia = SÓ pendentes com vencimento no dia. Um lançamento pago
 * some da agenda mesmo que a data bata. */
export function agendaDoDia(entries: FinanceEntryLike[], dia: Date): FinanceEntryLike[] {
  return entries.filter(e => {
    if (isPago(e)) return false;
    const d = parseEntryDate(e.date);
    return !!d && d.getFullYear() === dia.getFullYear() && d.getMonth() === dia.getMonth() && d.getDate() === dia.getDate();
  });
}

/** Vencidas = pendente E vencimento antes de hoje. */
export function lancamentosEmAtraso(entries: FinanceEntryLike[], hoje: Date): FinanceEntryLike[] {
  const h = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return entries.filter(e => {
    if (isPago(e)) return false;
    const d = parseEntryDate(e.date);
    return !!d && d < h;
  });
}

export interface ComparativoLinha {
  linha: string;
  atual: number;
  anterior: number;
  variacaoValor: number;
  /** null = "Sem alteração" (os dois meses são zero). */
  variacaoPct: number | null;
}

/** Comparativo com o mês anterior — usa sempre o PREVISTO (competência),
 * nunca o realizado, mesmo comparando "quanto entrou". */
export function comparativoMesAnterior(
  entries: FinanceEntryLike[],
  categoriesMap: Map<string, FinanceCategoryLike>,
  ref: Date
): ComparativoLinha[] {
  const prevRef = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);

  const porTipo = (tipo: DreTipo | "TODAS_DESPESAS", data: Date) => {
    const y = data.getFullYear(), m = data.getMonth();
    const doMes = entries.filter(e => isInMonth(e.date, y, m));
    if (tipo === "RECEBIMENTO") return doMes.filter(e => e.type === "Receber").reduce((s, e) => s + e.value, 0);
    if (tipo === "TODAS_DESPESAS") return doMes.filter(e => e.type === "Pagar").reduce((s, e) => s + e.value, 0);
    return doMes.filter(e => e.type === "Pagar" && dreTipoDe(e, categoriesMap) === tipo).reduce((s, e) => s + e.value, 0);
  };

  const linhas: { linha: string; tipo: DreTipo | "TODAS_DESPESAS" }[] = [
    { linha: "Recebimentos", tipo: "RECEBIMENTO" },
    { linha: "Despesas", tipo: "TODAS_DESPESAS" },
    { linha: "Despesas fixas", tipo: "DESPESA_FIXA" },
    { linha: "Despesas variáveis", tipo: "DESPESA_VARIAVEL" },
    { linha: "Pessoas", tipo: "PESSOAS" },
    { linha: "Impostos", tipo: "IMPOSTOS" },
  ];

  return linhas.map(({ linha, tipo }) => {
    const atual = round2(porTipo(tipo, ref));
    const anterior = round2(porTipo(tipo, prevRef));
    const variacaoValor = round2(atual - anterior);
    const variacaoPct = atual === 0 && anterior === 0 ? null : anterior === 0 ? null : round2((variacaoValor / anterior) * 100);
    return { linha, atual, anterior, variacaoValor, variacaoPct };
  });
}

export interface DreResult {
  receitaBruta: number;
  impostos: number;
  lucroBruto: number;
  despesasVariaveis: number;
  lucroOperacional: number;
  despesasFixas: number;
  gastosComPessoal: number;
  lucroLiquido: number;
}

const MONTH_NAMES_SHORT = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** % de variação de `atual` vs. `anterior` — `null` quando não há base pra
 * comparar (mês/período anterior zerado), pra nunca mostrar um "+Infinity%"
 * ou um número inventado. Usado por todo KPI com "vs. período anterior" do
 * módulo Financeiro (DRE, Central de Relatórios...) — uma única fórmula,
 * pro mesmo par de números nunca dar percentuais diferentes em telas diferentes. */
export function pctDelta(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return Math.round(((atual - anterior) / Math.abs(anterior)) * 1000) / 10;
}

export interface MonthlyDrePoint {
  key: string; // 'YYYY-MM'
  label: string;
  receitaBruta: number;
  despesaTotal: number;
  lucroLiquido: number;
}

export interface MonthlyRealizedPoint {
  key: string; // 'YYYY-MM'
  label: string;
  value: number;
}

/**
 * Série mensal (últimos N meses) de lançamentos PAGOS de um único tipo —
 * regime de caixa puro. Usada pelos gráficos de Receitas/Despesas/Contas a
 * Receber/Contas a Pagar (GenericFinanceiroList), que só precisam de uma
 * linha só, diferente do DRE (que precisa das 3 juntas).
 */
export function getMonthlyRealizedSeries(
  entries: FinanceEntryLike[],
  type: "Pagar" | "Receber",
  months: number = 6
): MonthlyRealizedPoint[] {
  const now = new Date();
  const buckets: { key: string; label: string; start: Date; end: Date }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    buckets.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: MONTH_NAMES_SHORT[d.getMonth()], start, end });
  }
  return buckets.map(b => {
    const value = round2(
      entries
        .filter(e => e.type === type && isPago(e))
        .filter(e => { const dt = parseEntryDate(e.date); return !!dt && dt >= b.start && dt <= b.end; })
        .reduce((s, e) => s + e.value, 0)
    );
    return { key: b.key, label: b.label, value };
  });
}

/**
 * Série mensal de DRE pros últimos N meses (incluindo o atual) — usada pelos
 * gráficos de tendência (DRE, Central de Relatórios). Roda `calcularDRE` uma
 * vez por mês do intervalo, sempre em regime de competência (mesmo default
 * do dashboard), nunca soma acumulada nem reimplementa a lógica de linha.
 */
export function getMonthlyDreSeries(
  entries: FinanceEntryLike[],
  categoriesMap: Map<string, FinanceCategoryLike>,
  months: number = 6
): MonthlyDrePoint[] {
  const now = new Date();
  const buckets: { key: string; label: string; start: Date; end: Date }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
    buckets.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: MONTH_NAMES_SHORT[d.getMonth()], start, end });
  }
  return buckets.map(b => {
    const entriesDoMes = entries.filter(e => { const dt = parseEntryDate(e.date); return !!dt && dt >= b.start && dt <= b.end; });
    const dre = calcularDRE(entriesDoMes, categoriesMap);
    return {
      key: b.key,
      label: b.label,
      receitaBruta: dre.receitaBruta,
      despesaTotal: round2(dre.receitaBruta - dre.lucroLiquido),
      lucroLiquido: dre.lucroLiquido,
    };
  });
}

/**
 * DRE — sempre regime de COMPETÊNCIA (todos os lançamentos, pagos ou não,
 * por padrão; `apenasPagos` existe só pra respeitar o filtro "Incluir
 * lançamentos (pagos/não pagos)" de um relatório específico — o dashboard
 * nunca usa essa opção). Transferências nunca entram aqui — nem são lidas,
 * porque não são finance_entries.
 */
export interface PeriodLockLike {
  data_inicial: string;
  data_final: string;
}

/** Bloqueio de período: uma transação PAGA com vencimento dentro de
 * qualquer intervalo bloqueado não pode ser criada, editada ou excluída —
 * pendentes no mesmo intervalo continuam livres. */
export function isDateLocked(dateStr: string | null | undefined, locks: PeriodLockLike[]): boolean {
  if (!dateStr || locks.length === 0) return false;
  const d = parseEntryDate(dateStr);
  if (!d) return false;
  return locks.some(l => {
    const ini = new Date(l.data_inicial + "T00:00:00");
    const fim = new Date(l.data_final + "T23:59:59");
    return d >= ini && d <= fim;
  });
}

export function calcularDRE(
  entries: FinanceEntryLike[],
  categoriesMap: Map<string, FinanceCategoryLike>,
  opts?: { apenasPagos?: boolean }
): DreResult {
  // Cálculo único, compartilhado com o servidor (src/lib/dre/dre.ts).
  return calcularDRELegado(entries, categoriesMap, opts);
}
