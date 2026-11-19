/*
 * BrathaMatu service worker.
 *
 * The shell and static build files are cached so an installed app opens fast
 * and still renders its own error states when the network drops. API traffic
 * is NEVER cached: stock, prices, payments and shifts must only ever come from
 * the server, so a stale response can never be mistaken for the truth.
 */
const VERSION = "brathamatu-pwa-v6";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_URLS = [
  "/",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/favicon.svg",
  "/pwa/icon-96.png",
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/apple-touch-icon.png",
  "/pwa/icon-maskable-512.png",
];

const API_PREFIXES = [
  /^\/api(\/|$)/,
  /^\/sanctum(\/|$)/,
  /^\/up(\/|$)/,
  /^\/mpesa(\/|$)/,
  /^\/storage(\/|$)/,
];

const OFFLINE_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Offline — BrathaMatu</title>
    <style>
      body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: #fbfaf6; color: #3d2b1f; font-family: system-ui, sans-serif; padding: 24px; }
      main { max-width: 22rem; text-align: center; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { font-size: 0.875rem; line-height: 1.5; color: #6b5a4b; margin: 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>You are offline</h1>
      <p>BrathaMatu needs a connection to load live stock, prices and payments. Nothing stale is shown. Reconnect and open the app again.</p>
    </main>
  </body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await Promise.all(
        SHELL_URLS.map(async (url) => {
          try {
            const response = await fetch(url, { cache: "reload" });
            if (response.ok) await cache.put(url, response);
          } catch {
            // One missing shell file must not block the worker install.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE]);
      const names = await caches.keys();
      await Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put("/", response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match("/");
    if (cached) return cached;
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(ASSET_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (API_PREFIXES.some((pattern) => pattern.test(url.pathname))) return;
  if (request.headers.has("range")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  const isStaticAsset =
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/pwa/") ||
    ["/favicon.ico", "/favicon.svg", "/manifest.webmanifest", "/og-default.jpg"].includes(
      url.pathname,
    );
  if (!isStaticAsset) return;

  event.respondWith(staleWhileRevalidate(request));
});
