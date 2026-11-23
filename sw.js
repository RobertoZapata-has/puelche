/* Puelche — service worker: el juego funciona sin conexión */
const CACHE = 'puelche-v2';
const FILES = [
  './',
  'index.html',
  'game.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'a/bicho-avispa.webp',
  'a/bicho-escarabajo.webp',
  'a/bicho-langosta.webp',
  'a/bicho-libelula.webp',
  'a/bicho-mosquito.webp',
  'a/bicho-oruga.webp',
  'a/bicho-polilla.webp',
  'a/cara-bichi-derrota.webp',
  'a/cara-bichi.webp',
  'a/cara-chispa-derrota.webp',
  'a/cara-chispa.webp',
  'a/cara-ozan.webp',
  'a/cara-reina-burla.webp',
  'a/cara-reina.webp',
  'a/cara-tito-derrota.webp',
  'a/cara-tito.webp',
  'a/entre-1-01.webp',
  'a/entre-1-02.webp',
  'a/entre-1-03.webp',
  'a/entre-2-01.webp',
  'a/entre-2-02.webp',
  'a/entre-2-03.webp',
  'a/entre-3-01.webp',
  'a/entre-3-02.webp',
  'a/entre-3-03.webp',
  'a/entre-4-01.webp',
  'a/entre-4-02.webp',
  'a/entre-4-03.webp',
  'a/final-01.webp',
  'a/final-02.webp',
  'a/final-03.webp',
  'a/final-04.webp',
  'a/final-05.webp',
  'a/fondo-1-vinedos.webp',
  'a/fondo-2-ciudad.webp',
  'a/fondo-3-potrerillos.webp',
  'a/fondo-4-caracoles.webp',
  'a/fondo-5-glaciar.webp',
  'a/gameover-caida.webp',
  'a/jefe-1-madre-polilla.webp',
  'a/jefe-2-gran-langosta.webp',
  'a/jefe-3-libelula.webp',
  'a/jefe-4-escarabajo.webp',
  'a/jefe-5-reina.webp',
  'a/nave.webp',
  'a/portada.webp',
  'a/prologo-01.webp',
  'a/prologo-02.webp',
  'a/prologo-03.webp',
  'a/prologo-04.webp',
  'a/prologo-05.webp',
  'a/prologo-06.webp',
  'a/prologo-07.webp',
  'a/prologo-08.webp',
  'a/prologo-09.webp',
  'a/prologo-10.webp',
  'a/pw-bomba.webp',
  'a/pw-doble.webp',
  'a/pw-escudo.webp',
  'a/pw-misil.webp',
  'a/pw-vida.webp',
  'a/taller.webp'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  const fresh = u.origin === location.origin && (u.pathname.endsWith('/') || /\.(html|js|webmanifest)$/.test(u.pathname));
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
    if (fresh) return hit ? Promise.race([net, new Promise(r => setTimeout(() => r(hit), 2500))]) : net;
    return hit || net;
  }));
});
