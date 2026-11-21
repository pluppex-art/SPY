import { test } from "node:test";
import assert from "node:assert/strict";
import { hashSenha, senhaConfere, validaSenha } from "../../server/varejoSupervisor.js";

test("a senha confere com o próprio hash e não confere com outra", async () => {
  const h = await hashSenha("gerente123");
  assert.ok(h.startsWith("scrypt$"));
  assert.equal(await senhaConfere("gerente123", h), true);
  assert.equal(await senhaConfere("gerente124", h), false);
  assert.equal(await senhaConfere("", h), false);
});

test("o mesmo texto gera hashes diferentes (sal aleatório) e o texto puro não aparece no hash", async () => {
  const a = await hashSenha("1234"), b = await hashSenha("1234");
  assert.notEqual(a, b);
  assert.ok(!a.includes("1234") || a.split("$")[1] !== "1234");
  assert.equal(await senhaConfere("1234", a), true);
  assert.equal(await senhaConfere("1234", b), true);
});

test("valores guardados inválidos ou ausentes nunca confirmam", async () => {
  assert.equal(await senhaConfere("1234", null), false);
  assert.equal(await senhaConfere("1234", ""), false);
  assert.equal(await senhaConfere("1234", "texto-qualquer"), false);
  assert.equal(await senhaConfere("1234", "scrypt$zz$"), false);
});

test("validação do tamanho da senha", () => {
  assert.ok(validaSenha("123"));
  assert.ok(validaSenha(undefined));
  assert.ok(validaSenha("x".repeat(65)));
  assert.equal(validaSenha("1234"), null);
});
