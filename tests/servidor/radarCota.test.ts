/** Limite diário do Radar e filtro por cidade. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { LIMITE_POR_DIA, reservar, devolver, restanteHoje, naCidade, hojeBR } from "../../server/radarCota.js";
import { pesquisarNoRadar } from "../../src/lib/buscaRadar.js";
import { criarFakeDb } from "../agendamento/fakeDb.js";

const meioDia = Date.parse("2026-11-27T15:00:00Z");

test("cota: no máximo 50 por dia por empresa, com devolução do que não veio", async () => {
  const db = criarFakeDb({ app_settings: [] });
  assert.equal(LIMITE_POR_DIA, 50);
  assert.equal(await restanteHoje(db, "A", meioDia), 50);
  assert.equal(await reservar(db, "A", 20, meioDia), 20);
  assert.equal(await reservar(db, "A", 20, meioDia), 20);
  assert.equal(await reservar(db, "A", 20, meioDia), 10);
  assert.equal(await reservar(db, "A", 5, meioDia), 0);
  await devolver(db, "A", 4, meioDia);
  assert.equal(await restanteHoje(db, "A", meioDia), 4);
  assert.equal(await restanteHoje(db, "B", meioDia), 50); // outra empresa não é afetada
  assert.equal(db.t.app_settings.length, 1);
});

test("cota: vira à meia-noite de Brasília", async () => {
  const db = criarFakeDb({ app_settings: [] });
  await reservar(db, "A", 50, Date.parse("2026-11-28T02:59:00Z")); // 23h59 do dia 27
  assert.equal(hojeBR(Date.parse("2026-11-28T02:59:00Z")), "2026-11-27");
  assert.equal(await restanteHoje(db, "A", Date.parse("2026-11-28T02:59:30Z")), 0);
  assert.equal(await restanteHoje(db, "A", Date.parse("2026-11-28T03:01:00Z")), 50);
});

test("cidade: só aceita endereço da cidade e do estado pedidos", () => {
  assert.equal(naCidade("Quadra 104 Sul, 10 - Plano Diretor Sul, Palmas - TO, 77020-000, Brasil", "Palmas", "TO"), true);
  assert.equal(naCidade("GOIANIA/GO", "Goiânia", "GO"), true);
  assert.equal(naCidade("Rua Palmas, 10 - Centro, Gurupi - TO", "Palmas", "TO"), false);
  assert.equal(naCidade("Centro, Palmas - PR", "Palmas", "TO"), false);
  assert.equal(naCidade("Nova Palmas - TO", "Palmas", "TO"), false);
  assert.equal(naCidade("endereço não encontrado", "Palmas", "TO"), false);
});

test("busca por várias cidades: junta sem repetir e guarda o que veio quando o limite acaba", async () => {
  const pedidos: any[] = [];
  const api = async (_p: string, init?: RequestInit) => {
    const b = JSON.parse(String(init!.body)); pedidos.push(b);
    if (b.cidade === "Gurupi") return new Response(JSON.stringify({ error: "acabou", restante: 0 }), { status: 429 });
    return new Response(JSON.stringify({ resultados: [{ empresa: "A", endereco: "x" }, { empresa: "A", endereco: "x" }], restante: 1 }));
  };
  const r = await pesquisarNoRadar(api, { tipo: "academias", cidades: [{ cidade: "Palmas", uf: "TO" }, { cidade: "Gurupi", uf: "TO" }], quantidade: 10 });
  assert.deepEqual([r.empresas.length, r.restante, r.aviso], [1, 0, "acabou"]);
  assert.equal(pedidos[0].criterio, "academias em Palmas/TO");
  await assert.rejects(() => pesquisarNoRadar(api, { tipo: "", cidades: [], quantidade: 10 }));
});
