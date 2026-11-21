import { test } from "node:test";
import assert from "node:assert/strict";
import { margemPct, custoParaVenda, eanDoProduto, produtoTemCodigo } from "../../src/lib/tabelaPrecos.js";

test("margem: (preço − custo) / preço em %, 1 casa; sem preço = 0; pode ser negativa", () => {
  assert.equal(margemPct(100, 60), 40);
  assert.equal(margemPct(35, 20), 42.9);
  assert.equal(margemPct("49,9", 20), 0);          // texto com vírgula não vira número (quem chama já converte)
  assert.equal(margemPct("120.5", "50"), 58.5);
  assert.equal(margemPct(0, 10), 0);
  assert.equal(margemPct(null, null), 0);
  assert.equal(margemPct(80, 100), -25);
  assert.equal(margemPct(100, 0), 100);             // sem custo cadastrado: a margem "cheia" é só aritmética; quem mostra deve avisar
  assert.equal(margemPct(NaN, 5), 0);
});

test("custo da venda: só grava quando o produto tem custo; senão null (nunca zero)", () => {
  assert.equal(custoParaVenda({ cost: 12.5 }), 12.5);
  assert.equal(custoParaVenda({ cost: "7" }), 7);
  assert.equal(custoParaVenda({ cost: 0 }), null);
  assert.equal(custoParaVenda({}), null);
  assert.equal(custoParaVenda(null), null);
});

test("código de barras: coluna ean, depois type_attributes (barcode/ean), sem pontuação e em minúsculas", () => {
  assert.equal(eanDoProduto({ ean: "789-0001 " }), "7890001");
  assert.equal(eanDoProduto({ typeAttributes: { barcode: "ABC123" } }), "abc123");
  assert.equal(eanDoProduto({ type_attributes: { ean: "55 66" } }), "5566");
  assert.equal(eanDoProduto({ ean: "111", typeAttributes: { ean: "222" } }), "111"); // a coluna única manda
  assert.equal(eanDoProduto({}), "");
  assert.equal(eanDoProduto(null), "");
});

test("busca no caixa: SKU ou código de barras, ignora maiúscula e pontuação; vazio nunca casa", () => {
  const p = { sku: "TP-1884", typeAttributes: { barcode: "7891000100103" } };
  assert.equal(produtoTemCodigo(p, "tp1884"), true);
  assert.equal(produtoTemCodigo(p, " TP-1884 "), true);
  assert.equal(produtoTemCodigo(p, "789 1000 100103"), true);
  assert.equal(produtoTemCodigo(p, "0000"), false);
  assert.equal(produtoTemCodigo(p, ""), false);
  assert.equal(produtoTemCodigo({ sku: "", typeAttributes: {} }, "x"), false);
});
