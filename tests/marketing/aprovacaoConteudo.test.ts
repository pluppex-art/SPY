import test from "node:test";
import assert from "node:assert/strict";
import { alteradaDepoisDaResposta, enviarParaAprovacao, lerAprovacao, linkVencido, novoToken, responder, tokenValido, versaoDoConteudo } from "../../src/lib/aprovacaoConteudo.js";
import { registrarAprovacaoConteudo, versaoDaLinha } from "../../server/aprovacaoConteudo.js";

const ID = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";

test("token, validade e histórico: reenviar volta para aguardando sem perder as respostas", () => {
  const token = novoToken();
  assert.ok(tokenValido(token));
  assert.notEqual(token, novoToken());
  assert.equal(tokenValido("curto"), false);
  const enviada = enviarParaAprovacao(token, undefined, new Date("2026-01-01T00:00:00Z"));
  assert.equal(linkVencido(enviada, Date.parse("2026-02-01T00:00:00Z")), false);
  assert.equal(linkVencido(enviada, Date.parse("2026-04-01T00:00:00Z")), true);
  const respondida = responder(enviada, { decisao: "ajustes", comentario: "trocar a foto", nome: "Ana", em: "2026-01-02T00:00:00Z" }, "v1");
  assert.equal(respondida.status, "ajustes");
  assert.equal(alteradaDepoisDaResposta(respondida, "v1"), false);
  assert.equal(alteradaDepoisDaResposta(respondida, "v2"), true);
  const deNovo = enviarParaAprovacao(token, respondida);
  assert.equal(deNovo.status, "aguardando");
  assert.equal(deNovo.resposta, undefined);
  assert.equal(deNovo.historico.length, 1);
  assert.equal(lerAprovacao({ token: "x" }), undefined);
});

test("a versão muda com o que o cliente aprova", () => {
  const base = { titulo: "Post", descricao: "Legenda", canal: "Instagram", data: "2026-12-01", anexos: [{ url: "https://a/1.png" }] };
  assert.equal(versaoDoConteudo(base), versaoDoConteudo({ ...base, titulo: " Post " }));
  assert.notEqual(versaoDoConteudo(base), versaoDoConteudo({ ...base, descricao: "Outra" }));
  assert.notEqual(versaoDoConteudo(base), versaoDoConteudo({ ...base, data: "2026-12-02" }));
  assert.notEqual(versaoDoConteudo(base), versaoDoConteudo({ ...base, anexos: [] }));
});

/** Banco de mentira com o mínimo que as rotas usam (inclusive o filtro por caminho JSON). */
function banco(tabelas: Record<string, any[]>) {
  const ler = (linha: any, caminho: string) => caminho.split(/->>?/).reduce((v, k) => v?.[k], linha);
  return {
    from(nome: string) {
      const filtros: ((l: any) => boolean)[] = [];
      let mudanca: any = null;
      const rodar = () => {
        const achadas = (tabelas[nome] ??= []).filter((l) => filtros.every((f) => f(l)));
        if (mudanca) achadas.forEach((l) => Object.assign(l, mudanca));
        return structuredClone(achadas);
      };
      const q: any = {
        select: () => q, limit: () => q,
        eq: (c: string, v: unknown) => { filtros.push((l) => ler(l, c) === v); return q; },
        is: (c: string, v: unknown) => { filtros.push((l) => (l[c] ?? null) === v); return q; },
        update: (m: any) => { mudanca = m; return q; },
        insert: (linhas: any[]) => { (tabelas[nome] ??= []).push(...linhas); return Promise.resolve({ error: null }); },
        maybeSingle: () => Promise.resolve({ data: rodar()[0] ?? null, error: null }),
        then: (ok: any, falha: any) => Promise.resolve({ data: rodar(), error: null }).then(ok, falha),
      };
      return q;
    },
  };
}

