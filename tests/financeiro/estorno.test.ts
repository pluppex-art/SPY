import test from "node:test";
import assert from "node:assert/strict";
import { decidirEscritaExterna, soCamposPermitidos, criarEstorno, CAMPOS_TRAVADOS_NO_PAGO } from "../../server/financeEstorno.js";

const pagoNovo = { id: "tnp_fat_1", description: "Reserva", status: "Pago", value: 100, type: "Receber", origem_registro: "api", conta_bancaria_id: "c1" };

test("escrita externa: o que fazer com um lançamento já existente", () => {
  const novo = { value: 100, status: "Pago", type: "Receber" };
  assert.deepEqual(decidirEscritaExterna(null, novo), { acao: "livre" });
  assert.deepEqual(decidirEscritaExterna({ ...pagoNovo, origem_registro: null }, { ...novo, value: 5 }), { acao: "livre" });          // antigo: como sempre
  assert.deepEqual(decidirEscritaExterna({ ...pagoNovo, status: "A Vencer" }, { ...novo, value: 5 }), { acao: "livre" });             // ainda aberto
  assert.deepEqual(decidirEscritaExterna(pagoNovo, novo), { acao: "so_permitidos" });                                                  // reenvio idêntico (idempotente)
  assert.deepEqual(decidirEscritaExterna(pagoNovo, { ...novo, value: 0 }), { acao: "estornar" });
  assert.equal(decidirEscritaExterna(pagoNovo, { ...novo, value: 60 }).acao, "conflito");
  assert.equal(decidirEscritaExterna(pagoNovo, { ...novo, status: "Pendente" }).acao, "conflito");
  assert.equal(decidirEscritaExterna(pagoNovo, { ...novo, type: "Pagar" }).acao, "conflito");
  assert.deepEqual(decidirEscritaExterna({ ...pagoNovo, value: "100.00" }, novo), { acao: "so_permitidos" });
});

test("pagamento confirmado: só campos permitidos seguem no payload", () => {
  const p = soCamposPermitidos({ id: "x", description: "novo texto", value: 9, status: "Pago", type: "Receber", category: "A", category_id: "k", competencia_date: "2026-11-01", conta_bancaria_id: "c", tags: ["t"], counterparty: "João" });
  assert.deepEqual(Object.keys(p).sort(), ["counterparty", "description", "id", "tags"]);
  for (const c of CAMPOS_TRAVADOS_NO_PAGO) assert.equal(c in p, false);
});

test("criarEstorno: ligado ao original, tipo oposto, mesma conta, uma vez só (id fixo)", async () => {
  const chamadas: any[] = [];
  const db = { from: (t: string) => ({
    select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "cat-2-02" } }) }) }) }),
    upsert: async (row: any, opt: any) => { chamadas.push({ t, row, opt }); return { error: null }; },
  }) };
  const r = await criarEstorno(db, "T1", pagoNovo, { counterparty: "João", tags: ["Reserva"] });
  assert.deepEqual(r, {});
  const { row, opt } = chamadas[0];
  assert.equal(row.id, "estorno_tnp_fat_1"); assert.equal(opt.onConflict, "id");
  assert.equal(row.estorno_de, "tnp_fat_1"); assert.equal(row.type, "Pagar"); assert.equal(row.value, 100); assert.equal(row.status, "Pago");
  assert.equal(row.conta_bancaria_id, "c1"); assert.equal(row.category_id, "cat-2-02"); assert.deepEqual(row.tags, ["Reserva", "Estorno"]);
  const pagar = await criarEstorno(db, "T1", { ...pagoNovo, type: "Pagar" });
  assert.equal(chamadas[1].row.type, "Receber"); assert.deepEqual(pagar, {});
});
