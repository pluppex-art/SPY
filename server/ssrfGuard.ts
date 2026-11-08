import dns from "dns/promises";
import dnsCb from "dns";
import http from "http";
import https from "https";
import net from "net";

// Bloqueia loopback, RFC1918, link-local (metadata 169.254.x), CGNAT, multicast e IPv6 locais.
export function isPrivateIp(ip: string): boolean {
  let addr = ip.trim().toLowerCase();
  if (addr.startsWith("::ffff:")) addr = addr.slice(7); // IPv4-mapped
  if (net.isIPv4(addr)) {
    const [a, b] = addr.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0)
    );
  }
  if (net.isIPv6(addr)) {
    return (
      addr === "::" || addr === "::1" ||
      addr.startsWith("fe8") || addr.startsWith("fe9") || addr.startsWith("fea") || addr.startsWith("feb") || // fe80::/10
      addr.startsWith("fc") || addr.startsWith("fd") || // fc00::/7
      addr.startsWith("ff") // multicast
    );
  }
  return true; // formato desconhecido: bloqueia
}

const BLOCKED_HOSTS = new Set(["localhost", "metadata.google.internal"]);

/** Resolve o host e lança se qualquer IP resultante for interno. Retorna um IP público validado. */
export async function assertPublicHost(hostname: string): Promise<string> {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new Error("Destino não permitido.");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("Destino não permitido.");
    return host;
  }
  const records = await dns.lookup(host, { all: true });
  if (!records.length || records.some((r) => isPrivateIp(r.address))) {
    throw new Error("Destino não permitido.");
  }
  return records[0].address;
}

/** Valida URL http(s) de saída (sem credenciais embutidas) e o IP resolvido; lança Error se inválida. */
export async function assertSafeHttpUrl(rawUrl: unknown): Promise<URL> {
  let u: URL;
  try {
    u = new URL(String(rawUrl));
  } catch {
    throw new Error("URL inválida.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Apenas http/https são permitidos.");
  if (u.username || u.password) throw new Error("URL com credenciais não é permitida.");
  if (u.port && !["80", "443", "8080", "8443"].includes(u.port) && Number(u.port) < 1024) {
    throw new Error("Porta não permitida.");
  }
  await assertPublicHost(u.hostname);
  return u;
}

const SMTP_PORTS = new Set([25, 465, 587, 2525]);

/** Valida host/porta SMTP: só portas de e-mail padrão e host público. Retorna o IP validado. */
export async function assertSafeSmtpTarget(host: unknown, port: unknown): Promise<string> {
  const p = Number(port);
  if (!SMTP_PORTS.has(p)) throw new Error("Porta SMTP não permitida (use 25, 465, 587 ou 2525).");
  return assertPublicHost(String(host));
}

/**
 * lookup() customizado para http(s).Agent: o IP validado é exatamente o IP usado na conexão.
 * Sem isso há uma janela de DNS rebinding entre a validação (assertSafeHttpUrl) e o connect,
 * em que o DNS poderia devolver um IP interno na segunda resolução.
 */
function safeLookup(hostname: string, options: any, callback: any) {
  const opts = typeof options === "function" ? {} : (options || {});
  const cb = typeof options === "function" ? options : callback;
  dnsCb.lookup(hostname, { ...opts, all: true }, (err: any, records: any) => {
    if (err) return cb(err);
    const list = (records || []) as { address: string; family: number }[];
    if (!list.length || list.some((r) => isPrivateIp(r.address))) {
      return cb(Object.assign(new Error("Destino não permitido."), { code: "ESSRF" }));
    }
    if (opts.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}

/** Agents que só conectam a IPs públicos (validação feita no momento da conexão). Use em axios: { httpAgent, httpsAgent }. */
export const ssrfSafeAgents = {
  httpAgent: new http.Agent({ lookup: safeLookup as any }),
  httpsAgent: new https.Agent({ lookup: safeLookup as any }),
};
