import { test } from "node:test";
import assert from "node:assert/strict";
import { acionarAgentesDoCliente, INTERVALO_MS } from "../../server/agentesImplementacao.js";
import { modulosDeAgenteNovos } from "../../src/lib/modulosDeAgente.js";
import { agendarAgentes } from "../../src/lib/agendarAgentes.js";

const RAIZ = "raiz";
function banco(modules: any) {
  const settings: Record<string, any> = {};
  return {
    settings,
    from(t: string) {
      const f: any = {}; const q: any = {};
      q.select = () => q; q.eq = (k: string, v: any) => { f[k] = v; return q; };
      q.maybeSingle = async () => t === "tenants"
        ? { data: modules === undefined ? null : { id: f.id, name: " Loja Teste ", modules } }
        : { data: settings[f.tenant_id] ? { value: settings[f.tenant_id] } : null };
      q.upsert = async (row: any) => { settings[row.tenant_id] = row.value; return { error: null }; };
      return q;
    },
  };
}
const env = { SPY_IMPLEMENTACAO_WEBHOOK_SECRET: "s" };
function chamadas(status = 200) {
  const lista: any[] = [];
  const fetchImpl = (async (url: string, init: any) => { lista.push({ url, headers: init.headers, body: JSON.parse(init.body) }); return { ok: status < 300, status }; }) as any;
  return { lista, fetchImpl };
}

test("módulos novos: só os que passaram a ligado", () => {
  assert.deepEqual(modulosDeAgenteNovos({ aurora: true, crm: false }, { aurora: true, crm: true, agente_secreto: true, radar: true, sdr: true }), ["agente_secreto"]);
  assert.deepEqual(modulosDeAgenteNovos({ aurora: true }, { aurora: false }), []);
  assert.deepEqual(modulosDeAgenteNovos(null, { aurora: true, cs: "true" }), ["aurora"]);
});

test("chama o agente sem telefone e com o nome da empresa", async () => {
  const c = chamadas();
  const r = await acionarAgentesDoCliente({ db: banco({ aurora: true }), tenantRaiz: RAIZ, env, fetchImpl: c.fetchImpl }, "t1");
  assert.deepEqual(r, { status: "acionado", modulos: ["aurora"] });
  assert.equal(c.lista[0].body.phone, ""); assert.equal(c.lista[0].body.company, "Loja Teste"); assert.equal(c.lista[0].body.tenant_id, "t1");
  assert.equal(c.lista[0].headers["X-Webhook-Secret"], "s");
});

test("não chama: empresa dona, sem módulo, sem segredo ou inexistente", async () => {
  const c = chamadas();
  const base = { tenantRaiz: RAIZ, env, fetchImpl: c.fetchImpl };
  assert.equal((await acionarAgentesDoCliente({ ...base, db: banco({ aurora: true }) }, RAIZ)).status, "ignorado");
  assert.equal((await acionarAgentesDoCliente({ ...base, db: banco({ crm: true }) }, "t1")).status, "ignorado");
  assert.equal((await acionarAgentesDoCliente({ ...base, env: {}, db: banco({ aurora: true }) }, "t1")).status, "falhou");
  assert.equal((await acionarAgentesDoCliente({ ...base, db: banco(undefined) }, "t1")).status, "falhou");
  assert.equal(c.lista.length, 0);
});

test("segunda chamada em seguida aguarda; depois do intervalo passa", async () => {
  const c = chamadas(); let t = Date.parse("2026-11-27T10:00:00Z");
  const deps = { db: banco({ aurora: true }), tenantRaiz: RAIZ, env, fetchImpl: c.fetchImpl, agora: () => t };
  await acionarAgentesDoCliente(deps, "t1");
  t += 5000;
  assert.deepEqual(await acionarAgentesDoCliente(deps, "t1"), { status: "aguarde", segundos: 25 });
  t += INTERVALO_MS;
  assert.equal((await acionarAgentesDoCliente(deps, "t1")).status, "acionado");
  assert.equal(c.lista.length, 2);
});

test("falha do n8n libera para tentar de novo", async () => {
  const db = banco({ aurora: true });
  const r = await acionarAgentesDoCliente({ db, tenantRaiz: RAIZ, env, fetchImpl: chamadas(500).fetchImpl }, "t1");
  assert.equal(r.status, "falhou");
  assert.equal((await acionarAgentesDoCliente({ db, tenantRaiz: RAIZ, env, fetchImpl: chamadas().fetchImpl }, "t1")).status, "acionado");
});

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
test("cliques seguidos viram uma chamada; 'aguarde' tenta de novo", async () => {
  let n = 0; const avisos: string[] = [];
  const chamar = async () => { n++; return { status: "acionado" as const }; };
  agendarAgentes("a", chamar, (r) => avisos.push(r.status), 20);
  agendarAgentes("a", chamar, (r) => avisos.push(r.status), 20);
  await espera(80);
  assert.equal(n, 1); assert.deepEqual(avisos, ["acionado"]);
  let m = 0;
  agendarAgentes("b", async () => (++m === 1 ? { status: "aguarde" as const, segundos: 0.001 } : { status: "acionado" as const }), (r) => avisos.push(r.status), 10, 2);
  await espera(1200);
  assert.equal(m, 2); assert.equal(avisos.length, 2);
});
