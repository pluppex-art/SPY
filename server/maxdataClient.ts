/**
 * Cliente mínimo da MaxAPI Go (coleção v2.0): POST {base}/auth com os headers
 * application_name / application_key / application_description e corpo
 * { terminal, empId, idUser } devolve um JWT; as demais rotas usam esse token.
 *
 * ASSUNÇÃO NÃO CONFIRMADA: o token vai em `Authorization: Bearer <token>` — a
 * coleção só diz "token JWT utilizado nas demais requisições". O teste de
 * conexão exercita exatamente isso, então um 401 aqui aparece na hora.
 *
 * Nunca loga chave nem token. A validação de destino (SSRF) é feita por quem
 * chama, com assertSafeHttpUrl, antes de construir o cliente.
 */
export interface MaxDataConn {
  baseUrl: string;
  applicationName: string;
  applicationKey: string;
  applicationDescription: string;
  terminal: string;
  empId: number;
  idUser: number;
}

/** Config de app_settings (tenantIntegrations) → conexão; devolve o que falta quando incompleta. */
export function connFromConfig(cfg: any): { conn: MaxDataConn } | { error: string } {
  const missing: string[] = [];
  const s = (v: any) => (typeof v === "string" ? v.trim() : "");
  const apiUrl = s(cfg?.apiUrl), name = s(cfg?.clientId), key = s(cfg?.apiKey), desc = s(cfg?.applicationDescription), terminal = s(cfg?.terminal);
  if (!apiUrl) missing.push("URL base da API");
  if (!name) missing.push("Nome da aplicação");
  if (!key) missing.push("Chave da aplicação");
  if (!desc) missing.push("Descrição da aplicação");
  if (!terminal) missing.push("Terminal");
  if (!/^\d+$/.test(s(cfg?.empId))) missing.push("ID da empresa (empId)");
  if (missing.length) return { error: `Configuração da Max Data incompleta: ${missing.join(", ")}.` };
  return {
    conn: {
      baseUrl: apiUrl.replace(/\/+$/, ""), applicationName: name, applicationKey: key, applicationDescription: desc,
      terminal, empId: Number(s(cfg.empId)), idUser: /^\d+$/.test(s(cfg?.idUser)) ? Number(s(cfg.idUser)) : 0,
    },
  };
}

export class MaxDataError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

const TIMEOUT_MS = 15_000;
// Cache em memória por conexão (chave = hash simples dos campos, sem guardar a chave em claro como índice legível).
const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const cacheKey = (c: MaxDataConn) => `${c.baseUrl}|${c.applicationName}|${c.empId}|${c.idUser}|${c.terminal}|${c.applicationKey.length}:${c.applicationKey.slice(-4)}`;

async function request(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: "error" });
  } catch (e: any) {
    throw new MaxDataError(e?.name === "AbortError" ? "A Max Data não respondeu a tempo." : "Não foi possível conectar à Max Data.");
  } finally {
    clearTimeout(t);
  }
}

export async function maxdataAuth(conn: MaxDataConn): Promise<{ token: string; expiresAt: number }> {
  const res = await request(`${conn.baseUrl}/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Accept: "application/json",
      application_name: conn.applicationName, application_key: conn.applicationKey, application_description: conn.applicationDescription,
    },
    body: JSON.stringify({ terminal: conn.terminal, empId: conn.empId, idUser: conn.idUser }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || !body?.token) {
    throw new MaxDataError(body?.message || `A Max Data recusou o login (HTTP ${res.status}).`, res.status);
  }
  const exp = Date.parse(body.expiration);
  // Renova 60s antes de expirar; sem data válida, assume 10 min.
  const expiresAt = (Number.isFinite(exp) ? exp : Date.now() + 10 * 60_000) - 60_000;
  const entry = { token: String(body.token), expiresAt };
  tokenCache.set(cacheKey(conn), entry);
  return entry;
}

async function getToken(conn: MaxDataConn, force = false): Promise<string> {
  const cached = tokenCache.get(cacheKey(conn));
  if (!force && cached && cached.expiresAt > Date.now()) return cached.token;
  return (await maxdataAuth(conn)).token;
}

/** GET autenticado; se o token for recusado (401), refaz o login uma vez. */
export async function maxdataGet<T = any>(conn: MaxDataConn, path: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getToken(conn, attempt === 1);
    const res = await request(`${conn.baseUrl}${path}`, { headers: { Accept: "application/json", Authorization: `Bearer ${token}` } });
    if (res.status === 401 && attempt === 0) continue;
    const body: any = await res.json().catch(() => null);
    if (!res.ok) throw new MaxDataError(body?.message || `A Max Data respondeu HTTP ${res.status} em ${path}.`, res.status);
    return body as T;
  }
  throw new MaxDataError("A Max Data recusou o token.", 401);
}

export const _resetTokenCacheForTests = () => tokenCache.clear();
