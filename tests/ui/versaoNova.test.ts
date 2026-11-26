import { test } from "node:test";
import assert from "node:assert/strict";
import { haVersaoNova } from "../../src/lib/versaoNova.js";

const ABA = "926106719113d6b2e336245d7771c2b4a621423c";

test("versão diferente avisa; a mesma, com quebra de linha, não", () => {
  assert.equal(haVersaoNova("c4351515aaaa6b2e336245d7771c2b4a62142300\n", ABA), true);
  assert.equal(haVersaoNova(`${ABA}\n`, ABA), false);
  assert.equal(haVersaoNova("1795700000000", "1795600000000"), true);
});

test("página HTML, vazio ou lixo não viram aviso", () => {
  for (const t of ["<!doctype html><html></html>", "", "   ", "404 not found", "x".repeat(200)]) assert.equal(haVersaoNova(t, ABA), false);
});
