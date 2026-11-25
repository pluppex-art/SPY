import { test } from "node:test";
import assert from "node:assert/strict";
import { ehGrupo, mensagemDeGrupo, destinoDosGrupos, montarEnvio, encaminharMensagemDeGrupo } from "../../server/gruposAgenteSecreto.js";

const inst = { id: "i-1", tenant_id: "t-1" };
const grupo = { event: "message", session: "s1", payload: { id: "m1", from: "120363@g.us", participant: "5511@c.us", body: "preciso de um post", fromMe: false } };

test("reconhece grupo e ignora conversa 1:1 e eco", () => {
  assert.equal(ehGrupo("120363@g.us"), true);
  assert.equal(ehGrupo("5511@c.us"), false);
  assert.equal(mensagemDeGrupo(grupo), true);
  assert.equal(mensagemDeGrupo({ event: "message", payload: { from: "5511@c.us" } }), false);
  assert.equal(mensagemDeGrupo({ ...grupo, payload: { ...grupo.payload, fromMe: true } }), false);
  assert.equal(mensagemDeGrupo({ event: "session.status", payload: { from: "1@g.us" } }), false);
  assert.equal(mensagemDeGrupo({ event: "message.any", payload: { chatId: "1@g.us" } }), true);
});

test("destino: padrão, reaproveita cabeçalho/segredo do Radar e aceita os próprios", () => {
  assert.deepEqual(destinoDosGrupos({ RADAR_BUSCA_WEBHOOK_SECRET: "r" } as any), { url: "https://n8n.spycrm.com.br/webhook/agente-secreto-interno-grupos", header: "X-Webhook-Secret", secret: "r" });
  const d = destinoDosGrupos({ N8N_WEBHOOK_BASE: "https://n/x/", AGENTE_SECRETO_GRUPOS_WEBHOOK_HEADER: "X-A", AGENTE_SECRETO_GRUPOS_WEBHOOK_SECRET: "s", RADAR_BUSCA_WEBHOOK_SECRET: "r" } as any);
  assert.deepEqual(d, { url: "https://n/x/agente-secreto-interno-grupos", header: "X-A", secret: "s" });
});

test("envio leva empresa, instância e a mensagem do WAHA", () => {
  const e = montarEnvio(grupo, inst, new Date("2026-11-25T12:00:00Z"));
  assert.equal(e.tenantId, "t-1"); assert.equal(e.instanceId, "i-1"); assert.equal(e.session, "s1");
  assert.equal(e.payload.body, "preciso de um post"); assert.equal(e.recebidoEm, "2026-11-25T12:00:00.000Z");
});

test("encaminha com o cabeçalho; sem segredo não envia; falha não lança", async () => {
  let visto: any;
  const ok = await encaminharMensagemDeGrupo(grupo, inst, { env: { RADAR_BUSCA_WEBHOOK_SECRET: "seg" } as any, postar: async (u, c, cfg) => { visto = { u, c, cfg }; return {}; } });
  assert.equal(ok.ok, true);
  assert.equal(visto.cfg.headers["X-Webhook-Secret"], "seg");
  assert.match(visto.u, /agente-secreto-interno-grupos$/);
  const sem = await encaminharMensagemDeGrupo(grupo, inst, { env: {} as any, postar: async () => { throw new Error("não devia chamar"); } });
  assert.equal(sem.ok, false);
  const falha = await encaminharMensagemDeGrupo(grupo, inst, { env: { RADAR_BUSCA_WEBHOOK_SECRET: "s" } as any, postar: async () => { throw { response: { status: 403 } }; } });
  assert.deepEqual(falha, { ok: false, motivo: "n8n respondeu 403" });
});
