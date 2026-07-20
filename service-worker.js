// ══════════════════════════════════════════════════════════════════
// Service Worker — Créditos R&M
// Objetivo: que la app se pueda instalar como aplicación (PWA) y que
// siga ABRIENDO incluso sin señal, para poder CONSULTAR la información
// ya sincronizada (clientes, créditos, cobros, etc. viven en localStorage,
// no aquí — este service worker solo se encarga de que la página en sí
// cargue sin depender de internet).
//
// IMPORTANTE sobre "trabajar sin conexión":
// - Los datos (clientes, créditos, pagos...) YA viven en localStorage del
//   navegador, así que consultarlos sin señal siempre funcionó.
// - Los CAMBIOS que hagas sin señal se guardan localmente igual que
//   siempre, y la cola de reintentos de Supabase (ya implementada) los
//   sube solos apenas vuelva la conexión — este archivo no toca esa
//   lógica, solo hace que la PÁGINA (el HTML/CSS/JS) cargue sin red.
//
// Si subes una versión nueva del HTML, sube también este archivo con el
// número de CACHE_VERSION incrementado en +1, así los celulares que ya
// tenían la app instalada descargan la versión nueva en vez de quedarse
// con una vieja en caché.
// ══════════════════════════════════════════════════════════════════

const CACHE_VERSION = 'creditos-rym-v1';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL).catch(() => {
      // Si algún archivo del listado no existe (ej. nombre distinto), no
      // rompe la instalación del resto.
    }))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo interceptamos GET; todo lo demás (POST a Supabase, etc.) pasa
  // directo a la red, sin tocarlo.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // NUNCA cachear llamadas a APIs externas (Supabase, Google, etc.) — esas
  // siempre deben ir a la red real, o fallar limpiamente si no hay señal
  // (la cola de reintentos ya sabe manejar eso).
  const esAPIExterna = /supabase\.co|googleapis\.com|google\.com|accounts\.google\.com/.test(url.hostname);
  if (esAPIExterna) return;

  // Navegación (abrir/recargar la página): red primero, caché de respaldo.
  // Así, si hay internet, siempre se ve la versión más reciente del HTML;
  // si no hay internet, se abre la última versión guardada.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then((res) => {
        caches.open(CACHE_VERSION).then((cache) => cache.put(req, res.clone()));
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  // Resto de recursos (CSS/JS de CDN, iconos, manifest): caché primero,
  // red de respaldo — son archivos que casi no cambian.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type !== 'opaque') {
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, res.clone()));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
