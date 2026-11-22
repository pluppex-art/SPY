import test from "node:test";
import assert from "node:assert/strict";
import { formatarDocumento, dataBR, dadosDaFatura, gerarFaturaPdf } from "../../server/faturaPdf.js";

test("documento e data: máscara de CPF/CNPJ e data sem escorregar de dia", () => {
  assert.equal(formatarDocumento("52998224725"), "529.982.247-25");
  assert.equal(formatarDocumento("12345678000195"), "12.345.678/0001-95");
  assert.equal(formatarDocumento("abc"), "abc");
  assert.equal(dataBR("2026-11-21"), "21/11/2026");
  assert.equal(dataBR("2026-11-21T23:30:00-03:00"), "21/11/2026");
  assert.equal(dataBR(null), "");
});

test("pago vira RECIBO; em aberto vira FATURA; cliente é a pessoa do lançamento", () => {
  const e = { id: "ganho_b6fc9218-53c3", counterparty: "Cícero Divino", description: "caixa trifásica", value: "2244.00", status: "Pago", date_normalized: "2026-11-21", data_pagamento: "2026-11-21", payment_method: "Pix" };
  const d = dadosDaFatura(e, { razaoSocial: "LUMINAR LTDA", cnpj: "12345678000195" }, { name: "Luminar", documento: "" }, "Luminar", "2026-11-21");
  assert.equal(d.tipoDocumento, "RECIBO"); assert.equal(d.cliente.nome, "Cícero Divino"); assert.equal(d.valor, 2244); assert.equal(d.numero, "B6FC9218");
  assert.equal(dadosDaFatura({ ...e, status: "A Vencer" }, null, null, "Luminar", "2026-11-21").tipoDocumento, "FATURA");
  assert.equal(dadosDaFatura({ value: 1 }, null, null, "Minha Empresa", "2026-11-21").emitente.nome, "Minha Empresa");
});

test("PDF de verdade: começa com %PDF e tem corpo", () => {
  const d = dadosDaFatura({ id: "abcdef12", counterparty: "Cícero Divino", value: 2244, status: "A Vencer", date_normalized: "2026-12-05" }, { razaoSocial: "LUMINAR LTDA", cnpj: "12345678000195", endereco: "Rua A, 10" }, null, "Luminar", "2026-11-21");
  const pdf = gerarFaturaPdf(d);
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(pdf.length > 1500);
});
