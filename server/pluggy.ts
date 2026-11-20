// Conexão automática com os bancos (Open Finance) via Pluggy — https://docs.pluggy.ai
//
// Fluxo:
//  1. o navegador pede POST /api/pluggy/connect-token → o servidor autentica no Pluggy (CLIENT_ID/CLIENT_SECRET ficam SÓ aqui)
//     e devolve um token de 30 min que abre o widget "Pluggy Connect";
//  2. o cliente entra no banco dentro do widget; ao terminar, o navegador manda o itemId para POST /api/pluggy/items;
//  3. o servidor lista as contas do item, liga cada uma a uma conta de finance_bank_accounts e importa as movimentações
//     (POSTED) em finance_extratos_importados — o mesmo lugar do extrato OFX/CSV, então a Conciliação já funciona;
//  4. o Pluggy avisa por webhook (item/updated, transactions/created…) e o servidor sincroniza de novo.
//
// Segurança: tenant_id NUNCA vem do corpo — é a empresa do usuário autenticado ou, para master/parceiro, uma empresa a que ele
// tem acesso (has_tenant_access). Quem conecta: qualquer pessoa com o módulo Financeiro (na empresa e no cargo). O webhook é
// autenticado por um cabeçalho secreto (criado com POST /webhooks) e ainda assim é só um "sinal": nunca grava dados que vieram
// na chamada, só dispara uma nova leitura feita com as nossas credenciais.
// Datas/ids: transações usam GET /v2/transactions (a /transactions antiga acaba em 31/12/2026), paginado por cursor.

import { Router } from "express";
import type { NextFunction, Response } from "express";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { modulosDoCargo, restritoAosProprios } from "../src/lib/cargosUsuario.js";
import rateLimit from "express-rate-limit";

const API_BASE = "https://api.pluggy.ai";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Configuração ───────────────────────────────────────────────────────────────

export type PluggyConfig = {
  clientId: string;
  clientSecret: string;
  /** Segredo que o Pluggy devolve no cabeçalho x-spy-webhook-secret de cada webhook (definido por nós ao registrar). */
  webhookSecret?: string;
  /** Signing secret da aplicação no Pluggy (X-Pluggy-Signature), opcional: só dá para conferir quando o corpo bruto existe. */
  signingSecret?: string;
  /** Mostra os conectores de teste (sandbox) no widget. */
  sandbox: boolean;
  publicAppUrl: string;
};

/** Sem CLIENT_ID e CLIENT_SECRET a integração fica desligada (as rotas respondem 503 com uma mensagem clara). */
export function lerConfigPluggy(env: Record<string, string | undefined> = process.env): PluggyConfig | null {
  const clientId = env.PLUGGY_CLIENT_ID?.trim();
  const clientSecret = env.PLUGGY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  return {
    clientId,
    clientSecret,
    webhookSecret: env.PLUGGY_WEBHOOK_SECRET?.trim() || undefined,
    signingSecret: env.PLUGGY_SIGNING_SECRET?.trim() || undefined,
    sandbox: env.PLUGGY_SANDBOX === "true",
    publicAppUrl: (env.PUBLIC_APP_URL || env.APP_URL || "").trim().replace(/\/+$/, ""),
  };
}

/** O Pluggy só entrega webhook em HTTPS público: sem isso o token é criado sem webhookUrl (a sincronização manual continua valendo). */
export function webhookUrlDe(cfg: Pick<PluggyConfig, "publicAppUrl">): string | undefined {
  const u = cfg.publicAppUrl;
  if (!u.startsWith("https://") || /^https:\/\/(localhost|127\.|10\.|192\.168\.)/i.test(u)) return undefined;
  return `${u}/api/pluggy/webhook`;
}

// ── Peças puras (testáveis) ────────────────────────────────────────────────────

export const CABECALHO_SEGREDO = "x-spy-webhook-secret";

/** Compara dois segredos em tempo constante (os dois viram SHA-256 antes, para terem sempre o mesmo tamanho). */
export function segredoConfere(recebido: string | undefined | null, esperado: string | undefined | null): boolean {
  if (!recebido || !esperado) return false;
  const h = (x: string) => createHash("sha256").update(x).digest();
  return timingSafeEqual(h(recebido), h(esperado));
}

