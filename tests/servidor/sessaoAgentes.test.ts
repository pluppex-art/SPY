import { test } from "node:test";
import assert from "node:assert/strict";
import { urlWebhookInterno, temWebhookInterno, comWebhookInterno, grupoCadastradoNaEmpresa } from "../../server/sessaoAgentes.js";

const URL = urlWebhookInterno("https://app.exemplo.com/", "inst-1", "seg");

test("url do webhook do SPY", () => assert.equal(URL, "https://app.exemplo.com/api/whatsapp/webhook/inst-1?secret=seg"));

test("acrescenta o webhook do SPY sem mexer no do n8n e libera os grupos", () => {
  const cfg = { webhooks: [{ url: "https://n8n/x", events: ["message.any"], hmac: { key: "k" } }], ignore: { status: true, groups: true, channels: true }, gows: { a: 1 } };
  const novo = comWebhookInterno(cfg, URL, "inst-1");
  assert.equal(novo.webhooks.length, 2);
  assert.deepEqual(novo.webhooks[0], cfg.webhooks[0]);
  assert.deepEqual(novo.webhooks[1], { url: URL, events: ["message.any"] });
  assert.deepEqual(novo.ignore, { status: true, groups: false, channels: true });
  assert.deepEqual(novo.gows, { a: 1 });
  assert.equal(cfg.ignore.groups, true); // não altera o original
});

test("é idempotente e reconhece sessão que já tem o webhook", () => {
  const uma = comWebhookInterno({ webhooks: [] }, URL, "inst-1");
  assert.equal(temWebhookInterno(uma, "inst-1"), true);
  assert.equal(temWebhookInterno(uma, "outra"), false);
  assert.equal(comWebhookInterno(uma, URL, "inst-1").webhooks.length, 1);
});

test("config vazia ou ausente não quebra", () => {
  assert.equal(temWebhookInterno(null, "i"), false);
  const n = comWebhookInterno(undefined, URL, "i");
  assert.equal(n.webhooks.length, 1); assert.equal(n.ignore.groups, false);
});

const db = (interno: any[], radar: any[], erro = false) => ({ from(t: string) {
  const f: any = {}; const q: any = {};
  q.select = () => q; q.eq = (k: string, v: any) => { f[k] = v; return q; };
  q.maybeSingle = async () => { if (erro) throw new Error("x"); return { data: { value: { grupos: interno } } }; };
  q.limit = async () => ({ data: radar.filter((r) => r === f.group_chat_id).map((r) => ({ id: r })) });
  return q;
} });

test("sessão pessoal: só grupo cadastrado (interno ativo ou radar) passa; erro e grupo pausado descartam", async () => {
  const base = db([{ group_chat_id: "a@g.us" }, { group_chat_id: "p@g.us", ativo: false }], ["r@g.us"]);
  assert.equal(await grupoCadastradoNaEmpresa(base, "t", "a@g.us"), true);
  assert.equal(await grupoCadastradoNaEmpresa(base, "t", "r@g.us"), true);
  assert.equal(await grupoCadastradoNaEmpresa(base, "t", "familia@g.us"), false);
  assert.equal(await grupoCadastradoNaEmpresa(base, "t", "p@g.us"), false);
  assert.equal(await grupoCadastradoNaEmpresa(db([], [], true), "t", "a@g.us"), false);
  assert.equal(await grupoCadastradoNaEmpresa(base, "t", ""), false);
});
