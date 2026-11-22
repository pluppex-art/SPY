import test from "node:test";
import assert from "node:assert/strict";
import { refDoLancamento, idDaRef, diaBrasilia, expiracaoPix, corpoPagamentoPix, decidirBaixa } from "../../server/cobrancaPix.js";

test("referência: vai e volta; o que não é de fatura (ex.: agendamento) é ignorado", () => {
  assert.equal(refDoLancamento("ganho_abc123"), "fin:ganho_abc123");
  assert.equal(idDaRef("fin:ganho_abc123"), "ganho_abc123");
  assert.equal(idDaRef("3f2b1a9c-1111-2222-3333-444455556666"), null);
  assert.equal(idDaRef(undefined), null);
  assert.equal(idDaRef("fin:a"), null);
});

test("data do pagamento: dia no horário de Brasília (22h do dia 21 não vira dia 22)", () => {
  assert.equal(diaBrasilia("2026-11-22T01:30:00.000Z"), "2026-11-21");
  assert.equal(diaBrasilia("2026-11-21T15:00:00.000-03:00"), "2026-11-21");
  assert.equal(diaBrasilia("lixo"), "");
});

test("validade do Pix: dia seguinte ao vencimento, mínimo 3 dias, máximo 30; formato com fuso", () => {
  const agora = Date.parse("2026-11-21T12:00:00-03:00");
  const dias = (iso: string) => (Date.parse(iso) - agora) / 86_400_000;
  assert.match(expiracaoPix("2026-12-05", agora), /^2026-12-06T23:59:59\.\d{3}-03:00$/);
  assert.ok(Math.abs(dias(expiracaoPix("2026-11-10", agora)) - 3) < 0.01);       // vencida: ainda dá 3 dias
  assert.ok(Math.abs(dias(expiracaoPix("2027-06-01", agora)) - 30) < 0.01);      // longe demais: limite de 30
});

test("corpo do Pix: valor com 2 casas, referência da fatura, pagador com nome separado", () => {
  const c = corpoPagamentoPix({ valor: 2244.499, descricao: "caixa", lancamentoId: "ganho_abc123", emailPagador: "a@b.com", nomePagador: "Cícero Divino da Silva", vencimentoISO: "2026-12-05", urlNotificacao: "https://x/w" });
  assert.equal(c.transaction_amount, 2244.5); assert.equal(c.payment_method_id, "pix"); assert.equal(c.external_reference, "fin:ganho_abc123");
  assert.deepEqual(c.payer, { email: "a@b.com", first_name: "Cícero", last_name: "Divino da Silva" });
});

test("baixa automática: só paga o que foi aprovado e cobre o valor; nunca mexe no que já está pago/cancelado", () => {
  const l = { type: "Receber", status: "A Vencer", value: "2244.00" };
  const ok = decidirBaixa(l, { status: "approved", transaction_amount: 2244, date_approved: "2026-11-22T01:30:00.000Z" }, "2026-11-22");
  assert.deepEqual(ok, { acao: "baixar", patch: { status: "Pago", payment_method: "Pix", data_pagamento: "2026-11-21" } });
  assert.equal(decidirBaixa(l, { status: "approved", transaction_amount: 2300 }, "2026-11-22").acao, "baixar");           // pagou a mais
  assert.equal(decidirBaixa(l, { status: "approved", transaction_amount: 2243.98 }, "2026-11-22").acao, "divergente");   // pagou a menos
  assert.equal(decidirBaixa(l, { status: "pending", transaction_amount: 2244 }, "2026-11-22").acao, "ignorar");
  assert.equal(decidirBaixa({ ...l, status: "Pago" }, { status: "approved", transaction_amount: 2244 }, "2026-11-22").acao, "ignorar");
  assert.equal(decidirBaixa({ ...l, status: "Cancelado" }, { status: "approved", transaction_amount: 2244 }, "2026-11-22").acao, "ignorar");
  assert.equal(decidirBaixa({ ...l, type: "Pagar" }, { status: "approved", transaction_amount: 2244 }, "2026-11-22").acao, "ignorar");
  assert.equal(decidirBaixa(null, { status: "approved" }, "2026-11-22").acao, "ignorar");
  assert.equal((decidirBaixa(l, { status: "approved", transaction_amount: 2244 }, "2026-11-22") as any).patch.data_pagamento, "2026-11-22"); // sem data de aprovação: hoje
});
