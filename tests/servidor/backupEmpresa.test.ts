import { test } from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { tabelasDoOpenApi, redigir, criarMotorBackup, idDoBackup, progresso, BUCKET_BACKUP } from "../../server/backupEmpresa.js";
import { montarZip, crc32 } from "../../src/lib/zipSimples.js";

const PK = { description: "Note:\nThis is a Primary Key.<pk/>" };
const spec = { definitions: {
  tenants: { properties: { id: PK, name: {} } },
  leads: { properties: { id: PK, tenant_id: {} } },
  ligacoes: { properties: { lead_id: PK, campo_id: PK, tenant_id: {} } },
  planos: { properties: { id: PK } },
  leads_com_contatos: { properties: { tenant_id: {} } },
} };

test("tabelas: o cadastro, toda tabela com tenant_id; fora visões e tabelas da plataforma", () => {
  assert.deepEqual(tabelasDoOpenApi(spec).map((t) => [t.nome, t.filtro, t.pk]), [
    ["tenants", "id", ["id"]], ["leads", "tenant_id", ["id"]], ["ligacoes", "tenant_id", ["lead_id", "campo_id"]],
  ]);
});

test("redige senhas, chaves e tokens em qualquer profundidade, sem apagar contagens de tokens", () => {
  const r = redigir({
    api_key: "k", webhook_secret: "s", senha: "x", access_token: "t", token: "t2", refresh_token: "r",
    value: { mercadoPago: { accessToken: "APP" }, apiKey: "ej_live", chave: "pix@empresa.com", grupos: [{ client_secret: "z", nome: "ok" }] },
    webhook_url: "https://a/b?secret=abc123&x=1", prompt_tokens: 120, total_tokens: 300, monthly_token_limit: 5000, api_key_vazia: "", ativo: true, nulo: null,
  }) as any;
  for (const k of ["api_key", "webhook_secret", "senha", "access_token", "token", "refresh_token"]) assert.equal(r[k], "[removido]", k);
  assert.equal(r.value.mercadoPago.accessToken, "[removido]");
  assert.equal(r.value.apiKey, "[removido]");
  assert.equal(r.value.grupos[0].client_secret, "[removido]");
  assert.equal(r.value.grupos[0].nome, "ok");
  assert.equal(r.value.chave, "pix@empresa.com");
  assert.equal(r.webhook_url, "https://a/b?secret=[removido]&x=1");
  assert.deepEqual([r.prompt_tokens, r.total_tokens, r.monthly_token_limit, r.api_key_vazia, r.ativo, r.nulo], [120, 300, 5000, "", true, null]);
});

/** Banco e armazenamento de mentira, com o limite de 1000 linhas por consulta do PostgREST. */
function falso(dados: Record<string, any[]>, arquivos: Record<string, string[]> = {}) {
  const guardados = new Map<string, Buffer>(), copias: string[] = [];
  let bucket: any = null;
  const db = {
    guardados, copias,
    from(nome: string) {
      let linhas = [...(dados[nome] ?? [])], limite = 1000, faixa: [number, number] | null = null, contando = false;
      const q: any = {
        select: (_c: string, o?: any) => { contando = !!o?.head; return q; },
        eq: (c: string, v: any) => { linhas = linhas.filter((l) => l[c] === v); return q; },
        gt: (c: string, v: any) => { linhas = linhas.filter((l) => l[c] > v); return q; },
        order: (c: string) => { linhas.sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0)); return q; },
        limit: (n: number) => { limite = Math.min(n, 1000); return q; },
        range: (a: number, b: number) => { faixa = [a, b]; return q; },
        maybeSingle: async () => ({ data: linhas[0] ?? null, error: null }),
        then: (ok: any, ko: any) => Promise.resolve(nome === "quebrada" ? { data: null, error: { message: "sem permissão" } } : contando ? { count: linhas.length, error: null } : { data: faixa ? linhas.slice(faixa[0], faixa[1] + 1) : linhas.slice(0, limite), error: null }).then(ok, ko),
      };
      return q;
    },
    storage: {
      getBucket: async () => ({ data: bucket }),
      createBucket: async (_n: string, o: any) => { bucket = { public: o.public }; return { error: null }; },
      listBuckets: async () => ({ data: [{ id: "docs" }, { id: BUCKET_BACKUP }], error: null }),
      from: (b: string) => ({
        upload: async (c: string, corpo: Buffer) => { guardados.set(`${b}/${c}`, corpo); return { error: null }; },
        download: async (c: string) => { const x = guardados.get(`${b}/${c}`); return x ? { data: { arrayBuffer: async () => x }, error: null } : { data: null, error: { message: "not found" } }; },
        list: async (p: string) => {
          const dentro = (arquivos[b] ?? []).filter((a) => a.startsWith(`${p}/`)).map((a) => a.slice(p.length + 1));
          const nomes = new Map<string, boolean>(); for (const d of dentro) nomes.set(d.split("/")[0], !d.includes("/"));
          return { data: [...nomes].map(([name, arq]) => ({ name, id: arq ? "1" : null })), error: null };
        },
        copy: async (de: string, para: string, o: any) => { copias.push(`${b}/${de} -> ${o.destinationBucket}/${para}`); return { error: null }; },
        createSignedUrls: async (c: string[]) => ({ data: c.map((x) => ({ signedUrl: `https://s/${x}` })), error: null }),
      }),
    },
  };
  return db;
}

