/* Service worker: guarda o app para abrir offline. Troque VERSION a cada release. */
const VERSION = 'motion-v20';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'ai-edit.js', 'lottie.js', 'pro-config.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Player vetorial: CDN com versão fixa, guardado após a primeira importação.
  const lottieBase = 'https://cdn.jsdelivr.net/npm/@lottiefiles/dotlottie-web@0.81.0/dist/';
  const lottieResource = url.origin + url.pathname;
  if (lottieResource === lottieBase + 'index.js' || lottieResource === lottieBase + 'dotlottie-player.wasm') {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(lottieResource);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) await c.put(lottieResource, res.clone());
      return res;
    }));
    return;
  }
  // fontes do Google: cache primeiro, rede para preencher
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com')) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  // arquivos do app: rede primeiro (pega atualizações), cache se estiver offline
  e.respondWith(fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(hit => hit || caches.match('index.html'))));
});
