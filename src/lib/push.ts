import { apiFetch } from "./apiClient";

// Web Push (notificação do sistema com o app fechado). A permissão em si é pedida em lib/notifications.ts;
// aqui fica só a inscrição do aparelho no servidor. Tudo é tolerante: sem suporte, sem chaves no servidor
// ou sem a tabela criada, o app segue normal com os avisos dentro dele.

export type PushResult = "subscribed" | "unsupported" | "denied" | "not-configured" | "error";

export const isWebPushSupported = (): boolean =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Garante que ESTE aparelho está inscrito e registrado no servidor para o usuário logado. Não pede permissão. */
export async function ensurePushSubscription(): Promise<PushResult> {
  if (!isWebPushSupported()) return "unsupported";
  if (Notification.permission !== "granted") return "denied";
  try {
    const cfgRes = await apiFetch("/api/push/config");
    if (!cfgRes.ok) return "error";
    const cfg = await cfgRes.json();
    if (!cfg?.enabled || !cfg?.publicKey) return "not-configured";

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(cfg.publicKey) as BufferSource,
      });
    }
    const res = await apiFetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subscription: sub.toJSON() }),
    });
    return res.ok ? "subscribed" : "error";
  } catch {
    return "error";
  }
}

/** Cancela a inscrição deste aparelho (navegador e servidor). */
export async function removePushSubscription(): Promise<void> {
  if (!isWebPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await apiFetch("/api/push/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }).catch(() => undefined);
    await sub.unsubscribe();
  } catch { /* nada a fazer */ }
}
