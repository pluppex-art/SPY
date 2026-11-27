import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { criarEmpresaSelecionada } from "../../server/empresaSelecionada.js";

async function rodar(o: { pedida?: string; master?: boolean; acesso?: boolean }) {
  const req: any = { query: o.pedida ? { tenantId: o.pedida } : {}, tenantId: "casa", isMaster: !!o.master };
  let status = 0, seguiu = false;
  const res: any = { status: (s: number) => ((status = s), res), json: () => res };
  await criarEmpresaSelecionada(async (_r, rs) => { if (o.acesso === false) { rs.status(403).json({}); return null; } return o.pedida!; })(req, res, () => { seguiu = true; });
  return { empresa: seguiu ? req.tenantId : null, status };
}

test("sem empresa pedida ou pedindo a própria: segue na empresa de origem", async () => {
  assert.deepEqual(await rodar({}), { empresa: "casa", status: 0 });
  assert.deepEqual(await rodar({ pedida: "casa" }), { empresa: "casa", status: 0 });
});

test("outra empresa: o master age nela; quem não é master, ou não tem acesso, é recusado", async () => {
  assert.deepEqual(await rodar({ pedida: "cliente", master: true }), { empresa: "cliente", status: 0 });
  assert.deepEqual(await rodar({ pedida: "cliente" }), { empresa: null, status: 403 });
  assert.deepEqual(await rodar({ pedida: "cliente", master: true, acesso: false }), { empresa: null, status: 403 });
});

test("toda rota de chave de API e de conector externo passa pela empresa selecionada, e a tela a envia", () => {
  const server = readFileSync("server.ts", "utf8");
  const rotas = server.split("\n").filter((l) => /^app\.\w+\("\/api\/(settings\/api-keys|integrations\/external)/.test(l));
  assert.equal(rotas.length, 7);
  for (const r of rotas) assert.match(r, /requireTenantAdmin, empresaSelecionada,/);
  for (const arquivo of ["src/hooks/useExternalIntegrations.ts", "src/pages/settings/ConfigConectoresExternos.tsx"]) {
    const chamadas = readFileSync(arquivo, "utf8").match(/apiFetch\([^\n]*/g) ?? [];
    assert.ok(chamadas.length >= 3, arquivo);
    for (const c of chamadas) assert.match(c, /\$\{daEmpresa\}/, `${arquivo}: ${c}`);
  }
});
