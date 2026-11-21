// Módulo único do DRE (decisão 8 da Fase 1): tela e servidor importam ESTE arquivo. Sem imports (o servidor roda em Node ESM).
//
// Dois cálculos convivem:
//  • calcularDRELegado  — exatamente o DRE de hoje (4 linhas por subtipo). Vale para lançamentos antigos e para a tela atual.
//  • calcularDreCompleto — o DRE da Fase 1 (10 grupos do plano de contas): receita bruta, deduções, CMV, EBITDA, depreciação,
//                          resultado financeiro, IR/CSLL. Linha vem de finance_categories.linha_dre.

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

// ─────────────────────────── DRE legado (comportamento de hoje, sem mudança) ───────────────────────────
export type DreTipoLegado = "RECEBIMENTO" | "DESPESA_FIXA" | "DESPESA_VARIAVEL" | "PESSOAS" | "IMPOSTOS";
export interface EntradaLegado { type: string; status: string; value: number | string; category_id?: string | null }
export interface CategoriaLegado { id: string; subtipo?: string | null }
export interface DreLegado {
  receitaBruta: number; impostos: number; lucroBruto: number; despesasVariaveis: number;
  lucroOperacional: number; despesasFixas: number; gastosComPessoal: number; lucroLiquido: number;
}

export function dreTipoLegado(e: EntradaLegado, cats: Map<string, CategoriaLegado>): DreTipoLegado {
  if (e.type === "Receber") return "RECEBIMENTO";
  const cat = e.category_id ? cats.get(e.category_id) : undefined;
  return (cat?.subtipo as DreTipoLegado | null | undefined) ?? "DESPESA_VARIAVEL";
}

export function calcularDRELegado(entries: EntradaLegado[], cats: Map<string, CategoriaLegado>, opts?: { apenasPagos?: boolean }): DreLegado {
  const base = opts?.apenasPagos ? entries.filter((e) => e.status === "Pago") : entries;
  const receitaBruta = round2(base.filter((e) => e.type === "Receber").reduce((s, e) => s + num(e.value), 0));
  const soma = (tipo: DreTipoLegado) => round2(base.filter((e) => e.type === "Pagar" && dreTipoLegado(e, cats) === tipo).reduce((s, e) => s + num(e.value), 0));
  const impostos = soma("IMPOSTOS");
  const lucroBruto = round2(receitaBruta - impostos);
  const despesasVariaveis = soma("DESPESA_VARIAVEL");
  const lucroOperacional = round2(lucroBruto - despesasVariaveis);
  const despesasFixas = soma("DESPESA_FIXA");
  const gastosComPessoal = soma("PESSOAS");
  const lucroLiquido = round2(lucroOperacional - despesasFixas - gastosComPessoal);
  return { receitaBruta, impostos, lucroBruto, despesasVariaveis, lucroOperacional, despesasFixas, gastosComPessoal, lucroLiquido };
}

// ─────────────────────────── DRE completo (Fase 1) ───────────────────────────
export type LinhaDre = "RECEITA_BRUTA" | "DEDUCOES" | "CMV" | "DESP_COMERCIAL" | "DESP_ADMINISTRATIVA" | "DESP_PESSOAL"
  | "DEPRECIACAO" | "RESULTADO_FINANCEIRO" | "IR_CSLL" | "FORA_DRE";
export const LINHAS_DRE: LinhaDre[] = ["RECEITA_BRUTA", "DEDUCOES", "CMV", "DESP_COMERCIAL", "DESP_ADMINISTRATIVA", "DESP_PESSOAL", "DEPRECIACAO", "RESULTADO_FINANCEIRO", "IR_CSLL", "FORA_DRE"];

export interface LancamentoDre {
  type: string; status: string; value: number | string; category_id?: string | null;
  nao_operacional?: boolean | null; estorno_de?: string | null; origem_registro?: string | null;
  competencia_date?: string | null; data_pagamento?: string | null; date_normalized?: string | null;
}
export interface CategoriaDre { id: string; linha_dre?: string | null }

export type RegimeDre = "competencia" | "caixa";

/** Dia que coloca o lançamento no período: competência (padrão) ou pagamento (caixa). Legado cai em date_normalized. */
export function diaDoLancamento(e: LancamentoDre, regime: RegimeDre): string | null {
  const dia = regime === "caixa" ? (e.data_pagamento || e.date_normalized) : (e.competencia_date || e.date_normalized);
  return dia ? String(dia).slice(0, 10) : null;
}

/** Filtra por período [inicio, fim] (YYYY-MM-DD). Caixa só considera o que está "Pago". */
export function filtrarPeriodo<T extends LancamentoDre>(entries: T[], inicio: string, fim: string, regime: RegimeDre = "competencia"): T[] {
  return entries.filter((e) => {
    if (regime === "caixa" && e.status !== "Pago") return false;
    const d = diaDoLancamento(e, regime);
    return !!d && d >= inicio && d <= fim;
  });
}

