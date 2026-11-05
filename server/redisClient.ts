import Redis from "ioredis";

// Redis-SPY: camada de cache/aceleração, nunca fonte de verdade. Todo helper
// aqui é "fail open" — qualquer erro de conexão/timeout vira log + retorno
// neutro (null/no-op), nunca uma exception que derruba a rota que o chamou.
// Sem REDIS_URL configurada, o sistema roda 100% normal via Supabase (a
// mesma garantia vale se a REDIS_URL existir mas o Redis estiver fora do ar).

const REDIS_URL = process.env.REDIS_URL;

let client: Redis | null = null;
let warnedMissingConfig = false;

function getClient(): Redis | null {
  if (!REDIS_URL) {
    if (!warnedMissingConfig) {
      console.warn("[Redis-SPY] REDIS_URL não configurada — cache desativado, tudo passa direto pelo Supabase.");
      warnedMissingConfig = true;
    }
    return null;
  }
  if (client) return client;

  client = new Redis(REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 3000,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
    reconnectOnError: () => false,
  });
  client.on("error", (err) => {
    console.warn("[Redis-SPY] erro de conexão (fallback pro Supabase):", err.message);
  });
  return client;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getClient();
  if (!redis) return null;
  try {
    const raw = await redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err: any) {
    console.warn(`[Redis-SPY] GET falhou (${key}):`, err?.message);
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getClient();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err: any) {
    console.warn(`[Redis-SPY] SET falhou (${key}):`, err?.message);
  }
}

export async function redisHealthCheck(): Promise<{ configured: boolean; connected: boolean; latencyMs?: number; reason?: string }> {
  const redis = getClient();
  if (!redis) return { configured: false, connected: false };
  try {
    const start = Date.now();
    await redis.ping();
    return { configured: true, connected: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    // Só o código do erro (ENOTFOUND, ECONNREFUSED, NOAUTH...) — nunca URL, host ou senha.
    const reason = String(err?.code || err?.name || "ERRO").replace(/[^A-Za-z0-9_]/g, "").slice(0, 40);
    return { configured: true, connected: false, reason };
  }
}
