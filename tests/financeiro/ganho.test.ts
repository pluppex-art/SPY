import test from "node:test";
import assert from "node:assert/strict";
import { deveLancarGanho, idLancamentoDoGanho, montarLancamentoDoGanho } from "../../src/pages/finance/lib/ganho.js";

test("ganho sem proposta lança no financeiro: só com valor, sem proposta e uma vez", () => {
  assert.equal(deveLancarGanho(500, false, false), true);
  assert.equal(deveLancarGanho(0, false, false), false);      // sem valor: nada a lançar
  assert.equal(deveLancarGanho(500, true, false), false);     // com proposta, quem lança é a proposta aceita
  assert.equal(deveLancarGanho(500, false, true), false);     // já lançado (status foi e voltou)
});

test("lançamento do ganho: conta a receber pendente, id fixo por negócio, categoria de vendas do plano quando existe", () => {
  const lead = { id: "L1", name: "João", title: "Plano anual", clientName: "João Silva", clientId: "c1" };
  const l = montarLancamentoDoGanho(lead, 1500.5, "2026-11-21", [{ id: "cat11", nome: "Venda de produtos", tipo: "Receita", codigo: "1.01" }]);
  assert.equal(l.id, idLancamentoDoGanho("L1")); assert.equal(l.id, "ganho_L1");
  assert.equal(l.type, "Receber"); assert.equal(l.status, "A Vencer"); assert.equal(l.value, 1500.5);
  assert.equal(l.date, "2026-11-21"); assert.equal(l.competencia_date, "2026-11-21");
  assert.equal(l.category_id, "cat11"); assert.equal(l.counterparty, "João Silva"); assert.equal(l.contato_id, "c1");
  assert.equal(l.description, "Venda - Plano anual");
  const sem = montarLancamentoDoGanho({ id: "L2", name: "Maria" }, 10, "2026-11-21", []);
  assert.equal(sem.category, "Vendas"); assert.equal(sem.category_id, null); assert.equal(sem.description, "Venda - Maria");
});
