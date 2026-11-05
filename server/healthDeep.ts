/**
 * Saúde de ponta a ponta — GET /api/health/deep.
 * Pensado para um monitor externo (UptimeRobot, Better Stack...) que avisa por e-mail/WhatsApp quando cair:
 * responde 200 se tudo que é essencial responde, 503 se algo essencial falhou (cache fora do ar = "degraded", sem 503).
 * Não devolve URL, chave nem dado de empresa — só "ok" por componente e a latência.
 */
import type { Express } from "express";
import axios from "axios";

interface Deps {
  supabaseService: any;
  redisHealthCheck: () => Promise<{ configured: boolean; connected: boolean; latencyMs?: number }>;
}

type Check = { configured: boolean; ok: boolean; ms?: number };

async function timed(fn: () => Promise<boolean>): Promise<Check> {
  const t0 = Date.now();
  try {
    const ok = await fn();
    return { configured: true, ok, ms: Date.now() - t0 };
  } catch {
    return { configured: true, ok: false, ms: Date.now() - t0 };
  }
}

const base = (v?: string) => (v || "").replace(/\/+$/, "");
const origin = (v?: string) => { try { return v ? new URL(v).origin : ""; } catch { return ""; } };

export function registerDeepHealthRoute(app: Express, { supabaseService, redisHealthCheck }: Deps) {
  app.get("/api/health/deep", async (_req, res) => {
    // Vigia o n8n que a Aurora de fato usa (origem do webhook dela); sem ele, cai pro da API do n8n.
    const n8nUrl = origin(process.env.AURORA_WEBHOOK_URL) || base(process.env.N8N_API_URL);
    const wahaUrl = base(process.env.WAHA_API_URL);

    const [supabase, n8n, waha, redis] = await Promise.all([
      supabaseService
        ? timed(async () => !(await supabaseService.from("tenants").select("id").limit(1)).error)
        : Promise.resolve<Check>({ configured: false, ok: false }),
      n8nUrl
        // /healthz é público no n8n; qualquer resposta HTTP < 500 prova que a instância está de pé.
        ? timed(async () => (await axios.get(`${n8nUrl.replace(/\/api\/v1$/, "")}/healthz`, { timeout: 6000, validateStatus: () => true })).status < 500)
        : Promise.resolve<Check>({ configured: false, ok: false }),
      wahaUrl
        ? timed(async () => (await axios.get(`${wahaUrl}/ping`, { timeout: 6000, validateStatus: () => true })).status < 500)
        : Promise.resolve<Check>({ configured: false, ok: false }),
      (async (): Promise<Check> => {
        const r = await redisHealthCheck();
        return { configured: r.configured, ok: r.connected, ms: r.latencyMs };
      })(),
    ]);

    const checks = { supabase, n8n, waha, redis };
    // Redis é só cache (falha aberta: o sistema segue direto no banco). Fora do ar vira "degraded",
    // que aparece no JSON mas NÃO dá 503 — senão o monitor externo alertaria sem haver queda real.
    const OPTIONAL = new Set(["redis"]);
    const down = Object.entries(checks).filter(([, c]) => c.configured && !c.ok).map(([k]) => k);
    const failed = down.filter((k) => !OPTIONAL.has(k));
    const degraded = down.filter((k) => OPTIONAL.has(k));
    res.status(failed.length ? 503 : 200).json({ ok: failed.length === 0, failed, degraded, checks, at: new Date().toISOString() });
  });
}
