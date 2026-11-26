import { test } from "node:test";
import assert from "node:assert/strict";
import { buscarRepositorios, repoDoGitHub, somarLinguagens, MAX_PAGINAS } from "../../src/pages/dev/lib/github.js";

const no = (id: string, extra: any = {}) => ({ id, name: `r${id}`, url: `https://github.com/a/r${id}`, owner: { login: "a" }, ...extra });
const resposta = (nodes: any[], mais = false, cursor = "c", extra: { status?: number; escopos?: string; errors?: any[] } = {}) =>
  new Response(JSON.stringify({ data: { viewer: { repositories: { nodes, pageInfo: { hasNextPage: mais, endCursor: cursor } } } }, errors: extra.errors }), {
    status: extra.status ?? 200, headers: extra.escopos === undefined ? {} : { "x-oauth-scopes": extra.escopos },
  });

test("repositório: linguagens, contagens, último commit e autores sem repetir", () => {
  const c = (m: string, login: string | null, name: string) => ({ messageHeadline: m, committedDate: "2026-11-20T10:00:00Z", author: { name, user: login ? { login } : null } });
  const r = repoDoGitHub(no("1", {
    isPrivate: true, refs: { totalCount: 4 }, pullRequests: { totalCount: 2 }, issues: { totalCount: 3 }, primaryLanguage: { name: "TypeScript" },
    languages: { edges: [{ size: 90, node: { name: "TypeScript", color: "#3178c6" } }, { size: 10, node: { name: "CSS", color: null } }] },
    defaultBranchRef: { name: "main", target: { history: { nodes: [c("feat: x", "ana", "Ana"), c("fix: y", "ana", "Ana"), c("docs", null, "Bia")] } } },
  }));
  assert.deepEqual([r.branches, r.prsAbertos, r.issuesAbertas, r.privado, r.linguagem], [4, 2, 3, true, "TypeScript"]);
  assert.deepEqual(r.autoresRecentes, ["ana", "Bia"]);
  assert.equal(r.ultimoCommit?.mensagem, "feat: x");
  assert.equal(r.linguagens[1].cor, "#64748B");
});

test("repositório vazio (sem branch nem linguagem) não quebra", () => {
  const r = repoDoGitHub(no("2", { defaultBranchRef: null, primaryLanguage: null, languages: { edges: [] } }));
  assert.deepEqual([r.ultimoCommit, r.linguagem, r.branches, r.autoresRecentes], [null, "", 0, []]);
});

test("soma das linguagens: ordena e calcula a fatia", () => {
  const s = somarLinguagens([[{ nome: "TS", cor: "a", bytes: 30 }], [{ nome: "CSS", cor: "b", bytes: 10 }, { nome: "TS", cor: "a", bytes: 60 }], []]);
  assert.deepEqual(s.map((l) => [l.nome, l.bytes, l.pct]), [["TS", 90, 90], ["CSS", 10, 10]]);
  assert.deepEqual(somarLinguagens([]), []);
});

test("busca: segue as páginas, ignora nulos e avisa token sem escopo repo e erro parcial", async () => {
  const cursores: any[] = [];
  const respostas = [resposta([no("1"), null], true, "p2", { escopos: "public_repo, read:org", errors: [{ message: "SAML" }] }), resposta([no("2")])];
  const r = await buscarRepositorios("t", async (_u, init: any) => { cursores.push(JSON.parse(init.body).variables.cursor); return respostas.shift()!; });
  assert.deepEqual(r.repos.map((x) => x.id), ["1", "2"]);
  assert.deepEqual(cursores, [null, "p2"]);
  assert.equal(r.avisos.length, 2);
});

test("busca: com escopo repo, ou token fino sem cabeçalho, não avisa", async () => {
  assert.deepEqual((await buscarRepositorios("t", async () => resposta([no("1")], false, "c", { escopos: "gist, repo" }))).avisos, []);
  assert.deepEqual((await buscarRepositorios("t", async () => resposta([no("1")]))).avisos, []);
});

test("busca: token recusado e erro do GitHub viram mensagem", async () => {
  await assert.rejects(buscarRepositorios("t", async () => new Response("{}", { status: 401 })), /recusou o token/);
  await assert.rejects(buscarRepositorios("t", async () => new Response(JSON.stringify({ errors: [{ message: "scopes faltando" }] }), { status: 200 })), /scopes faltando/);
  await assert.rejects(buscarRepositorios("t", async () => new Response(JSON.stringify({ message: "rate limit" }), { status: 403 })), /403: rate limit/);
});

test("busca: 502 repete com página menor; muitas páginas param no teto com aviso", async () => {
  const tamanhos: number[] = [];
  await buscarRepositorios("t", async (_u, init: any) => { tamanhos.push(JSON.parse(init.body).variables.tamanho); return tamanhos.length === 1 ? new Response("", { status: 502 }) : resposta([no("1")]); });
  assert.deepEqual(tamanhos, [40, 10]);
  await assert.rejects(buscarRepositorios("t", async () => new Response("", { status: 502 })), /502/);
  let n = 0;
  const r = await buscarRepositorios("t", async () => resposta([no(String(++n))], true, `c${n}`));
  assert.equal(n, MAX_PAGINAS);
  assert.match(r.avisos[0], /mais recentemente/);
});
