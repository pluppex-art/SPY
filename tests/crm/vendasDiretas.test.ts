import test from "node:test";
import assert from "node:assert/strict";
import { diaDaVenda, vendasDiretasComoContratos } from "../../src/lib/vendasDiretas.js";

const leads = [
  { id: "a", status: "Fechado", value: 500, source: "Instagram", date: "2026-11-03", clientName: "Ana" },
  { id: "b", status: "Ganho", value: "1.200,50", source: "Indicação", closed_at: "2026-11-20T15:00:00Z", date: "2026-10-01", name: "Bia" },
  { id: "c", status: "Fechado", value: 300, source: "Site", date: "2026-11-05" },                 // tem proposta: o contrato nasce dela
  { id: "d", status: "Novo", value: 900, date: "2026-11-05" },                                      // ainda aberto
  { id: "e", status: "Fechado", value: 80, source: "Max Data", date: "2026-11-06" },               // importado: entra mesmo com proposta
  { id: "f", status: "Perdido", value: 70, date: "2026-11-06" },
];

test("venda direta: negócio ganho sem proposta vira contrato virtual com valor, canal (leadId) e data de fechamento", () => {
  const r = vendasDiretasComoContratos(leads, [{ lead_id: "c" }, { lead_id: "e" }]);
  assert.deepEqual(r.map((c) => c.id), ["venda-a", "venda-b", "venda-e"]);
  const b = r.find((c) => c.id === "venda-b");
  assert.equal(b.mrr, 1200.5); assert.equal(b.totalValue, 1200.5); assert.equal(b.leadId, "b"); assert.equal(b.date, "20/11/2026"); assert.equal(b.client, "Bia");
  assert.equal(r.find((c) => c.id === "venda-a").date, "03/11/2026");
  assert.equal(r.every((c) => c.status === "Ativo" && c.proposalId === null && c.plan === "Venda"), true);
});

test("data da venda: fechamento, senão cadastro; sem data fica vazia", () => {
  assert.equal(diaDaVenda({ id: "x", closed_at: "2026-02-01T00:00:00Z", date: "2025-01-01" }), "01/02/2026");
  assert.equal(diaDaVenda({ id: "x", date: "2025-12-31" }), "31/12/2025");
  assert.equal(diaDaVenda({ id: "x", created_at: "2025-07-04T10:00:00Z" }), "04/07/2025");
  assert.equal(diaDaVenda({ id: "x" }), "");
  assert.deepEqual(vendasDiretasComoContratos(null, null), []);
});

import { diaDoGanhoISO } from "../../src/lib/vendasDiretas.js";
test("dia do ganho: fechamento; se o Agente Secreto só moveu o card, a última atualização; senão o cadastro", () => {
  assert.equal(diaDoGanhoISO({ id: "1", closed_at: "2026-11-20T10:00:00Z", updated_at: "2026-11-21T10:00:00Z", date: "2026-09-01" }), "2026-11-20");
  assert.equal(diaDoGanhoISO({ id: "2", ganhoPelaEtapa: true, updated_at: "2026-11-21T18:26:48Z", date: "2026-11-18" }), "2026-11-21");
  assert.equal(diaDoGanhoISO({ id: "3", updated_at: "2026-11-21T18:26:48Z", date: "2026-10-05" }), "2026-10-05");     // sem marca de etapa: updated_at NÃO vale (qualquer edição mexe nele)
  assert.equal(diaDoGanhoISO({ id: "4", created_at: "2025-07-04T10:00:00Z" }), "2025-07-04");
  assert.equal(diaDoGanhoISO({ id: "5" }), "");
});
