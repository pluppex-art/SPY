/* S.P.Y. — service worker.
 *
 * Regras (multi-tenant, dados de clientes):
 *  - NUNCA guarda /api nem qualquer resposta autenticada: só o "casco" do app (HTML, JS, CSS, ícones).
 *  - HTML (navegação): rede primeiro, para sempre pegar a versão nova do deploy; sem rede, página offline.
 *  - /assets/* (nome com hash, imutável): cache primeiro.
 *  - Push: recebe e mostra notificações; o clique abre a URL enviada (só do mesmo domínio).
 */
// O sufixo do VERSION é trocado a cada build (ver buildIdPlugin em vite.config.ts): cada deploy tem seu próprio cache,
// e o "activate" abaixo apaga os caches de versões anteriores (assets antigos não se acumulam).
const VERSION = "spy-__BUILD_ID__";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/pwa-192.png", "/pwa-512.png", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;            // Supabase, WAHA, Google etc.: direto na rede
  if (url.pathname.startsWith("/api/")) return;                // dados de clientes: nunca em cache

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit && !isHtml(hit)) return hit;
        const res = await fetch(req);
        // O rewrite da Vercel devolve index.html (200) para chunk inexistente: nunca guardar HTML em /assets/.
        if (res.ok && !isHtml(res)) cache.put(req, res.clone());
        return res;
      }),
    );
  }
});

function isHtml(res) {
  return (res.headers.get("content-type") || "").toLowerCase().includes("text/html");
}

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || "S.P.Y.";
  event.waitUntil(
    // Com o app aberto e visível o pop-up interno já mostrou o aviso: não duplica na bandeja do sistema.
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      if (list.some((c) => c.visibilityState === "visible")) return;
      return self.registration.showNotification(title, {
        body: data.body || "",
        icon: "/pwa-192.png",
        badge: "/pwa-192.png",
        tag: data.tag,
        data: { url: data.url || "/app/dashboard" },
      });
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "/app/dashboard", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.navigate(target.href); return c.focus(); }
      }
      return self.clients.openWindow(target.href);
    }),
  );
});
