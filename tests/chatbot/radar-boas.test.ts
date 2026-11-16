import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularBoas, ehQuente } from "../../src/lib/radarBoas.js";

const valor = (v: unknown) => Number(v) || 0;
const agora = new Date("2026-11-17T12:00:00Z").getTime();
const dia = (n: number) => new Date(agora - n * 86400000).toISOString();

test("quente = temperatura quente ou nota alta; fechado/perdido nunca entra", () => {
  assert.equal(ehQuente({ temperature: "quente" }), true);
  assert.equal(ehQuente({ scoreIA: 70 }), true);
  assert.equal(ehQuente({ score_ia: 85 }), true);
  assert.equal(ehQuente({ temperature: "morno", scoreIA: 69 }), false);
  const r = calcularBoas([
    { id: "a", status: "Em Aberto", temperature: "quente", scoreIA: 90, value: 100, timeIdle: 5 },
    { id: "b", status: "Fechado", temperature: "quente", scoreIA: 99, value: 500, updated_at: dia(100) },
    { id: "c", status: "Perdido", temperature: "quente", scoreIA: 99, value: 700 },
  ], valor, agora);
  assert.deepEqual(r.quentes.map((x) => x.l.id), ["a"]);
});

test("esquentando = mexido nas últimas 24h e ainda não quente; quentes têm prioridade", () => {
  const r = calcularBoas([
    { id: "q", status: "Em Aberto", temperature: "quente", value: 10, timeIdle: 0 },
    { id: "m1", status: "Em Aberto", temperature: "morno", scoreIA: 40, value: 300, timeIdle: 0 },
    { id: "m2", status: "Em Aberto", temperature: "frio", scoreIA: 10, value: 900, timeIdle: 1 },
    { id: "velho", status: "Em Aberto", temperature: "morno", value: 50, timeIdle: 3 },
  ], valor, agora);
  assert.deepEqual(r.quentes.map((x) => x.l.id), ["q"]);
  assert.deepEqual(r.esquentando.map((x) => x.l.id), ["m2", "m1"]); // maior valor primeiro
});

test("quentes ordenados por nota e depois por valor; soma do valor", () => {
  const r = calcularBoas([
    { id: "a", status: "Em Aberto", scoreIA: 80, value: 100 },
    { id: "b", status: "Em Aberto", scoreIA: 95, value: 50 },
    { id: "c", status: "Em Aberto", scoreIA: 80, value: 300 },
  ], valor, agora);
  assert.deepEqual(r.quentes.map((x) => x.l.id), ["b", "c", "a"]);
  assert.equal(r.valorQuentes, 450);
});

test("fechados recentemente: só os dos últimos 30 dias, mais novo primeiro; excluídos ficam de fora", () => {
  const r = calcularBoas([
    { id: "novo", status: "Fechado", value: 1000, updated_at: dia(2) },
    { id: "meio", status: "Fechado", value: 500, updated_at: dia(20) },
    { id: "velho", status: "Fechado", value: 9999, updated_at: dia(45) },
    { id: "sem-data", status: "Fechado", value: 5 },
    { id: "del", status: "Fechado", value: 7, updated_at: dia(1), deleted_at: dia(0) },
  ], valor, agora);
  assert.deepEqual(r.fechados.map((x) => x.l.id), ["novo", "meio"]);
  assert.equal(r.valorFechados, 1500);
});
