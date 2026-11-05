/**
 * Registro de erros próprio (alternativa gratuita ao Sentry).
 * - registrarErro(): grava em public.app_error_log (service role). Nunca lança e nunca atrasa a resposta.
 * - POST /api/client-error: o navegador relata erros de JavaScript. Aceita sem login (a tela de login também
 *   pode quebrar), mas com limite de uso, tamanho cortado e deduplicação — e, se houver sessão, anexa quem e a empresa.
 * Quem lê é o master, em Admin > Operação > Erros do app (RLS: só is_super_admin()).
 */
import { createHash } from "node:crypto";
import type { Express, Request } from "express";

interface Deps {
  supabaseService: any;
  supabase: any;
  limiter: any;
}

export interface ErroParaRegistrar {
  origem: "web" | "servidor";
  mensagem: string;
  stack?: string | null;
  url?: string | null;
  navegador?: string | null;
  tenantId?: string | null;
  userId?: string | null;
}

const cortar = (v: unknown, n: number) => String(v ?? "").slice(0, n);
const ultimoPorImpressao = new Map<string, number>();
const JANELA_MS = 60_000;

function impressaoDigital(mensagem: string, stack: string) {
  const primeiraLinha = stack.split("\n").find((l) => /\bat\b|@/.test(l)) ?? "";
  return createHash("sha1").update(`${mensagem.slice(0, 200)}|${primeiraLinha.trim().slice(0, 200)}`).digest("hex").slice(0, 16);
}

export async function registrarErro(db: any, e: ErroParaRegistrar): Promise<void> {
  try {
    if (!db) return;
    const mensagem = cortar(e.mensagem, 600);
    if (!mensagem) return;
    const stack = cortar(e.stack, 4000);
    const fingerprint = impressaoDigital(mensagem, stack);
    // Mesmo erro em rajada (loop, vários usuários): grava no máximo 1 por minuto por instância do servidor.
    const agora = Date.now();
    if ((ultimoPorImpressao.get(fingerprint) ?? 0) > agora - JANELA_MS) return;
    ultimoPorImpressao.set(fingerprint, agora);
    if (ultimoPorImpressao.size > 500) ultimoPorImpressao.clear();
    await db.from("app_error_log").insert({
      origem: e.origem, mensagem, stack: stack || null, url: cortar(e.url, 300) || null,
      navegador: cortar(e.navegador, 200) || null, tenant_id: e.tenantId ?? null, user_id: e.userId ?? null, fingerprint,
    });
  } catch { /* o registro de erros nunca pode causar outro erro */ }
}

/** Remove query string e ids longos da URL (podem carregar token ou dado pessoal). */
export function urlSegura(raw: unknown): string {
  try {
    const u = new URL(String(raw), "http://x");
    return u.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id").slice(0, 300);
  } catch { return cortar(raw, 120).split("?")[0]; }
}

export function registerClientErrorRoute(app: Express, { supabaseService, supabase, limiter }: Deps) {
  app.post("/api/client-error", limiter, async (req: Request, res) => {
    res.status(204).end(); // responde já; o registro roda em segundo plano
    try {
      const b: any = req.body ?? {};
      if (typeof b.mensagem !== "string" || !b.mensagem.trim()) return;
      let userId: string | null = null;
      let tenantId: string | null = null;
      const auth = String(req.headers.authorization || "");
      if (auth.startsWith("Bearer ") && supabase && supabaseService) {
        const { data } = await supabase.auth.getUser(auth.slice(7));
        if (data?.user) {
          userId = data.user.id;
          const { data: u } = await supabaseService.from("users").select("tenant_id").eq("id", userId).maybeSingle();
          tenantId = u?.tenant_id ?? null;
        }
      }
      await registrarErro(supabaseService, {
        origem: "web", mensagem: b.mensagem, stack: b.stack, url: urlSegura(b.url),
        navegador: String(req.headers["user-agent"] || ""), tenantId, userId,
      });
    } catch { /* silencioso */ }
  });
}
