// Backup completo de uma empresa (fase 2 do ciclo de vida): todas as tabelas com tenant_id, o cadastro dela e os arquivos da
// pasta dela no armazenamento, gravados num bucket PRIVADO que não depende da empresa (sobrevive à exclusão).
// Grande demais para uma requisição só: roda em etapas e guarda o progresso no manifest.json do próprio backup.
// Só LÊ os dados da empresa; a única escrita é no bucket de backups. Senhas, chaves e tokens saem como "[removido]".
import type express from "express";
import { gzipSync } from "node:zlib";
import { BUCKET_BACKUP, locaisDosArquivos, type Arquivo } from "./arquivosDaEmpresa.js";

export { BUCKET_BACKUP };
const PAGINA = 1000;       // o PostgREST devolve no máximo 1000 linhas por consulta
const LINHAS_POR_PARTE = 5000;
const VALIDADE_LINK = 7 * 24 * 3600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ID_BACKUP = /^[0-9]{8}-[0-9]{6}$/;

/** Visões do banco: repetem dados de tabelas que já entram. */
const VISOES = new Set(["aurora_google_tasks", "aurora_google_agenda", "tenant_token_usage_current_month", "google_calendar_connection_status", "external_integrations_safe", "leads_com_contatos", "whatsapp_instances_safe", "aurora_leads_estado"]);

export interface TabelaBackup { nome: string; filtro: "tenant_id" | "id"; pk: string[] }

/** Tabelas a exportar, a partir da descrição OpenAPI do PostgREST (toda tabela com tenant_id, mais o cadastro da empresa). */
export function tabelasDoOpenApi(spec: any): TabelaBackup[] {
  const defs: Record<string, any> = spec?.definitions ?? {};
  const pkDe = (def: any) => Object.entries<any>(def?.properties ?? {}).filter(([, p]) => String(p?.description ?? "").includes("<pk/>")).map(([c]) => c);
  const lista: TabelaBackup[] = Object.keys(defs)
    .filter((n) => n !== "tenants" && !VISOES.has(n) && defs[n]?.properties?.tenant_id)
    .sort()
    .map((n) => ({ nome: n, filtro: "tenant_id", pk: pkDe(defs[n]) }));
  return defs.tenants ? [{ nome: "tenants", filtro: "id", pk: ["id"] }, ...lista] : lista;
}

const CAMPO_SECRETO = /(secret|password|senha|api_?key|apikey|access_?key|access_?token|accesstoken|refresh_?token|private_?key|credential|^token$|_token$|Token$)/i;
const SECRETO_NA_URL = /([?&](?:secret|token|apikey|api_key|key)=)[^&#\s"]+/gi;

/** Tira senhas, chaves e tokens (em qualquer profundidade) antes de gravar: o backup pode ser entregue ao cliente. */
export function redigir(valor: unknown, campo = ""): unknown {
  if (valor == null || typeof valor === "boolean") return valor;
  if (campo && CAMPO_SECRETO.test(campo) && (typeof valor === "string" ? valor !== "" : typeof valor === "object")) return "[removido]";
  if (typeof valor === "string") return valor.replace(SECRETO_NA_URL, "$1[removido]");
  if (Array.isArray(valor)) return valor.map((v) => redigir(v));
  if (typeof valor === "object") return Object.fromEntries(Object.entries(valor as Record<string, unknown>).map(([k, v]) => [k, redigir(v, k)]));
  return valor;
}

export interface ItemTabela extends TabelaBackup { status: "pendente" | "ok" | "incompleta" | "falha"; linhas: number; esperado: number | null; partes: number; ultimo?: unknown; erro?: string }
export interface Manifest {
  versao: 1; id: string; empresa: { id: string; nome: string }; criadoEm: string; atualizadoEm: string; criadoPor: string;
  status: "em_andamento" | "concluido" | "concluido_com_falhas";
  tabelas: ItemTabela[];
  arquivos: { pastas: { bucket: string; prefixo: string }[] | null; fila: Arquivo[]; copiados: string[]; falhas: { arquivo: string; erro: string }[] };
  aviso: string;
}

export function progresso(m: Manifest) {
  const feitas = m.tabelas.filter((t) => t.status !== "pendente").length;
  return {
    id: m.id, status: m.status, criadoEm: m.criadoEm, atualizadoEm: m.atualizadoEm, tabelas: m.tabelas.length, tabelasFeitas: feitas,
    linhas: m.tabelas.reduce((s, t) => s + t.linhas, 0), arquivos: m.arquivos.copiados.length, arquivosNaFila: m.arquivos.fila.length,
    falhas: [...m.tabelas.filter((t) => t.status === "falha" || t.status === "incompleta").map((t) => `${t.nome}: ${t.erro ?? `${t.linhas} de ${t.esperado} linhas`}`), ...m.arquivos.falhas.map((f) => `${f.arquivo}: ${f.erro}`)],
  };
}

export const idDoBackup = (agora: Date) => agora.toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);

