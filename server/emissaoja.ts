// Emissão de NFS-e pelo emissaoja.com.br (Emissor Nacional, sem certificado digital).
// Uma conta emissaoja = uma empresa: a chave (ej_live_… / ej_test_…) de cada empresa do SPY fica em
// app_settings (chave "integracoes_emissaoja") e só é lida AQUI, no servidor; o navegador nunca a recebe de volta.
// A senha do portal do Emissor Nacional passa direto para a emissaoja: não é gravada nem logada pelo SPY.
// Referência: docs/apis-brasil.md.
import { createHash, randomUUID } from "node:crypto";
import type express from "express";
import { round2 } from "../src/lib/dinheiro.js";

const SETTINGS_KEY = "integracoes_emissaoja";
const HOST_PRODUCAO = "https://emissaoja.com.br";
const HOST_SANDBOX = "https://sandbox.emissaoja.com.br";

type Deps = {
  requireUser: express.RequestHandler;
  requireTenantAdmin: express.RequestHandler;
  resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>;
  supabaseService: any;
  limiter: express.RequestHandler;
};

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const soDigitos = (v: unknown) => texto(v).replace(/\D/g, "");

export const chaveValida = (k: unknown) => /^ej_(live|test)_[A-Za-z0-9_-]{8,}$/.test(texto(k));
export const hostDaChave = (k: string) => (k.startsWith("ej_test_") ? HOST_SANDBOX : HOST_PRODUCAO);
export const ambienteDaChave = (k: string): "sandbox" | "producao" => (k.startsWith("ej_test_") ? "sandbox" : "producao");

/** Chave de idempotência: a mesma referência (ex.: o lançamento) nunca emite duas notas. Regex da API: ^[A-Za-z0-9_-]{8,64}$. */
export function chaveIdempotencia(tenantId: string, referencia?: string | null): string {
  const ref = texto(referencia);
  if (!ref) return `spy-${randomUUID()}`;
  return `spy-${createHash("sha256").update(`${tenantId}:${ref}`).digest("hex").slice(0, 40)}`;
}

export type PedidoNota = {
  documento: string; nome?: string; valor: number; descricao?: string; competencia?: string; servicoId?: string;
};

/** Valida o pedido do navegador e devolve só o que a API aceita. Erro = mensagem pronta para a tela. */
export function validarPedido(b: any): { ok: true; pedido: PedidoNota } | { ok: false; erro: string } {
  const documento = soDigitos(b?.documento);
  if (documento.length !== 11 && documento.length !== 14) return { ok: false, erro: "Informe o CPF (11 dígitos) ou o CNPJ (14 dígitos) do cliente." };
  const valor = round2(Number(b?.valor));
  if (!Number.isFinite(valor) || valor <= 0) return { ok: false, erro: "Informe o valor da nota (maior que zero)." };
  const nome = texto(b?.nome).slice(0, 150);
  if (documento.length === 11 && nome.split(/\s+/).filter(Boolean).length < 2) return { ok: false, erro: "Para CPF, informe o nome completo do cliente." };
  const competencia = texto(b?.competencia);
  if (competencia && !/^\d{4}-\d{2}-\d{2}$/.test(competencia)) return { ok: false, erro: "Competência inválida (use AAAA-MM-DD)." };
  const descricao = texto(b?.descricao).slice(0, 2000);
  const servicoId = texto(b?.servicoId);
  return { ok: true, pedido: { documento, valor, ...(nome ? { nome } : {}), ...(descricao ? { descricao } : {}), ...(competencia ? { competencia } : {}), ...(servicoId ? { servicoId } : {}) } };
}

export function montarCorpoNota(p: PedidoNota, tomador: { tipo: string; id: string }) {
  return {
    tomador_tipo: tomador.tipo, tomador_id: tomador.id, valor: p.valor,
    ...(p.servicoId ? { servico_id: p.servicoId } : {}), ...(p.descricao ? { descricao: p.descricao } : {}), ...(p.competencia ? { competencia: p.competencia } : {}),
  };
}

