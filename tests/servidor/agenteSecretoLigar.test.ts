import { test } from "node:test";
import assert from "node:assert/strict";
import { agentesDaEquipe, chaveVendasDesligado, ligarOuDesligarAgente } from "../../server/agenteSecretoLigar.js";
import { temWebhookInterno, urlWebhookInterno, webhooksVendas } from "../../server/sessaoAgentes.js";

const N8N = { url: "https://n8n.exemplo/webhook/agente", events: ["message.any"], customHeaders: [{ name: "X-A", value: "1" }] };
const SPY = { url: urlWebhookInterno("https://app.exemplo.com", "inst-1", "seg"), events: ["message.any"] };
const base = () => ({ webhooks: [N8N, SPY], ignore: { status: true, groups: false }, gows: { a: 1 } });

function cenario(opts: { cfg?: any; modules?: any; colab?: any; guardado?: any; modelos?: Record<string, any>; falhaGuardar?: boolean; webhookUrl?: string } = {}) {
  const configs: Record<string, any> = { "sessao-1": opts.cfg ?? base(), ...(opts.modelos ?? {}) };
  const guardado = new Map<string, any>(opts.guardado ? [[chaveVendasDesligado("inst-1"), opts.guardado]] : []);
  const gravacoes: any[] = [];
  const consulta = (resposta: () => any) => { const q: any = { select: () => q, eq: (c: string, v: string) => { q.filtro = { ...q.filtro, [c]: v }; return q; }, limit: () => Promise.resolve(resposta()), maybeSingle: () => Promise.resolve(resposta.call(q)) }; return q; };
  const service = { from: () => { const q: any = { select: () => q, eq: (c: string, v: string) => { if (c === "key") q.key = v; return q; }, maybeSingle: async () => ({ data: guardado.has(q.key) ? { value: guardado.get(q.key) } : null }),
    upsert: async (l: any) => { if (opts.falhaGuardar) return { error: { message: "falhou" } }; guardado.set(l.key, l.value); return { error: null }; } }; return q; } };
  const db = { from: () => consulta(() => ({ data: Object.keys(opts.modelos ?? {}).map((name) => ({ name, colaborador_id: "outro" })) })) };
  const provider = { getSessionConfig: async (n: string) => configs[n] ?? null, updateSessionConfig: async (n: string, c: any) => { configs[n] = c; gravacoes.push(n); } };
  const pedir = (agente: "vendas" | "interno", ligado: boolean) => ligarOuDesligarAgente({ db, service, provider, appUrl: "https://app.exemplo.com",
    tenant: { id: "t1", modules: opts.modules ?? { agente_secreto: true, agente_interno: true } }, colab: opts.colab ?? { id: "c1", nome: "Ana", cargo: "Vendedor" },
    instancia: { id: "inst-1", name: "sessao-1", webhook_secret: "seg", webhook_url: opts.webhookUrl ?? null }, agente, ligado });
  return { pedir, configs, guardado, gravacoes };
}

test("desligar Vendas tira só o webhook do n8n e guarda para voltar igual", async () => {
  const c = cenario();
  assert.deepEqual(await c.pedir("vendas", false), { ok: true, mudou: true });
  assert.deepEqual(c.configs["sessao-1"].webhooks, [SPY]);
  assert.deepEqual(c.configs["sessao-1"].gows, { a: 1 });
  assert.deepEqual(c.guardado.get(chaveVendasDesligado("inst-1")).webhooks, [N8N]);
  await c.pedir("vendas", true);
  assert.deepEqual(c.configs["sessao-1"].webhooks, [N8N, SPY]);
});

test("desligar Interno tira o webhook do SPY, volta a ignorar grupos e mantém Vendas", async () => {
  const c = cenario();
  await c.pedir("interno", false);
  assert.deepEqual(c.configs["sessao-1"].webhooks, [N8N]);
  assert.equal(c.configs["sessao-1"].ignore.groups, true);
  assert.equal(c.configs["sessao-1"].ignore.status, true);
  await c.pedir("interno", true);
  assert.equal(temWebhookInterno(c.configs["sessao-1"], "inst-1"), true);
  assert.equal(c.configs["sessao-1"].ignore.groups, false);
  assert.equal(webhooksVendas(c.configs["sessao-1"]).length, 1);
});

