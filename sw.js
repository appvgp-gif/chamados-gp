/* Service worker: guarda a "casca" do app para abrir rápido e permitir instalação.
   Os chamados NUNCA vêm do cache: sempre do servidor (Apps Script). */
const VERSAO = 'chamados-gp-v4';
const ARQUIVOS = ['./', 'index.html', 'styles.css', 'config.js', 'regras.js', 'api.js', 'app.js', 'manifest.webmanifest',
  'logo-branco.png', 'icon-192.png', 'favicon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(VERSAO).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))));
});