/** Confere o cabeçalho X-Pluggy-Signature: `t=<unix>,v1=<HMAC-SHA256 hex de "<t>.<corpo bruto>">`, tolerância de 5 min. */
export function assinaturaValida(corpoBruto: string, cabecalho: string | undefined, segredo: string, agoraMs = Date.now(), toleranciaS = 300): boolean {
  if (!cabecalho || !segredo) return false;
  const partes: Record<string, string> = {};
  for (const p of cabecalho.split(",")) {
    const i = p.indexOf("=");
    if (i > 0) partes[p.slice(0, i).trim()] = p.slice(i + 1).trim();
  }
  const t = Number(partes.t);
  const v1 = partes.v1;
  if (!Number.isFinite(t) || !v1) return false;
  if (Math.abs(agoraMs / 1000 - t) > toleranciaS) return false;
  const esperado = createHmac("sha256", segredo).update(`${partes.t}.${corpoBruto}`).digest("hex");
  const a = Buffer.from(esperado);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type TransacaoPluggy = {
  id: string;
  description?: string | null;
  descriptionRaw?: string | null;
  amount: number;
  date: string;
  type?: "CREDIT" | "DEBIT" | null;
  status?: "PENDING" | "POSTED" | null;
};

/** Transação do Pluggy → linha de finance_extratos_importados (mesmo formato do OFX/CSV). Pendentes ficam de fora até serem lançadas. */
export function paraLinhaExtrato(tx: TransacaoPluggy, tenantId: string, banco: string, contaId: string | null = null) {
  if (tx.status === "PENDING") return null;
  const bruto = Number(tx.amount);
  if (!Number.isFinite(bruto) || bruto === 0) return null;
  const iso = String(tx.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const tipo = tx.type === "DEBIT" ? "debito" : tx.type === "CREDIT" ? "credito" : bruto < 0 ? "debito" : "credito";
  const [y, m, d] = iso.split("-");
  return {
    id: `pluggy-${tx.id}`,
    tenant_id: tenantId,
    data: `${d}/${m}/${y}`,
    descricao: String(tx.description || tx.descriptionRaw || "Movimentação").slice(0, 200),
    documento: tx.id,
    valor: Math.abs(bruto),
    tipo,
    banco,
    conta_bancaria_id: contaId,
    conciliado: false,
  };
}

/** A paginação do /v2 devolve `next`: ou uma query string pronta ("?after=…") ou só o cursor. Monta a URL da próxima página. */
export function proximaPagina(base: string, next: string | null | undefined): string | null {
  if (!next) return null;
  if (next.startsWith("?")) {
    // Junta o cursor com os filtros originais (accountId, dateFrom): funciona tanto se `next` vier completo quanto só com o cursor.
    const [caminho, query = ""] = base.split("?");
    const params = new URLSearchParams(query);
    for (const [k, v] of new URLSearchParams(next.slice(1))) params.set(k, v);
    return `${caminho}?${params.toString()}`;
  }
  if (next.startsWith("/")) return next;
  return `${base}&after=${encodeURIComponent(next)}`;
}

// ── Cliente da API do Pluggy ───────────────────────────────────────────────────

export class ErroPluggy extends Error {
  constructor(public etapa: string, public status: number, mensagem?: string) {
    super(`Pluggy (${etapa}) respondeu ${status}${mensagem ? `: ${mensagem}` : ""}`);
  }
}

export function criarClientePluggy(cfg: PluggyConfig, f: typeof fetch = fetch) {
  let chave: { valor: string; expira: number } | null = null;

  const autenticar = async (): Promise<string> => {
    if (chave && chave.expira > Date.now()) return chave.valor;
    const r = await f(`${API_BASE}/auth`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId: cfg.clientId, clientSecret: cfg.clientSecret }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) throw new ErroPluggy("auth", r.status);
    const j: any = await r.json();
    if (!j?.apiKey) throw new ErroPluggy("auth", 502, "resposta sem apiKey");
    chave = { valor: j.apiKey, expira: Date.now() + 100 * 60 * 1000 }; // a chave vale 2 h
    return j.apiKey;
  };

  const chamar = async <T = any>(metodo: string, caminho: string, corpo?: unknown, repetir = true): Promise<T> => {
    const apiKey = await autenticar();
    const r = await f(`${API_BASE}${caminho}`, {
      method: metodo,
      headers: { "X-API-KEY": apiKey, ...(corpo !== undefined ? { "content-type": "application/json" } : {}) },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(20000),
    });
    if ((r.status === 401 || r.status === 403) && repetir) {
      chave = null; // a chave pode ter sido revogada: renova e tenta uma vez
      return chamar<T>(metodo, caminho, corpo, false);
    }
    if (!r.ok) {
      let msg = "";
      try { msg = String((await r.json())?.message || "").slice(0, 200); } catch { /* sem corpo */ }
      throw new ErroPluggy(caminho.split("?")[0], r.status, msg);
    }
    return r.status === 204 ? (undefined as T) : ((await r.json()) as T);
  };

  return {
    get: <T = any>(caminho: string) => chamar<T>("GET", caminho),
    post: <T = any>(caminho: string, corpo: unknown) => chamar<T>("POST", caminho, corpo),
    delete: (caminho: string) => chamar("DELETE", caminho),
  };
}
export type ClientePluggy = ReturnType<typeof criarClientePluggy>;

// ── Sincronização ──────────────────────────────────────────────────────────────

export type ResultadoSync = {
  status: string | null;
  contas: number;
  importadas: number;
  /** Parou por tempo; a próxima sincronização continua de onde parou. */
  parcial: boolean;
  /** Banco ainda coletando os dados ou pedindo ação do cliente: nada para importar agora. */
  aguardando?: string;
};

const STATUS_AGUARDANDO = new Set(["UPDATING", "LOGIN_IN_PROGRESS", "WAITING_USER_INPUT", "WAITING_USER_ACTION"]);
const STATUS_ERRO = new Set(["LOGIN_ERROR", "OUTDATED", "ERROR"]);

export async function sincronizarItem(
  d: { cli: ClientePluggy; sb: SupabaseClient; tenantId: string; itemId: string },
  opcoes: { orcamentoMs?: number; agora?: () => Date } = {},
): Promise<ResultadoSync> {
  const { cli, sb, tenantId, itemId } = d;
  const agora = opcoes.agora ?? (() => new Date());
  const limite = Date.now() + (opcoes.orcamentoMs ?? 45000);

  const { data: existentes, error: e0 } = await sb.from("finance_bank_connections").select("*").eq("tenant_id", tenantId).eq("item_id", itemId);
  if (e0) throw e0;
  if (!existentes?.length) throw new ErroPluggy("conexao", 404, "conexão não encontrada para esta empresa");

  const item: any = await cli.get(`/items/${itemId}`);
  const status: string | null = item?.status ?? null;
  const conector: string | null = item?.connector?.name ?? existentes[0].connector_name ?? null;

  if (status && STATUS_ERRO.has(status)) {
    await sb.from("finance_bank_connections").update({ status, connector_name: conector, last_error: "O banco recusou o acesso. Reconecte a conta para continuar sincronizando." }).eq("tenant_id", tenantId).eq("item_id", itemId);
    return { status, contas: 0, importadas: 0, parcial: false, aguardando: "reconectar" };
  }
  if (status && STATUS_AGUARDANDO.has(status)) {
    await sb.from("finance_bank_connections").update({ status, connector_name: conector }).eq("tenant_id", tenantId).eq("item_id", itemId);
    return { status, contas: 0, importadas: 0, parcial: false, aguardando: status };
  }

  // 1) Contas do banco → linhas de mapeamento (a primeira usa a conta que o usuário escolheu; as demais viram contas novas).
  const contasApi: any = await cli.get(`/accounts?itemId=${encodeURIComponent(itemId)}`);
  // Contas correntes/poupanças (BANK) e cartões de crédito (CREDIT). As bancárias vêm primeiro: a conta que o usuário escolheu
  // no "Conectar" fica com a primeira delas; as demais viram contas novas.
  const bancarias: any[] = (contasApi?.results ?? [])
    .filter((a: any) => a?.type === "BANK" || a?.type === "CREDIT")
    .sort((a: any, b: any) => Number(b.type === "BANK") - Number(a.type === "BANK"));
  const contaApiPorId = new Map(bancarias.map((a: any) => [a.id, a]));
  const reais = existentes.filter((e: any) => !String(e.pluggy_account_id).startsWith("item:"));
  const marcador = existentes.find((e: any) => String(e.pluggy_account_id).startsWith("item:"));
  const jaMapeadas = new Set(reais.map((e: any) => e.pluggy_account_id));
  const usadas = new Set(reais.map((e: any) => e.conta_bancaria_id).filter(Boolean));
  let contaLivre: string | null = marcador?.conta_bancaria_id ?? existentes.find((e: any) => e.conta_bancaria_id)?.conta_bancaria_id ?? null;
  if (contaLivre && usadas.has(contaLivre)) contaLivre = null;

  for (const acc of bancarias) {
    if (jaMapeadas.has(acc.id)) continue;
    let contaId = contaLivre;
    contaLivre = null;
    if (!contaId) {
      const { data: criada, error } = await sb.from("finance_bank_accounts").insert({
        tenant_id: tenantId,
        nome: `${conector ?? "Banco"} — ${acc.name || acc.number || "conta"}`.slice(0, 80),
        tipo: acc.type === "CREDIT" ? "CARTAO_CREDITO" : acc.subtype === "SAVINGS_ACCOUNT" ? "CONTA_POUPANCA" : "CONTA_CORRENTE",
        saldo_inicial: 0, sinal_saldo_inicial: "ZERADO", is_principal: false, arquivada: false,
        banco: conector, numero_conta: acc.number ?? null, titular: acc.owner ?? null, documento: acc.taxNumber ?? null,
      }).select("id").single();
      if (error) throw error;
      contaId = criada.id;
    }
    const { error } = await sb.from("finance_bank_connections").insert({
      tenant_id: tenantId, item_id: itemId, connector_name: conector, pluggy_account_id: acc.id,
      pluggy_account_name: acc.name ?? null, pluggy_account_type: acc.type, conta_bancaria_id: contaId, status,
    });
    if (error) throw error;
  }
  if (marcador && bancarias.length) await sb.from("finance_bank_connections").delete().eq("id", marcador.id).eq("tenant_id", tenantId);

  // 2) Movimentações de cada conta mapeada.
  const { data: mapa } = await sb.from("finance_bank_connections").select("*").eq("tenant_id", tenantId).eq("item_id", itemId).not("pluggy_account_id", "like", "item:%");
  const ids = [...new Set((mapa ?? []).map((m: any) => m.conta_bancaria_id).filter(Boolean))];
  const { data: contas } = ids.length ? await sb.from("finance_bank_accounts").select("id,nome,banco").eq("tenant_id", tenantId).in("id", ids) : { data: [] as any[] };
  const contaPorId = new Map((contas ?? []).map((c: any) => [c.id, c]));

  let importadas = 0;
  let parcial = false;
  for (const m of mapa ?? []) {
    const conta: any = m.conta_bancaria_id ? contaPorId.get(m.conta_bancaria_id) : null;
    const rotulo = conta?.nome ?? "Conta Importada";
    // Primeira vez: 90 dias. Depois: desde a última sincronização, com 3 dias de folga (ids estáveis + upsert evitam duplicar).
    const desde = m.last_sync_at ? new Date(new Date(m.last_sync_at).getTime() - 3 * 86400000) : new Date(agora().getTime() - 90 * 86400000);
    const base = `/v2/transactions?accountId=${encodeURIComponent(m.pluggy_account_id)}&dateFrom=${encodeURIComponent(desde.toISOString())}`;
    let url: string | null = base;
    let paginas = 0;
    let completo = true;
    while (url) {
      if (Date.now() > limite || paginas >= 40) { completo = false; parcial = true; break; }
      const pagina: any = await cli.get(url);
      const linhas = (pagina?.results ?? []).map((t: TransacaoPluggy) => paraLinhaExtrato(t, tenantId, rotulo, m.conta_bancaria_id ?? null)).filter(Boolean) as any[];
      for (let i = 0; i < linhas.length; i += 500) {
        // ignoreDuplicates: o que já veio antes (e talvez já foi conciliado) não é sobrescrito.
        const { data: novas, error } = await sb.from("finance_extratos_importados").upsert(linhas.slice(i, i + 500), { onConflict: "id", ignoreDuplicates: true }).select("id");
        if (error) throw error;
        importadas += novas?.length ?? 0;
      }
      url = proximaPagina(base, pagina?.next);
      paginas++;
    }
    const agoraIso = agora().toISOString();
    await sb.from("finance_bank_connections").update({ status, connector_name: conector, last_error: null, ...(completo ? { last_sync_at: agoraIso } : {}) }).eq("id", m.id).eq("tenant_id", tenantId);
    if (m.conta_bancaria_id) {
      // Saldo que o banco informa. Cartão de crédito: o Pluggy devolve o valor devido (positivo) — no sistema é uma dívida (negativo).
      const acc: any = contaApiPorId.get(m.pluggy_account_id);
      const bruto = acc && Number.isFinite(Number(acc.balance)) ? Number(acc.balance) : null;
      const saldoBanco = bruto === null ? null : acc.type === "CREDIT" ? -Math.abs(bruto) : bruto;
      await sb.from("finance_bank_accounts").update({
        conexao_status: "Conectada", conexao_provedor: "Pluggy", ultima_sincronizacao: agoraIso,
        ...(saldoBanco !== null ? { saldo_banco: saldoBanco, saldo_banco_em: agoraIso } : {}),
        ...(conta && !conta.banco && conector ? { banco: conector } : {}),
      }).eq("id", m.conta_bancaria_id).eq("tenant_id", tenantId);
    }
  }
  return { status, contas: (mapa ?? []).length, importadas, parcial };
}

// ── Rotas ──────────────────────────────────────────────────────────────────────

type Deps = {
  requireUser: (req: any, res: Response, next: NextFunction) => any;
  requireMaster: (req: any, res: Response, next: NextFunction) => any;
  /** Empresa pedida em ?tenantId= (a do usuário, ou uma a que master/parceiro tem acesso). Já responde o erro e devolve null se não puder. */
  resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>;
  supabaseService: SupabaseClient | null;
};

/**
 * Quem pode conectar banco: qualquer pessoa com acesso ao Financeiro — o módulo ligado na empresa e no cargo (mesma regra do menu),
 * sem exigir administrador. Master não depende do módulo. Perfis restritos aos próprios dados (ex.: vendedor) não acessam contas.
 */
export async function liberarFinanceiro(sb: SupabaseClient, userId: string, tenantId: string): Promise<{ ok: boolean; status?: number; erro?: string }> {
  const { data: t } = await sb.from("tenants").select("modules").eq("id", tenantId).is("deleted_at", null).maybeSingle();
  const { data: u } = await sb.from("users").select("role, email, is_master, is_tenant_admin, tenant_id").eq("id", userId).maybeSingle();
  if (!u) return { ok: false, status: 403, erro: "Não foi possível verificar permissões." };
  if (u.is_master !== true && t?.modules?.financeiro !== true) return { ok: false, status: 403, erro: "O módulo Financeiro não está ativo nesta empresa." };
  if (u.is_master === true || (u.is_tenant_admin === true && u.tenant_id === tenantId)) return { ok: true };
  const [{ data: cargos }, { data: colabs }] = await Promise.all([
    sb.from("cargos").select("nome, modulos, restringir_aos_proprios_dados").eq("tenant_id", tenantId),
    sb.from("colaboradores").select("cargos").eq("tenant_id", tenantId).eq("user_id", userId),
  ]);
  const roles = (colabs ?? []).flatMap((c: any) => (Array.isArray(c.cargos) ? c.cargos : [])).filter(Boolean);
  const pessoa = { role: u.role, roles };
  const mods = modulosDoCargo(pessoa, cargos ?? []);
  if (mods && !mods.includes("financeiro")) return { ok: false, status: 403, erro: "Seu perfil não tem acesso ao Financeiro." };
  if (restritoAosProprios(pessoa, cargos ?? [])) return { ok: false, status: 403, erro: "Seu perfil só acessa os próprios dados, então não pode conectar contas bancárias." };
  return { ok: true };
}

/** Registra UMA vez o webhook da aplicação no Pluggy, com o cabeçalho secreto que o handler exige (o webhookUrl do connect token não envia cabeçalhos). */
export async function registrarWebhook(cli: ClientePluggy, cfg: PluggyConfig): Promise<{ criado: boolean; url: string }> {
  const url = webhookUrlDe(cfg);
  if (!url) throw new ErroPluggy("webhook", 400, "PUBLIC_APP_URL precisa ser um endereço https público");
  if (!cfg.webhookSecret) throw new ErroPluggy("webhook", 400, "defina PLUGGY_WEBHOOK_SECRET");
  try {
    const lista: any = await cli.get("/webhooks");
    if ((lista?.results ?? []).some((w: any) => w?.url === url)) return { criado: false, url };
  } catch { /* sem listagem: cria mesmo assim — evento repetido é inofensivo, a sincronização é idempotente */ }
  await cli.post("/webhooks", { event: "all", url, headers: { [CABECALHO_SEGREDO]: cfg.webhookSecret } });
  return { criado: true, url };
}

const SEM_CONFIG = { error: "A conexão com bancos ainda não foi ativada neste servidor (faltam as chaves do Pluggy).", code: "pluggy_not_configured" };

export function createPluggyRouter(deps: Deps): Router {
  const router = Router();
  router.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));
  const cfg = () => lerConfigPluggy();
  let cliente: { cfg: PluggyConfig; cli: ClientePluggy } | null = null;
  const clienteDe = (c: PluggyConfig) => {
    if (!cliente || cliente.cfg.clientId !== c.clientId || cliente.cfg.clientSecret !== c.clientSecret) cliente = { cfg: c, cli: criarClientePluggy(c) };
    return cliente.cli;
  };
  const erro = (res: Response, e: any, rotulo: string) => {
    console.error(`[pluggy:${rotulo}]`, e?.message);
    const status = e instanceof ErroPluggy && e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 403 ? e.status : 502;
    return res.status(status).json({ error: "Não foi possível falar com o banco agora. Tente de novo em instantes.", code: "pluggy_error" });
  };

  // Ativação do webhook: só master (é da aplicação inteira, não de uma empresa).
  router.post("/webhook/register", deps.requireUser, deps.requireMaster, async (_req: any, res) => {
    const c = cfg();
    if (!c) return res.status(503).json(SEM_CONFIG);
    try {
      res.json(await registrarWebhook(clienteDe(c), c));
    } catch (e: any) {
      if (e instanceof ErroPluggy && e.status === 400) return res.status(400).json({ error: `Não foi possível ativar: ${e.message.split(": ").slice(1).join(": ")}.` });
      erro(res, e, "webhook-register");
    }
  });

  router.use(deps.requireUser, async (req: any, res: Response, next: NextFunction) => {
    try {
      const tenantId = await deps.resolveRequestedTenantId(req, res);
      if (!tenantId) return;
      if (!deps.supabaseService) return res.status(503).json({ error: "Banco de dados não configurado no servidor." });
      const lib = await liberarFinanceiro(deps.supabaseService, req.user.id, tenantId);
      if (!lib.ok) return res.status(lib.status ?? 403).json({ error: lib.erro });
      req.tenantId = tenantId;
      next();
    } catch (e: any) {
      console.error("[pluggy:acesso]", e?.message);
      res.status(500).json({ error: "Não foi possível conferir a permissão." });
    }
  });

  router.get("/status", async (req: any, res) => {
    const c = cfg();
    if (!deps.supabaseService) return res.status(503).json({ error: "Banco de dados não configurado no servidor." });
    const { data, error } = await deps.supabaseService
      .from("finance_bank_connections")
      .select("id,item_id,connector_name,pluggy_account_id,pluggy_account_name,pluggy_account_type,conta_bancaria_id,status,last_sync_at,last_error")
      .eq("tenant_id", req.tenantId);
    if (error) return res.status(500).json({ error: "Não foi possível carregar as conexões." });
    res.json({ configured: !!c, sandbox: !!c?.sandbox, webhook: { url: c ? webhookUrlDe(c) ?? null : null, secret: !!c?.webhookSecret }, connections: data ?? [] });
  });

  router.post("/connect-token", async (req: any, res) => {
    const c = cfg();
    if (!c) return res.status(503).json(SEM_CONFIG);
    if (!deps.supabaseService) return res.status(503).json({ error: "Banco de dados não configurado no servidor." });
    const contaId = typeof req.body?.contaId === "string" ? req.body.contaId : null;
    const itemId = typeof req.body?.itemId === "string" ? req.body.itemId : null;
    if (contaId && !UUID.test(contaId)) return res.status(400).json({ error: "Conta inválida." });
    if (itemId && !UUID.test(itemId)) return res.status(400).json({ error: "Conexão inválida." });
    try {
      if (contaId) {
        const { data } = await deps.supabaseService.from("finance_bank_accounts").select("id").eq("id", contaId).eq("tenant_id", req.tenantId).maybeSingle();
        if (!data) return res.status(404).json({ error: "Conta não encontrada." });
      }
      if (itemId) {
        const { data } = await deps.supabaseService.from("finance_bank_connections").select("id").eq("item_id", itemId).eq("tenant_id", req.tenantId).limit(1);
        if (!data?.length) return res.status(404).json({ error: "Conexão não encontrada." });
      }
      // Sem webhookUrl aqui: esse caminho não envia cabeçalhos, então não dá para autenticar. O webhook da aplicação (registrado uma vez,
      // com cabeçalho secreto) cobre todos os itens.
      const r: any = await clienteDe(c).post("/connect_token", {
        ...(itemId ? { itemId } : {}),
        options: { clientUserId: req.tenantId, avoidDuplicates: true },
      });
      if (!r?.accessToken) throw new ErroPluggy("connect_token", 502, "resposta sem accessToken");
      res.json({ accessToken: r.accessToken, sandbox: c.sandbox });
    } catch (e) { erro(res, e, "connect-token"); }
  });

  router.post("/items", async (req: any, res) => {
    const c = cfg();
    if (!c) return res.status(503).json(SEM_CONFIG);
    const sb = deps.supabaseService;
    if (!sb) return res.status(503).json({ error: "Banco de dados não configurado no servidor." });
    const itemId = typeof req.body?.itemId === "string" ? req.body.itemId : "";
    const contaId = typeof req.body?.contaId === "string" ? req.body.contaId : null;
    if (!UUID.test(itemId)) return res.status(400).json({ error: "Conexão inválida." });
    if (contaId && !UUID.test(contaId)) return res.status(400).json({ error: "Conta inválida." });
    try {
      if (contaId) {
        const { data } = await sb.from("finance_bank_accounts").select("id").eq("id", contaId).eq("tenant_id", req.tenantId).maybeSingle();
        if (!data) return res.status(404).json({ error: "Conta não encontrada." });
      }
      // O item tem que ser da nossa aplicação e do cliente certo: confere no Pluggy antes de guardar.
      const cli = clienteDe(c);
      const item: any = await cli.get(`/items/${itemId}`);
      if (item?.clientUserId && item.clientUserId !== req.tenantId) return res.status(403).json({ error: "Esta conexão pertence a outra empresa." });
      const { data: dono } = await sb.from("finance_bank_connections").select("tenant_id").eq("item_id", itemId).limit(1);
      if (dono?.length && dono[0].tenant_id !== req.tenantId) return res.status(403).json({ error: "Esta conexão pertence a outra empresa." });
      if (!dono?.length) {
        const { error } = await sb.from("finance_bank_connections").insert({
          tenant_id: req.tenantId, item_id: itemId, connector_name: item?.connector?.name ?? null,
          pluggy_account_id: `item:${itemId}`, pluggy_account_type: null, conta_bancaria_id: contaId, status: item?.status ?? null,
        });
        if (error) throw error;
      }
      const r = await sincronizarItem({ cli, sb, tenantId: req.tenantId, itemId });
      res.json(r);
    } catch (e) { erro(res, e, "items"); }
  });

  router.post("/sync", async (req: any, res) => {
    const c = cfg();
    if (!c) return res.status(503).json(SEM_CONFIG);
    const sb = deps.supabaseService;
    if (!sb) return res.status(503).json({ error: "Banco de dados não configurado no servidor." });
    const unico = typeof req.body?.itemId === "string" ? req.body.itemId : null;
    if (unico && !UUID.test(unico)) return res.status(400).json({ error: "Conexão inválida." });
    try {
      let q = sb.from("finance_bank_connections").select("item_id").eq("tenant_id", req.tenantId);
      if (unico) q = q.eq("item_id", unico);
      const { data } = await q;
      const itens = [...new Set((data ?? []).map((x: any) => x.item_id as string))];
      if (!itens.length) return res.status(404).json({ error: "Nenhuma conexão para sincronizar." });
      const cli = clienteDe(c);
      const resultados = [];
      for (const itemId of itens) resultados.push(await sincronizarItem({ cli, sb, tenantId: req.tenantId, itemId }, { orcamentoMs: Math.floor(45000 / itens.length) }));
      res.json({
        contas: resultados.reduce((a, r) => a + r.contas, 0),
        importadas: resultados.reduce((a, r) => a + r.importadas, 0),
        parcial: resultados.some((r) => r.parcial),
        aguardando: resultados.find((r) => r.aguardando)?.aguardando ?? null,
      });
    } catch (e) { erro(res, e, "sync"); }
  });

  router.delete("/connections/:itemId", async (req: any, res) => {
    const c = cfg();
    if (!c) return res.status(503).json(SEM_CONFIG);
    const sb = deps.supabaseService;
    if (!sb) return res.status(503).json({ error: "Banco de dados não configurado no servidor." });
    const itemId = String(req.params.itemId || "");
    if (!UUID.test(itemId)) return res.status(400).json({ error: "Conexão inválida." });
    try {
      const { data: linhas } = await sb.from("finance_bank_connections").select("id,conta_bancaria_id").eq("tenant_id", req.tenantId).eq("item_id", itemId);
      if (!linhas?.length) return res.status(404).json({ error: "Conexão não encontrada." });
      // Revoga o acesso no Pluggy (se já não existir lá, segue em frente) e só então apaga o vínculo.
      try { await clienteDe(c).delete(`/items/${itemId}`); } catch (e: any) { if (!(e instanceof ErroPluggy && e.status === 404)) throw e; }
      await sb.from("finance_bank_connections").delete().eq("tenant_id", req.tenantId).eq("item_id", itemId);
      const contas = [...new Set(linhas.map((l: any) => l.conta_bancaria_id).filter(Boolean))];
      if (contas.length) await sb.from("finance_bank_accounts").update({ conexao_status: "Manual", conexao_provedor: null }).eq("tenant_id", req.tenantId).in("id", contas);
      res.json({ ok: true });
    } catch (e) { erro(res, e, "delete"); }
  });

  return router;
}