export interface DreCompleto {
  receitaBruta: number; deducoes: number; receitaLiquida: number; cmv: number; lucroBruto: number;
  despesasComerciais: number; despesasAdministrativas: number; despesasPessoal: number;
  ebitda: number; depreciacao: number; resultadoOperacional: number;
  resultadoFinanceiro: number; lucroAntesIr: number; irCsll: number; lucroLiquido: number;
  /** Fora do resultado (grupo 10 e lançamentos não operacionais): nunca entra no DRE, só no caixa. */
  foraDoResultado: number;
  /** Lançamentos sem linha do DRE (sem categoria do plano): ficam de fora e viram aviso na tela. */
  pendencias: { quantidade: number; valor: number };
  /** CMV vindo do custo cadastrado dos itens vendidos (já somado em `cmv`). */
  cmvMercadoria: number;
}

/**
 * DRE completo. `cmvMercadoria` = custo dos produtos vendidos no período (calculado pelo chamador a partir de venda_items.custo_unitario);
 * é somado ao CMV lançado à mão. Estorno (estorno_de preenchido) reduz a receita como dedução, qualquer que seja a categoria.
 * Receber em RESULTADO_FINANCEIRO soma; Pagar subtrai. Receber fora de RECEITA_BRUTA/RESULTADO_FINANCEIRO/FORA_DRE é pendência.
 */
export function calcularDreCompleto(entries: LancamentoDre[], cats: Map<string, CategoriaDre>, opts?: { cmvMercadoria?: number }): DreCompleto {
  const soma: Record<LinhaDre, number> = Object.fromEntries(LINHAS_DRE.map((l) => [l, 0])) as Record<LinhaDre, number>;
  let finReceitas = 0; let finDespesas = 0;
  let pendQtd = 0; let pendValor = 0; let fora = 0;

  for (const e of entries) {
    const v = num(e.value);
    if (e.nao_operacional) { fora += v; continue; }
    if (e.estorno_de) { soma.DEDUCOES += v; continue; }
    const linha = (e.category_id ? cats.get(e.category_id)?.linha_dre : null) as LinhaDre | null | undefined;
    if (!linha || !LINHAS_DRE.includes(linha)) { pendQtd++; pendValor += v; continue; }
    if (linha === "FORA_DRE") { fora += v; continue; }
    if (e.type === "Receber") {
      if (linha === "RECEITA_BRUTA") soma.RECEITA_BRUTA += v;
      else if (linha === "RESULTADO_FINANCEIRO") finReceitas += v;
      else { pendQtd++; pendValor += v; }            // receita numa linha de despesa: precisa de revisão
    } else {
      if (linha === "RECEITA_BRUTA") { pendQtd++; pendValor += v; }  // despesa numa linha de receita: revisão
      else if (linha === "RESULTADO_FINANCEIRO") finDespesas += v;
      else soma[linha] += v;
    }
  }

  const cmvMercadoria = round2(Math.max(0, num(opts?.cmvMercadoria)));
  const receitaBruta = round2(soma.RECEITA_BRUTA);
  const deducoes = round2(soma.DEDUCOES);
  const receitaLiquida = round2(receitaBruta - deducoes);
  const cmv = round2(soma.CMV + cmvMercadoria);
  const lucroBruto = round2(receitaLiquida - cmv);
  const despesasComerciais = round2(soma.DESP_COMERCIAL);
  const despesasAdministrativas = round2(soma.DESP_ADMINISTRATIVA);
  const despesasPessoal = round2(soma.DESP_PESSOAL);
  const ebitda = round2(lucroBruto - despesasComerciais - despesasAdministrativas - despesasPessoal);
  const depreciacao = round2(soma.DEPRECIACAO);
  const resultadoOperacional = round2(ebitda - depreciacao);
  const resultadoFinanceiro = round2(finReceitas - finDespesas);
  const lucroAntesIr = round2(resultadoOperacional + resultadoFinanceiro);
  const irCsll = round2(soma.IR_CSLL);
  const lucroLiquido = round2(lucroAntesIr - irCsll);
  return {
    receitaBruta, deducoes, receitaLiquida, cmv, lucroBruto, despesasComerciais, despesasAdministrativas, despesasPessoal,
    ebitda, depreciacao, resultadoOperacional, resultadoFinanceiro, lucroAntesIr, irCsll, lucroLiquido,
    foraDoResultado: round2(fora), pendencias: { quantidade: pendQtd, valor: round2(pendValor) }, cmvMercadoria,
  };
}

/** CMV de mercadoria: soma quantidade × custo unitário dos itens vendidos. Item sem custo cadastrado (null) é contado à parte, nunca como zero. */
export function cmvDosItens(itens: Array<{ quantidade: number | string; custo_unitario: number | string | null }>): { cmv: number; itensSemCusto: number } {
  let cmv = 0; let sem = 0;
  for (const i of itens) {
    if (i.custo_unitario === null || i.custo_unitario === undefined) { sem++; continue; }
    cmv += num(i.quantidade) * num(i.custo_unitario);
  }
  return { cmv: round2(cmv), itensSemCusto: sem };
}