const T = "t1";
const motor = (db: any, defs: any = spec) => criarMotorBackup({ db, lerOpenApi: async () => defs, agora: () => new Date("2026-11-26T12:34:56Z") });

test("backup completo: pagina além de 1000 linhas, divide em partes, redige, copia arquivos das subpastas e só da empresa", async () => {
  const leads = Array.from({ length: 6500 }, (_, i) => ({ id: String(i).padStart(6, "0"), tenant_id: T, api_key: "x" }));
  const db = falso(
    { tenants: [{ id: T, name: "Loja" }], leads: [...leads, { id: "999999", tenant_id: "outra" }], ligacoes: [{ lead_id: "a", campo_id: "b", tenant_id: T }] },
    { docs: [`${T}/a.pdf`, `${T}/sub/b.png`, "outra/c.pdf"] },
  );
  const m0 = await motor(db).iniciar(T, "u1");
  assert.equal(m0.id, "20261126-123456");
  const m = (await motor(db).continuar(T, m0.id, 60_000))!;
  assert.equal(m.status, "concluido");
  const l = m.tabelas.find((t) => t.nome === "leads")!;
  assert.deepEqual([l.linhas, l.esperado, l.partes, l.status], [6500, 6500, 2, "ok"]);
  const lidas = [1, 2].flatMap((p) => gunzipSync(db.guardados.get(`${BUCKET_BACKUP}/${T}/${m.id}/tabelas/leads.000${p}.ndjson.gz`)!).toString().trim().split("\n").map((x) => JSON.parse(x)));
  assert.equal(new Set(lidas.map((x) => x.id)).size, 6500);
  assert.ok(lidas.every((x) => x.tenant_id === T && x.api_key === "[removido]"));
  assert.deepEqual(m.arquivos.copiados.sort(), [`docs/${T}/a.pdf`, `docs/${T}/sub/b.png`]);
  assert.ok(db.copias.every((c) => c.includes(`-> ${BUCKET_BACKUP}/${T}/${m.id}/arquivos/docs/${T}/`)));
  const links = (await motor(db).links(T, m.id))!;
  assert.equal(links.arquivos.length, 1 + 4 + 2); // manifest + partes (tenants 1, leads 2, ligacoes 1) + 2 arquivos
});

test("retoma em etapas até terminar sem repetir linha", async () => {
  const db = falso({ tenants: [{ id: T, name: "Loja" }], leads: Array.from({ length: 12000 }, (_, i) => ({ id: String(i).padStart(6, "0"), tenant_id: T })) });
  const { id } = await motor(db).iniciar(T, "u1");
  let m: any, voltas = 0;
  do { m = await motor(db).continuar(T, id, 0); voltas++; } while (m.status === "em_andamento" && voltas < 100);
  assert.equal(m.status, "concluido");
  assert.ok(voltas > 3);
  assert.equal(m.tabelas.find((t: any) => t.nome === "leads").linhas, 12000);
});

test("tabela que falha não passa por completo: status com falhas e o motivo aparece", async () => {
  const db = falso({ tenants: [{ id: T, name: "Loja" }] });
  const defs = { definitions: { ...spec.definitions, quebrada: { properties: { id: PK, tenant_id: {} } } } };
  const { id } = await motor(db, defs).iniciar(T, "u1");
  const m = (await motor(db, defs).continuar(T, id, 60_000))!;
  assert.equal(m.status, "concluido_com_falhas");
  assert.match(progresso(m).falhas.join(), /quebrada: sem permissão/);
});

test("empresa inexistente não gera backup; bucket público é recusado", async () => {
  await assert.rejects(motor(falso({})).iniciar("nada", "u"), /empresa não encontrada/);
  const db: any = falso({ tenants: [{ id: T, name: "L" }] });
  db.storage.getBucket = async () => ({ data: { public: true } });
  await assert.rejects(motor(db).iniciar(T, "u"), /público/);
});

test("id do backup", () => assert.equal(idDoBackup(new Date("2026-01-02T03:04:05Z")), "20260102-030405"));

test("ZIP simples abre no unzip com o conteúdo certo", () => {
  assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  const dir = mkdtempSync(join(tmpdir(), "zip-"));
  try {
    const zip = join(dir, "b.zip");
    writeFileSync(zip, Buffer.concat(montarZip([{ nome: "manifest.json", dados: new TextEncoder().encode("{}") }, { nome: "tabelas/ação.txt", dados: new TextEncoder().encode("olá\n") }])));
    execFileSync("unzip", ["-tq", zip]); // CRC e estrutura conferidos por outra ferramenta
    // O unzip do macOS não entende nomes em UTF-8; o zipfile do Python respeita a marca de UTF-8, como os descompactadores atuais.
    const lido = execFileSync("python3", ["-I", "-c", "import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print('|'.join(z.namelist()));sys.stdout.write(z.read('tabelas/ação.txt').decode())", zip], { env: { ...process.env, PYTHONIOENCODING: "utf-8" } }).toString();
    assert.equal(lido, "manifest.json|tabelas/ação.txt\nolá\n");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
