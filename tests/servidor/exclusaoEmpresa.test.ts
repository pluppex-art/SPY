import { test } from "node:test";
import assert from "node:assert/strict";
import { criarMotorExclusao, fluxosDaEmpresa, sessoesDaEmpresa, problemaDoBackup, type Externos } from "../../server/exclusaoEmpresa.js";

const RAIZ = "27ef95ee-0000-0000-0000-000000000000";
const A = "aaaaaaaa-0000-0000-0000-000000000000";
const B = "bbbbbbbb-0000-0000-0000-000000000000";
const EMPRESAS = [{ id: RAIZ, name: "SPY | IA" }, { id: A, name: "Girassol Corretora de Seguros" }, { id: B, name: "Nicolas" }];
const fluxo = (id: string, name: string, tags: string[] = [], citando: string[] = [], active = true) => ({ id, name, active, tags: tags.map((t) => ({ name: t })), nodes: [{ parameters: { v: citando.join(" ") } }] });

test("n8n: só apaga cópia com o nome exato da empresa; modelo, outra empresa e citação ficam para conferir", () => {
  const r = fluxosDaEmpresa([
    fluxo("1", "[GIRASSOL CORRETORA DE SEGUROS] Radar", ["copia-cliente"]),
    fluxo("2", "[Girassol Corretora de Seguros] Aviso", [], [A]),
    fluxo("3", "[PLUPPEX AI OS] Cadastro rápido", [], [A]),
    fluxo("4", "[Girassol Corretora de Seguros] Padrão", ["padrao-cliente"], [A]),
    fluxo("5", "[Girassol Corretora de Seguros] Misto", ["copia-cliente"], [A, B]),
    fluxo("6", "[Nicolas] Aurora Core", ["copia-cliente"], [B]),
    fluxo("7", "[Girassol Corretora de Seguros] Sem marca"),
    fluxo("8", "[Girassol Corretora de Seguros] Aurora", ["copia-cliente"], [A, RAIZ]),
    fluxo("9", "Fluxo do Rodrigo", ["Rodrigo"], [A]),
  ], EMPRESAS[1], EMPRESAS, RAIZ);
  assert.deepEqual(r.apagar.map((f) => f.id), ["1", "2", "8"]);
  assert.deepEqual(r.revisar.map((f) => f.id), ["3", "4", "5", "7", "9"]);
});

test("n8n: duas empresas com o mesmo nome não apagam nada pelo nome; 'Nicolas' não pega 'Nicolas Rocha'", () => {
  const gemeas = [...EMPRESAS, { id: "c", name: "nicolas" }];
  assert.deepEqual(fluxosDaEmpresa([fluxo("1", "[Nicolas] Radar", ["copia-cliente"])], EMPRESAS[2], gemeas, RAIZ).apagar, []);
  const r = fluxosDaEmpresa([fluxo("1", "[Nicolas Rocha] Radar", ["copia-cliente"])], EMPRESAS[2], EMPRESAS, RAIZ);
  assert.deepEqual([r.apagar, r.revisar], [[], []]);
});

test("WhatsApp: pega id ou nome das sessões da empresa e preserva nome usado por outra", () => {
  const r = sessoesDaEmpresa([
    { id: "i1", tenant_id: A, name: "closer-a" },
    { id: "i2", tenant_id: A, name: "agente-secreto-Ana", colaborador_id: "c1" },
    { id: "i3", tenant_id: A, name: "agente-secreto-Rafael", colaborador_id: "c2" },
    { id: "i4", tenant_id: B, name: "agente-secreto-Rafael", colaborador_id: "c3" },
  ], [{ tenant_id: A, whatsapp_session: "bot-a" }, { tenant_id: B, whatsapp_session: "bot-b" }], A);
  assert.deepEqual(r.apagar.sort(), ["agente-secreto-Ana", "bot-a", "closer-a", "i1"]);
  assert.deepEqual(r.compartilhadas, ["agente-secreto-Rafael"]);
});

const AGORA = Date.parse("2026-11-26T15:00:00Z");
const manifesto = (m: any = {}) => ({ empresa: { id: A, nome: "x" }, status: "concluido", criadoEm: "2026-11-26T10:00:00Z", tabelas: [{ nome: "tenants", status: "ok", linhas: 1 }, { nome: "leads", status: "ok", linhas: 3 }], ...m }) as any;

test("backup: precisa ser da empresa, completo, das últimas 24 h e ter toda tabela com dados", () => {
  const dados = { tenants: 1, leads: 3, "backups.copia": 9 };
  assert.equal(problemaDoBackup(manifesto(), A, dados, AGORA), null);
  assert.match(problemaDoBackup(null, A, dados, AGORA)!, /não encontrado/);
  assert.match(problemaDoBackup(manifesto(), B, dados, AGORA)!, /não encontrado/);
  assert.match(problemaDoBackup(manifesto({ status: "concluido_com_falhas" }), A, dados, AGORA)!, /não está completo/);
  assert.match(problemaDoBackup(manifesto({ criadoEm: "2026-11-25T10:00:00Z" }), A, dados, AGORA)!, /mais de 24/);
  assert.match(problemaDoBackup(manifesto(), A, { ...dados, tasks: 2 }, AGORA)!, /tasks/);
});

