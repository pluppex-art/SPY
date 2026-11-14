import { test } from "node:test";
import assert from "node:assert/strict";
import { sessoesModelo } from "../../server/agenteSecretoModelo";

test("prefere sessões pessoais; sem elas, usa a sessão do Agente Secreto da empresa", () => {
  const luminar = [
    { name: "agente_secreto-luminar" }, { name: "closer-luminar-loja-el" }, { name: "cs-luminar-loja-eletri" },
    { name: "radar-luminar-loja-ele" }, { name: "sdr-luminar-loja-eletr" },
  ];
  assert.deepEqual(sessoesModelo(luminar).map((s) => s.name), ["agente_secreto-luminar"]); // closer/cs/radar/sdr não servem de modelo
  const comPessoal = [{ name: "agente_secreto-x" }, { name: "agente-secreto-Maria", colaborador_id: "c1" }];
  assert.deepEqual(sessoesModelo(comPessoal).map((s) => s.name), ["agente-secreto-Maria", "agente_secreto-x"]);
  assert.deepEqual(sessoesModelo([{ name: "sdr-x" }]), []);
});
