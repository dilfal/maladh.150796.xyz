/* Maladh – «Collega a Marsa»: collegamento facoltativo (spento di default) con l'app del ciclo https://marsa.150796.xyz.
   Quando in Marsa si segna l'inizio del ciclo, il server (push.150796.xyz) ferma gli avvisi di questo dispositivo e Maladh,
   alla prossima apertura, si mette in pausa; quando il ciclo finisce la pausa si toglie.
   Il server conosce soltanto un codice casuale (per l'esattezza la sua impronta), se è in pausa o no e il giorno dell'ultimo contatto:
   nessuna data, nessuno storico. Il legame si cancella dopo 60 giorni senza contatti.
   Chiavi: maladh.marsa = {codice, server} (codice: 26 caratteri, alfabeto Crockford; server: ultima pausa vista sul server); maladh.marsaSospeso = {pausa} (operazione da ripetere);
   maladh.pausaDa = "marsa" (la scrive js/tempo.js, con impostaPausa).
   L'unico nome globale è window.MaladhMarsa. */
(function () {
  'use strict';

  var LOCALE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var PUSH_URL = LOCALE ? 'http://127.0.0.1:8787' : 'https://push.150796.xyz';
  var K = 'maladh.marsa', K_SOSP = 'maladh.marsaSospeso';
  var ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
  var ER_CODICE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

  var T = function () { return window.MaladhTempo; };
  function $(s) { return document.querySelector(s); }
  function leggi(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function scrivi(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }

  /* ---------- il codice ---------- */
  function generaCodice() {
    var b = new Uint8Array(16);
    crypto.getRandomValues(b);
    var bit = 0, n = 0, fuori = '';
    for (var i = 0; i < b.length; i++) {
      bit = (bit << 8) | b[i]; n += 8;
      while (n >= 5) { fuori += ALFABETO.charAt((bit >>> (n - 5)) & 31); n -= 5; }
      bit &= (1 << n) - 1;
    }
    if (n > 0) fuori += ALFABETO.charAt((bit << (5 - n)) & 31);        // 128 bit = 25 caratteri + 3 bit, riempiti con zeri
    return fuori;                                                      // 26 caratteri
  }
  function aGruppi(codice) { return codice.replace(/(.{4})(?=.)/g, '$1-'); }

  /* ---------- stato ---------- */
  function codice() {
    try {
      var s = JSON.parse(leggi(K) || 'null');
      if (s && typeof s.codice === 'string' && ER_CODICE.test(s.codice)) return s.codice;
    } catch (e) {}
    return null;
  }
  function serverVisto() {
    try { var s = JSON.parse(leggi(K) || 'null'); return !!(s && s.server === true); } catch (e) { return false; }
  }
  function salvaServer(v) {
    var c = codice();
    if (c) scrivi(K, JSON.stringify({ codice: c, server: !!v }));
  }
  /* Gli avvisi che il server aveva cancellato per la pausa tornano subito. */
  function rinnovaAvvisi() {
    var A = window.MaladhAvvisi;
    if (A && A.rinnova) A.rinnova();
  }
  function sospeso() {
    try {
      var s = JSON.parse(leggi(K_SOSP) || 'null');
      if (s && typeof s.pausa === 'boolean') return s.pausa;
    } catch (e) {}
    return null;
  }

  var scaduto = false, occupato = false, messaggioTesto = '', ultimoLegato = null, ultimoControllo = 0;

  /* ---------- server ---------- */
  function chiama(percorso, corpo) {
    return fetch(PUSH_URL + percorso, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      .then(function (r) {
        return r.text().then(function (t) {
          var dati = null;
          try { dati = t ? JSON.parse(t) : null; } catch (e) {}
          return { stato: r.status, dati: dati };
        });
      });
  }
  function endpointPush() {
    var A = window.MaladhAvvisi;
    return A && A.endpoint ? A.endpoint() : Promise.resolve(null);
  }

  /* La pausa decisa dal server vale come quella dello switch (stessa funzione di js/tempo.js). */
  function applicaDalServer(pausa) {
    var t = T();
    if (!t) return;
    if (t.inPausa() !== !!pausa) t.impostaPausa(!!pausa, pausa ? 'marsa' : undefined);
  }
  function legamePerso() {
    scrivi(K, null); scrivi(K_SOSP, null);
    scaduto = true; ultimoLegato = null;
    disegna();
  }

  /* Ripete l'ultima scelta fatta con lo switch, se non è ancora arrivata al server. */
  function consegnaSospeso() {
    var c = codice(), p = sospeso();
    if (!c || p === null) return Promise.resolve(true);
    return chiama('/pausa', { codice: c, pausa: p }).then(function (r) {
      if (r.stato === 404) { legamePerso(); return false; }
      if (r.stato >= 200 && r.stato < 300) {
        if (sospeso() === p) scrivi(K_SOSP, null);
        salvaServer(p);
        if (!p) rinnovaAvvisi();          // pausa tolta: gli avvisi cancellati dal server si rifanno
        return true;
      }
      return false;
    }).catch(function () { return false; });
  }

  var inSincronia = null;
  function sincronizza() {
    if (!codice()) return Promise.resolve();
    if (inSincronia) return inSincronia;
    ultimoControllo = Date.now();
    inSincronia = consegnaSospeso().then(function (ok) {
      var c = codice();
      if (!ok || !c || sospeso() !== null) return;
      return chiama('/stato', { codice: c }).then(function (r) {
        if (r.stato === 404) { legamePerso(); return; }
        if (r.stato === 200 && r.dati && typeof r.dati.pausa === 'boolean') {
          if (!codice() || sospeso() !== null) return;         // lo switch è stato toccato mentre la richiesta era in volo
          var prima = serverVisto();
          salvaServer(r.dati.pausa);
          applicaDalServer(r.dati.pausa);
          if (!r.dati.pausa && prima) rinnovaAvvisi();
        }
      });
    }).catch(function () {}).then(function () { inSincronia = null; });
    return inSincronia;
  }

  /* Lo switch di Maladh è stato toccato: si dice anche al server (o si tiene da parte, senza rete). */
  function pausaScelta(e) {
    if (!codice() || !e.detail) return;
    scrivi(K_SOSP, JSON.stringify({ pausa: !!e.detail.pausa }));
    consegnaSospeso();
  }

  /* Una nuova iscrizione agli avvisi, dopo il collegamento, va legata al codice. */
  function legaIscrizione(endpoint) {
    var c = codice();
    if (!c || !endpoint || endpoint === ultimoLegato) return Promise.resolve();
    return chiama('/collega', { codice: c, endpoint: endpoint }).then(function (r) {
      if (r.stato === 200 && r.dati) {
        ultimoLegato = endpoint;
        if (r.dati.pausa === true && codice() && sospeso() === null) { salvaServer(true); applicaDalServer(true); }
      }
    }).catch(function () {});
  }
  function dimentica() { ultimoLegato = null; }
  function pausaDalServer() {
    if (!codice() || sospeso() !== null) return;           // una scelta con lo switch è ancora in viaggio: vale quella
    salvaServer(true);
    applicaDalServer(true);
  }

  /* ---------- collegare e scollegare ---------- */
  function collega() {
    if (occupato) return;
    occupato = true; scaduto = false; messaggio('');
    disegna();
    var c = generaCodice();
    endpointPush().then(function (endpoint) {
      var corpo = { codice: c };
      if (endpoint) corpo.endpoint = endpoint;
      return chiama('/collega', corpo).then(function (r) {
        if (r.stato === 200) {
          scrivi(K, JSON.stringify({ codice: c, server: false }));
          scrivi(K_SOSP, null);
          // ultimoLegato resta vuoto: il server lega solo un'iscrizione già presente, lo farà il prossimo /iscrivi.
          if (T() && T().inPausa()) {          // già in pausa: lo si dice al server, che parte da «non in pausa»
            scrivi(K_SOSP, JSON.stringify({ pausa: true }));
            return consegnaSospeso();
          }
        } else if (r.stato === 503) messaggio('Il collegamento non è disponibile in questo momento. Riprova più tardi.');
        else messaggio('Non sono riuscito a collegarmi. Riprova tra poco.');
      });
    }).catch(function () {
      messaggio('Non riesco a raggiungere il server. Riprova quando c\'è la rete.');
    }).then(function () { occupato = false; disegna(); });
  }
  function scollega() {
    var c = codice();
    if (!c || occupato) return;
    occupato = true; messaggio(''); disegna();
    chiama('/scollega', { codice: c }).then(function (r) {
      if (r.stato === 200 || r.stato === 404) {
        scrivi(K, null); scrivi(K_SOSP, null);
        ultimoLegato = null; scaduto = false;
      } else messaggio('Serve la connessione per scollegare.');
    }, function () {
      messaggio('Serve la connessione per scollegare.');
    }).then(function () { occupato = false; disegna(); });
  }
  function copia() {
    var c = codice();
    if (!c) return;
    var testo = aGruppi(c);
    var fatto = function () { messaggio('Copiato.'); };
    var ripiego = function () {
      var sel = window.getSelection && document.getSelection(), o = $('#mr-codice');
      if (!o || !sel) { messaggio('Seleziona il codice e copialo a mano.'); return; }
      var r = document.createRange(); r.selectNodeContents(o); sel.removeAllRanges(); sel.addRange(r);
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      messaggio(ok ? 'Copiato.' : 'Il codice è selezionato: copialo a mano.');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(testo).then(fatto, ripiego);
    else ripiego();
  }

  /* ---------- il blocco dentro «Giorni di pausa» ---------- */
  function messaggio(t) { messaggioTesto = t; var m = $('#mr-msg'); if (m) m.textContent = t; }

  function disegna() {
    var c = $('#tempo-marsa');
    if (!c) return;
    if (!c.getAttribute('data-pronto')) {
      c.setAttribute('data-pronto', '1');
      c.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('button[data-az]') : null;
        if (!b || b.disabled) return;
        var az = b.getAttribute('data-az');
        if (az === 'collega') collega(); else if (az === 'copia') copia(); else if (az === 'scollega') scollega();
      });
    }
    var cod = codice();
    var h = '<section class="mr-blocco" aria-labelledby="mr-titolo"><h3 class="mr-titolo" id="mr-titolo">Collega a Marsa</h3>';
    if (cod) {
      h += '<p class="nota">Il tuo codice</p>' +
        '<output class="mr-codice" id="mr-codice" aria-label="Codice del collegamento">' + aGruppi(cod) + '</output>' +
        '<div class="mr-azioni">' +
          '<button class="btn secondario" type="button" data-az="copia"' + (occupato ? ' disabled' : '') + '>Copia</button>' +
          '<button class="btn secondario" type="button" data-az="scollega"' + (occupato ? ' disabled' : '') + '>Scollega</button>' +
        '</div>' +
        '<p class="nota">Incollalo in Marsa, nella sezione Il ciclo. Quando segnerai l\'inizio, Maladh si metterà in pausa da sé.</p>';
    } else {
      h += '<button class="btn secondario" type="button" data-az="collega"' + (occupato ? ' disabled' : '') + '>Collega a Marsa</button>';
      if (scaduto) h += '<p class="nota">Il collegamento con Marsa è scaduto: puoi rifarlo.</p>';
    }
    h += '<p class="nota" id="mr-msg" role="status" aria-live="polite">' + esc(messaggioTesto) + '</p>' +
      '<p class="nota mr-privacy">Il server di Maladh saprà soltanto se sei in pausa o no, legato a un codice casuale: nessuna data, nessuno storico. Il legame si cancella dopo 60 giorni senza contatti.</p>' +
      '</section>';
    c.innerHTML = h;
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (x) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[x]; }); }

  /* ---------- eventi ---------- */
  document.addEventListener('maladh:tempo-vista', disegna);
  document.addEventListener('maladh:pausa-scelta', pausaScelta);
  window.addEventListener('online', sincronizza);
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && Date.now() - ultimoControllo > 60000) sincronizza();
  });
  if (codice()) setTimeout(sincronizza, 1000);          // all'apertura, solo se collegato

  window.MaladhMarsa = {
    collegato: function () { return !!codice(); },
    sincronizza: sincronizza,
    legaIscrizione: legaIscrizione,
    dimentica: dimentica,
    pausaDalServer: pausaDalServer
  };
})();