/** Banco, armazenamento e serviços de mentira. A função do banco é simulada: marca o registro e apaga a empresa. */
function mundo(o: { erroBanco?: string; bloqueios?: string[]; erroWhats?: boolean } = {}) {
  const t: Record<string, any[]> = {
    tenants: [{ id: RAIZ, name: "SPY | IA", status: "Active" }, { id: A, name: "Loja A", status: "Active" }],
    users: [{ id: "u1", tenant_id: A, is_master: false }],
    whatsapp_instances: [{ id: "i1", tenant_id: A, name: "loja-a", colaborador_id: "c" }],
    chatbots: [], checkout_orders: [], tenant_subscriptions: [{ tenant_id: A, gateway: "asaas", gateway_subscription_id: "sub_1" }], empresa_exclusoes: [],
  };
  const feito: string[] = [];
  const estado = { semPasta: false };
  const db: any = {
    from(nome: string) {
      let filtros: ((l: any) => boolean)[] = [], acao: "ler" | "mudar" | "inserir" = "ler", dado: any, faixa: [number, number] | null = null;
      const executar = () => {
        if (acao === "inserir") { const l = { id: "r1", status: "iniciada", registros_apagados: 0, criado_em: "x", ...structuredClone(dado) }; t[nome].push(l); return [l]; }
        const linhas = t[nome].filter((l) => filtros.every((f) => f(l)));
        if (acao === "mudar") linhas.forEach((l) => Object.assign(l, structuredClone(dado)));
        return faixa ? linhas.slice(faixa[0], faixa[1] + 1) : linhas;
      };
      const q: any = {
        select: () => q, order: () => q, limit: () => q,
        eq: (c: string, v: any) => { filtros.push((l) => l[c] === v); return q; },
        neq: (c: string, v: any) => { filtros.push((l) => l[c] !== v); return q; },
        range: (a: number, b: number) => { faixa = [a, b]; return q; },
        update: (d: any) => { acao = "mudar"; dado = d; return q; },
        insert: (d: any) => { acao = "inserir"; dado = d; return q; },
        maybeSingle: async () => ({ data: structuredClone(executar()[0] ?? null), error: null }),
        single: async () => ({ data: structuredClone(executar()[0]), error: null }),
        then: (ok: any, ko: any) => Promise.resolve({ data: structuredClone(executar()), error: null }).then(ok, ko),
      };
      return q;
    },
    rpc: async (nome: string) => {
      if (nome === "spy_exclusao_conferir") return { data: { existe: true, bloqueios: o.bloqueios ?? [], tabelas: { tenants: 1, leads: 3 }, registros: 4 }, error: null };
      if (o.erroBanco) return { data: null, error: { message: o.erroBanco } };
      t.empresa_exclusoes[0].status = "banco_apagado"; t.empresa_exclusoes[0].registros_apagados = 4; t.tenants = t.tenants.filter((x) => x.id !== A);
      feito.push("banco");
      return { data: { concluido: true }, error: null };
    },
    auth: { admin: { deleteUser: async (id: string) => { feito.push(`login ${id}`); return { error: null }; } } },
    storage: {
      listBuckets: async () => ({ data: [{ id: "docs" }], error: null }),
      from: (b: string) => ({
        list: async (p: string) => ({ data: b === "docs" && p === A ? [{ name: "a.pdf", id: "1" }] : [], error: null }),
        upload: async (c: string) => { if (estado.semPasta) return { error: { message: "Bucket not found" } }; feito.push(`guardou ${c}`); return { error: null }; },
        remove: async (c: string[]) => { feito.push(`arquivo ${c.join()}`); return { error: null }; },
      }),
    },
  };
  const externos: Externos = {
    n8n: {
      listar: async () => [fluxo("f1", "[Loja A] Radar", ["copia-cliente"])],
      ler: async (id) => fluxo(id, "[Loja A] Radar"),
      ativar: async (id, a) => { feito.push(`${a ? "liga" : "desliga"} ${id}`); },
      apagar: async (id) => { feito.push(`apaga fluxo ${id}`); },
    },
    whatsapp: { listar: async () => ["loja-a"], apagar: async (s) => { if (o.erroWhats) throw new Error("fora do ar"); feito.push(`sessao ${s}`); } },
    cobranca: { cancelar: async (id) => { feito.push(`asaas ${id}`); } },
  };
  const motor = criarMotorExclusao({ db, externos, lerBackup: async () => manifesto(), tenantRaiz: RAIZ, agora: () => AGORA });
  return { motor, t, feito, o, semPastaDeBackup: () => { estado.semPasta = true; } };
}
const pedido = { confirmacao: "Loja A", backupId: "20261126-100000" };

