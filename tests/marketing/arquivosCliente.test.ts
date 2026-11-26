import test from "node:test";
import assert from "node:assert/strict";
import { LIMITE_ARQUIVO, abreNoNavegador, chaveDoArquivo, motivoRecusa, nomeExibido, nomeSeguro, pastaDaCategoria, tamanhoLegivel } from "../../src/lib/arquivosCliente.js";

test("nome do arquivo: sem acento nem símbolo recusado, extensão mantida", () => {
  assert.equal(nomeSeguro("Relatório de março (v2).pdf"), "Relatorio de marco (v2).pdf");
  assert.equal(nomeSeguro("a/b\\c#d%e.png"), "a_b_c_d_e.png");
  assert.equal(nomeSeguro("..escondido.txt"), "escondido.txt");
  assert.equal(nomeSeguro("???"), "_");
  assert.equal(nomeSeguro(""), "arquivo");
  const longo = nomeSeguro(`${"x".repeat(300)}.docx`);
  assert.equal(longo.length, 120);
  assert.ok(longo.endsWith(".docx"));
});

test("chave no armazenamento volta ao nome na tela", () => {
  const chave = chaveDoArquivo("Contrato 2026.pdf", 1795000000000);
  assert.equal(chave, "1795000000000__Contrato 2026.pdf");
  assert.equal(nomeExibido(chave), "Contrato 2026.pdf");
  assert.equal(nomeExibido("sem-prefixo.pdf"), "sem-prefixo.pdf");
  // A primeira pasta é a empresa: é por ela que o armazenamento separa o acesso.
  assert.equal(pastaDaCategoria("t1", "c1", "contratos"), "t1/clientes/c1/contratos");
});

test("o que entra e o que abre no navegador", () => {
  assert.equal(motivoRecusa({ name: "arte.psd", size: 10 }), null);
  assert.ok(motivoRecusa({ name: "virus.EXE", size: 10 }));
  assert.ok(motivoRecusa({ name: "pagina.html", size: 10 }));
  assert.ok(motivoRecusa({ name: "vazio.pdf", size: 0 }));
  assert.ok(motivoRecusa({ name: "video.mp4", size: LIMITE_ARQUIVO + 1 }));
  assert.equal(abreNoNavegador("a.PDF"), true);
  assert.equal(abreNoNavegador("a.docx"), false);
  assert.equal(tamanhoLegivel(900), "900 B");
  assert.equal(tamanhoLegivel(1536 * 1024), "1,5 MB");
});
