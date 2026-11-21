import test from "node:test";
import assert from "node:assert/strict";
import { formatBRL, formatBRLCentavos, round2 } from "../../src/lib/dinheiro.js";

const antigo = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

test("formatBRL: mesma saída de antes para número; texto/NaN/null viram R$ 0,00", () => {
  for (const n of [0, 1, 1234.5, 1234567.891, -42.1, 0.005]) assert.equal(formatBRL(n), antigo(n));
  assert.equal(formatBRL("99.9"), antigo(99.9));
  for (const v of [null, undefined, "abc", NaN, Infinity]) assert.equal(formatBRL(v), antigo(0));
});

test("formatBRLCentavos: centavos inteiros viram reais", () => {
  assert.equal(formatBRLCentavos(12345), antigo(123.45));
  assert.equal(formatBRLCentavos(0), antigo(0));
  assert.equal(formatBRLCentavos("990"), antigo(9.9));
  assert.equal(formatBRLCentavos(null), antigo(0));
});

test("round2: fecha em centavos sem erro de ponto flutuante", () => {
  assert.equal(round2(0.1 + 0.2), 0.3);
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(-2.345), -2.34); // comportamento de sempre (meio centavo negativo arredonda para cima); mantido para não mudar nenhum total
});
