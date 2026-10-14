/* Service worker: guarda o app para abrir offline. Troque VERSION a cada release. */
const VERSION = 'motion-v30';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'ai-edit.js', 'lottie.js', 'chrome-ai.js', 'silence-cutter.js', 'mobile-pwa.js', 'timeline-touch.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

const CDN_FILES = new Set([
  'https://cdn.jsdelivr.net/npm/@lottiefiles/dotlottie-web@0.81.0/dist/index.js',
  'https://cdn.jsdelivr.net/npm/@lottiefiles/dotlottie-web@0.81.0/dist/dotlottie-player.wasm',
  'https://cdn.jsdelivr.net/npm/@iconify-json/lucide@1.2.130/icons.json',
  'https://cdn.jsdelivr.net/npm/wavesurfer.js@7.12.12/dist/wavesurfer.esm.js',
  'https://cdn.jsdelivr.net/npm/mp4box@2.4.1/dist/mp4box.all.mjs',
  'https://cdn.jsdelivr.net/npm/mp4box@2.4.1/dist/rolldown-runtime-w6R9maHv.mjs',
  'https://cdn.jsdelivr.net/npm/mp4box@2.4.1/dist/styp-9TIZZDLN.mjs',
  'https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js',
]);

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'shared-media').map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.origin === location.origin &&
      url.pathname === new URL('share-target', self.registration.scope).pathname) {
    e.respondWith((async () => {
      try {
        const data = await req.formData(), cache = await caches.open('shared-media');
        const stamp = `${Date.now()}-${crypto.randomUUID()}`;
        let n = 0;
        for (const file of data.getAll('media')) {
          if (!(file instanceof File) || !/^(video|image|audio)\//.test(file.type)) continue;
          const key = new URL(`shared-${stamp}-${n++}`, self.registration.scope).href;
          await cache.put(key, new Response(file, {
            headers: { 'Content-Type': file.type, 'X-Filename': encodeURIComponent(file.name) }
          }));
        }
        return Response.redirect(new URL('./#editor?shared=1', self.registration.scope).href, 303);
      } catch {
        return new Response('Não consegui receber a mídia. Compartilhe novamente.', { status: 400 });
      }
    })());
    return;
  }
  if (req.method !== 'GET') return;
  // Bibliotecas abertas em CDN com versão fixa: guardadas após o primeiro uso.
  const lottieResource = url.origin + url.pathname;
  if (CDN_FILES.has(lottieResource)) {
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