// ── Webhook ────────────────────────────────────────────────────────────────────

const EVENTOS_SYNC = new Set(["item/created", "item/updated", "item/login_succeeded", "transactions/created", "transactions/updated", "transactions/deleted"]);
const EVENTOS_ESTADO: Record<string, { status: string; erro?: string }> = {
  "item/error": { status: "ERROR", erro: "O banco recusou o acesso. Reconecte a conta para continuar sincronizando." },
  "item/waiting_user_input": { status: "WAITING_USER_INPUT" },
  "item/waiting_user_action": { status: "WAITING_USER_ACTION" },
};

/** POST /api/pluggy/webhook — público (o Pluggy não manda login). Trata o aviso só como sinal e relê tudo com as nossas credenciais. */
export function createPluggyWebhookHandler(deps: { supabaseService: SupabaseClient | null; criarCliente?: (c: PluggyConfig) => ClientePluggy }) {
  return async (req: any, res: Response) => {
    const c = lerConfigPluggy();
    const sb = deps.supabaseService;
    if (!c || !sb) return res.status(503).json({ error: "indisponível" });
    try {
      // 1) Autenticação: o Pluggy devolve o cabeçalho secreto que registramos (funciona também na Vercel, onde o corpo bruto não existe).
      //    Sem PLUGGY_WEBHOOK_SECRET configurado ninguém é aceito.
      if (!segredoConfere(req.headers[CABECALHO_SEGREDO] as string | undefined, c.webhookSecret)) {
        return res.status(401).json({ error: "não autorizado" });
      }
      // 2) Integridade (opcional): assinatura do corpo, quando há signing secret e o corpo bruto está disponível.
      const bruto: string | null = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : null;
      if (c.signingSecret && bruto !== null && !assinaturaValida(bruto, req.headers["x-pluggy-signature"] as string | undefined, c.signingSecret)) {
        return res.status(401).json({ error: "assinatura inválida" });
      }
      let payload: any = req.body;
      if (bruto !== null) { try { payload = JSON.parse(bruto); } catch { return res.status(400).json({ error: "corpo inválido" }); } }
      if (!payload || typeof payload !== "object") return res.status(400).json({ error: "corpo inválido" });
      if (payload.clientId !== c.clientId) return res.status(200).json({ ignorado: true });

      const evento = String(payload.event || "");
      const itemId = typeof payload.itemId === "string" && UUID.test(payload.itemId) ? payload.itemId : null;
      let alvo = itemId;
      if (!alvo && typeof payload.accountId === "string") {
        const { data } = await sb.from("finance_bank_connections").select("item_id").eq("pluggy_account_id", payload.accountId).limit(1);
        alvo = data?.[0]?.item_id ?? null;
      }
      if (!alvo) return res.status(200).json({ ignorado: true });
      const { data: donos } = await sb.from("finance_bank_connections").select("tenant_id").eq("item_id", alvo).limit(1);
      const tenantId = donos?.[0]?.tenant_id as string | undefined;
      if (!tenantId) return res.status(200).json({ ignorado: true });

      const estado = EVENTOS_ESTADO[evento];
      if (estado) {
        await sb.from("finance_bank_connections").update({ status: estado.status, ...(estado.erro ? { last_error: estado.erro } : {}) }).eq("tenant_id", tenantId).eq("item_id", alvo);
        return res.status(200).json({ ok: true });
      }
      if (EVENTOS_SYNC.has(evento)) {
        await sincronizarItem({ cli: (deps.criarCliente ?? criarClientePluggy)(c), sb, tenantId, itemId: alvo }, { orcamentoMs: 7000 });
      }
      res.status(200).json({ ok: true });
    } catch (e: any) {
      console.error("[pluggy:webhook]", e?.message);
      // 5XX => o Pluggy tenta de novo (até 3 vezes); 4XX seria descartado.
      res.status(500).json({ error: "falha ao processar" });
    }
  };
}