test("recusa sem mexer em nada: nome errado, empresa raiz e bloqueio do banco", async () => {
  const m = mundo({ bloqueios: ["A empresa tem usuário master."] });
  await assert.rejects(m.motor.iniciar(A, { ...pedido, confirmacao: "loja" }, "eu"), /não é igual/);
  await assert.rejects(m.motor.iniciar(RAIZ, pedido, "eu"), /nunca pode ser excluída/);
  await assert.rejects(m.motor.iniciar(A, pedido, "eu"), /usuário master/);
  assert.deepEqual([m.feito, m.t.empresa_exclusoes.length, m.t.tenants[1].status], [[], 0, "Active"]);
});

test("caminho completo: desliga os fluxos, apaga o banco e só depois o que está fora", async () => {
  const m = mundo();
  const r = await m.motor.iniciar(A, pedido, "eu");
  assert.equal(m.t.tenants.find((x) => x.id === A)!.status, "Inactive");
  assert.deepEqual(m.feito, ["desliga f1"]);
  assert.equal((await m.motor.avancar(r.id)).status, "banco_apagado");
  const fim = await m.motor.avancar(r.id);
  assert.deepEqual([fim.status, fim.pendencias, fim.registrosApagados], ["concluida", [], 4]);
  assert.deepEqual(m.feito, ["desliga f1", "banco", `guardou ${A}/20261126-100000/n8n/f1.json`, "apaga fluxo f1", "sessao loja-a", `arquivo ${A}/a.pdf`, "login u1", "asaas sub_1"]);
});

test("erro no banco antes de apagar: nada é excluído, fluxo religado e empresa volta ao que era", async () => {
  const m = mundo({ erroBanco: "violação" });
  const r = await m.motor.iniciar(A, pedido, "eu");
  await assert.rejects(m.motor.avancar(r.id), /Nada foi excluído: violação/);
  assert.deepEqual(m.feito, ["desliga f1", "liga f1"]);
  assert.deepEqual([m.t.empresa_exclusoes[0].status, m.t.tenants[1].status], ["cancelada", "Active"]);
});

test("falha fora do banco vira pendência e é tentada de novo sem repetir o resto", async () => {
  const m = mundo({ erroWhats: true });
  const r = await m.motor.iniciar(A, pedido, "eu");
  await m.motor.avancar(r.id);
  const um = await m.motor.avancar(r.id);
  assert.equal(um.status, "com_pendencias");
  assert.match(um.pendencias[0], /Sessão de WhatsApp loja-a: fora do ar/);
  m.o.erroWhats = false; m.feito.length = 0;
  assert.equal((await m.motor.avancar(r.id)).status, "concluida");
  assert.deepEqual(m.feito, ["sessao loja-a"]);
});

test("cancelar só vale antes de o banco apagar; pedido esquecido há mais de 24 h é desfeito em vez de executado", async () => {
  const m = mundo();
  const r = await m.motor.iniciar(A, pedido, "eu");
  m.t.empresa_exclusoes[0].criado_em = "2026-11-25T10:00:00Z";
  await assert.rejects(m.motor.avancar(r.id), /mais de 24 horas/);
  assert.deepEqual([m.t.empresa_exclusoes[0].status, m.feito], ["cancelada", ["desliga f1", "liga f1"]]);
  const outro = mundo();
  const r2 = await outro.motor.iniciar(A, pedido, "eu");
  await outro.motor.avancar(r2.id);
  await assert.rejects(outro.motor.desistir(r2.id), /já começou/);
  assert.equal(outro.t.empresa_exclusoes[0].status, "banco_apagado");
});

test("erro 'not found' ao guardar o fluxo não conta como apagado", async () => {
  const m = mundo();
  const r = await m.motor.iniciar(A, pedido, "eu");
  await m.motor.avancar(r.id);
  m.semPastaDeBackup();
  const fim = await m.motor.avancar(r.id);
  assert.match(fim.pendencias.join(), /Fluxo do n8n \[Loja A\] Radar: não foi possível guardar/);
  assert.ok(!m.feito.some((x) => x.startsWith("apaga fluxo")));
});

test("sem a migração no banco: avisa que falta instalar e não mostra lista de pendências", async () => {
  const falta = { data: null, error: { code: "PGRST205", message: "Could not find the table 'public.empresa_exclusoes' in the schema cache" } };
  const q: any = {}; for (const k of ["select", "eq", "neq", "order", "limit"]) q[k] = () => q;
  q.maybeSingle = async () => falta; q.then = (ok: any) => Promise.resolve(falta).then(ok);
  const motor = criarMotorExclusao({ db: { from: () => q }, externos: { n8n: null, whatsapp: null, cobranca: null }, lerBackup: async () => null, tenantRaiz: RAIZ });
  await assert.rejects(motor.conferir(A), /falta aplicar a migração/);
  assert.deepEqual(await motor.listar(), []);
});