const MENSAGENS: Record<string, string> = {
  chave_invalida: "A chave da emissaoja foi recusada. Confira a chave salva.",
  aceite_pendente: "A emissaoja pede para aceitar os novos termos no app deles antes de continuar.",
  limite_notas: "O limite de notas do plano da emissaoja acabou neste mês.",
  possivel_duplicada: "Já existe uma nota igual emitida hoje. Confira antes de emitir de novo.",
  emissao_repetida_recente: "Uma nota igual foi emitida há instantes. Aguarde 2 minutos para repetir.",
  incerta_pendente: "Há uma emissão com resultado incerto aguardando conferência. Resolva-a antes de emitir outra.",
  sem_empresa: "Esta conta da emissaoja ainda não tem empresa conectada. Conecte o CNPJ primeiro.",
  nota_bloqueada: "A nota foi bloqueada pela validação (veja os motivos abaixo).",
  cnpj_nao_encontrado: "CNPJ do cliente não encontrado na Receita.",
  documento_invalido: "CPF ou CNPJ do cliente inválido.",
  nome_obrigatorio: "Para CPF, informe o nome do cliente.",
  nome_incompleto: "Informe o nome completo do cliente.",
  receita_indisponivel: "A Receita está indisponível agora. Tente de novo em instantes.",
  motor_indisponivel: "O emissor está indisponível agora. Tente de novo em instantes.",
  fila_indisponivel: "O emissor está ocupado. Tente de novo em instantes (a mesma nota não será duplicada).",
  rate_limited: "Muitas chamadas seguidas. Aguarde um minuto.",
  cnpj_ja_vinculado: "Este CNPJ já está vinculado a outra conta da emissaoja.",
  ja_tem_empresa: "Esta conta da emissaoja já tem uma empresa conectada.",
  cnpj_alfanumerico_nao_suportado: "CNPJ alfanumérico ainda não é aceito pela emissaoja.",
};

/** Resposta de erro da emissaoja → status e texto para a tela (nunca ecoa a chave nem a senha). */
export function traduzirErro(status: number, json: any): { status: number; error: string; bloqueios?: unknown } {
  const code = texto(json?.code);
  const error = MENSAGENS[code] || texto(json?.message) || "A emissaoja não respondeu como esperado.";
  const http = status === 401 ? 400 : status >= 400 && status < 500 ? status : 502;
  return { status: http, error, ...(Array.isArray(json?.bloqueios) ? { bloqueios: json.bloqueios } : {}) };
}

