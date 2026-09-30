/**
 * Cliente mínimo da API v4 do Kommo (somente leitura): GET
 * https://{subdominio}.kommo.com/api/v4/... com `Authorization: Bearer <token
 * de longa duração>` (Kommo → Configurações → Integrações → Chaves e escopos →
 * "Gerar token de longa duração").
 *
 * O host é sempre `{subdominio}.kommo.com` com o subdomínio validado por regex —
 * nunca uma URL livre vinda do usuário, então não há risco de SSRF. O limite da
 * Kommo é ~7 req/s: espaçamos as chamadas e repetimos em 429. Nunca loga token.
 */
export interface KommoConn {
  subdomain: string;
  accessToken: string;
}

export class KommoError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const MIN_INTERVAL_MS = 160;
let lastCallAt = 0;

/** Aceita "suaempresa", "suaempresa.kommo.com" ou a URL completa; devolve só o subdomínio. */
export function normalizeKommoSubdomain(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let v = raw.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
  v = v.replace(/\.kommo\.com$/, "");
  return SUBDOMAIN_RE.test(v) ? v : null;
}

export function kommoConnFromConfig(cfg: any): { conn: KommoConn } | { error: string } {
  const subdomain = normalizeKommoSubdomain(cfg?.subdomain);
  const accessToken = typeof cfg?.accessToken === "string" ? cfg.accessToken.trim() : "";
  if (!subdomain) return { error: "Informe o subdomínio da Kommo (ex.: suaempresa, de suaempresa.kommo.com)." };
  if (!accessToken) return { error: "Informe o token de longa duração da Kommo." };
  return { conn: { subdomain, accessToken } };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function kommoGet(conn: KommoConn, path: string, params: Record<string, string | string[]> = {}): Promise<any | null> {
  const url = new URL(`https://${conn.subdomain}.kommo.com/api/v4${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
    else url.searchParams.set(k, v);
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = lastCallAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastCallAt = Date.now();
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${conn.accessToken}`, Accept: "application/json" },
        signal: AbortSignal.timeout(25_000),
      });
    } catch {
      throw new KommoError("Não foi possível alcançar a Kommo. Confira o subdomínio e tente de novo.");
    }
    if (res.status === 204) return null; // sem conteúdo (lista vazia)
    if (res.status === 429) { await sleep(1000 * (attempt + 1)); continue; }
    if (res.status === 401) throw new KommoError("Token recusado pela Kommo (401). Gere um novo token de longa duração.", 401);
    if (res.status === 403) throw new KommoError("A Kommo negou o acesso (403). Verifique os escopos da integração.", 403);
    if (res.status === 404) throw new KommoError("Conta não encontrada (404). Confira o subdomínio.", 404);
    if (!res.ok) throw new KommoError(`A Kommo respondeu com erro ${res.status}.`, res.status);
    return res.json();
  }
  throw new KommoError("A Kommo limitou as requisições (429). Tente novamente em instantes.", 429);
}

export async function kommoAccount(conn: KommoConn): Promise<{ id: number; name: string; subdomain: string }> {
  const a = await kommoGet(conn, "/account");
  return { id: a?.id, name: a?.name || conn.subdomain, subdomain: a?.subdomain || conn.subdomain };
}

export interface KommoStatus { id: number; name: string; sort: number; type: number; pipelineId: number }
export interface KommoPipeline { id: number; name: string; sort: number; statuses: KommoStatus[] }

export async function kommoPipelines(conn: KommoConn): Promise<KommoPipeline[]> {
  const body = await kommoGet(conn, "/leads/pipelines");
  const list: any[] = body?._embedded?.pipelines || [];
  return list
    .filter((p) => !p.is_archive)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map((p) => ({
      id: p.id, name: p.name, sort: p.sort ?? 0,
      statuses: ((p._embedded?.statuses || []) as any[])
        .map((s) => ({ id: s.id, name: s.name, sort: s.sort ?? 0, type: s.type ?? 0, pipelineId: p.id }))
        // ganho (142) e perda (143) ficam sempre no fim, na ordem do funil
        .sort((a, b) => {
          const tail = (s: KommoStatus) => (s.id === 142 ? 1 : s.id === 143 ? 2 : 0);
          return tail(a) - tail(b) || a.sort - b.sort;
        }),
    }));
}

export async function kommoUsers(conn: KommoConn): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  try {
    const body = await kommoGet(conn, "/users", { limit: "250" });
    for (const u of body?._embedded?.users || []) map.set(u.id, u.name);
  } catch { /* sem escopo de usuários: segue sem nome do responsável */ }
  return map;
}

/** Todas as páginas de uma coleção paginada da Kommo, até `max` itens. */
export async function kommoPaged(conn: KommoConn, path: string, key: string, params: Record<string, string | string[]> = {}, max = 10_000): Promise<any[]> {
  const out: any[] = [];
  for (let page = 1; out.length < max; page++) {
    const body = await kommoGet(conn, path, { ...params, page: String(page), limit: "250" });
    const items: any[] = body?._embedded?.[key] || [];
    out.push(...items);
    if (items.length < 250 || !body?._links?.next) break;
  }
  return out.slice(0, max);
}

/** Busca entidades por ID em lotes (contatos/empresas) — o filtro por id aceita vários valores. */
export async function kommoByIds(conn: KommoConn, path: string, key: string, ids: number[]): Promise<any[]> {
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const body = await kommoGet(conn, path, { "filter[id][]": chunk.map(String), limit: "250" });
    out.push(...(body?._embedded?.[key] || []));
  }
  return out;
}

export function kommoFieldValue(entity: any, code: string): string {
  const f = (entity?.custom_fields_values || []).find((c: any) => c.field_code === code);
  const v = f?.values?.[0]?.value;
  return typeof v === "string" ? v.trim() : "";
}