test("os dois desligados e religados um de cada vez", async () => {
  const c = cenario();
  await c.pedir("vendas", false); await c.pedir("interno", false);
  assert.deepEqual(c.configs["sessao-1"].webhooks, []);
  await c.pedir("vendas", true);
  assert.deepEqual(c.configs["sessao-1"].webhooks, [N8N]);
});

test("repetir o pedido não mexe na sessão", async () => {
  const c = cenario();
  assert.deepEqual(await c.pedir("vendas", true), { ok: true, mudou: false });
  assert.deepEqual(await c.pedir("interno", true), { ok: true, mudou: false });
  assert.equal(c.gravacoes.length, 0);
});

test("se não conseguir guardar o webhook, não desliga", async () => {
  const c = cenario({ falhaGuardar: true });
  const r = await c.pedir("vendas", false);
  assert.equal(r.ok, false);
  assert.equal(c.gravacoes.length, 0);
});

test("sem webhook guardado, copia de uma sessão modelo; sem modelo usa o registrado na linha; sem nada recusa", async () => {
  const semN8n = { webhooks: [SPY] };
  const outro = { url: "https://n8n.exemplo/webhook/modelo", events: ["session.status"] };
  const a = cenario({ cfg: semN8n, modelos: { "modelo-1": { webhooks: [outro, SPY] } } });
  await a.pedir("vendas", true);
  assert.deepEqual(webhooksVendas(a.configs["sessao-1"]), [{ ...outro, events: ["message.any"] }]);
  const b = cenario({ cfg: semN8n, webhookUrl: "https://n8n.exemplo/webhook/linha" });
  await b.pedir("vendas", true);
  assert.equal(webhooksVendas(b.configs["sessao-1"])[0].url, "https://n8n.exemplo/webhook/linha");
  const c = cenario({ cfg: semN8n });
  assert.equal((await c.pedir("vendas", true)).ok, false);
});

test("ligar exige módulo contratado e, em Vendas, pessoa de vendas; desligar sempre pode", async () => {
  const semModulo = cenario({ cfg: { webhooks: [] }, modules: {} });
  assert.equal((await semModulo.pedir("interno", true)).ok, false);
  const naoVendedor = cenario({ cfg: { webhooks: [] }, colab: { id: "c1", nome: "Bia", cargo: "Designer", departamento: "Marketing" }, webhookUrl: "https://n8n/x" });
  assert.equal((await naoVendedor.pedir("vendas", true)).ok, false);
  const desliga = cenario({ modules: {}, colab: { id: "c1", nome: "Bia", cargo: "Designer" } });
  assert.deepEqual(await desliga.pedir("vendas", false), { ok: true, mudou: true });
});

test("sessão sem configuração legível não é alterada", async () => {
  const c = cenario();
  delete c.configs["sessao-1"];
  assert.equal((await c.pedir("vendas", false)).ok, false);
  assert.equal(c.gravacoes.length, 0);
});

test("cartões do RH: diz o que está ligado em cada pessoa e não afirma nada sem a configuração", async () => {
  const linhas = [
    { id: "inst-1", name: "a", colaborador_id: "c1", finalidade: "vendas" },
    { id: "inst-2", name: "b", colaborador_id: "c2", finalidade: "vendas" },
    { id: "inst-3", name: "c", colaborador_id: "c3", finalidade: "vendas" },
    { id: "inst-4", name: "d", colaborador_id: "c4", finalidade: "vendas" },
    { id: "inst-5", name: "e", colaborador_id: "c1", finalidade: "interno" },
  ];
  const spy2 = { url: urlWebhookInterno("https://app.exemplo.com", "inst-2", "s") };
  const r = await agentesDaEquipe(linhas, { a: { config: base() }, b: { config: { webhooks: [spy2] } }, c: {}, e: { config: { webhooks: [] } } },
    async (nome) => { if (nome === "c") throw new Error("fora"); return null; });
  assert.deepEqual(r, { c1: { vendas: true, interno: true }, c2: { vendas: false, interno: true } });
});