function montar() {
  const token = novoToken();
  const linha = (id: string, extra: Record<string, any> = {}) => ({
    id, tenant_id: "t1", title: "Reels de dezembro", description: "Legenda", platform: "Instagram", publish_date: "2026-12-01T00:00:00+00:00", deleted_at: null,
    extras: { clienteId: "c1", value: 900, responsavel: "Bia", notas: [{ texto: "interno" }], refs: [{ url: "javascript:alert(1)" }, { url: "https://ref.example/x" }], aprovacao: enviarParaAprovacao(token, undefined) },
    ...extra,
  });
  const tabelas: Record<string, any[]> = {
    marketing_content: [linha(ID), linha(OUTRO, { extras: { clienteId: "c1" } })],
    tenants: [{ id: "t1", name: "Agência X", primary_color: "#123456" }],
    empresa_filiais: [{ id: "c1", tenant_id: "t1", nome: "Padaria Y" }],
    users: [{ id: "u1", tenant_id: "t1", name: "Bia", active: true, is_tenant_admin: false }, { id: "u2", tenant_id: "t1", name: "Zé", active: true, is_tenant_admin: false }],
  };
  const rotas: Record<string, any> = {};
  const app: any = { get: (p: string, ...f: any[]) => { rotas[`GET ${p}`] = f.at(-1); }, post: (p: string, ...f: any[]) => { rotas[`POST ${p}`] = f.at(-1); } };
  const passa: any = (_q: any, _r: any, n: any) => n();
  registrarAprovacaoConteudo(app, banco(tabelas) as any, { ler: passa, responder: passa });
  const chamar = async (rota: string, params: any, body?: any) => {
    const res: any = { codigo: 200, corpo: null, setHeader() {}, status(c: number) { this.codigo = c; return this; }, json(b: any) { this.corpo = b; return this; } };
    await rotas[rota]({ params, body }, res);
    return res;
  };
  return { token, tabelas, chamar, ver: () => chamar("GET /api/public-aprovacao/:token", { token }), enviar: (itemId: string, body: any) => chamar("POST /api/public-aprovacao/:token/:itemId", { token, itemId }, body) };
}

test("página do cliente: só as pautas enviadas, sem dado interno e sem link perigoso", async () => {
  const { ver, chamar } = montar();
  const r = await ver();
  assert.equal(r.codigo, 200);
  assert.equal(r.corpo.empresa, "Agência X");
  assert.equal(r.corpo.cliente, "Padaria Y");
  assert.deepEqual(r.corpo.itens.map((i: any) => i.id), [ID]);
  assert.deepEqual(r.corpo.itens[0].links, ["https://ref.example/x"]);
  const texto = JSON.stringify(r.corpo);
  for (const interno of ["interno", "responsavel", "Bia", "900", "tenant_id"]) assert.ok(!texto.includes(interno), interno);
  assert.equal((await chamar("GET /api/public-aprovacao/:token", { token: novoToken() })).codigo, 404);
});

test("resposta do cliente: valida, grava sem mexer no resto e avisa o responsável", async () => {
  const { ver, enviar, tabelas } = montar();
  const versao = (await ver()).corpo.itens[0].versao;
  assert.equal((await enviar(ID, { decisao: "talvez", nome: "Ana", versao })).codigo, 400);
  assert.equal((await enviar(ID, { decisao: "aprovado", nome: "", versao })).codigo, 400);
  assert.equal((await enviar(ID, { decisao: "ajustes", nome: "Ana", comentario: "", versao })).codigo, 400);
  assert.equal((await enviar(OUTRO, { decisao: "aprovado", nome: "Ana", versao })).codigo, 404);

  const ok = await enviar(ID, { decisao: "aprovado", nome: "Ana", versao });
  assert.equal(ok.codigo, 200);
  const linha = tabelas.marketing_content[0];
  assert.equal(linha.extras.aprovacao.status, "aprovado");
  assert.equal(linha.extras.value, 900);
  assert.equal(linha.extras.aprovacao.versaoRespondida, versaoDaLinha(linha));
  assert.deepEqual(tabelas.notifications.map((n) => n.user_id), ["u1"]);

  linha.description = "Legenda nova";
  assert.equal((await ver()).corpo.itens[0].alterado, true);
  const velho = await enviar(ID, { decisao: "aprovado", nome: "Ana", versao });
  assert.equal(velho.codigo, 409);
  assert.equal(velho.corpo.item.descricao, "Legenda nova");
});

test("pauta apagada ou link vencido somem", async () => {
  const a = montar();
  a.tabelas.marketing_content[0].deleted_at = "2026-01-01";
  assert.equal((await a.ver()).codigo, 404);
  const b = montar();
  b.tabelas.marketing_content[0].extras.aprovacao.expiraEm = "2020-01-01T00:00:00Z";
  assert.equal((await b.ver()).codigo, 404);
});
