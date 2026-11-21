import test from "node:test";
import assert from "node:assert/strict";
import { completarBaixa, contaParaBaixa } from "../../src/pages/finance/lib/baixa.js";

const contas = [{ id: "a", is_principal: false }, { id: "p", is_principal: true }, { id: "x", is_principal: true, arquivada: true }];

test("conta da baixa: principal ativa; senão a única ativa; senão nenhuma", () => {
  assert.equal(contaParaBaixa(contas), "p");
  assert.equal(contaParaBaixa([{ id: "u" }]), "u");
  assert.equal(contaParaBaixa([{ id: "a" }, { id: "b" }]), null);
  assert.equal(contaParaBaixa([{ id: "x", is_principal: true, arquivada: true }]), null);
  assert.equal(contaParaBaixa(null), null);
});

test("baixa: Pago sem conta recebe a principal; já preenchida não muda; não-Pago e Pago→Pago não mudam; nunca envia data_pagamento", () => {
  assert.equal(completarBaixa<{ status: string; conta_bancaria_id?: string | null }>({ status: "Pago" }, contas).conta_bancaria_id, "p");
  assert.equal(completarBaixa({ status: "Pago", conta_bancaria_id: "a" }, contas).conta_bancaria_id, "a");
  assert.equal(completarBaixa<{ status: string; conta_bancaria_id?: string | null }>({ status: "A Vencer" }, contas).conta_bancaria_id, undefined);
  assert.equal(completarBaixa<{ status: string; conta_bancaria_id?: string | null }>({ status: "Pago" }, contas, "Pago").conta_bancaria_id, undefined);
  assert.equal(completarBaixa<{ status: string; conta_bancaria_id?: string | null }>({ status: "Pago" }, [], undefined).conta_bancaria_id, undefined);
  assert.equal("data_pagamento" in completarBaixa({ status: "Pago" }, contas), false);
});
