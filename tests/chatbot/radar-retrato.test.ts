import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularRetrato, riscoDe, CRITICO_DIAS, ALTO_DIAS } from "../../src/lib/radarRetrato.js";

const valor = (v: unknown) => Number(v) || 0;
const agora = new Date("2026-11-17T12:00:00Z").getTime();

test("gravidade do lado ruim pelos dias parado", () => {
  assert.equal(riscoDe(1), "atencao");
  assert.equal(riscoDe(ALTO_DIAS - 1), "atencao");
  assert.equal(riscoDe(ALTO_DIAS), "alto");
  assert.equal(riscoDe(CRITICO_DIAS - 1), "alto");
  assert.equal(riscoDe(CRITICO_DIAS), "critico");
});

test("retrato do dia: lado ruim e lado bom na mesma conta", () => {
  const r = calcularRetrato([
    { status: "Em Aberto", timeIdle: 20, value: 1000, scoreIA: 50 },            // crítico
    { status: "Em Aberto", timeIdle: 8, value: 500, scoreIA: 50 },              // alto
    { status: "Em Aberto", timeIdle: 2, value: 100, scoreIA: 50 },              // atenção
    { status: "Em Aberto", timeIdle: 0, value: 50, scoreIA: 90 },               // em chamas (não está parado)
    { status: "Em Aberto", timeIdle: 0, value: 10, scoreIA: 50 },               // esquentando
    { status: "Em Aberto", timeIdle: 3, value: 7, scoreIA: 75 },                // quente e atenção (os dois lados são independentes)
    { status: "Fechado", timeIdle: 30, value: 999, scoreIA: 99 },               // fora dos dois lados
    { status: "Perdido", timeIdle: 30, value: 999 },
    { status: "Em Aberto", timeIdle: 40, value: 5, deleted_at: "2026-11-01" },  // excluído
  ], valor, agora);
  assert.equal(r.critico_count, 1);
  assert.equal(r.alto_count, 1);
  assert.equal(r.atencao_count, 2);
  assert.equal(r.total_count, 4);
  assert.equal(r.valor_em_risco, 1000 + 500 + 100 + 7);
  assert.equal(r.chamas_count, 1);
  assert.equal(r.quente_count, 1);
  assert.equal(r.esquentando_count, 1);
  assert.equal(r.total_boas_count, 3);
  assert.equal(r.valor_oportunidades, 50 + 7 + 10);
});

test("empresa sem leads gera retrato zerado (não quebra)", () => {
  const r = calcularRetrato([], valor, agora);
  assert.equal(r.total_count, 0);
  assert.equal(r.total_boas_count, 0);
  assert.equal(r.valor_em_risco, 0);
});
