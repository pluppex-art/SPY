import { test } from "node:test";
import assert from "node:assert/strict";
import { checarUrl, classificar } from "../../server/devAmbientes.js";
import { assertSafeHttpUrl } from "../../server/ssrfGuard.js";
import { normalizarUrl, sugestoesDoRepo, buscarSugestoes } from "../../src/pages/dev/lib/ambientes.js";

test("classificação da resposta", () => {
  const s = (c: number, ms = 100) => classificar(c, ms).status;
  assert.deepEqual([s(200), s(204), s(200, 5000), s(401), s(403), s(404), s(429), s(301), s(500), s(503)],
    ["operacional", "operacional", "degradado", "operacional", "operacional", "degradado", "degradado", "degradado", "offline", "offline"]);
});

const valida = async (u: string) => new URL(u);

test("segue redirecionamento (inclusive relativo) e para no limite", async () => {
  const vistos: string[] = [];
  const r = await checarUrl("https://a.com", async (u) => { vistos.push(u.href); return vistos.length === 1 ? { codigo: 308, destino: "/app" } : { codigo: 200 }; }, valida);
  assert.deepEqual([r.status, r.codigo, vistos], ["operacional", 200, ["https://a.com/", "https://a.com/app"]]);
  let n = 0;
  assert.equal((await checarUrl("https://a.com", async () => { n++; return { codigo: 302, destino: "/x" }; }, valida)).status, "degradado");
  assert.equal(n, 6);
});

test("endereço interno é recusado, também quando vem de redirecionamento, sem acessar", async () => {
  let acessos = 0;
  const nunca = async () => { acessos++; return { codigo: 200 }; };
  for (const u of ["http://127.0.0.1", "http://169.254.169.254/latest", "http://localhost:8080", "ftp://a.com", "http://10.0.0.1"]) {
    const r = await checarUrl(u, nunca);
    assert.deepEqual([r.status, acessos], [null, 0], u);
    assert.match(r.aviso, /^Não verificado/);
  }
  const r = await checarUrl("https://8.8.8.8", async () => { acessos++; return { codigo: 302, destino: "http://192.168.0.1/" }; }, assertSafeHttpUrl);
  assert.deepEqual([r.status, acessos], [null, 1]);
});

test("falha de rede vira offline com o motivo", async () => {
  const falha = (code: string) => async () => { throw Object.assign(new Error("x"), { code }); };
  assert.deepEqual([(await checarUrl("https://a.com", falha("ENOTFOUND"), valida)).aviso, (await checarUrl("https://a.com", falha("ECONNREFUSED"), valida)).status], ["Endereço não encontrado", "offline"]);
  assert.equal((await checarUrl("https://a.com", falha("ABORT_ERR"), valida)).aviso, "Sem resposta em 10 s");
  assert.equal((await checarUrl("https://nao-existe.com", async () => ({ codigo: 200 }), falha("ENOTFOUND") as any)).status, "offline");
});

test("endereço digitado", () => {
  assert.equal(normalizarUrl("www.site.com.br"), "https://www.site.com.br");
  assert.equal(normalizarUrl(" http://a.com/app/ "), "http://a.com/app");
  for (const ruim of ["", "javascript:alert(1)", "ftp://a.com", "qualquer coisa", "semponto"]) assert.equal(normalizarUrl(ruim), "", ruim);
});

const dep = (environment: string, state: string, url: string, oid = "abcdef123456", createdAt = "2026-11-26T05:20:37Z") => ({ environment, createdAt, commitOid: oid, latestStatus: { state, environmentUrl: url } });

test("sugestões: usa o site na produção, a última publicação que deu certo e ignora pré-visualização", () => {
  const r = sugestoesDoRepo({ name: "loja", nameWithOwner: "a/loja", homepageUrl: "www.loja.com", deployments: { nodes: [
    dep("Production", "FAILURE", "https://x.vercel.app", "ffffffffff"), dep("Preview", "SUCCESS", "https://p.vercel.app"), dep("Production", "SUCCESS", "https://y.vercel.app"),
  ] } });
  assert.deepEqual(r, [{ chave: "a/loja:Production", nome: "loja", tipo: "Produção", url: "https://www.loja.com", versao: "abcdef1", publicadoEm: "2026-11-26T05:20:37Z" }]);
});

test("sugestões: várias produções (só a principal usa o site), staging, só site e nada", () => {
  const r = sugestoesDoRepo({ name: "pista", nameWithOwner: "a/pista", homepageUrl: "https://pista.app", deployments: { nodes: [
    dep("Production – pista-coex", "SUCCESS", "https://coex.app"), dep("Production – pista", "SUCCESS", "https://hash.app"), dep("staging", "SUCCESS", "https://s.app"),
  ] } });
  assert.deepEqual(r.map((s) => [s.nome, s.tipo, s.url]), [["pista (pista-coex)", "Produção", "https://coex.app"], ["pista", "Produção", "https://pista.app"], ["pista (staging)", "Staging", "https://s.app"]]);
  assert.equal(sugestoesDoRepo({ name: "s", nameWithOwner: "a/s", homepageUrl: "s.com", deployments: { nodes: [] } })[0].chave, "a/s:site");
  assert.deepEqual(sugestoesDoRepo({ name: "s", nameWithOwner: "a/s", homepageUrl: "", deployments: { nodes: [] } }), []);
});

test("busca: pula arquivados, pagina e traduz erro", async () => {
  const pagina = (nodes: any[], mais: boolean) => new Response(JSON.stringify({ data: { viewer: { repositories: { nodes, pageInfo: { hasNextPage: mais, endCursor: "c" } } } } }));
  const repo = (name: string, isArchived = false) => ({ name, nameWithOwner: `a/${name}`, isArchived, homepageUrl: `${name}.com`, deployments: { nodes: [] } });
  const paginas = [pagina([repo("um"), repo("velho", true)], true), pagina([repo("dois")], false)];
  assert.deepEqual((await buscarSugestoes("t", async () => paginas.shift()!)).map((s) => s.nome), ["um", "dois"]);
  await assert.rejects(buscarSugestoes("t", async () => new Response("{}", { status: 401 })), /recusou o token/);
});
