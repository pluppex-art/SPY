import test from "node:test";
import assert from "node:assert/strict";
import { calcularDRELegado, calcularDreCompleto, cmvDosItens, diaDoLancamento, filtrarPeriodo, type LancamentoDre } from "../../src/lib/dre/dre.js";
import { calcularDRE } from "../../src/pages/finance/lib/financeEngine.js";

// ── Legado: o número de hoje não pode mudar ────────────────────────────────────────────────────
const cats = new Map<string, any>([
  ["imp", { id: "imp", tipo: "Despesa", subtipo: "IMPOSTOS" }],
  ["fix", { id: "fix", tipo: "Despesa", subtipo: "DESPESA_FIXA" }],
  ["pes", { id: "pes", tipo: "Despesa", subtipo: "PESSOAS" }],
]);
const leg = [
  { id: "1", type: "Receber", status: "Pago", value: 1000, date: "2026-11-01" },
  { id: "2", type: "Receber", status: "A Vencer", value: 500, date: "2026-11-05" },
  { id: "3", type: "Pagar", status: "Pago", value: 100, date: "2026-11-02", category_id: "imp" },
  { id: "4", type: "Pagar", status: "Pago", value: 200, date: "2026-11-02", category_id: "fix" },
  { id: "5", type: "Pagar", status: "Pago", value: 300, date: "2026-11-02", category_id: "pes" },
  { id: "6", type: "Pagar", status: "A Vencer", value: 50, date: "2026-11-03" }, // sem categoria = variável
] as any[];

test("DRE legado: mesmos números de sempre (receita, impostos, variável, fixas, pessoal, líquido)", () => {
  const r = calcularDRELegado(leg, cats);
  assert.deepEqual(r, { receitaBruta: 1500, impostos: 100, lucroBruto: 1400, despesasVariaveis: 50, lucroOperacional: 1350, despesasFixas: 200, gastosComPessoal: 300, lucroLiquido: 850 });
  assert.deepEqual(calcularDRELegado(leg, cats, { apenasPagos: true }).receitaBruta, 1000);
});

test("a tela (financeEngine.calcularDRE) e o módulo compartilhado dão o mesmo resultado", () => {
  assert.deepEqual(calcularDRE(leg, cats), calcularDRELegado(leg, cats));
  assert.deepEqual(calcularDRE(leg, cats, { apenasPagos: true }), calcularDRELegado(leg, cats, { apenasPagos: true }));
});

test("DRE legado aceita valor em texto (como vem do banco) sem virar NaN", () => {
  const r = calcularDRELegado([{ type: "Receber", status: "Pago", value: "10.50" }, { type: "Receber", status: "Pago", value: null as any }], new Map());
  assert.equal(r.receitaBruta, 10.5);
});

// ── DRE completo ──────────────────────────────────────────────────────────────────────────────
const pc = new Map<string, any>(Object.entries({
  rec: "RECEITA_BRUTA", ded: "DEDUCOES", cmv: "CMV", com: "DESP_COMERCIAL", adm: "DESP_ADMINISTRATIVA", pes: "DESP_PESSOAL",
  dep: "DEPRECIACAO", fin: "RESULTADO_FINANCEIRO", ir: "IR_CSLL", fora: "FORA_DRE",
}).map(([id, linha]) => [id, { id, linha_dre: linha }]));
const L = (type: string, value: number, category_id: string | null, extra: Partial<LancamentoDre> = {}): LancamentoDre => ({ type, status: "Pago", value, category_id, ...extra });

