/*
 * Offline support with a self-healing update path.
 *
 * The application shell (HTML, CSS, JS) is network-first: a broken build can
 * never be pinned forever by a stale cache, which is what makes an installed
 * iPad app impossible to repair from the outside. Artwork is cache-first
 * because it is large, immutable and versioned by filename.
 */

/* The suffix is replaced by scripts/build.mjs with a hash of everything that
 * shipped, so changed artwork can never be served from an old cache. */
const CACHE_NAME = "ponpoko-dev";

const SHELL_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./apple-touch-icon.png",
];

/* Rewritten by scripts/build.mjs with every sprite that this build ships. */
const ASSET_FILES = [];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) =>
        Promise.all(
          SHELL_FILES.concat(ASSET_FILES).map((file) =>
            cache.add(file).catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function isShellRequest(request, url) {
  if (request.mode === "navigate") return true;
  return /\.(?:html|css|js|webmanifest)$/.test(url.pathname);
}

function putInCache(request, response) {
  if (!response || response.status !== 200 || response.type === "opaque") return response;
  const copy = response.clone();
  caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }
  if (url.origin !== self.location.origin) return;

  if (isShellRequest(request, url)) {
    event.respondWith(
      fetch(request)
        .then((response) => putInCache(request, response))
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match("./index.html"))
            .then((cached) => cached || Response.error()),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => putInCache(request, response))
        .catch(() => Response.error());
    }),
  );
});