export function registerEmissaoJaRoutes(app: express.Express, { requireUser, requireTenantAdmin, resolveRequestedTenantId, supabaseService, limiter }: Deps) {
  const lerChave = async (tenantId: string): Promise<string | null> => {
    if (!supabaseService) return null;
    const { data } = await supabaseService.from("app_settings").select("value").eq("tenant_id", tenantId).eq("key", SETTINGS_KEY).maybeSingle();
    const k = data?.value?.apiKey;
    return chaveValida(k) ? k : null;
  };

  async function chamar(chave: string, metodo: string, caminho: string, corpo?: unknown, extra: Record<string, string> = {}) {
    const r = await fetch(`${hostDaChave(chave)}${caminho}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${chave}`, Accept: "application/json", ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}), ...extra },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(25_000),
    });
    return r;
  }
  async function json(r: Response) { try { return await r.json(); } catch { return null; } }

  /** Resolve a empresa e a chave; responde sozinho quando falta algo. */
  async function contexto(req: any, res: any): Promise<{ tenantId: string; chave: string } | null> {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return null;
    const chave = await lerChave(tenantId);
    if (!chave) { res.status(409).json({ error: "A emissão de notas ainda não está configurada. Salve a chave da emissaoja primeiro.", configurado: false }); return null; }
    return { tenantId, chave };
  }

  async function repassar(res: express.Response, r: Response, ok: number[] = [200, 201, 202]) {
    const j = await json(r);
    if (!ok.includes(r.status)) { const e = traduzirErro(r.status, j); return res.status(e.status).json({ error: e.error, ...(e.bloqueios ? { bloqueios: e.bloqueios } : {}) }); }
    return res.status(r.status).json(j);
  }

  const falha = (res: express.Response, tag: string, err: any) => {
    console.error(`[nfse/${tag}]`, err?.message);
    return res.status(502).json({ error: "Não foi possível falar com a emissaoja agora. Tente de novo." });
  };

  // Estado: configurado? empresa conectada? (a chave nunca volta)
  app.get("/api/nfse/status", requireUser, limiter, async (req: any, res) => {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const chave = await lerChave(tenantId);
    if (!chave) return res.json({ configurado: false });
    try {
      const r = await chamar(chave, "GET", "/v1/empresa");
      const j = await json(r);
      if (r.status === 200) return res.json({ configurado: true, ambiente: ambienteDaChave(chave), ...j });
      const e = traduzirErro(r.status, j);
      return res.json({ configurado: true, ambiente: ambienteDaChave(chave), empresa: null, aviso: e.error });
    } catch (err) { return falha(res, "status", err); }
  });

  // Salva a chave (só administrador da empresa). Valida de verdade na emissaoja antes de gravar.
  app.put("/api/nfse/config", requireUser, requireTenantAdmin, limiter, async (req: any, res) => {
    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;
    const chave = texto(req.body?.apiKey);
    if (!chaveValida(chave)) return res.status(400).json({ error: "Chave inválida. Ela começa com ej_live_ (produção) ou ej_test_ (testes)." });
    try {
      const r = await chamar(chave, "GET", "/v1/empresa");
      if (r.status === 401) return res.status(400).json({ error: "A emissaoja recusou essa chave. Confira se copiou inteira." });
      const { error } = await supabaseService.from("app_settings").upsert(
        { tenant_id: tenantId, key: SETTINGS_KEY, value: { apiKey: chave, atualizadoEm: new Date().toISOString(), atualizadoPor: req.user?.id } },
        { onConflict: "tenant_id,key" });
      if (error) return res.status(500).json({ error: "Não foi possível salvar a chave." });
      console.info("[nfse/config]", JSON.stringify({ actor: req.user?.id, tenant: tenantId, ambiente: ambienteDaChave(chave) }));
      return res.json({ ok: true, ambiente: ambienteDaChave(chave) });
    } catch (err) { return falha(res, "config", err); }
  });

  // Conectar a empresa: CNPJ + senha do portal do Emissor Nacional (a senha só passa, nunca é guardada nem logada aqui).
  app.put("/api/nfse/credencial", requireUser, requireTenantAdmin, limiter, async (req: any, res) => {
    const c = await contexto(req, res); if (!c) return;
    const cnpj = soDigitos(req.body?.cnpj);
    const senha = typeof req.body?.senha === "string" ? req.body.senha : "";
    if (cnpj.length !== 14) return res.status(400).json({ error: "Informe o CNPJ da empresa (14 dígitos)." });
    if (!senha) return res.status(400).json({ error: "Informe a senha do portal do Emissor Nacional." });
    try {
      const r = await chamar(c.chave, "PUT", "/v1/empresa/credencial", { cnpj, senha, ...(req.body?.cienteUltimaTentativa === true ? { ciente_ultima_tentativa: true } : {}) });
      console.info("[nfse/credencial]", JSON.stringify({ actor: req.user?.id, tenant: c.tenantId, http: r.status }));
      return repassar(res, r);
    } catch (err) { return falha(res, "credencial", err); }
  });
  app.get("/api/nfse/credencial", requireUser, limiter, async (req: any, res) => {
    const c = await contexto(req, res); if (!c) return;
    try { return repassar(res, await chamar(c.chave, "GET", "/v1/empresa/credencial")); } catch (err) { return falha(res, "credencial-get", err); }
  });

  app.get("/api/nfse/servicos", requireUser, limiter, async (req: any, res) => {
    const c = await contexto(req, res); if (!c) return;
    try { return repassar(res, await chamar(c.chave, "GET", "/v1/servicos")); } catch (err) { return falha(res, "servicos", err); }
  });

  // Emitir: cadastra/acha o tomador (cliente) e pede a nota. 202 = na fila; a tela acompanha em /emissoes/:id.
  app.post("/api/nfse/emitir", requireUser, limiter, async (req: any, res) => {
    const v = validarPedido(req.body);
    if (v.ok === false) return res.status(400).json({ error: v.erro });
    const c = await contexto(req, res); if (!c) return;
    try {
      const rt = await chamar(c.chave, "POST", "/v1/tomadores", { documento: v.pedido.documento, ...(v.pedido.nome ? { nome: v.pedido.nome } : {}) });
      const jt = await json(rt);
      if (rt.status !== 200 && rt.status !== 201) { const e = traduzirErro(rt.status, jt); return res.status(e.status).json({ error: e.error }); }
      const tomador = jt?.tomador;
      if (!tomador?.id || !tomador?.tipo) return res.status(502).json({ error: "A emissaoja não devolveu o cliente da nota." });
      const idem = chaveIdempotencia(c.tenantId, req.body?.referencia);
      const r = await chamar(c.chave, "POST", "/v1/notas", montarCorpoNota(v.pedido, tomador), { "Idempotency-Key": idem });
      console.info("[nfse/emitir]", JSON.stringify({ actor: req.user?.id, tenant: c.tenantId, http: r.status, valor: v.pedido.valor }));
      return repassar(res, r);
    } catch (err) { return falha(res, "emitir", err); }
  });

  app.get("/api/nfse/emissoes/:id", requireUser, limiter, async (req: any, res) => {
    const id = texto(req.params.id);
    if (!/^[\w-]{6,80}$/.test(id)) return res.status(400).json({ error: "Pedido inválido." });
    const c = await contexto(req, res); if (!c) return;
    try { return repassar(res, await chamar(c.chave, "GET", `/v1/emissoes/${encodeURIComponent(id)}`)); } catch (err) { return falha(res, "emissao", err); }
  });

  app.get("/api/nfse/notas", requireUser, limiter, async (req: any, res) => {
    const c = await contexto(req, res); if (!c) return;
    const q = new URLSearchParams({ periodo: ["mes_atual", "mes_anterior", "ano_atual", "12_meses"].includes(texto(req.query.periodo)) ? texto(req.query.periodo) : "12_meses", limite: "30" });
    const cursor = texto(req.query.cursor).slice(0, 200); if (cursor) q.set("cursor", cursor);
    try { return repassar(res, await chamar(c.chave, "GET", `/v1/notas?${q.toString()}`)); } catch (err) { return falha(res, "notas", err); }
  });

  // PDF (DANFSe) e XML da nota: o servidor busca com a chave e entrega o arquivo.
  app.get("/api/nfse/notas/:origem/:id/:formato", requireUser, limiter, async (req: any, res) => {
    const { origem, id, formato } = req.params;
    if (!["local", "importada"].includes(origem) || !/^[\w-]{6,80}$/.test(id) || !["pdf", "xml"].includes(formato)) return res.status(400).json({ error: "Nota inválida." });
    const c = await contexto(req, res); if (!c) return;
    try {
      const r = await chamar(c.chave, "GET", `/v1/notas/${origem}/${encodeURIComponent(id)}/${formato}`);
      if (r.status !== 200) { const e = traduzirErro(r.status, await json(r)); return res.status(e.status).json({ error: e.error }); }
      res.setHeader("Content-Type", formato === "pdf" ? "application/pdf" : "application/xml");
      res.setHeader("Content-Disposition", `inline; filename="nfse-${id}.${formato}"`);
      return res.send(Buffer.from(await r.arrayBuffer()));
    } catch (err) { return falha(res, "arquivo", err); }
  });

  // Cancelar (ato fiscal, só administrador): motivo "1" erro na emissão, "2" serviço não prestado.
  app.post("/api/nfse/notas/:origem/:id/cancelar", requireUser, requireTenantAdmin, limiter, async (req: any, res) => {
    const { origem, id } = req.params;
    const motivo = texto(req.body?.motivo);
    const justificativa = texto(req.body?.justificativa);
    if (!["local", "importada"].includes(origem) || !/^[\w-]{6,80}$/.test(id)) return res.status(400).json({ error: "Nota inválida." });
    if (!["1", "2"].includes(motivo)) return res.status(400).json({ error: "Escolha o motivo do cancelamento." });
    if (justificativa && (justificativa.length < 15 || justificativa.length > 255)) return res.status(400).json({ error: "A justificativa deve ter entre 15 e 255 caracteres." });
    const c = await contexto(req, res); if (!c) return;
    try {
      const r = await chamar(c.chave, "POST", `/v1/notas/${origem}/${encodeURIComponent(id)}/cancelar`, { motivo, ...(justificativa ? { justificativa } : {}) });
      console.info("[nfse/cancelar]", JSON.stringify({ actor: req.user?.id, tenant: c.tenantId, nota: id, http: r.status }));
      return repassar(res, r);
    } catch (err) { return falha(res, "cancelar", err); }
  });
}
