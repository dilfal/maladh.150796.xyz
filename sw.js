/* Maladh – service worker: tiene l'app in memoria per usarla senza rete e serve le registrazioni dell'utente.
   Sullo stesso indirizzo di base possono vivere altre app: qui si toccano solo le memorie che iniziano per «maladh-». */
var CACHE = 'maladh-v9';
var AUDIO_CACHE = 'maladh-audio-v1';     // le registrazioni caricate dall'utente (le scrive js/pacchetto.js)
var FILES = [
  './', 'index.html', 'site.webmanifest',
  'css/style.css',
  'js/version.js', 'js/nome.js', 'js/pacchetto.js', 'js/audio.js', 'js/adhkar_dati.js', 'js/adhkar_it.js', 'js/rabbana_dati.js', 'js/raccolte_dati.js',
  'js/aya_dati.js', 'js/aya_it.js', 'js/frasi_dati.js', 'js/frasi_it.js',
  'js/adhan.js', 'js/tempo.js', 'js/avvisi.js', 'js/tasbih.js', 'js/awrad.js', 'js/santuario.js', 'js/app.js',
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


/* ---------- avvisi (Web Push senza contenuto) ----------
   Il server manda un push vuoto all'ora scelta. Il testo si decide qui: js/avvisi.js salva in IndexedDB («maladh» / «avvisi»)
   l'elenco {at, chiave} dei prossimi avvisi; si prende quello più vicino a adesso (entro 15 minuti).
   Una notifica va sempre mostrata (su iPhone è obbligatorio), anche se non si trova nessuna voce. */
var AV_TITOLI = { fajr: 'Fajr', dhuhr: 'Dhuhr', asr: 'Asr', maghrib: 'Maghrib', isha: 'Isha' };
function avDb() {
  return new Promise(function (ok, no) {
    var r = indexedDB.open('maladh', 2);       // la versione e le tabelle sono le stesse di js/avvisi.js
    r.onupgradeneeded = function () {
      if (!r.result.objectStoreNames.contains('avvisi')) r.result.createObjectStore('avvisi', { keyPath: 'id', autoIncrement: true });
      if (!r.result.objectStoreNames.contains('stato')) r.result.createObjectStore('stato');
    };
    r.onsuccess = function () { ok(r.result); };
    r.onerror = function () { no(r.error); };
  });
}
function avLeggi() {
  return avDb().then(function (db) {
    return new Promise(function (ok, no) {
      var q = db.transaction('avvisi', 'readonly').objectStore('avvisi').getAll();
      q.onsuccess = function () { db.close(); ok(q.result || []); };
      q.onerror = function () { db.close(); no(q.error); };
    });
  });
}
/* Toglie dallo store le voci passate e quella appena usata. */
function avPulisci(voci, usata, ora) {
  var da = voci.filter(function (v) { return v === usata || v.at * 1000 < ora - 15 * 60000; });
  if (!da.length) return Promise.resolve();
  return avDb().then(function (db) {
    return new Promise(function (ok) {
      var tx = db.transaction('avvisi', 'readwrite'), st = tx.objectStore('avvisi');
      da.forEach(function (v) { st.delete(v.id); });
      tx.oncomplete = tx.onerror = tx.onabort = function () { db.close(); ok(); };
    });
  });
}
/* Il flag «pausa» scritto da js/avvisi.js: se manca o l'archivio non si legge, vale «non in pausa». */
function avInPausa() {
  return avDb().then(function (db) {
    return new Promise(function (ok) {
      var q = db.transaction('stato', 'readonly').objectStore('stato').get('pausa');
      q.onsuccess = function () { db.close(); ok(q.result === true); };
      q.onerror = function () { db.close(); ok(false); };
    });
  }).catch(function () { return false; });
}
/* Stessa regola di js/avvisi.js: in prova (localhost) il server è quello locale. */
function avPushUrl() {
  return /^(localhost|127\.0\.0\.1)$/.test(self.location.hostname) ? 'http://127.0.0.1:8787' : 'https://push.150796.xyz';
}
/* In pausa un push può ancora arrivare (l'ultimo elenco del server): si dice con garbo e si svuota il server. */
function avAvvisoInPausa() {
  var mostra = self.registration.showNotification('Maladh', { body: 'Gli avvisi sono in pausa.', icon: 'icons/icon-192.png', tag: 'maladh-orario', silent: true });
  var svuota = self.registration.pushManager.getSubscription().then(function (sub) {
    if (!sub) return;
    return fetch(avPushUrl() + '/iscrivi', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint, orari: [] }) });
  }).catch(function () {});
  return Promise.all([mostra, svuota]);
}
function mostraAvviso() {
  return avInPausa().then(function (pausa) { return pausa ? avAvvisoInPausa() : avvisoDellOra(); });
}
function avvisoDellOra() {
  var ora = Date.now();
  return avLeggi().catch(function () { return []; }).then(function (voci) {
    var usata = null;
    voci.forEach(function (v) {
      var d = Math.abs(v.at * 1000 - ora);
      if (d <= 15 * 60000 && (!usata || d < Math.abs(usata.at * 1000 - ora))) usata = v;
    });
    var titolo = 'Maladh', corpo = 'È giunta l\'ora della preghiera.';
    if (usata && AV_TITOLI[usata.chiave]) titolo = AV_TITOLI[usata.chiave];
    else if (usata && usata.chiave === 'ultimoTerzo') { titolo = 'Ultimo terzo della notte'; corpo = 'Un tempo di quiete per il ricordo.'; }
    return self.registration.showNotification(titolo, { body: corpo, icon: 'icons/icon-192.png', tag: 'maladh-orario' })
      .then(function () { return avPulisci(voci, usata, ora).catch(function () {}); });
  });
}
self.addEventListener('push', function (e) { e.waitUntil(mostraAvviso()); });

/* Il tocco sulla notifica: porta in primo piano una finestra già aperta e la sposta su «Orari», altrimenti ne apre una. */
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (lista) {
    for (var i = 0; i < lista.length; i++) {
      var c = lista[i];
      if (c.url.indexOf(self.registration.scope) === 0 && 'focus' in c) {          // solo le finestre di Maladh
        return c.focus().then(function (w) { try { (w || c).postMessage({ tipo: 'vai', hash: '#tempo' }); } catch (err) {} });
      }
    }
    return self.clients.openWindow('./#tempo');
  }));
});
