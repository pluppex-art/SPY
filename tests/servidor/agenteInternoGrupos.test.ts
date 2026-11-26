import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizarGrupo, sanitizarGrupos, registerAgenteInternoGruposRoutes } from "../../server/agenteInternoGrupos.js";

const base = { group_chat_id: "120363000000000000@g.us", group_name: "Marketing time", departamento: "Marketing", responsavel_phone: "(11) 91234-5678" };
const U = "11111111-1111-4111-8111-111111111111";

test("grupo válido é normalizado (departamento minúsculo, telefone só dígitos, padrões de notificação)", () => {
  const r = sanitizarGrupo(base) as any;
  assert.equal(r.ok, true);
  assert.equal(r.grupo.departamento, "marketing");
  assert.equal(r.grupo.responsavel_phone, "11912345678");
  assert.deepEqual([r.grupo.notificar_sistema, r.grupo.notificar_whatsapp, r.grupo.notificar_email, r.grupo.ativo], [true, true, false, true]);
  assert.equal(r.grupo.responsavel_user_id, null);
});

test("recusa id sem @g.us, nome vazio, departamento fora da lista, telefone curto, e-mail ruim e responsável que não é uuid", () => {
  assert.equal((sanitizarGrupo({ ...base, group_chat_id: "5511999999999@c.us" }) as any).ok, false);
  assert.equal((sanitizarGrupo({ ...base, group_name: " " }) as any).ok, false);
  assert.equal((sanitizarGrupo({ ...base, departamento: "juridico" }) as any).ok, false);
  assert.equal((sanitizarGrupo({ ...base, responsavel_phone: "123" }) as any).ok, false);
  assert.equal((sanitizarGrupo({ ...base, responsavel_email: "x" }) as any).ok, false);
  assert.equal((sanitizarGrupo({ ...base, responsavel_user_id: "abc" }) as any).ok, false);
  assert.equal((sanitizarGrupo({ ...base, responsavel_user_id: U }) as any).ok, true);
});

test("preserva o que a tela não edita (dev_project_id, whatsapp_session) do que já estava gravado", () => {
  const r = sanitizarGrupos([base], [{ group_chat_id: base.group_chat_id, dev_project_id: "p1", whatsapp_session: "s1" }]) as any;
  assert.equal(r.grupos[0].dev_project_id, "p1");
  assert.equal(r.grupos[0].whatsapp_session, "s1");
});

test("lista: id repetido, formato errado e excesso são recusados", () => {
  assert.equal((sanitizarGrupos([base, base]) as any).ok, false);
  assert.equal((sanitizarGrupos("x") as any).ok, false);
  assert.equal((sanitizarGrupos(Array.from({ length: 101 }, (_, i) => ({ ...base, group_chat_id: `g${i}abc@g.us` }))) as any).ok, false);
});

// Rotas com banco de mentira
function fakeDb(modules: any, settings: any = null, doRadar: any[] = []) {
  const calls: any[] = [];
  const db = {
    calls,
    from(t: string) {
      const q: any = { t, f: {} };
      q.select = () => q; q.eq = (k: string, v: any) => { q.f[k] = v; return q; }; q.in = () => q; q.limit = async () => ({ data: t === "radar_grupos_monitorados" ? doRadar : [] });
      q.maybeSingle = async () => (t === "tenants" ? { data: { modules } } : t === "app_settings" ? { data: settings } : { data: null });
      q.then = undefined;
      q.update = (v: any) => { calls.push({ op: "update", t, v }); return { eq: async () => ({ error: null }) }; };
      q.insert = async (v: any) => { calls.push({ op: "insert", t, v }); return { error: null }; };
      return q;
    },
  };
  return db;
}
function app() {
  const rotas: Record<string, any> = {};
  const a: any = { get: (p: string, ...h: any[]) => { rotas["GET " + p] = h[h.length - 1]; }, put: (p: string, ...h: any[]) => { rotas["PUT " + p] = h[h.length - 1]; } };
  return { a, rotas };
}
const res = () => { const r: any = { code: 200, body: null }; r.status = (c: number) => { r.code = c; return r; }; r.json = (b: any) => { r.body = b; return r; }; return r; };
const mw = (_q: any, _r: any, n: any) => n && n();

test("empresa sem o módulo: GET devolve contratado:false e PUT é 403 (nada é gravado)", async () => {
  const db: any = fakeDb({ crm: true });
  const { a, rotas } = app();
  registerAgenteInternoGruposRoutes(a, { requireUser: mw, requireTenantAdmin: mw, resolveRequestedTenantId: async () => "t1", supabaseService: db, limiter: mw });
  const g = res(); await rotas["GET /api/agente-interno/grupos"]({}, g);
  assert.equal(g.body.contratado, false); assert.deepEqual(g.body.grupos, []);
  const p = res(); await rotas["PUT /api/agente-interno/grupos"]({ body: { grupos: [base] } }, p);
  assert.equal(p.code, 403); assert.equal(db.calls.length, 0);
});

test("empresa com o módulo: lê e grava no mesmo cadastro que o n8n usa", async () => {
  const db: any = fakeDb({ agente_interno: true }, { id: "s1", value: { grupos: [{ ...base, group_chat_id: "120363000000000000@g.us", dev_project_id: "p1" }] } });
  const { a, rotas } = app();
  registerAgenteInternoGruposRoutes(a, { requireUser: mw, requireTenantAdmin: mw, resolveRequestedTenantId: async () => "t1", supabaseService: db, limiter: mw });
  const g = res(); await rotas["GET /api/agente-interno/grupos"]({}, g);
  assert.equal(g.body.contratado, true); assert.equal(g.body.grupos.length, 1);
  const p = res(); await rotas["PUT /api/agente-interno/grupos"]({ body: { grupos: [{ ...base, group_name: "Novo nome" }] } }, p);
  assert.equal(p.code, 200);
  assert.equal(db.calls[0].op, "update");
  assert.equal(db.calls[0].v.value.grupos[0].group_name, "Novo nome");
  assert.equal(db.calls[0].v.value.grupos[0].dev_project_id, "p1");
  const ruim = res(); await rotas["PUT /api/agente-interno/grupos"]({ body: { grupos: [{ ...base, departamento: "x" }] } }, ruim);
  assert.equal(ruim.code, 400);
});

test("um grupo, um agente: grupo que já é do Radar é recusado (409) e nada é gravado", async () => {
  const db: any = fakeDb({ agente_interno: true }, { id: "s1", value: { grupos: [] } }, [{ group_chat_id: base.group_chat_id }]);
  const { a, rotas } = app();
  registerAgenteInternoGruposRoutes(a, { requireUser: mw, requireTenantAdmin: mw, resolveRequestedTenantId: async () => "t1", supabaseService: db, limiter: mw });
  const p = res(); await rotas["PUT /api/agente-interno/grupos"]({ body: { grupos: [base] } }, p);
  assert.equal(p.code, 409); assert.match(p.body.error, /Radar/); assert.equal(db.calls.length, 0);
});
