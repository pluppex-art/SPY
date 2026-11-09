import webpush from "web-push";
import type { Express } from "express";

// Web Push do S.P.Y.: notificação do sistema (celular/computador) com o app fechado.
// Genérico para todos os tenants. Só liga se as chaves VAPID existirem no ambiente
// (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT); sem elas tudo é desligado sem erro.

const PUBLIC_KEY = (process.env.VAPID_PUBLIC_KEY || "").trim();
const PRIVATE_KEY = (process.env.VAPID_PRIVATE_KEY || "").trim();
const SUBJECT = (process.env.VAPID_SUBJECT || "mailto:contato@spycrm.com.br").trim();

let configured = false;
export function isWebPushConfigured(): boolean {
  if (configured) return true;
  if (!PUBLIC_KEY || !PRIVATE_KEY) return false;
  try {
    webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
    configured = true;
  } catch (err: any) {
    console.error("[web-push] chaves VAPID inválidas:", err?.message);
  }
  return configured;
}

// O servidor faz uma requisição ao endereço de cada inscrição. Para isso não virar SSRF, só aceitamos
// os serviços de push dos navegadores (Chrome/Android, Firefox, Safari/iOS, Edge).
const PUSH_HOST_SUFFIXES = ["googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com"];

export function isAllowedPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  try {
    const u = new URL(endpoint);
    if (u.protocol !== "https:" || u.username || u.password) return false;
    const host = u.hostname.toLowerCase();
    return PUSH_HOST_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`));
  } catch {
    return false;
  }
}

export interface PushPayload {
  title: string;
  body: string;
  /** Caminho interno do app (ex.: "/app/crm/pipeline"); qualquer outra coisa vira "/app". */
  url?: string | null;
  tag?: string;
  /** Teste do próprio usuário: o aparelho mostra a notificação mesmo com o app aberto na tela. */
  test?: boolean;
}

const safePath = (u?: string | null) => (typeof u === "string" && /^\/app[\w\-./?=&%]*$/.test(u) ? u : "/app");

/**
 * Manda a notificação para todos os aparelhos inscritos dos usuários informados (sempre dentro do tenant).
 * Nunca lança: push é complemento do sino. Inscrições mortas (404/410) são apagadas.
 */
export async function sendWebPushToUsers(db: any, tenantId: string | null, userIds: string[], payload: PushPayload): Promise<{ sent: number; failed: number; removed: number }> {
  const out = { sent: 0, failed: 0, removed: 0 };
  try {
    if (!isWebPushConfigured() || !db || userIds.length === 0) return out;
    let q = db.from("push_subscriptions").select("id, endpoint, p256dh, auth");
    if (tenantId) q = q.eq("tenant_id", tenantId); // null só no teste do próprio usuário (filtrado por user_id)
    const { data: subs, error } = await q.in("user_id", userIds.slice(0, 100)).limit(500);
    if (error || !subs?.length) return out; // tabela ainda não criada ou ninguém inscrito

    const body = JSON.stringify({
      title: payload.title.slice(0, 120),
      body: payload.body.slice(0, 200),
      url: safePath(payload.url),
      tag: payload.tag,
      test: payload.test === true,
    });
    const dead: string[] = [];

    for (let i = 0; i < subs.length; i += 10) {
      await Promise.all(
        subs.slice(i, i + 10).map(async (s: any) => {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 3600, timeout: 8000 });
            out.sent++;
          } catch (err: any) {
            if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(s.id);
            else { out.failed++; console.error("[web-push]", err?.statusCode || err?.message); }
          }
        }),
      );
    }
    if (dead.length) {
      await db.from("push_subscriptions").delete().in("id", dead);
      out.removed = dead.length;
    }
  } catch (err: any) {
    console.error("[web-push]", err?.message);
  }
  return out;
}

interface Deps {
  requireUser: any;
  resolveRequestedTenantId: (req: any, res: any) => Promise<string | null>;
  limiter: any;
  supabaseService: any;
}

export function registerPushRoutes(app: Express, { requireUser, resolveRequestedTenantId, limiter, supabaseService }: Deps) {
  // Chave pública (não é segredo) para o navegador criar a inscrição.
  app.get("/api/push/config", requireUser, (_req: any, res: any) => {
    res.json({ enabled: isWebPushConfigured(), publicKey: isWebPushConfigured() ? PUBLIC_KEY : null });
  });

  app.post("/api/push/subscribe", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return res.status(503).json({ error: "Servidor sem acesso ao banco." });
    if (!isWebPushConfigured()) return res.status(503).json({ error: "Notificações com o app fechado ainda não estão ativas neste ambiente." });

    const sub = req.body?.subscription;
    const endpoint = sub?.endpoint;
    const p256dh = sub?.keys?.p256dh;
    const auth = sub?.keys?.auth;
    if (!isAllowedPushEndpoint(endpoint) || typeof p256dh !== "string" || typeof auth !== "string" || p256dh.length > 200 || auth.length > 100) {
      return res.status(400).json({ error: "Inscrição de notificação inválida." });
    }

    const tenantId = await resolveRequestedTenantId(req, res);
    if (!tenantId) return;

    // O mesmo aparelho pode trocar de usuário (logout/login): o endpoint é único e passa a pertencer a quem acabou de entrar.
    const { error } = await supabaseService.from("push_subscriptions").upsert(
      { user_id: req.user.id, tenant_id: tenantId, endpoint, p256dh, auth, user_agent: String(req.headers["user-agent"] || "").slice(0, 200) },
      { onConflict: "endpoint" },
    );
    if (error) {
      console.error("[push/subscribe]", error.message);
      return res.status(500).json({ error: "Não foi possível salvar a inscrição." });
    }
    res.json({ ok: true });
  });

  // Teste: manda uma notificação SÓ para os aparelhos do próprio usuário (nunca para outras pessoas).
  app.post("/api/push/test", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return res.status(503).json({ error: "Servidor sem acesso ao banco." });
    if (!isWebPushConfigured()) return res.status(503).json({ error: "As chaves de envio (VAPID) ainda não foram configuradas no servidor." });
    const { data: mine, error } = await supabaseService.from("push_subscriptions").select("id").eq("user_id", req.user.id).limit(20);
    if (error) return res.status(503).json({ error: "A tabela de inscrições ainda não foi criada no banco." });
    if (!mine?.length) return res.status(409).json({ error: "Nenhum aparelho seu está inscrito. Ative as notificações neste aparelho primeiro." });
    const r = await sendWebPushToUsers(supabaseService, null, [req.user.id], {
      title: "S.P.Y. — teste de notificação",
      body: "Se você está vendo isto, as notificações do sistema estão funcionando neste aparelho.",
      url: "/app/configuracoes/usuario/notificacoes",
      test: true,
    });
    res.json({ ok: r.sent > 0, devices: mine.length, ...r });
  });

  app.post("/api/push/unsubscribe", requireUser, limiter, async (req: any, res: any) => {
    if (!supabaseService) return res.status(503).json({ error: "Servidor sem acesso ao banco." });
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== "string" || endpoint.length > 1000) return res.status(400).json({ error: "Endereço inválido." });
    // Só apaga a inscrição do próprio usuário.
    await supabaseService.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", req.user.id);
    res.json({ ok: true });
  });
}
