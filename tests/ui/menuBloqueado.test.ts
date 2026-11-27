import { test } from "node:test";
import assert from "node:assert/strict";
import { secoesExtras } from "../../src/components/layout/menuBloqueado.js";

test("menu: colaborador não vê nada a mais", () => {
  assert.deepEqual(secoesExtras({ admin: false, ligado: () => false }), []);
});

test("menu: cadeado só no que falta; cadastro de usuários aparece quando não há RH", () => {
  const secoes = secoesExtras({ admin: true, ligado: (m) => ["financeiro", "radar"].includes(m) });
  assert.deepEqual(secoes.map((s) => s.title), ["Equipe", "Liberar módulos"]);
  const nomes = secoes[1].items.map((i) => i.name);
  assert.ok(!nomes.includes("Financeiro") && !nomes.includes("Radar de busca e grupos"));
  assert.ok(nomes.includes("Marketing") && nomes.at(-1) === "Todos os módulos");
  assert.deepEqual(secoesExtras({ admin: true, ligado: () => true }).map((s) => s.items.length), [1]);
});
