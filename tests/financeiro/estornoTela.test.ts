import test from "node:test";
import assert from "node:assert/strict";
import { montarEstorno, pagamentoTravado, podeEstornar } from "../../src/pages/finance/lib/estorno.js";

const pago: any = { id: "e1", type: "Receber", status: "Pago", value: "150.50", description: "Venda", counterparty: "João", payment_method: "Pix", conta_bancaria_id: "c1", origem_registro: "spy" };

test("estorno: só pagamento confirmado da regra nova, ainda não estornado e que não seja um estorno", () => {
  assert.deepEqual(podeEstornar(pago, []), { ok: true });
  assert.equal(podeEstornar({ ...pago, status: "A Vencer" }, []).ok, false);
  assert.equal(podeEstornar({ ...pago, origem_registro: null }, []).ok, false);          // antigo: edita/exclui normal
  assert.equal(podeEstornar({ ...pago, estorno_de: "x" }, []).ok, false);                // já é estorno
  const dup = podeEstornar(pago, [{ estorno_de: "e1" }]); assert.equal(dup.ok, false);   // já estornado
  assert.match((dup as any).motivo, /já foi estornado/);
});

test("pagamentoTravado: regra nova e pago", () => {
  assert.equal(pagamentoTravado({ status: "Pago", origem_registro: "api" }), true);
  assert.equal(pagamentoTravado({ status: "Pago", origem_registro: null }), false);
  assert.equal(pagamentoTravado({ status: "A Vencer", origem_registro: "spy" }), false);
});

test("montarEstorno: tipo oposto, mesmo valor e conta, ligado ao original, id fixo (um estorno por pagamento)", () => {
  const e = montarEstorno(pago, "2026-11-21", [{ id: "cat22", nome: "Devoluções e estornos de vendas", codigo: "2.02" }]);
  assert.equal(e.id, "estorno_e1"); assert.equal(e.estorno_de, "e1"); assert.equal(e.type, "Pagar"); assert.equal(e.value, 150.5);
  assert.equal(e.status, "Pago"); assert.equal(e.date, "2026-11-21"); assert.equal(e.competencia_date, "2026-11-21");
  assert.equal(e.conta_bancaria_id, "c1"); assert.equal(e.category_id, "cat22"); assert.deepEqual(e.tags, ["Estorno"]);
  assert.equal(montarEstorno({ ...pago, type: "Pagar" }, "2026-11-21").type, "Receber");
  assert.equal(montarEstorno(pago, "2026-11-21").category_id, null);   // empresa sem plano: só o nome
});
