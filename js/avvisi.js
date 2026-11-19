/* Maladh – «Avvisi»: notifiche Web Push all'ora delle preghiere scelte, disegnate in #tempo-avvisi (la vista «Orari», js/tempo.js).
   Il server (push.150796.xyz, cartella worker/) riceve solo l'indirizzo push di questo browser e gli istanti scelti: mai la posizione, mai un nome.
   Le notifiche arrivano senza contenuto: il testo lo scrive il service worker (sw.js) leggendo l'elenco salvato qui in IndexedDB.
   Stato in localStorage («maladh.avvisi» = {attivi, chiavi, inviato}). Nessun contatore, nessuna serie di giorni.
   L'unico nome globale è window.MaladhAvvisi. */
(function () {
  'use strict';

  var LOCALE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var PUSH_URL = LOCALE ? 'http://127.0.0.1:8787' : 'https://push.150796.xyz';
  var VAPID = 'BKFhfliYY8ccs67mNVyiuXC7u8UQdb4bE7O2A65hcWkfv8PQXRJ3OHyZgIJSmvVOpT_1DV4Wt8tzWWUe61Omox8';
  var K = 'maladh.avvisi';
  var DODICI_ORE = 12 * 3600 * 1000;
  var VOCI = [['fajr', 'Fajr'], ['dhuhr', 'Dhuhr'], ['asr', 'Asr'], ['maghrib', 'Maghrib'], ['isha', 'Isha'], ['ultimoTerzo', 'Ultimo terzo della notte']];
  var CHIAVI_OK = VOCI.map(function (v) { return v[0]; });

  var T = function () { return window.MaladhTempo; };
  function $(s) { return document.querySelector(s); }

  /* ---------- stato ---------- */
  var stato = { attivi: false, chiavi: [], inviato: 0 };
  (function carica() {
    try {
      var s = JSON.parse(localStorage.getItem(K) || 'null');
      if (s && typeof s === 'object') {
        stato.attivi = s.attivi === true;
        stato.chiavi = Array.isArray(s.chiavi) ? s.chiavi.filter(function (k) { return CHIAVI_OK.indexOf(k) >= 0; }) : [];
        stato.inviato = typeof s.inviato === 'number' && isFinite(s.inviato) ? s.inviato : 0;
      }
    } catch (e) {}
  })();
  function salva() { try { localStorage.setItem(K, JSON.stringify(stato)); } catch (e) {} }

  /* ---------- che cosa può fare questo dispositivo ---------- */
  function iosFuoriDallaHome() {
    var ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!ios) return false;
    var standalone = navigator.standalone === true;
    try { standalone = standalone || window.matchMedia('(display-mode: standalone)').matches; } catch (e) {}
    return !standalone;
  }
  function conSupporto() { return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window; }

  /* ---------- IndexedDB «maladh» / «avvisi»: l'elenco {at, chiave} che il service worker legge quando arriva un push ---------- */
  function apriDb() {
    return new Promise(function (ok, no) {
      var r = indexedDB.open('maladh', 2);
      r.onupgradeneeded = function () {
        if (!r.result.objectStoreNames.contains('avvisi')) r.result.createObjectStore('avvisi', { keyPath: 'id', autoIncrement: true });
        if (!r.result.objectStoreNames.contains('stato')) r.result.createObjectStore('stato');     // «pausa»: true/false, letto dal service worker
      };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { no(r.error); };
    });
  }
  function scriviElenco(elenco, pausa) {
    return apriDb().then(function (db) {
      return new Promise(function (ok, no) {
        var tx = db.transaction(['avvisi', 'stato'], 'readwrite'), st = tx.objectStore('avvisi');
        tx.objectStore('stato').put(!!pausa, 'pausa');
        st.clear();
        elenco.forEach(function (x) { st.add({ at: x.at, chiave: x.chiave }); });
        tx.oncomplete = function () { db.close(); ok(); };
        tx.onerror = tx.onabort = function () { db.close(); no(tx.error); };
      });
    });
  }

  /* ---------- server ---------- */
  function invia(percorso, corpo) {
    return fetch(PUSH_URL + percorso, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      .then(function (r) { if (!r.ok) throw new Error('http ' + r.status); });
  }
  function registrazione() {
    return navigator.serviceWorker.getRegistration().then(function (reg) { return reg && reg.active ? reg : (reg ? navigator.serviceWorker.ready : null); });
  }
  function iscrizione() {
    return registrazione().then(function (reg) { return reg ? reg.pushManager.getSubscription() : null; });
  }

  /* Manda al server (e a IndexedDB) gli orari dei prossimi dieci giorni per le preghiere scelte. Con la pausa l'elenco è vuoto.
     Se la rete manca non si dice nulla di allarmante: si riprova alla prossima apertura. */
  var inCorso = null, rifare = false;
  function sincronizza() {
    if (!stato.attivi || !conSupporto() || !T()) return Promise.resolve();
    if (inCorso) { rifare = true; return inCorso; }
    inCorso = (function () {
      if (Notification.permission !== 'granted') { stato.attivi = false; salva(); disegna(); return Promise.resolve(); }
      return iscrizione().then(function (sub) {
        if (!sub) { stato.attivi = false; salva(); disegna(); return; }
        var elenco = T().prossimi(10, stato.chiavi).slice(0, 80);
        return scriviElenco(elenco, T().inPausa()).then(function () {
          return invia('/iscrivi', { endpoint: sub.endpoint, orari: elenco.map(function (x) { return x.at; }) });
        }).then(function () { stato.inviato = Date.now(); salva(); messaggio(''); });
      }).catch(function () {
        stato.inviato = 0; salva();          // da riprovare: quando torna la rete o alla prossima apertura
        messaggio('Gli avvisi si aggiorneranno alla prossima apertura.');
      });
    })().then(function () {
      inCorso = null;
      if (rifare) { rifare = false; return sincronizza(); }
    });
    return inCorso;
  }
  var attesa = 0;
  function sincronizzaPresto() { clearTimeout(attesa); attesa = setTimeout(sincronizza, 400); }

  /* ---------- attivare e disattivare ---------- */
  function b64Chiave(b64) {
    var s = (b64 + '===='.slice(b64.length % 4)).replace(/-/g, '+').replace(/_/g, '/');
    var raw = atob(s), a = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i);
    return a;
  }
  function attiva() {
    if (!stato.chiavi.length) { messaggio('Scegli almeno una preghiera.'); return; }
    messaggio('');
    var b = $('#av-bottone'); if (b) b.disabled = true;
    var p;
    try { p = Promise.resolve(Notification.requestPermission()); } catch (e) { p = Promise.resolve('denied'); }
    p.then(function (perm) {
      if (perm !== 'granted') { messaggio('Le notifiche sono bloccate nelle impostazioni del browser.'); return; }
      return navigator.serviceWorker.ready.then(function (reg) {
        return reg.pushManager.getSubscription().then(function (sub) {
          return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64Chiave(VAPID) });
        });
      }).then(function () {
        stato.attivi = true; salva();
        return sincronizza();
      });
    }).catch(function () {
      messaggio('Non sono riuscito ad attivare gli avvisi su questo dispositivo.');
    }).then(function () { disegna(); });
  }
  function disattiva() {
    var b = $('#av-bottone'); if (b) b.disabled = true;
    stato.attivi = false; salva();
    iscrizione().then(function (sub) {
      if (!sub) return;
      return invia('/cancella', { endpoint: sub.endpoint }).catch(function () {}).then(function () { return sub.unsubscribe(); });
    }).catch(function () {}).then(function () { return scriviElenco([], false); }).catch(function () {}).then(function () { messaggio(''); disegna(); });
  }

  /* ---------- la sezione ---------- */
  var costruita = false;
  function messaggio(t) { var m = $('#av-msg'); if (m) m.textContent = t; }

  function costruisci() {
    var c = $('#tempo-avvisi');
    if (!c || costruita && c.firstChild) return !!c;
    c.innerHTML =
      '<section class="tp-avvisi" aria-labelledby="av-titolo">' +
        '<h2 class="sezione-titolo" id="av-titolo">Avvisi</h2>' +
        '<p id="av-nota" class="av-testo"></p>' +
        '<div id="av-corpo">' +
          '<div class="av-caselle" role="group" aria-label="Per quali momenti">' +
            VOCI.map(function (v) { return '<label class="spunta"><input type="checkbox" data-k="' + v[0] + '"><span>' + v[1] + '</span></label>'; }).join('') +
          '</div>' +
          '<p class="nota" id="av-msg" role="status" aria-live="polite"></p>' +
          '<button class="btn" id="av-bottone" type="button">Attiva gli avvisi</button>' +
          '<p class="nota tp-sotto">Per gli avvisi, il server di Maladh riceve solo l\'indirizzo per le notifiche di questo browser e gli orari che hai scelto: nessuna posizione esatta, nessun nome. Ogni orario si cancella appena l\'avviso parte. Gli orari si rinnovano quando apri Maladh: senza aprirla, durano dieci giorni. Gli orari, da soli, possono indicare all\'incirca la zona in cui ti trovi.</p>' +
        '</div>' +
      '</section>';
    c.addEventListener('change', function (e) {
      var k = e.target && e.target.getAttribute && e.target.getAttribute('data-k');
      if (!k) return;
      var i = stato.chiavi.indexOf(k);
      if (e.target.checked && i < 0) stato.chiavi.push(k);
      if (!e.target.checked && i >= 0) stato.chiavi.splice(i, 1);
      salva();
      messaggio('');
      if (stato.attivi) sincronizzaPresto();
    });
    $('#av-bottone').addEventListener('click', function () { if (stato.attivi) disattiva(); else attiva(); });
    costruita = true;
    return true;
  }

  function disegna() {
    if (!costruisci()) return;
    var nota = $('#av-nota'), corpo = $('#av-corpo');
    var luogo = T() && T().luogo();
    var testo = '';
    if (!luogo) testo = 'Scegli un luogo per gli avvisi.';
    else if (iosFuoriDallaHome()) testo = 'Su iPhone gli avvisi arrivano solo se Maladh è nella schermata Home: Condividi, poi «Aggiungi alla schermata Home».';
    else if (!conSupporto()) testo = 'Questo browser non riceve avvisi. Puoi usare il calendario qui sotto.';
    nota.textContent = testo; nota.hidden = !testo;
    corpo.hidden = !!testo;
    if (testo) return;
    Array.prototype.forEach.call(document.querySelectorAll('#av-corpo input[data-k]'), function (i) { i.checked = stato.chiavi.indexOf(i.getAttribute('data-k')) >= 0; });
    var b = $('#av-bottone');
    b.disabled = false;
    b.textContent = stato.attivi ? 'Disattiva gli avvisi' : 'Attiva gli avvisi';
    b.classList.toggle('secondario', stato.attivi);
    if (!stato.attivi && Notification.permission === 'denied') messaggio('Le notifiche sono bloccate nelle impostazioni del browser.');
  }

  /* ---------- eventi ---------- */
  document.addEventListener('maladh:tempo-vista', disegna);
  document.addEventListener('maladh:tempo', function () { disegna(); sincronizzaPresto(); });     // luogo, metodo o pausa cambiati
  window.addEventListener('online', function () { if (stato.attivi && stato.inviato === 0) sincronizza(); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && stato.attivi && Date.now() - stato.inviato > DODICI_ORE) sincronizza();
  });
  /* Il tocco sulla notifica (sw.js) chiede di portare la finestra su «Orari». */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.tipo === 'vai' && e.data.hash === '#tempo') location.hash = '#tempo';
    });
  }
  if (stato.attivi && Date.now() - stato.inviato > DODICI_ORE) setTimeout(sincronizza, 1500);       // all'apertura, se l'ultimo invio è vecchio

  window.MaladhAvvisi = { sincronizza: sincronizza };
})();