export function criarMotorBackup(deps: { db: any; lerOpenApi: () => Promise<any>; agora?: () => Date }) {
  const { db } = deps;
  const agora = deps.agora ?? (() => new Date());
  const pasta = (tenantId: string, id: string) => `${tenantId}/${id}`;

  async function gravar(caminho: string, corpo: Buffer, tipo: string) {
    const { error } = await db.storage.from(BUCKET_BACKUP).upload(caminho, corpo, { upsert: true, contentType: tipo, cacheControl: "0" });
    if (error) throw new Error(`armazenamento: ${error.message}`);
  }
  const salvar = (m: Manifest) => { m.atualizadoEm = agora().toISOString(); return gravar(`${pasta(m.empresa.id, m.id)}/manifest.json`, Buffer.from(JSON.stringify(m)), "application/json"); };
  async function ler(tenantId: string, id: string): Promise<Manifest | null> {
    const { data, error } = await db.storage.from(BUCKET_BACKUP).download(`${pasta(tenantId, id)}/manifest.json`);
    if (error || !data) return null;
    return JSON.parse(Buffer.from(await data.arrayBuffer()).toString("utf8")) as Manifest;
  }

  async function garantirBucket() {
    const { data } = await db.storage.getBucket(BUCKET_BACKUP);
    if (data) { if (data.public) throw new Error("o bucket de backups está público; torne-o privado antes de gerar backup"); return; }
    const { error } = await db.storage.createBucket(BUCKET_BACKUP, { public: false });
    if (error && !/exists/i.test(error.message)) throw new Error(`não foi possível criar o bucket de backups: ${error.message}`);
  }

  async function iniciar(tenantId: string, criadoPor: string): Promise<Manifest> {
    const { data: empresa, error } = await db.from("tenants").select("id, name").eq("id", tenantId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!empresa) throw new Error("empresa não encontrada");
    await garantirBucket();
    const tabelas = tabelasDoOpenApi(await deps.lerOpenApi());
    if (tabelas.length < 2) throw new Error("não foi possível listar as tabelas do banco");
    const t = agora();
    const m: Manifest = {
      versao: 1, id: idDoBackup(t), empresa: { id: tenantId, nome: empresa.name }, criadoEm: t.toISOString(), atualizadoEm: t.toISOString(), criadoPor,
      status: "em_andamento",
      tabelas: tabelas.map((x) => ({ ...x, status: "pendente", linhas: 0, esperado: null, partes: 0 })),
      arquivos: { pastas: null, fila: [], copiados: [], falhas: [] },
      aviso: "Senhas, chaves de API e tokens foram substituídos por [removido]. Entram os arquivos da empresa (pasta dela, fotos dos usuários e comprovantes de pagamento); os logins (autenticação) não entram.",
    };
    await salvar(m);
    return m;
  }

  /** Exporta uma parte (até LINHAS_POR_PARTE linhas) da tabela; marca "ok" quando não há mais nada. */
  async function parteDaTabela(m: Manifest, t: ItemTabela) {
    const chave = t.pk.length === 1 && t.pk[0] !== "tenant_id" ? t.pk[0] : null;
    const linhas: any[] = [];
    let ultimo = t.ultimo, acabou = false;
    while (linhas.length < LINHAS_POR_PARTE) {
      let q = db.from(t.nome).select("*").eq(t.filtro, m.empresa.id);
      if (chave) { q = q.order(chave, { ascending: true }); if (ultimo !== undefined) q = q.gt(chave, ultimo); q = q.limit(PAGINA); }
      else { for (const c of t.pk) q = q.order(c, { ascending: true }); const de = t.linhas + linhas.length; q = q.range(de, de + PAGINA - 1); }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      if (!data?.length) { acabou = true; break; }
      linhas.push(...data);
      if (chave) ultimo = data[data.length - 1][chave];
      // Página incompleta = fim; a contagem abaixo confere (se o banco limitar menos que PAGINA, a tabela sai "incompleta", nunca "ok").
      if (data.length < PAGINA) { acabou = true; break; }
    }
    if (linhas.length) {
      const nome = `${pasta(m.empresa.id, m.id)}/tabelas/${t.nome}.${String(t.partes + 1).padStart(4, "0")}.ndjson.gz`;
      await gravar(nome, gzipSync(Buffer.from(linhas.map((l) => JSON.stringify(redigir(l))).join("\n") + "\n")), "application/gzip");
      t.partes += 1; t.linhas += linhas.length; t.ultimo = ultimo;
    }
    if (!acabou) return;
    if (t.linhas === 0) { t.esperado = 0; t.status = "ok"; return; } // a própria consulta veio vazia: não precisa contar
    // Confere com a contagem do banco: backup que veio pela metade não pode passar por completo.
    const { count, error } = await db.from(t.nome).select("*", { count: "exact", head: true }).eq(t.filtro, m.empresa.id);
    if (error) throw new Error(error.message);
    t.esperado = count ?? 0;
    t.status = t.linhas >= t.esperado ? "ok" : "incompleta";
  }

  async function listarPastas(m: Manifest) {
    const { pastas, soltos } = await locaisDosArquivos(db, m.empresa.id);
    m.arquivos.pastas = pastas;
    m.arquivos.fila.push(...soltos);
  }

  async function passoDosArquivos(m: Manifest) {
    const a = m.arquivos;
    const arquivo = a.fila.shift();
    if (arquivo) {
      const nome = `${arquivo.bucket}/${arquivo.caminho}`;
      const { error } = await db.storage.from(arquivo.bucket).copy(arquivo.caminho, `${pasta(m.empresa.id, m.id)}/arquivos/${nome}`, { destinationBucket: BUCKET_BACKUP });
      if (error && arquivo.opcional && /not.?found/i.test(error.message)) return; // o registro aponta para um arquivo que já não existe
      if (error && !/exists/i.test(error.message)) a.falhas.push({ arquivo: nome, erro: error.message });
      else a.copiados.push(nome);
      return;
    }
    const p = a.pastas!.shift()!;
    for (let de = 0; ; de += 1000) {
      const { data, error } = await db.storage.from(p.bucket).list(p.prefixo, { limit: 1000, offset: de });
      if (error) { a.falhas.push({ arquivo: `${p.bucket}/${p.prefixo}`, erro: error.message }); return; }
      for (const o of data || []) {
        if (o.id) a.fila.push({ bucket: p.bucket, caminho: `${p.prefixo}/${o.name}` });
        else a.pastas!.push({ bucket: p.bucket, prefixo: `${p.prefixo}/${o.name}` });
      }
      if ((data || []).length < 1000) return;
    }
  }

  /** Avança o backup por até `orcamentoMs` e grava o progresso; chamar de novo até status deixar de ser em_andamento. */
  async function continuar(tenantId: string, id: string, orcamentoMs = 35_000): Promise<Manifest | null> {
    const m = await ler(tenantId, id);
    if (!m || m.status !== "em_andamento") return m;
    const fim = Date.now() + orcamentoMs;
    let desdeSalvo = 0;
    do {
      const t = m.tabelas.find((x) => x.status === "pendente");
      if (t) {
        const antes = t.partes;
        try { await parteDaTabela(m, t); }
        catch (e: any) { t.status = "falha"; t.erro = String(e?.message || e).slice(0, 200); }
        // Parte gravada = salva já (retomada sem repetir); tabelas vazias são salvas em lotes.
        if (t.partes !== antes || ++desdeSalvo >= 20) { await salvar(m); desdeSalvo = 0; }
        continue;
      }
      if (m.arquivos.pastas === null) { await listarPastas(m); continue; }
      if (m.arquivos.fila.length || m.arquivos.pastas.length) { await passoDosArquivos(m); if (++desdeSalvo >= 20) { await salvar(m); desdeSalvo = 0; } continue; }
      const falhou = m.tabelas.some((x) => x.status !== "ok") || m.arquivos.falhas.length > 0;
      m.status = falhou ? "concluido_com_falhas" : "concluido";
      break;
    } while (Date.now() < fim);
    await salvar(m);
    return m;
  }

  async function listar(tenantId: string) {
    const { data, error } = await db.storage.from(BUCKET_BACKUP).list(tenantId, { limit: 100 });
    if (error) { if (/not found/i.test(error.message)) return []; throw new Error(error.message); }
    const ids = (data || []).map((o: any) => String(o.name)).filter((n: string) => ID_BACKUP.test(n)).sort().reverse().slice(0, 20);
    const todos = await Promise.all(ids.map((id: string) => ler(tenantId, id)));
    return todos.filter((m): m is Manifest => !!m).map(progresso);
  }

  /** Links temporários de tudo que o backup tem (manifest, partes das tabelas e arquivos copiados). */
  async function links(tenantId: string, id: string) {
    const m = await ler(tenantId, id);
    if (!m) return null;
    const base = pasta(tenantId, id);
    const relativos = [
      "manifest.json",
      ...m.tabelas.flatMap((t) => Array.from({ length: t.partes }, (_, i) => `tabelas/${t.nome}.${String(i + 1).padStart(4, "0")}.ndjson.gz`)),
      ...m.arquivos.copiados.map((a) => `arquivos/${a}`),
    ];
    const saida: { nome: string; url: string }[] = [];
    for (let i = 0; i < relativos.length; i += 200) {
      const lote = relativos.slice(i, i + 200);
      const { data, error } = await db.storage.from(BUCKET_BACKUP).createSignedUrls(lote.map((r) => `${base}/${r}`), VALIDADE_LINK);
      if (error) throw new Error(error.message);
      (data || []).forEach((d: any, k: number) => { if (d?.signedUrl) saida.push({ nome: lote[k], url: d.signedUrl }); });
    }
    return { empresa: m.empresa.nome, status: m.status, validadeDias: VALIDADE_LINK / 86400, arquivos: saida, faltando: relativos.length - saida.length };
  }

  return { iniciar, continuar, listar, links, ler };
}

