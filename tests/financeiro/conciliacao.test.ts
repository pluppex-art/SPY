import { test } from "node:test";
import assert from "node:assert/strict";
import { acharLancamento, diasEntre, lancamentoDoExtrato, paraISO, type LancamentoLike, type LinhaExtrato } from "../../src/pages/finance/lib/conciliacao.js";

const item = (o: Partial<LinhaExtrato> = {}): LinhaExtrato => ({ id: "x", data: "10/11/2026", descricao: "PIX Studio Alfa", valor: 1500, tipo: "credito", banco: "Caixa", contaId: "c1", ...o });
const lan = (o: Partial<LancamentoLike>): LancamentoLike => ({ id: "l", value: 1500, type: "Receber", date: "2026-11-10", conta_bancaria_id: "c1", ...o });

test("paraISO entende dd/mm/aaaa e aaaa-mm-dd (com hora) e recusa lixo", () => {
  assert.equal(paraISO("10/11/2026"), "2026-11-10");
  assert.equal(paraISO("2026-11-10T00:00:00.000Z"), "2026-11-10");
  assert.equal(paraISO("ontem"), null);
  assert.equal(paraISO(null), null);
  assert.equal(diasEntre("2026-11-10", "2026-11-03"), 7);
  assert.equal(diasEntre("2026-11-03", "2026-11-10"), 7);
});

test("acharLancamento: casa valor + tipo + data, e NÃO casa só pelo valor (como era antes)", () => {
  assert.equal(acharLancamento(item(), [lan({})], new Set())?.id, "l");
  assert.equal(acharLancamento(item(), [lan({ type: "Pagar" })], new Set()), null, "tipo errado");
  assert.equal(acharLancamento(item(), [lan({ value: 1500.05 })], new Set()), null, "valor diferente");
  assert.equal(acharLancamento(item(), [lan({ date: "2026-10-01" })], new Set()), null, "mesmo valor, mas 40 dias antes: outro lançamento");
  assert.equal(acharLancamento(item(), [lan({ date: "17/11/2026" })], new Set())?.id, "l", "7 dias e data no formato legado");
  assert.equal(acharLancamento(item(), [lan({ date: "2026-11-18" })], new Set()), null, "8 dias: fora da janela");
});

test("acharLancamento: pega o mais próximo da data, desempata pela conta e não reaproveita lançamento já usado", () => {
  const lista = [lan({ id: "longe", date: "2026-11-04" }), lan({ id: "perto", date: "2026-11-09" }), lan({ id: "perto-outra-conta", date: "2026-11-09", conta_bancaria_id: "c2" })];
  assert.equal(acharLancamento(item(), lista, new Set())?.id, "perto");
  assert.equal(acharLancamento(item({ contaId: "c2" }), lista, new Set())?.id, "perto-outra-conta", "empate: a da mesma conta");
  assert.equal(acharLancamento(item(), lista, new Set(["perto", "perto-outra-conta"]))?.id, "longe", "usados saem");
  assert.equal(acharLancamento(item(), lista, new Set(["perto", "perto-outra-conta", "longe"])), null);
});

test("acharLancamento: débito casa com Pagar; extrato sem data válida não casa com nada", () => {
  assert.equal(acharLancamento(item({ tipo: "debito" }), [lan({ type: "Pagar" })], new Set())?.id, "l");
  assert.equal(acharLancamento(item({ data: "??" }), [lan({})], new Set()), null);
});

test("lancamentoDoExtrato: sai pago, na data e no valor do banco, com a conta e a categoria", () => {
  assert.deepEqual(lancamentoDoExtrato(item(), { categoria: "Mensalidades", categoriaId: "k1" }), {
    description: "PIX Studio Alfa", category: "Mensalidades", category_id: "k1", status: "Pago", value: 1500, type: "Receber", date: "2026-11-10",
    payment_method: "Conciliação bancária", conta_bancaria_id: "c1",
  });
  const sem = lancamentoDoExtrato(item({ tipo: "debito", contaId: null, valor: 80 }), {});
  assert.equal(sem.type, "Pagar");
  assert.equal(sem.category, "A classificar");
  assert.equal("conta_bancaria_id" in sem, false);
  assert.equal("category_id" in sem, false);
  assert.equal(lancamentoDoExtrato(item({ descricao: "  " }), {}).description, "Movimentação bancária");
});
