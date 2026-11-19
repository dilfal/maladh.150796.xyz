/* Maladh – «Orari»: orari di preghiera e Qibla, calcolati su questo dispositivo con adhan-js (js/adhan.js).
   Il luogo sta solo in questo telefono (localStorage, «maladh.luogo»: nome e coordinate a due decimali) e non viene mai inviato da nessuna parte.
   Chiavi: maladh.luogo = {nome, lat, lon}; maladh.tempo = {metodo, asr, hijri}; maladh.pausa = "1" o assente; maladh.pausaDa = "marsa" se la pausa l'ha messa il collegamento con Marsa (js/marsa.js); maladh.digiuni = intero.
   Niente conti alla rovescia, niente serie di giorni, niente percentuali: gli orari sono un'informazione, non un compito.
   L'unico nome globale è window.MaladhTempo (l'API per gli altri file; la vista la apre app.js con mostra() e nascondi()). */
(function () {
  'use strict';

  var A = window.adhan;
  var K_LUOGO = 'maladh.luogo', K_TEMPO = 'maladh.tempo', K_PAUSA = 'maladh.pausa', K_PAUSADA = 'maladh.pausaDa', K_DIGIUNI = 'maladh.digiuni';
  var MIN = 60000, GIORNO = 86400000;

  var METODI = [
    ['MuslimWorldLeague', 'Lega musulmana mondiale'],
    ['MoonsightingCommittee', 'Moonsighting Committee'],
    ['Egyptian', 'Egitto'],
    ['UmmAlQura', 'Umm al-Qura'],
    ['Turkey', 'Turchia (Diyanet)'],
    ['NorthAmerica', 'ISNA']
  ];
  var SCUOLE = [['shafi', "Shafi'i, Maliki, Hanbali"], ['hanafi', 'Hanafi']];
  var CORREZIONI = [[-1, '−1 giorno'], [0, 'Nessuna'], [1, '+1 giorno']];

  /* I capoluoghi di regione italiani, al centro della città. */
  var CITTA = [
    ['Torino', 45.07, 7.69], ['Aosta', 45.74, 7.32], ['Milano', 45.46, 9.19], ['Trento', 46.07, 11.12],
    ['Venezia', 45.44, 12.32], ['Trieste', 45.65, 13.78], ['Genova', 44.41, 8.93], ['Bologna', 44.49, 11.34],
    ['Firenze', 43.77, 11.26], ['Perugia', 43.11, 12.39], ['Ancona', 43.62, 13.52], ['Roma', 41.90, 12.50],
    ["L'Aquila", 42.35, 13.40], ['Campobasso', 41.56, 14.66], ['Napoli', 40.85, 14.27], ['Bari', 41.12, 16.87],
    ['Potenza', 40.64, 15.80], ['Catanzaro', 38.91, 16.59], ['Palermo', 38.12, 13.36], ['Cagliari', 39.22, 9.12]
  ];

  /* Le voci dell'elenco, nell'ordine in cui compaiono; le prime sette sono il giorno, le ultime due la notte. */
  var GIORNO_VOCI = [
    ['fajr', 'Fajr'], ['alba', 'Sorgere del sole'], ['duha', 'Duha'], ['dhuhr', 'Dhuhr'],
    ['asr', 'Asr'], ['maghrib', 'Maghrib'], ['isha', 'Isha']
  ];
  var NOTTE_VOCI = [['metaNotte', 'Metà della notte'], ['ultimoTerzo', 'Ultimo terzo della notte']];
  var TUTTE = GIORNO_VOCI.concat(NOTTE_VOCI).map(function (v) { return v[0]; });

  /* ---------- memoria: ogni accesso a localStorage è protetto; se manca, i valori valgono finché la pagina resta aperta ---------- */
  function leggi(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function scrivi(k, v) {
    try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {}
  }
  function leggiJson(k) {
    var s = leggi(k);
    if (!s) return null;
    try { return JSON.parse(s); } catch (e) { return null; }
  }
  function due(x) { return Math.round(x * 100) / 100; }
  function esiste(lista, v) { return lista.some(function (x) { return x[0] === v; }); }

  var stLuogo = null, stImp = { metodo: 'MuslimWorldLeague', asr: 'shafi', hijri: 0 }, stPausa = false, stDigiuni = 0;

  (function carica() {
    var l = leggiJson(K_LUOGO);
    if (l && typeof l === 'object' && typeof l.lat === 'number' && typeof l.lon === 'number' &&
        isFinite(l.lat) && isFinite(l.lon) && Math.abs(l.lat) <= 90 && Math.abs(l.lon) <= 180) {
      stLuogo = { nome: typeof l.nome === 'string' && l.nome ? l.nome.slice(0, 40) : 'La tua posizione', lat: due(l.lat), lon: due(l.lon) };
    }
    var t = leggiJson(K_TEMPO);
    if (t && typeof t === 'object') {
      if (esiste(METODI, t.metodo)) stImp.metodo = t.metodo;
      if (esiste(SCUOLE, t.asr)) stImp.asr = t.asr;
      if (esiste(CORREZIONI, t.hijri)) stImp.hijri = t.hijri;
    }
    stPausa = leggi(K_PAUSA) === '1';
    var d = parseInt(leggi(K_DIGIUNI), 10);
    stDigiuni = isFinite(d) ? Math.max(0, Math.min(365, d)) : 0;
  })();

  function avvisa() {
    try { document.dispatchEvent(new CustomEvent('maladh:tempo')); } catch (e) {}
  }

  /* ---------- calcolo ---------- */
  function parametri(coord) {
    var f = A.CalculationMethod[stImp.metodo] || A.CalculationMethod.MuslimWorldLeague;
    var p = f.call(A.CalculationMethod);
    p.madhab = stImp.asr === 'hanafi' ? A.Madhab.Hanafi : A.Madhab.Shafi;
    p.highLatitudeRule = A.HighLatitudeRule.recommended(coord);
    return p;
  }

  function luogo() { return stLuogo ? { nome: stLuogo.nome, lat: stLuogo.lat, lon: stLuogo.lon } : null; }
  function inPausa() { return stPausa; }

  /* Gli orari del giorno di «data» (di default oggi), come oggetti Date. Senza luogo: null. */
  function orari(data) {
    if (!stLuogo || !A) return null;
    var d = data instanceof Date && !isNaN(data) ? data : new Date();
    try {
      var c = new A.Coordinates(stLuogo.lat, stLuogo.lon);
      var t = new A.PrayerTimes(c, d, parametri(c));
      var s = new A.SunnahTimes(t);
      return {
        fajr: t.fajr, alba: t.sunrise, duha: new Date(t.sunrise.getTime() + 15 * MIN), dhuhr: t.dhuhr,
        asr: t.asr, maghrib: t.maghrib, isha: t.isha, metaNotte: s.middleOfTheNight, ultimoTerzo: s.lastThirdOfTheNight
      };
    } catch (e) { return null; }
  }

  /* Gli orari futuri di oggi e dei giorni seguenti (in tutto «giorni» giorni, da oggi), ordinati: [{at: secondi, chiave}].
     «chiavi» è l'elenco di quelli che servono (di default tutti). Con la pausa attiva: sempre []. */
  function prossimi(giorni, chiavi) {
    var fuori = [];
    if (stPausa || !stLuogo) return fuori;
    var n = Math.max(1, Math.min(60, parseInt(giorni, 10) || 1));
    var vuoi = Array.isArray(chiavi) && chiavi.length ? chiavi : TUTTE;
    var adesso = Date.now(), oggi = new Date();
    for (var i = -1; i < n; i++) {       // da ieri: l'ultimo terzo della notte cominciata ieri può cadere dopo mezzanotte
      var o = orari(new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + i, 12));
      if (!o) continue;
      vuoi.forEach(function (k) {
        var t = o[k] instanceof Date ? o[k].getTime() : NaN;
        if (isFinite(t) && t > adesso) fuori.push({ at: Math.floor(t / 1000), chiave: k });
      });
    }
    fuori.sort(function (a, b) { return a.at - b.at; });
    return fuori;
  }

  /* ---------- modifiche: ognuna salva e lo dice agli altri con «maladh:tempo» ---------- */
  function impostaLuogo(nome, lat, lon) {
    stLuogo = { nome: String(nome).slice(0, 40), lat: due(lat), lon: due(lon) };
    scrivi(K_LUOGO, JSON.stringify(stLuogo));
    avvisa();
  }
  function salvaImp() { scrivi(K_TEMPO, JSON.stringify(stImp)); avvisa(); }
  /* «da» = 'marsa' quando la pausa arriva dal collegamento con Marsa (js/marsa.js); con lo switch è sempre assente. */
  function impostaPausa(v, da) {
    stPausa = !!v;
    scrivi(K_PAUSA, stPausa ? '1' : null);
    scrivi(K_PAUSADA, stPausa && da === 'marsa' ? 'marsa' : null);
    avvisa();
  }
  function pausaDaMarsa() { return stPausa && leggi(K_PAUSADA) === 'marsa'; }
  function impostaDigiuni(n) {
    stDigiuni = Math.max(0, Math.min(365, n | 0));
    scrivi(K_DIGIUNI, String(stDigiuni));
  }

  function p2(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------- date ---------- */
  function ora12(d, extra) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (extra || 0), 12); }
  function dataGregoriana(d) {
    var s = '';
    try { s = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d); } catch (e) {}
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }
  /* La data dell'Egira, con la correzione di −1, 0 o +1 giorni. Se il browser non conosce il calendario islamico, stringa vuota. */
  function dataEgira(d) {
    try {
      var f = new Intl.DateTimeFormat('it-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' });
      if (!f.resolvedOptions || f.resolvedOptions().calendar !== 'islamic-umalqura') return '';
      return f.format(ora12(d, stImp.hijri));
    } catch (e) { return ''; }
  }
  function hhmm(t) {
    return t instanceof Date && !isNaN(t) ? p2(t.getHours()) + ':' + p2(t.getMinutes()) : '—';
  }

  /* ---------- la vista ---------- */
  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function opzioni(lista, scelto) {
    return lista.map(function (x) { return '<option value="' + esc(x[0]) + '"' + (x[0] === scelto ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('');
  }

  var costruita = false, visibile = false, cambiando = false;
  var giornoMostrato = '', timer = 0;

  function html() {
    return '<div class="intesta"><h1>Orari</h1><p class="sotto">Le preghiere del giorno, dove sei.</p></div>' +

      '<section class="tp-luogo" aria-label="Luogo">' +
        '<p class="tp-luogo-riga" id="tp-con" hidden><span id="tp-nome"></span> · <button class="tp-cambia" id="tp-cambia" type="button" aria-expanded="false" aria-controls="tp-scelta">Cambia</button></p>' +
        '<div class="tp-scelta" id="tp-scelta">' +
          '<p id="tp-intro">Per gli orari serve sapere dove sei. La posizione resta su questo dispositivo.</p>' +
          '<button class="btn" id="tp-gps" type="button">Usa la mia posizione</button>' +
          '<div class="tp-campo"><label for="tp-citta">oppure scegli una città</label>' +
            '<select id="tp-citta"><option value="">Scegli…</option>' +
            CITTA.map(function (c, i) { return '<option value="' + i + '">' + esc(c[0]) + '</option>'; }).join('') + '</select></div>' +
          '<p class="nota" id="tp-msg" role="status" aria-live="polite"></p>' +
        '</div>' +
      '</section>' +

      '<div class="tp-date"><p class="data" id="tp-greg"></p><p class="data" id="tp-egira"></p></div>' +

      '<div id="tp-dati" hidden>' +
        '<ul class="tp-orari" id="tp-giorno" aria-label="Orari di oggi"></ul>' +
        '<ul class="tp-orari tp-notte" id="tp-notte" aria-label="La notte"></ul>' +

        '<section class="tp-qibla" aria-labelledby="tp-qibla-t">' +
          '<h2 class="sezione-titolo" id="tp-qibla-t">Qibla</h2>' +
          '<p id="tp-qibla-testo"></p>' +
          '<button class="btn secondario" id="tp-bussola" type="button" aria-expanded="false" aria-controls="tp-bussola-box">Bussola</button>' +
          '<div class="tp-bussola" id="tp-bussola-box" hidden>' +
            '<div class="tp-quadrante"><span class="tp-segno" aria-hidden="true"></span>' +
              '<svg id="tp-freccia" viewBox="0 0 200 200" role="img" aria-label="Freccia verso la Qibla"><circle cx="100" cy="100" r="92" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="2"/>' +
              '<path d="M100 22l22 52h-14v70h-16V74H78z" fill="currentColor"/><circle cx="100" cy="162" r="6" fill="none" stroke="currentColor" stroke-width="2.5"/></svg></div>' +
            '<p class="nota">Tieni il telefono in piano, lontano da oggetti di metallo.</p>' +
          '</div>' +
          '<p class="nota" id="tp-bussola-err" role="status" hidden>La bussola non è disponibile su questo dispositivo.</p>' +
        '</section>' +
      '</div>' +

      '<div id="tempo-avvisi"></div>' +

      '<details class="tp-dett"><summary>Giorni di pausa e Marsa</summary><div class="tp-corpo">' +
        '<label class="spunta" for="tp-pausa"><input type="checkbox" id="tp-pausa" role="switch"><span>Pausa dalla salat</span></label>' +
        '<p class="nota" id="tp-pausa-da" hidden>Pausa messa da Marsa.</p>' +
        '<p class="nota">Per i giorni delle mestruazioni o del puerperio. Gli orari restano in disparte e gli avvisi di Maladh si fermano finché non la togli. Il ricordo resta sempre: il <a href="#tasbih">Tasbih</a> e gli <a href="#adhkar">Adhkar</a> sono qui.</p>' +
        '<div id="tempo-marsa"></div>' +
      '</div></details>' +

      '<details class="tp-dett"><summary>Digiuni da recuperare</summary><div class="tp-corpo">' +
        '<div class="tp-contatore">' +
          '<button class="tp-tondo" id="tp-dig-meno" type="button" aria-label="Uno in meno">−</button>' +
          '<output class="tp-numero" id="tp-dig-n" aria-live="polite"></output>' +
          '<button class="tp-tondo" id="tp-dig-piu" type="button" aria-label="Uno in più">+</button>' +
        '</div>' +
        '<p class="nota">Solo un numero, per te. Nessuno storico, nessuna data.</p>' +
      '</div></details>' +

      '<details class="tp-dett"><summary>Metodo di calcolo</summary><div class="tp-corpo">' +
        '<div class="tp-campo"><label for="tp-metodo">Metodo di calcolo</label><select id="tp-metodo">' + opzioni(METODI, stImp.metodo) + '</select></div>' +
        '<div class="tp-campo"><label for="tp-asr">Asr</label><select id="tp-asr">' + opzioni(SCUOLE, stImp.asr) + '</select></div>' +
        '<div class="tp-campo"><label for="tp-hijri">Correzione della data dell\'Egira</label><select id="tp-hijri">' + opzioni(CORREZIONI, stImp.hijri) + '</select></div>' +
        '<p class="nota">I calcoli si fanno su questo dispositivo.</p>' +
      '</div></details>';
  }

  function costruisci() {
    var sez = $('#v-tempo');
    if (!sez || costruita) return;
    sez.innerHTML = html();
    costruita = true;

    $('#tp-gps').addEventListener('click', usaPosizione);
    $('#tp-citta').addEventListener('change', function (e) {
      var c = CITTA[parseInt(e.target.value, 10)];
      if (!c) return;
      cambiando = false;
      messaggio('');
      impostaLuogo(c[0], c[1], c[2]);
    });
    $('#tp-cambia').addEventListener('click', function () { cambiando = !cambiando; aggiorna(); if (cambiando) $('#tp-gps').focus(); });
    $('#tp-bussola').addEventListener('click', bussolaTocco);
    $('#tp-pausa').addEventListener('change', function (e) {
      impostaPausa(e.target.checked);
      try { document.dispatchEvent(new CustomEvent('maladh:pausa-scelta', { detail: { pausa: e.target.checked } })); } catch (x) {}      // js/marsa.js, se collegato
    });
    $('#tp-dig-meno').addEventListener('click', function () { impostaDigiuni(stDigiuni - 1); mostraDigiuni(); });
    $('#tp-dig-piu').addEventListener('click', function () { impostaDigiuni(stDigiuni + 1); mostraDigiuni(); });
    $('#tp-metodo').addEventListener('change', function (e) { if (esiste(METODI, e.target.value)) { stImp.metodo = e.target.value; salvaImp(); } });
    $('#tp-asr').addEventListener('change', function (e) { if (esiste(SCUOLE, e.target.value)) { stImp.asr = e.target.value; salvaImp(); } });
    $('#tp-hijri').addEventListener('change', function (e) {
      var v = parseInt(e.target.value, 10);
      if (esiste(CORREZIONI, v)) { stImp.hijri = v; salvaImp(); }
    });
  }

  function messaggio(t) { var m = $('#tp-msg'); if (m) m.textContent = t; }

  /* Una sola lettura della posizione; il nome è sempre «La tua posizione». */
  function usaPosizione() {
    if (!navigator.geolocation) { messaggio('La posizione non è disponibile su questo dispositivo. Puoi scegliere una città qui sotto.'); return; }
    messaggio('Sto cercando la posizione…');
    $('#tp-gps').disabled = true;
    navigator.geolocation.getCurrentPosition(function (p) {
      var b = $('#tp-gps'); if (b) b.disabled = false;
      cambiando = false;
      messaggio('');
      impostaLuogo('La tua posizione', p.coords.latitude, p.coords.longitude);
    }, function (err) {
      var b = $('#tp-gps'); if (b) b.disabled = false;
      messaggio(err && err.code === 1
        ? 'Non hai dato il permesso per la posizione. Puoi scegliere una città qui sotto.'
        : 'Non sono riuscito a leggere la posizione. Puoi riprovare, oppure scegliere una città qui sotto.');
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 });
  }

  function mostraDigiuni() {
    var n = $('#tp-dig-n');
    if (n) n.textContent = stDigiuni === 0 ? 'Nessuno' : String(stDigiuni);
    var m = $('#tp-dig-meno'), p = $('#tp-dig-piu');
    if (m) m.disabled = stDigiuni <= 0;
    if (p) p.disabled = stDigiuni >= 365;
  }

  function vuota(el) { while (el.firstChild) el.removeChild(el.firstChild); }
  function voce(lista, k, nome, o, prossima) {
    var li = document.createElement('li');
    if (k === prossima) { li.className = 'prossima'; li.setAttribute('aria-current', 'true'); }
    var a = document.createElement('span'); a.className = 'tp-nome'; a.textContent = nome;
    var t = document.createElement('time'); t.className = 'tp-ora';
    var d = o[k];
    t.textContent = hhmm(d);
    if (d instanceof Date && !isNaN(d)) t.setAttribute('datetime', d.toISOString());
    li.appendChild(a); li.appendChild(t);
    lista.appendChild(li);
  }

  function aggiornaOrari(adesso) {
    var o = orari(adesso);
    var g = $('#tp-giorno'), n = $('#tp-notte');
    if (!g || !n) return;
    vuota(g); vuota(n);
    if (!o) return;
    var prossima = '', t = adesso.getTime();
    /* Tra mezzanotte e l'alba la notte che conta è quella cominciata ieri: si mostra quella e la sua voce può essere la prossima. */
    var oNotte = o;
    if (o.fajr instanceof Date && t < o.fajr.getTime()) {
      var ieri = orari(new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate() - 1, 12));
      if (ieri) oNotte = ieri;
    }
    var dt = function (src, k) { return src[k] instanceof Date ? src[k].getTime() : NaN; };
    GIORNO_VOCI.map(function (v) { return [v[0], dt(o, v[0])]; })
      .concat(NOTTE_VOCI.map(function (v) { return [v[0], dt(oNotte, v[0])]; }))
      .filter(function (x) { return isFinite(x[1]) && x[1] > t; })
      .sort(function (a, b) { return a[1] - b[1]; })
      .slice(0, 1).forEach(function (x) { prossima = x[0]; });
    GIORNO_VOCI.forEach(function (v) { voce(g, v[0], v[1], o, prossima); });
    NOTTE_VOCI.forEach(function (v) { voce(n, v[0], v[1], oNotte, prossima); });
    g.classList.toggle('in-pausa', stPausa);
    n.classList.toggle('in-pausa', stPausa);
  }

  function aggiornaQibla() {
    var el = $('#tp-qibla-testo');
    if (!el) return;
    var q = qibla();
    el.textContent = q === null ? '' : 'La Qibla è a ' + q + '° da nord';
  }
  function qibla() {
    if (!stLuogo || !A) return null;
    try {
      var v = A.Qibla(new A.Coordinates(stLuogo.lat, stLuogo.lon));
      return isFinite(v) ? Math.round(v) % 360 : null;
    } catch (e) { return null; }
  }

  /* Ridisegna tutto ciò che dipende dal luogo, dalle impostazioni o dall'ora; i riquadri aperti restano come sono. */
  function aggiorna() {
    if (!costruita) return;
    var adesso = new Date();
    giornoMostrato = adesso.toDateString();
    var ha = !!stLuogo;
    $('#tp-con').hidden = !ha;
    $('#tp-scelta').hidden = ha && !cambiando;
    $('#tp-intro').hidden = ha;
    $('#tp-cambia').setAttribute('aria-expanded', ha && cambiando ? 'true' : 'false');
    if (ha) $('#tp-nome').textContent = stLuogo.nome;
    $('#tp-dati').hidden = !ha;
    $('#tp-greg').textContent = dataGregoriana(adesso);
    var eg = dataEgira(adesso), e = $('#tp-egira');
    e.textContent = eg; e.hidden = !eg;
    $('#tp-pausa').checked = stPausa;
    $('#tp-pausa-da').hidden = !pausaDaMarsa();
    $('#tp-metodo').value = stImp.metodo;
    $('#tp-asr').value = stImp.asr;
    $('#tp-hijri').value = String(stImp.hijri);
    mostraDigiuni();
    if (ha) { aggiornaOrari(adesso); aggiornaQibla(); }
    else if (bussolaAttiva) fermaBussola();
  }

  /* ---------- bussola ---------- */
  var bussolaAttiva = false, bussolaAscolta = false, bussolaAttesa = 0, primoDato = false;

  function messaggioBussola(vero) { var m = $('#tp-bussola-err'); if (m) m.hidden = !vero; }
  function ruota(heading) {
    var q = qibla(), f = $('#tp-freccia');
    if (q === null || !f) return;
    f.style.transform = 'rotate(' + (((q - heading) % 360) + 360) % 360 + 'deg)';
  }
  function suEvento(e) {
    var h = null;
    if (typeof e.webkitCompassHeading === 'number' && isFinite(e.webkitCompassHeading)) h = e.webkitCompassHeading;
    else if (e.type === 'deviceorientationabsolute' || e.absolute === true) {
      if (typeof e.alpha === 'number' && isFinite(e.alpha)) h = (360 - e.alpha) % 360;
    }
    if (h === null) return;
    if (!primoDato) { primoDato = true; clearTimeout(bussolaAttesa); }
    ruota(h);
  }
  function togliAscolto() {
    if (!bussolaAscolta) return;
    window.removeEventListener('deviceorientationabsolute', suEvento, true);
    window.removeEventListener('deviceorientation', suEvento, true);
    bussolaAscolta = false;
  }
  function fermaBussola() {
    clearTimeout(bussolaAttesa);
    togliAscolto();
    bussolaAttiva = false;
    var box = $('#tp-bussola-box'), b = $('#tp-bussola');
    if (box) box.hidden = true;
    if (b) b.setAttribute('aria-expanded', 'false');
  }
  function nonDisponibile() {
    fermaBussola();
    messaggioBussola(true);
  }
  function avviaAscolto() {
    primoDato = false;
    bussolaAttiva = true;
    messaggioBussola(false);
    $('#tp-bussola-box').hidden = false;
    $('#tp-bussola').setAttribute('aria-expanded', 'true');
    ruota(0);
    if (!bussolaAscolta) {
      window.addEventListener('deviceorientationabsolute', suEvento, true);
      window.addEventListener('deviceorientation', suEvento, true);      // iOS: webkitCompassHeading; altrove vale solo se «absolute»
      bussolaAscolta = true;
    }
    clearTimeout(bussolaAttesa);
    bussolaAttesa = setTimeout(function () { if (!primoDato) nonDisponibile(); }, 3000);
  }
  function bussolaTocco() {
    if (bussolaAttiva) { fermaBussola(); return; }
    var DO = window.DeviceOrientationEvent;
    if (!DO) { nonDisponibile(); return; }
    /* Su iOS il permesso si chiede nel gesto dell'utente: la chiamata sta subito nel gestore del tocco. */
    if (typeof DO.requestPermission === 'function') {
      var p;
      try { p = DO.requestPermission(); } catch (e) { nonDisponibile(); return; }
      Promise.resolve(p).then(function (r) { if (r === 'granted') avviaAscolto(); else nonDisponibile(); }, nonDisponibile);
    } else {
      avviaAscolto();
    }
  }

  /* ---------- ingresso e uscita dalla vista ---------- */
  function ticchetta() {
    if (!visibile || document.hidden) return;
    if (!$('#tp-dati').hidden) aggiornaOrari(new Date());                  // sposta l'evidenza sulla voce successiva
    if (giornoMostrato !== new Date().toDateString()) aggiorna();          // a mezzanotte cambiano giorno e date
  }
  function mostra() {
    costruisci();
    visibile = true;
    aggiorna();
    try { document.dispatchEvent(new CustomEvent('maladh:tempo-vista')); } catch (e) {}      // js/avvisi.js disegna la sua parte
    clearInterval(timer);
    timer = setInterval(ticchetta, 30000);
  }
  function nascondi() {
    visibile = false;
    clearInterval(timer);
    fermaBussola();
  }

  document.addEventListener('maladh:tempo', function () { if (visibile) aggiorna(); });
  document.addEventListener('visibilitychange', function () {
    if (!visibile) return;
    if (document.hidden) fermaBussola(); else aggiorna();                  // al ritorno in primo piano si ricalcola
  });

  window.MaladhTempo = {
    luogo: luogo,
    orari: orari,
    prossimi: prossimi,
    inPausa: inPausa,
    impostaPausa: impostaPausa,
    mostra: mostra,
    nascondi: nascondi
  };
})();
