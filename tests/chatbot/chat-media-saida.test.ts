import { test } from "node:test";
import assert from "node:assert/strict";
import { validarMidiaSaida, nomeSeguro, rotuloHistorico, LIMITE_BYTES } from "../../server/chatMediaSaida.js";

const b64 = (n: number) => Buffer.alloc(n, 1).toString("base64");

test("imagem jpeg válida passa e remove o prefixo data:", () => {
  const r = validarMidiaSaida({ kind: "image", mimetype: "image/jpeg", filename: "foto.jpg", data: "data:image/jpeg;base64," + b64(1000), caption: " oi " });
  assert.equal(r.ok, true);
  if (r.ok) { assert.equal(r.midia.caption, "oi"); assert.equal(r.midia.bytes, 1000); assert.ok(!r.midia.data.startsWith("data:")); }
});

test("áudio com parâmetros de codec é aceito (ogg; codecs=opus)", () => {
  const r = validarMidiaSaida({ kind: "audio", mimetype: "audio/ogg; codecs=opus", data: b64(500) });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.midia.mimetype, "audio/ogg; codecs=opus");
});

test("tipos perigosos ou trocados são recusados", () => {
  for (const [kind, mimetype] of [["document", "application/x-msdownload"], ["document", "text/html"], ["image", "image/svg+xml"], ["image", "application/pdf"], ["audio", "video/mp4"]] as const) {
    assert.equal(validarMidiaSaida({ kind, mimetype, data: b64(10) }).ok, false, `${kind} ${mimetype}`);
  }
  assert.equal(validarMidiaSaida({ kind: "script", mimetype: "text/plain", data: b64(10) }).ok, false);
});

test("arquivo acima do limite ou vazio ou com base64 inválido é recusado", () => {
  assert.equal(validarMidiaSaida({ kind: "document", mimetype: "application/pdf", data: b64(LIMITE_BYTES + 10) }).ok, false);
  assert.equal(validarMidiaSaida({ kind: "document", mimetype: "application/pdf", data: "" }).ok, false);
  assert.equal(validarMidiaSaida({ kind: "document", mimetype: "application/pdf", data: "isso não é base64!!" }).ok, false);
  assert.equal(validarMidiaSaida({ kind: "document", mimetype: "application/pdf", data: b64(LIMITE_BYTES - 10) }).ok, true);
});

test("nome do arquivo: sem caminho, sem controle, sem ponto inicial, com limite", () => {
  assert.equal(nomeSeguro("../../etc/passwd", "x"), "passwd");
  assert.equal(nomeSeguro("C:\\temp\\a b.pdf", "x"), "a b.pdf");
  assert.equal(nomeSeguro("\u0000\u0007", "padrao"), "padrao");
  assert.equal(nomeSeguro(".bashrc", "x"), "bashrc");
  assert.equal(nomeSeguro("a".repeat(300) + ".pdf", "x").length, 120);
});

test("rótulo do histórico", () => {
  assert.equal(rotuloHistorico({ kind: "image", filename: "f.jpg", caption: "" }), "📷 Imagem");
  assert.equal(rotuloHistorico({ kind: "document", filename: "contrato.pdf", caption: "segue" }), "📎 contrato.pdf\nsegue");
  assert.equal(rotuloHistorico({ kind: "audio", filename: "a", caption: "" }), "🎤 Áudio");
});
