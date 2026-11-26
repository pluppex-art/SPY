process.env.TZ = "America/Sao_Paulo";
import { test } from "node:test";
import assert from "node:assert/strict";
import { diaLocal, filtrarPorPeriodo, noPeriodo } from "../../src/lib/periodoIndicadores.js";

test("período: entende os formatos de data usados nas telas", () => {
  assert.equal(diaLocal("2026-11-26"), "2026-11-26");
  assert.equal(diaLocal("26/11/2026"), "2026-11-26");
  assert.equal(diaLocal("26/11/2026, 14:30"), "2026-11-26");
  assert.equal(diaLocal("2026-11-26T10:00"), "2026-11-26");
  assert.equal(diaLocal(new Date(2026, 10, 26, 23, 59)), "2026-11-26");
});

test("período: horário com fuso vale o dia local", () => {
  assert.equal(diaLocal("2026-11-26T01:30:00Z"), "2026-11-25");
  assert.equal(diaLocal("2026-11-26T01:30:00+00:00"), "2026-11-25");
  assert.equal(diaLocal("2026-11-26 01:30:00.123456+00"), "2026-11-25");
});

test("período: o que não é data vira nulo", () => {
  for (const v of ["", "ontem", "99/99/2026", "2026-13-01", null, undefined, 0, NaN, {}]) assert.equal(diaLocal(v), null, String(v));
});

test("período: limites entram e quem não tem data só aparece sem filtro", () => {
  assert.equal(noPeriodo(null, null, null), true);
  assert.equal(noPeriodo(null, "2026-11-01", null), false);
  assert.equal(noPeriodo("2026-11-01", "2026-11-01", "2026-11-30"), true);
  assert.equal(noPeriodo("2026-11-30", "2026-11-01", "2026-11-30"), true);
  assert.equal(noPeriodo("2026-12-01", "2026-11-01", "2026-11-30"), false);
  assert.equal(noPeriodo("2026-10-31", null, "2026-10-31"), true);
});

test("período: sem filtro devolve a mesma lista", () => {
  const lista = [{ d: "2026-11-01" }, { d: null }];
  assert.equal(filtrarPorPeriodo(lista, (i) => i.d, null, null), lista);
  assert.deepEqual(filtrarPorPeriodo(lista, (i) => i.d, "2026-11-01", null), [lista[0]]);
});
