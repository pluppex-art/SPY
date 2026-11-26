import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizarGruposRadar, registerRadarGruposRoutes } from "../../server/radarGruposMonitorados.js";
import { destinoRadarGrupos, rotearMensagemDeGrupo, idDoGrupo } from "../../server/gruposAgenteSecreto.js";

const V = "11111111-1111-4111-8111-111111111111";
const g = { group_chat_id: "120363000000000000@g.us", group_name: "Clientes", vendedor_colaborador_id: V };
const msg = { event: "message", session: "s", payload: { id: "m1", from: "120363000000000000@g.us", participant: "5511@c.us", body: "quero comprar", fromMe: false } };
const inst = { id: "i1", tenant_id: "t1" };

test("grupos do Radar: exige id @g.us, nome, vendedor uuid, sem repetição", () => {
  assert.equal((sanitizarGruposRadar([g]) as any).ok, true);
  assert.equal((sanitizarGruposRadar([{ ...g, group_chat_id: "5511@c.us" }]) as any).ok, false);
  assert.equal((sanitizarGruposRadar([{ ...g, group_name: " " }]) as any).ok, false);
  assert.equal((sanitizarGruposRadar([{ ...g, vendedor_colaborador_id: "" }]) as any).ok, false);
  assert.equal((sanitizarGruposRadar([{ ...g, vendedor_colaborador_id: "x" }]) as any).ok, false);
  assert.equal((sanitizarGruposRadar([g, g]) as any).ok, false);
  assert.equal((sanitizarGruposRadar([{ ...g, ativo: false }]) as any).grupos[0].ativo, false);
});

test("destino do Radar: troca o prefixo do webhook de busca e usa segredo próprio", () => {
  const d = destinoRadarGrupos("https://n8n.x/webhook/radar-busca-direta-27ef95ee84", { RADAR_GRUPOS_WEBHOOK_SECRET: "s" } as any);
  assert.deepEqual(d, { url: "https://n8n.x/webhook/radar-whatsapp-grupos-27ef95ee84", header: "X-Radar-Grupos-Secret", secret: "s" });
  assert.equal(destinoRadarGrupos(null, {} as any).url, null);
  assert.equal(destinoRadarGrupos("https://n8n.x/webhook/outra-coisa", {} as any).url, null);
});

const dbFake = (radar: any[], url: string | null) => ({
  from: (t: string) => {
    const q: any = { select: () => q, eq: () => q, limit: () => Promise.resolve({ data: radar }), maybeSingle: () => Promise.resolve({ data: url ? { value: { url } } : null }) };
    return q;
  },
});

test("roteia: grupo do Radar vai ao Radar da empresa; outro vai ao interno; sem segredo/endereço não envia", async () => {
  assert.equal(idDoGrupo(msg), "120363000000000000@g.us");
  const vistos: any[] = [];
  const postar = async (u: string, c: any, cfg: any) => { vistos.push({ u, cfg }); return {}; };
  const env = { RADAR_GRUPOS_WEBHOOK_SECRET: "rs", AGENTE_SECRETO_GRUPOS_WEBHOOK_SECRET: "is" } as any;
  const url = "https://n8n.x/webhook/radar-busca-direta-abc";

  const r1 = await rotearMensagemDeGrupo(dbFake([{ id: 1 }], url), msg, inst, { env, postar });
  assert.deepEqual([r1.ok, r1.destino], [true, "radar"]);
  assert.equal(vistos[0].u, "https://n8n.x/webhook/radar-whatsapp-grupos-abc");
  assert.equal(vistos[0].cfg.headers["X-Radar-Grupos-Secret"], "rs");

  const r2 = await rotearMensagemDeGrupo(dbFake([], url), msg, inst, { env, postar });
  assert.deepEqual([r2.ok, r2.destino], [true, "interno"]);
  assert.match(vistos[1].u, /agente-secreto-interno-grupos$/);

  const r3 = await rotearMensagemDeGrupo(dbFake([{ id: 1 }], null), msg, inst, { env, postar });
  assert.deepEqual([r3.ok, r3.destino], [false, "radar"]);
  const r4 = await rotearMensagemDeGrupo(dbFake([{ id: 1 }], url), msg, inst, { env: {} as any, postar });
  assert.equal(r4.ok, false);
  assert.equal(vistos.length, 2);
});

// Rotas com banco de mentira
function fakeRotas(modules: any, { outros = [] as any[], atuais = [] as any[], colab = [{ id: V, nome: "Ana", phone: "(63) 99999-1111" }] } = {}) {
  const calls: any[] = [];
  const db = { calls, from(t: string) {
    const q: any = {};
    q.select = () => q; q.eq = () => q; q.order = () => Promise.resolve({ data: atuais, error: null });
    q.in = () => (t === "colaboradores" ? Promise.resolve({ data: colab }) : t === "radar_grupos_monitorados" ? Object.assign(Promise.resolve({ data: outros }), { }) : q);
    q.maybeSingle = async () => (t === "tenants" ? { data: { modules } } : { data: null });
    q.delete = () => ({ eq: () => ({ in: async () => { calls.push({ op: "delete", t }); return { error: null }; } }) });
    q.upsert = async (v: any) => { calls.push({ op: "upsert", t, v }); return { error: null }; };
    return q;
  } };
  const rotas: Record<string, any> = {};
  const a: any = { get: (p: string, ...h: any[]) => { rotas["GET " + p] = h[h.length - 1]; }, put: (p: string, ...h: any[]) => { rotas["PUT " + p] = h[h.length - 1]; } };
  const mw = (_q: any, _r: any, n: any) => n && n();
  registerRadarGruposRoutes(a, { requireUser: mw, requireTenantAdmin: mw, resolveRequestedTenantId: async () => "t1", supabaseService: db, limiter: mw });
  return { db, rotas };
}
const resp = () => { const r: any = { code: 200, body: null }; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };

test("rotas do Radar: sem módulo é 403; com módulo grava com nome e telefone do vendedor; grupo de outra empresa é 409", async () => {
  const sem = fakeRotas({ crm: true });
  const p0 = resp(); await sem.rotas["PUT /api/radar/grupos"]({ body: { grupos: [g] } }, p0);
  assert.equal(p0.code, 403); assert.equal(sem.db.calls.length, 0);

  const ok = fakeRotas({ radar: true });
  const p1 = resp(); await ok.rotas["PUT /api/radar/grupos"]({ body: { grupos: [g] } }, p1);
  assert.equal(p1.code, 200);
  const up = ok.db.calls.find((c: any) => c.op === "upsert");
  assert.equal(up.v[0].vendedor_nome, "Ana"); assert.equal(up.v[0].vendedor_phone, "63999991111"); assert.equal(up.v[0].tenant_id, "t1");

  const alheio = fakeRotas({ radar: true }, { outros: [{ group_chat_id: g.group_chat_id, tenant_id: "outra" }] });
  const p2 = resp(); await alheio.rotas["PUT /api/radar/grupos"]({ body: { grupos: [g] } }, p2);
  assert.equal(p2.code, 409); assert.equal(alheio.db.calls.length, 0);

  const semVend = fakeRotas({ radar: true }, { colab: [] });
  const p3 = resp(); await semVend.rotas["PUT /api/radar/grupos"]({ body: { grupos: [g] } }, p3);
  assert.equal(p3.code, 400);
});
