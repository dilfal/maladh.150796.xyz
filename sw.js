/* Maladh – service worker: tiene l'app in memoria per usarla senza rete e serve le registrazioni dell'utente.
   Sullo stesso indirizzo di base possono vivere altre app: qui si toccano solo le memorie che iniziano per «maladh-». */
var CACHE = 'maladh-v5';
var AUDIO_CACHE = 'maladh-audio-v1';     // le registrazioni caricate dall'utente (le scrive js/pacchetto.js)
var FILES = [
  './', 'index.html', 'site.webmanifest',
  'css/style.css',
  'js/version.js', 'js/pacchetto.js', 'js/audio.js', 'js/adhkar_dati.js', 'js/adhkar_it.js', 'js/rabbana_dati.js', 'js/raccolte_dati.js',
  'js/aya_dati.js', 'js/aya_it.js', 'js/frasi_dati.js', 'js/frasi_it.js',
  'js/tasbih.js', 'js/awrad.js', 'js/santuario.js', 'js/app.js',
  'img/raccolte/rabbana.webp', 'img/raccolte/shadhili.webp', 'img/raccolte/jilani.webp', 'img/raccolte/rifai.webp', 'img/raccolte/jawshan.webp',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'
];
var NATURA = ['pioggia', 'mare', 'fiume'].map(function (n) { return 'audio/natura/natura_' + n + '.mp3'; });

/* I suoni di natura sono pesanti: si scaricano all'installazione, ma senza far fallire l'installazione. */
function precacheAudio(cache) {
  return Promise.all(NATURA.map(function (u) { return cache.add(u).catch(function () {}); }));
}

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) { return c.addAll(FILES).then(function () { return precacheAudio(c); }); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('maladh-') === 0 && k !== CACHE && k !== AUDIO_CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

/* Una registrazione del pacchetto si serve dalla memoria, anche a pezzi (Range): su iPhone serve per spostarsi nella traccia.
   Si usa il Blob e blob.slice(): mai arrayBuffer() sull'intero file (ci sono tracce da 240 MB). */
async function rispostaPacchetto(req) {
  var cache = await caches.open(AUDIO_CACHE);
  var hit = await cache.match(req.url);
  if (!hit) return new Response('Registrazione non trovata', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  var blob = await hit.blob();
  var tot = blob.size;
  var tipo = 'audio/mpeg';
  var range = req.headers.get('range');
  if (!range) {
    return new Response(blob, { status: 200, headers: { 'Content-Type': tipo, 'Content-Length': String(tot), 'Accept-Ranges': 'bytes' } });
  }
  var m = /^bytes=(\d*)-(\d*)/.exec(range) || [];
  var inizio, fine;
  if (!m[1] && m[2]) { inizio = Math.max(0, tot - parseInt(m[2], 10)); fine = tot - 1; }          // bytes=-N: gli ultimi N byte
  else { inizio = m[1] ? parseInt(m[1], 10) : 0; fine = m[2] ? Math.min(parseInt(m[2], 10), tot - 1) : tot - 1; }
  if (tot === 0 || inizio >= tot || inizio > fine) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + tot } });
  return new Response(blob.slice(inizio, fine + 1, tipo), {
    status: 206,
    headers: {
      'Content-Type': tipo,
      'Content-Length': String(fine - inizio + 1),
      'Content-Range': 'bytes ' + inizio + '-' + fine + '/' + tot,
      'Accept-Ranges': 'bytes'
    }
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (url.pathname.indexOf('/audio/p/') >= 0) {
    e.respondWith(rispostaPacchetto(req));
    return;
  }

  /* il resto della stessa origine: prima la copia salvata, poi la rete */
  e.respondWith(
    caches.match(req).then(function (m) {
      if (m) return m;
      return fetch(req).then(function (res) {
        if (res.ok && res.type === 'basic') { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      }).catch(function () {
        return req.mode === 'navigate' ? caches.match('index.html') : Response.error();
      });
    })
  );
});