type Deps = { requireUser: any; requireMaster: any; limiter: any; supabaseService: any; supabaseUrl: string; serviceKey: string };

export const lerOpenApiDe = (supabaseUrl: string, serviceKey: string) => async () => {
  const r = await fetch(`${supabaseUrl.replace(/\/+$/, "")}/rest/v1/`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }, signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`o banco recusou a lista de tabelas (${r.status})`);
  return r.json();
};

export function registerBackupEmpresaRoutes(app: express.Express, { requireUser, requireMaster, limiter, supabaseService, supabaseUrl, serviceKey }: Deps) {
  const motor = criarMotorBackup({ db: supabaseService, lerOpenApi: lerOpenApiDe(supabaseUrl, serviceKey) });
  const emAndamento = new Set<string>();

  const rota = (fn: (req: any, res: any, tenantId: string) => Promise<unknown>) => async (req: any, res: any) => {
    const tenantId = String(req.params.tenantId || "");
    if (!supabaseService || !serviceKey) return res.status(503).json({ error: "Servidor sem acesso ao banco para backup." });
    if (!UUID.test(tenantId)) return res.status(400).json({ error: "Empresa inválida." });
    if (req.params.backupId !== undefined && !ID_BACKUP.test(String(req.params.backupId))) return res.status(400).json({ error: "Backup inválido." });
    try { await fn(req, res, tenantId); }
    catch (e: any) { console.error("[backup-empresa]", e?.message); res.status(500).json({ error: `Não foi possível concluir o backup: ${String(e?.message || "erro").slice(0, 200)}` }); }
  };
  const trilha = async (tenantId: string, por: string, acao: string, backupId: string) => {
    const { error } = await supabaseService.from("billing_events").insert({ tenant_id: tenantId, type: "backup", payload: { acao, backupId, by: por } });
    if (error) console.warn("[backup-empresa] não registrou a trilha:", error.message);
  };
  const base = "/api/admin/empresas/:tenantId/backups";

  app.get(base, requireUser, requireMaster, limiter, rota(async (_req, res, t) => res.json({ backups: await motor.listar(t) })));

  app.post(base, requireUser, requireMaster, limiter, rota(async (req, res, t) => {
    const m = await motor.iniciar(t, req.user.id);
    await trilha(t, req.user.id, "iniciado", m.id);
    res.status(201).json({ backup: progresso(m) });
  }));

  app.post(`${base}/:backupId/continuar`, requireUser, requireMaster, limiter, rota(async (req, res, t) => {
    const chave = `${t}/${req.params.backupId}`;
    if (emAndamento.has(chave)) return res.status(409).json({ error: "Este backup já está avançando. Aguarde." });
    emAndamento.add(chave);
    try {
      const m = await motor.continuar(t, req.params.backupId);
      if (!m) return res.status(404).json({ error: "Backup não encontrado." });
      res.json({ backup: progresso(m) });
    } finally { emAndamento.delete(chave); }
  }));

  app.get(`${base}/:backupId/links`, requireUser, requireMaster, limiter, rota(async (req, res, t) => {
    const l = await motor.links(t, req.params.backupId);
    if (!l) return res.status(404).json({ error: "Backup não encontrado." });
    await trilha(t, req.user.id, "links gerados", req.params.backupId);
    res.json(l);
  }));
}
