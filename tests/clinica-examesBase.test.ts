import test from "node:test";
import assert from "node:assert/strict";
import { exameDeProduto, produtoDeExame } from "../src/lib/examesBase.js";

test("produto -> exame: preço/custo 0 viram null; campos extras vêm de type_attributes", () => {
  const e = exameDeProduto({ id: "1", name: "Hemograma", sku: "HM1", price: 40, cost: 0, category: "Sangue", material: "Sangue", active: true,
    type_attributes: { codigo_externo: "X9", parceiro: "Lab", nomes_alternativos: ["hemo"], tipo_exame: "lab" } });
  assert.equal(e.valor, 40); assert.equal(e.custo, null); assert.equal(e.codigo_interno, "HM1"); assert.equal(e.codigo_externo, "X9");
  assert.deepEqual(e.nomes_alternativos, ["hemo"]); assert.equal(e.parceiro, "Lab"); assert.equal(e.tipo, "lab"); assert.equal(e.ativo, true);
});

test("exame -> produto: tipo Exame, preserva chaves desconhecidas e remove as esvaziadas", () => {
  const p = produtoDeExame({ nome: "X", codigo_interno: null, valor: 10, custo: null, parceiro: "", nomes_alternativos: [], codigo_externo: "C1", ativo: true },
    { valor_referencia: "5-10", parceiro: "Antigo" });
  assert.equal(p.type, "Exame"); assert.equal(p.price, 10); assert.equal(p.cost, 0); assert.equal(p.sku, null);
  assert.deepEqual(p.type_attributes, { valor_referencia: "5-10", codigo_externo: "C1" });
});