test("DRE completo: cascata de subtotais confere linha a linha", () => {
  const r = calcularDreCompleto([
    L("Receber", 10000, "rec"), L("Pagar", 600, "ded"), L("Pagar", 3000, "cmv"),
    L("Pagar", 800, "com"), L("Pagar", 700, "adm"), L("Pagar", 1000, "pes"),
    L("Pagar", 200, "dep"), L("Receber", 150, "fin"), L("Pagar", 50, "fin"), L("Pagar", 400, "ir"),
  ], pc);
  assert.equal(r.receitaBruta, 10000); assert.equal(r.deducoes, 600); assert.equal(r.receitaLiquida, 9400);
  assert.equal(r.lucroBruto, 6400);                       // 9400 − 3000
  assert.equal(r.ebitda, 3900);                            // 6400 − 800 − 700 − 1000
  assert.equal(r.resultadoOperacional, 3700);              // − depreciação 200
  assert.equal(r.resultadoFinanceiro, 100);                // 150 − 50
  assert.equal(r.lucroAntesIr, 3800);
  assert.equal(r.lucroLiquido, 3400);                      // − IR 400
  assert.deepEqual(r.pendencias, { quantidade: 0, valor: 0 });
});

test("DRE completo: CMV de mercadoria vem dos itens vendidos e soma ao CMV lançado", () => {
  const { cmv, itensSemCusto } = cmvDosItens([{ quantidade: 2, custo_unitario: 30 }, { quantidade: 1, custo_unitario: "15.50" }, { quantidade: 5, custo_unitario: null }]);
  assert.equal(cmv, 75.5); assert.equal(itensSemCusto, 1);   // item sem custo NUNCA vira zero silencioso
  const r = calcularDreCompleto([L("Receber", 1000, "rec"), L("Pagar", 100, "cmv")], pc, { cmvMercadoria: cmv });
  assert.equal(r.cmv, 175.5); assert.equal(r.cmvMercadoria, 75.5); assert.equal(r.lucroBruto, 824.5);
});

test("DRE completo: não operacional e FORA_DRE ficam fora; sem categoria vira pendência; estorno reduz a receita", () => {
  const r = calcularDreCompleto([
    L("Receber", 1000, "rec"),
    L("Receber", 5000, "fora"), L("Pagar", 700, null, { nao_operacional: true }),   // empréstimo, retirada
    L("Pagar", 90, null),                                                           // sem categoria: pendência
    L("Pagar", 100, "adm", { estorno_de: "x1" }),                                   // estorno de venda: dedução, qualquer categoria
    L("Receber", 40, "com"), L("Pagar", 20, "rec"),                                 // categoria incoerente com o tipo: pendência
  ], pc);
  assert.equal(r.foraDoResultado, 5700);
  assert.deepEqual(r.pendencias, { quantidade: 3, valor: 150 });
  assert.equal(r.deducoes, 100); assert.equal(r.receitaLiquida, 900);
  assert.equal(r.despesasAdministrativas, 0);
  assert.equal(r.lucroLiquido, 900);
});

test("período: competência usa competencia_date (cai em date_normalized no legado); caixa só Pago e por data_pagamento", () => {
  const a: LancamentoDre = { type: "Receber", status: "Pago", value: 1, competencia_date: "2026-10-30", data_pagamento: "2026-11-02", date_normalized: "2026-10-30" };
  const b: LancamentoDre = { type: "Receber", status: "A Vencer", value: 1, competencia_date: "2026-11-10", date_normalized: "2026-11-10" };
  const velho: LancamentoDre = { type: "Receber", status: "Pago", value: 1, date_normalized: "2026-11-15" };
  assert.equal(diaDoLancamento(velho, "competencia"), "2026-11-15");
  assert.deepEqual(filtrarPeriodo([a, b, velho], "2026-11-01", "2026-11-30", "competencia"), [b, velho]);
  assert.deepEqual(filtrarPeriodo([a, b, velho], "2026-11-01", "2026-11-30", "caixa"), [a, velho]);
});

import { separarLegado, quantidadeDoItem } from "../../src/lib/dre/dre.js";
test("legado fica fora do DRE completo; quantidade usa a decimal quando existe", () => {
  const r = separarLegado([{ type: "Receber", status: "Pago", value: 10 }, { type: "Receber", status: "Pago", value: 5, origem_registro: "spy" }]);
  assert.equal(r.novos.length, 1); assert.deepEqual(r.legado, { quantidade: 1, valor: 10 });
  assert.equal(quantidadeDoItem({ quantidade: 1, quantidade_decimal: 0.35 }), 0.35);
  assert.equal(quantidadeDoItem({ quantidade: 3, quantidade_decimal: null }), 3);
});
