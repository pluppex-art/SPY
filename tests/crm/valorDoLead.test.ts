import test from "node:test";
import assert from "node:assert/strict";
import { prepararValor, valorDoLead, somarLeads } from "../../src/lib/valorDoLead.js";

const produtos = [{ id: "a", price: 100 }, { id: "b", price: "250.50" }, { id: "c", price: 0 }];
const propostas = [
  { lead_id: "L3", valor: 900, created_at: "2026-11-01" }, { lead_id: "L3", valor: 1200, created_at: "2026-11-10" },
  { lead_id: "L6", valor: 0, created_at: "2026-11-02" },
];
const ctx = prepararValor(propostas, produtos);

test("valor do negócio: a primeira regra que existir vence", () => {
  assert.deepEqual(valorDoLead({ id: "L1", value: 500, productIds: ["a"] }, ctx), { valor: 500, origem: "valor", estimado: false });          // valor próprio manda
  assert.deepEqual(valorDoLead({ id: "L2", value: "1.500,50" }, ctx), { valor: 1500.5, origem: "valor", estimado: false });                  // texto brasileiro
  assert.deepEqual(valorDoLead({ id: "L3", value: 0 }, ctx), { valor: 1200, origem: "proposta", estimado: false });                          // proposta MAIS RECENTE
  assert.deepEqual(valorDoLead({ id: "L4", status: "Novo", value: 0, productIds: ["a", "b", "a"] }, ctx), { valor: 350.5, origem: "catalogo", estimado: true }); // aberto: preço de tabela, sem repetir produto
  assert.deepEqual(valorDoLead({ id: "L4", status: "Fechado", value: 0, productIds: ["a", "b"] }, ctx), { valor: 0, origem: "nenhuma", estimado: false });   // ganho por R$ 0 (cortesia): não inventa receita
  assert.deepEqual(valorDoLead({ id: "L4", status: "Perdido", value: 0, productIds: ["a"] }, ctx), { valor: 0, origem: "nenhuma", estimado: false });
  assert.deepEqual(valorDoLead({ id: "L5", status: "Novo", value: null, productIds: ["c"] }, ctx), { valor: 0, origem: "nenhuma", estimado: false });
  assert.deepEqual(valorDoLead({ id: "L7" }, ctx), { valor: 0, origem: "nenhuma", estimado: false });
  assert.deepEqual(valorDoLead(null, ctx), { valor: 0, origem: "nenhuma", estimado: false });
});

test("produtos de interesse: só sem proposta, como o card já fazia; com proposta, a proposta manda", () => {
  const interesse = { customFields: { produtosInteresseIds: ["a", "b"] } };
  assert.deepEqual(valorDoLead({ id: "L8", value: 0, ...interesse }, ctx), { valor: 350.5, origem: "interesse", estimado: false });
  assert.equal(valorDoLead({ id: "L3", value: 0, ...interesse }, ctx).origem, "proposta");
  assert.equal(valorDoLead({ id: "L6", value: 700, ...interesse }, ctx).origem, "valor");   // proposta de valor 0 ainda conta como "tem proposta"
  assert.deepEqual(valorDoLead({ id: "L9", value: 5, interesseIds: ["a"] }, ctx), { valor: 100, origem: "interesse", estimado: false });
});

test("soma: mesmo critério em qualquer tela; mostra quanto do total é estimado e quantos ficaram sem valor", () => {
  const r = somarLeads([{ id: "L1", value: 500 }, { id: "L3", value: 0 }, { id: "L4", status: "Novo", value: 0, productIds: ["a"] }, { id: "L7" }, { id: "L10", status: "Fechado", value: 0, productIds: ["a"] }], ctx);
  assert.deepEqual(r, { total: 1800, estimado: 100, quantidade: 5, quantidadeEstimados: 1, semValor: 2 });
  assert.deepEqual(somarLeads(null, ctx), { total: 0, estimado: 0, quantidade: 0, quantidadeEstimados: 0, semValor: 0 });
});

import { isLeadWon, isLeadOpen, normalizarStatusLead } from "../../src/lib/leadStatus.js";
test("Fechado, Ganho e Ganhou são a mesma coisa: ganho nunca conta como aberto", () => {
  for (const s of ["Fechado", "Ganho", "Ganhou"]) { assert.equal(isLeadWon(s), true, s); assert.equal(isLeadOpen(s), false, s); assert.equal(normalizarStatusLead(s), "Fechado"); }
  for (const s of ["Novo", "Em Aberto", "Em Negociacao", "Perdido", "Desqualificado", null, undefined, ""]) assert.equal(isLeadWon(s as any), false, String(s));
  assert.equal(normalizarStatusLead("Perdido"), "Perdido");
  assert.equal(isLeadOpen("Novo"), true); assert.equal(isLeadOpen("Perdido"), false);
  // o valor do negócio em aberto só usa preço de tabela quando NÃO é ganho em nenhum dos nomes
  const ctx2 = prepararValor([], [{ id: "p", price: 100 }]);
  assert.equal(valorDoLead({ id: "x", status: "Ganho", value: 0, productIds: ["p"] }, ctx2).valor, 0);
  assert.equal(valorDoLead({ id: "x", status: "Em Aberto", value: 0, productIds: ["p"] }, ctx2).valor, 100);
});
