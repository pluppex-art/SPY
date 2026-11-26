/**
 * Verificação dos ambientes (Dev > Ambientes): o servidor acessa o endereço de cada um e grava se respondeu,
 * o código HTTP e o tempo. Só código e tempo saem daqui (o conteúdo da resposta nunca é lido nem devolvido).
 */
import type express from "express";
import http from "http";
import https from "https";
import { assertSafeHttpUrl, ssrfSafeAgents } from "./ssrfGuard.js";

const LIMITE_MS = 10_000;
const LENTO_MS = 3_000;
const MAX_REDIRECIONAMENTOS = 5;

export interface Checagem { status: "operacional" | "degradado" | "offline" | null; codigo: number | null; ms: number | null; aviso: string }
type Resposta = { codigo: number; destino?: string };

export function classificar(codigo: number, ms: number): Pick<Checagem, "status" | "aviso"> {
  if (codigo >= 500) return { status: "offline", aviso: `Erro no servidor (HTTP ${codigo})` };
  if (codigo === 401 || codigo === 403) return { status: "operacional", aviso: `Responde, mas exige acesso (HTTP ${codigo})` };
  if (codigo >= 300) return { status: "degradado", aviso: codigo < 400 ? "Redirecionamentos demais" : `HTTP ${codigo}` };
  return ms > LENTO_MS ? { status: "degradado", aviso: "Resposta lenta" } : { status: "operacional", aviso: "" };
}

/** GET que só lê os cabeçalhos. O agente recusa IP interno no momento da conexão (anti-SSRF). */
function pedirHttp(u: URL, sinal: AbortSignal): Promise<Resposta> {
  return new Promise((ok, erro) => {
    const cliente = u.protocol === "https:" ? https : http;
    const req = cliente.request(u, { method: "GET", signal: sinal, agent: u.protocol === "https:" ? ssrfSafeAgents.httpsAgent : ssrfSafeAgents.httpAgent, headers: { "User-Agent": "SPY-Monitor/1.0", Accept: "text/html,*/*" } }, (res) => {
      ok({ codigo: res.statusCode ?? 0, destino: res.headers.location });
      res.destroy();
    });
    req.on("error", erro);
    req.end();
  });
}

function motivo(e: any): string {
  const c = String(e?.code ?? "");
  if (e?.name === "AbortError" || c === "ABORT_ERR" || c === "ETIMEDOUT") return `Sem resposta em ${LIMITE_MS / 1000} s`;
  if (c === "ENOTFOUND" || c === "EAI_AGAIN") return "Endereço não encontrado";
  if (c === "ECONNREFUSED") return "Conexão recusada";
  if (/CERT|SSL|TLS/i.test(c)) return "Certificado de segurança inválido";
  return "Falha ao conectar";
}

export async function checarUrl(url: string, pedir = pedirHttp, validar: (u: string) => Promise<URL> = assertSafeHttpUrl, agora = () => Date.now()): Promise<Checagem> {
  const inicio = agora();
  const sinal = AbortSignal.timeout(LIMITE_MS);
  let atual = url;
  try {
    for (let salto = 0; ; salto++) {
      let alvo: URL;
      // Cada destino (inclusive de redirecionamento) é validado antes do acesso.
      try { alvo = await validar(atual); }
      catch (e: any) {
        if (e?.code === "ENOTFOUND") throw e;
        return { status: null, codigo: null, ms: null, aviso: `Não verificado: ${e?.message || "endereço inválido"}` };
      }
      const r = await pedir(alvo, sinal);
      if (r.codigo >= 300 && r.codigo < 400 && r.destino && salto < MAX_REDIRECIONAMENTOS) { atual = new URL(r.destino, alvo).toString(); continue; }
      const ms = agora() - inicio;
      return { ...classificar(r.codigo, ms), codigo: r.codigo, ms };
    }
  } catch (e: any) {
    return { status: "offline", codigo: null, ms: null, aviso: motivo(e) };
  }
}

type Deps = { requireUser: any; resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>; limiter: any };

export function registerDevAmbientesRoutes(app: express.Express, { requireUser, resolveRequestedTenantId, limiter }: Deps) {
  app.post("/api/dev/ambientes/verificar", requireUser, limiter, async (req: any, res) => {
    try {
      const tenantId = await resolveRequestedTenantId(req, res);
      if (!tenantId) return;
      const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.filter((x: unknown) => typeof x === "string").slice(0, 60) : [];
      // Cliente do próprio usuário: o RLS continua valendo na leitura e na gravação.
      let consulta = req.supabase.from("dev_environments").select("env_id, url, metrics").eq("tenant_id", tenantId).neq("url", "").limit(60);
      if (ids.length) consulta = consulta.in("env_id", ids);
      const { data, error } = await consulta;
      if (error) throw error;
      const resultados = await Promise.all((data ?? []).map(async (env: any) => {
        const c = await checarUrl(env.url);
        const quando = new Date().toISOString();
        const { error: erroGravar } = await req.supabase.from("dev_environments").update({
          ...(c.status ? { status: c.status } : {}),
          metrics: { ...(env.metrics ?? {}), latency: c.ms === null ? "" : `${c.ms}ms`, http: c.codigo, aviso: c.aviso, verificadoEm: quando },
          updated_at: quando,
        }).eq("tenant_id", tenantId).eq("env_id", env.env_id);
        if (erroGravar) console.error("[dev-ambientes/gravar]", erroGravar.message);
        return { id: env.env_id, ...c };
      }));
      res.json({ resultados });
    } catch (e: any) { console.error("[dev-ambientes/verificar]", e?.message); res.status(500).json({ error: "Não foi possível verificar os ambientes." }); }
  });
}
