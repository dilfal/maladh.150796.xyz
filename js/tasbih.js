/* Maladh – il Tasbih: un filo di perle da toccare.
   Il giro in corso si salva in localStorage («maladh.tasbih») solo per riprenderlo alla riapertura:
   nessuno storico, nessun totale, nessun conteggio dei giri. */
(function () {
  'use strict';

  var M = window.Maladh = window.Maladh || {};

  var CHIAVE = 'maladh.tasbih';
  var SEI_ORE = 6 * 3600 * 1000;
  var MAX_N = 1000000000;

  var DHIKR = [
    { ar: 'سُبْحَانَ اللَّهِ', it: 'Gloria a Dio' },
    { ar: 'الْحَمْدُ لِلَّهِ', it: 'Lode a Dio' },
    { ar: 'اللَّهُ أَكْبَرُ', it: 'Dio è più grande' },
    { ar: 'لَا إِلَهَ إِلَّا اللَّهُ', it: 'Non c’è divinità all’infuori di Dio' },
    { ar: 'أَسْتَغْفِرُ اللَّهَ', it: 'Chiedo perdono a Dio' },
    { ar: 'سُبْحَانَ اللَّهِ وَبِحَمْدِهِ', it: 'Gloria a Dio e lode a Lui' },
    { ar: 'لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللَّهِ', it: 'Non c’è forza né potere se non in Dio' },
    { ar: 'اللَّهُمَّ صَلِّ وَسَلِّمْ عَلَى نَبِيِّنَا مُحَمَّدٍ', it: 'O Dio, benedici e dona pace al nostro profeta Muhammad' }
  ];
  var GIRI = [{ v: 33, t: '33' }, { v: 100, t: '100' }, { v: 0, t: 'Libero' }];
  var NATURE = [{ v: '', t: 'Silenzio' }, { v: 'pioggia', t: 'Pioggia' }, { v: 'mare', t: 'Mare' }, { v: 'fiume', t: 'Fiume' }];
  var VOCI = [
    { p: 'bader/bader_dhikr_1000.mp3', t: 'Dhikr del giorno' },
    { p: 'bader/bader_baqiyat.mp3', t: 'Al-Bāqiyāt aṣ-Ṣāliḥāt' },
    { p: 'bader/bader_hawqala.mp3', t: 'Ḥawqala' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  /* ---------- stato: sempre letto e ripulito ---------- */
  // d: indice in DHIKR, oppure -1 se il testo viene da fuori (gli adhkar) e sta in «testo»
  // meta: 33, 100 oppure 0 (libero); n: conteggio del giro; t: istante dell'ultimo tocco
  function stringa(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
  function pulisciStato(r) {
    var s = { d: 0, meta: 33, n: 0, t: 0, testo: null };
    if (!r || typeof r !== 'object') return s;
    if (Number.isInteger(r.d) && r.d >= 0 && r.d < DHIKR.length) s.d = r.d;
    if (r.d === -1 && r.testo && typeof r.testo === 'object' && stringa(r.testo.ar, 4000)) {
      s.d = -1;
      s.testo = { ar: stringa(r.testo.ar, 4000), it: stringa(r.testo.it, 600) };
    }
    if (r.meta === 33 || r.meta === 100 || r.meta === 0) s.meta = r.meta;
    if (Number.isInteger(r.n) && r.n >= 0 && r.n <= MAX_N) s.n = r.n;
    if (typeof r.t === 'number' && isFinite(r.t) && r.t > 0) s.t = r.t;
    if (s.meta && s.n > s.meta) s.n = 0;
    return s;
  }
  function leggi() {
    try { return pulisciStato(JSON.parse(localStorage.getItem(CHIAVE) || 'null')); } catch (e) { return pulisciStato(null); }
  }
  var stato = leggi();
  function salva() { try { localStorage.setItem(CHIAVE, JSON.stringify(stato)); } catch (e) {} }

  /* Se è passato troppo tempo dall'ultimo tocco, il giro riparte da zero, senza dire nulla. */
  function controllaVecchio() {
    if (stato.n > 0 && stato.t && Date.now() - stato.t > SEI_ORE) { stato.n = 0; stato.t = 0; salva(); return true; }
    return false;
  }

  /* ---------- disegno ---------- */
  var vista = null, el = {}, perle = [], nPerle = 0, costruito = false;

  function testoCorrente() {
    if (stato.d === -1 && stato.testo) return stato.testo;
    return DHIKR[stato.d] || DHIKR[0];
  }

  function costruisci() {
    vista.innerHTML =
      '<div class="tb-testo">' +
        '<p class="ar tb-ar" id="tb-ar" lang="ar" dir="rtl"></p>' +
        '<p class="tb-it" id="tb-it"></p>' +
      '</div>' +
      '<div class="tb-zona">' +
        '<button class="tb-bottone" id="tb-bottone" type="button" aria-label="Conta">' +
          '<svg viewBox="0 0 200 200" aria-hidden="true" focusable="false"><g id="tb-perle"></g><circle class="tb-disco" cx="100" cy="100" r="66"/><text class="tb-num" id="tb-num" x="100" y="100" font-size="56">0</text></svg>' +
          '<span class="tb-alone" id="tb-alone"></span>' +
        '</button>' +
      '</div>' +
      '<p class="tb-stato" id="tb-stato" role="status" aria-live="polite"></p>' +
      '<p class="tb-ricomincia"><button class="btn-testo" id="tb-ricomincia" type="button">Ricomincia</button></p>' +
      '<div id="tb-scelte"></div>';

    ['ar', 'it', 'bottone', 'perle', 'num', 'alone', 'stato', 'ricomincia', 'scelte'].forEach(function (k) { el[k] = document.getElementById('tb-' + k); });

    var bt = el.bottone;
    // pointerdown: risposta immediata, senza aspettare il click. Il click conta solo se viene dalla tastiera o dall'assistenza (detail 0).
    bt.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.isPrimary === false) return;
      tocca();
    });
    bt.addEventListener('click', function (e) { if (e.detail === 0) tocca(); });
    bt.addEventListener('keydown', function (e) {
      if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault();      // tenere premuto non conta a raffica
    });
    bt.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    el.ricomincia.addEventListener('click', function () { stato.n = 0; stato.t = Date.now(); salva(); aggiornaNumero(); aggiornaPerle(); aggiornaStato(); });

    el.scelte.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button[data-az]') : null;
      if (!b) return;
      scegli(b.getAttribute('data-az'), b.getAttribute('data-v'));
    });
    costruito = true;
  }

  function costruisciPerle() {
    var n = stato.meta === 100 ? 100 : 33;
    if (n === nPerle) return;
    nPerle = n;
    var raggioAnello = 86, r = n === 100 ? 2.35 : 6.1, html = '';
    for (var i = 0; i < n; i++) {
      var ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;          // la prima perla sta in alto
      var x = 100 + raggioAnello * Math.cos(ang), y = 100 + raggioAnello * Math.sin(ang);
      html += '<circle class="perla" cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="' + r + '"/>';
    }
    el.perle.innerHTML = html;
    perle = Array.prototype.slice.call(el.perle.children);
  }

  function accese() {
    if (stato.n <= 0) return 0;
    if (stato.meta === 100) return Math.min(stato.n, 100);
    if (stato.meta === 33) return Math.min(stato.n, 33);
    return ((stato.n - 1) % 33) + 1;                          // libero: le 33 perle girano a ciclo
  }
  function aggiornaPerle() {
    costruisciPerle();
    var k = accese();
    for (var i = 0; i < perle.length; i++) perle[i].classList.toggle('on', i < k);
  }
  function aggiornaNumero() {
    var s = String(stato.n);
    el.num.textContent = s;
    el.num.setAttribute('font-size', s.length <= 3 ? '56' : (s.length <= 5 ? '44' : '34'));
    el.bottone.setAttribute('aria-label', 'Conta. ' + s);
  }
  function aggiornaStato() {
    el.stato.textContent = (stato.meta && stato.n === stato.meta) ? 'Giro compiuto.' : '';
  }
  function aggiornaTesto() {
    var t = testoCorrente();
    el.ar.textContent = t.ar;
    el.ar.classList.toggle('lungo', t.ar.length > 60);
    el.it.textContent = t.it || '';
  }

  function chip(az, v, testo, premuto, extra) {
    return '<button class="chip' + (extra && extra.ar ? ' chip-ar' : '') + '" type="button" data-az="' + az + '" data-v="' + esc(v) + '" aria-pressed="' + (premuto ? 'true' : 'false') + '"' +
      (extra && extra.ar ? ' lang="ar" dir="rtl"' : '') + (extra && extra.etichetta ? ' aria-label="' + esc(extra.etichetta) + '"' : '') + '>' + esc(testo) + '</button>';
  }
  function aggiornaScelte() {
    var A = M.Audio, P = M.Pacchetto;
    var html = '';

    html += '<div class="gruppo"><p class="gruppo-etichetta">Dhikr</p><div class="chips">';
    DHIKR.forEach(function (d, i) { html += chip('dhikr', String(i), d.ar, stato.d === i, { ar: true, etichetta: d.it }); });
    html += '</div></div>';

    html += '<div class="gruppo"><p class="gruppo-etichetta">Giro</p><div class="chips">';
    GIRI.forEach(function (g) { html += chip('giro', String(g.v), g.t, stato.meta === g.v); });
    html += '</div></div>';

    var nat = A ? A.naturaCorrente() : '';
    html += '<div class="gruppo"><p class="gruppo-etichetta">Sottofondo</p><div class="chips">';
    NATURE.forEach(function (n) { html += chip('natura', n.v, n.t, nat === n.v); });
    html += '</div></div>';

    var presenti = VOCI.filter(function (v) { return P && P.ha(v.p); });
    if (presenti.length) {
      var cur = A ? A.corrente() : null;
      html += '<div class="gruppo"><p class="gruppo-etichetta">Voce</p><div class="chips">';
      presenti.forEach(function (v) { html += chip('voce', v.p, v.t, cur === v.p); });
      html += chip('voce', '', 'Nessuna', !presenti.some(function (v) { return cur === v.p; }));
      html += '</div></div>';
    }
    var att = document.activeElement, az = null, vv = null;
    if (att && el.scelte.contains(att) && att.getAttribute) { az = att.getAttribute('data-az'); vv = att.getAttribute('data-v'); }
    el.scelte.innerHTML = html;
    if (az !== null) {                 // il fuoco della tastiera resta sul bottone scelto
      var bottoni = el.scelte.querySelectorAll('button[data-az]');
      for (var i = 0; i < bottoni.length; i++) {
        if (bottoni[i].getAttribute('data-az') === az && bottoni[i].getAttribute('data-v') === vv) { bottoni[i].focus(); break; }
      }
    }
  }

  function scegli(az, v) {
    var A = M.Audio;
    if (az === 'dhikr') {
      stato.d = parseInt(v, 10); stato.testo = null; stato.n = 0; stato.t = Date.now();
    } else if (az === 'giro') {
      stato.meta = parseInt(v, 10);
      if (stato.meta && stato.n > stato.meta) stato.n = 0;
      stato.t = Date.now();
    } else if (az === 'natura') {
      if (A) A.natura(v);
      aggiornaScelte();
      return;
    } else if (az === 'voce') {
      if (!A) return;
      if (v) {
        var voce = VOCI.filter(function (x) { return x.p === v; })[0];
        if (voce) A.ascolta({ percorso: voce.p, titolo: voce.t, ciclo: true });
      } else {
        var cur = A.corrente();
        if (cur && VOCI.some(function (x) { return x.p === cur; })) A.ferma();
      }
      return;                          // le scelte si ridisegnano dall'evento maladh:ascolto
    }
    salva();
    aggiornaTesto(); aggiornaNumero(); aggiornaPerle(); aggiornaStato(); aggiornaScelte();
  }

  /* ---------- il tocco ---------- */
  function ripeti(nodo, classe, ms) {
    nodo.classList.remove(classe);
    void nodo.offsetWidth;
    nodo.classList.add(classe);
    setTimeout(function () { nodo.classList.remove(classe); }, ms);
  }
  function tocca() {
    if (!costruito) return;
    controllaVecchio();
    if (stato.meta && stato.n >= stato.meta) stato.n = 1;
    else if (stato.n < MAX_N) stato.n++;
    stato.t = Date.now();
    salva();

    if (M.Audio) M.Audio.tocco();
    try { if (navigator.vibrate) navigator.vibrate(8); } catch (e) {}

    aggiornaNumero(); aggiornaPerle(); aggiornaStato();
    ripeti(el.bottone, 'batte', 200);
    if (stato.meta && stato.n === stato.meta) {
      if (M.Audio) M.Audio.fine();
      ripeti(el.alone, 'va', 1500);
    }
  }

  /* ---------- API ---------- */
  function mostra() {
    vista = vista || document.getElementById('v-tasbih');
    if (!vista) return;
    if (!costruito) costruisci();
    controllaVecchio();
    aggiornaTesto(); aggiornaNumero(); aggiornaPerle(); aggiornaStato(); aggiornaScelte();
  }

  /* Apre il Tasbih con un testo arabo qualsiasi (serve alla lettura degli adhkar). */
  function apri(o) {
    o = o || {};
    var ar = stringa(o.ar, 4000);
    if (ar) {
      stato.d = -1;
      stato.testo = { ar: ar, it: stringa(o.it, 600) };
      stato.n = 0; stato.t = Date.now();
      var m = o.meta === 100 ? 100 : (o.meta === 33 ? 33 : 0);
      stato.meta = m;
      salva();
    }
    if (location.hash !== '#tasbih') location.hash = '#tasbih'; else mostra();
  }

  M.Tasbih = { apri: apri, mostra: mostra, _pulisciStato: pulisciStato };

  document.addEventListener('maladh:ascolto', function () { if (costruito) aggiornaScelte(); });
  document.addEventListener('maladh:natura', function () { if (costruito) aggiornaScelte(); });
  document.addEventListener('maladh:pacchetto', function () { if (costruito) aggiornaScelte(); });
})();
