/* Maladh – guscio dell'app: navigazione, «Adesso», «Adhkar», finestra «Su Maladh», versione e service worker.
   Il Tasbih sta in js/tasbih.js, i suoni in js/audio.js, le registrazioni in js/pacchetto.js,
   «Awrad» in js/awrad.js e il Santuario interiore in js/santuario.js (usa i pezzi comuni di Maladh.Ui).
   Maladh non chiede nulla e non conta nulla: niente giorni di fila, niente storico, niente promemoria. */
(function () {
  'use strict';

  var M = window.Maladh = window.Maladh || {};
  function $(sel) { return document.querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function categorie() { return Array.isArray(M.Adhkar) ? M.Adhkar : []; }
  function categoria(k) { return categorie().filter(function (c) { return c.k === k; })[0] || null; }
  /* Gruppo di una categoria: «momenti», «protezione» o «situazioni». Senza «g» (forma vecchia dei dati) vale «momenti». */
  function gruppoDi(c) { return c && (c.g === 'protezione' || c.g === 'situazioni') ? c.g : 'momenti'; }
  var GRUPPI = [
    { g: 'momenti', titolo: 'Momenti del giorno' },
    { g: 'protezione', titolo: 'Protezione' },
    { g: 'situazioni', titolo: 'Per ogni situazione' }
  ];

  var FRECCIA = '<svg class="freccia" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var ICONA_PLAY = 'M8 5.2v13.6L19 12z';
  var ICONA_PAUSA = 'M7 5h3.4v14H7zM13.6 5H17v14h-3.4z';
  function svgPlay(suona) {
    return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="' + (suona ? ICONA_PAUSA : ICONA_PLAY) + '" fill="currentColor"/></svg>';
  }

  /* ---------- navigazione con l'hash: #adesso, #tasbih, #adhkar, #adhkar/<chiave>, #awrad, #awrad/<chiave>,
     #santuario, #santuario/<stato> ---------- */
  var VISTE = ['adesso', 'tasbih', 'adhkar', 'awrad', 'santuario'];
  var vistaAttuale = '', chiaveAttuale = '';

  function leggiHash() {
    var h = (location.hash || '').replace(/^#/, '');
    var parti = h.split('/');
    var v = VISTE.indexOf(parti[0]) >= 0 ? parti[0] : 'adesso';
    var k = '';
    if ((v === 'adhkar' || v === 'awrad' || v === 'santuario') && parti[1]) { try { k = decodeURIComponent(parti[1]); } catch (e) { k = ''; } }
    return { v: v, k: k };
  }

  function vai() {
    var r = leggiHash();
    var chiave = r.v + '/' + r.k;
    var cambiata = chiave !== chiaveAttuale;
    VISTE.forEach(function (v) {
      var sez = document.getElementById('v-' + v);
      if (sez) sez.hidden = v !== r.v;
    });
    var inBarra = r.v === 'santuario' ? 'adesso' : r.v;          // il Santuario si apre da «Adesso» e non ha una voce sua
    Array.prototype.forEach.call(document.querySelectorAll('#barra a'), function (a) {
      if (a.getAttribute('data-vista') === inBarra) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    vistaAttuale = r.v; chiaveAttuale = chiave;

    if (r.v === 'adesso') disegnaAdesso(true);
    else if (r.v === 'tasbih') { if (M.Tasbih) M.Tasbih.mostra(); }
    else if (r.v === 'awrad') { if (M.Awrad) M.Awrad.mostra(r.k); }
    else if (r.v === 'santuario') { if (M.Santuario) M.Santuario.mostra(r.k); }
    else disegnaAdhkar(r.k);

    if (cambiata) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', vai);

  /* ---------- Adesso ---------- */
  function fascia(h) {
    if (h >= 4 && h < 11) return 'mattino';
    if (h >= 11 && h < 15) return 'preghiera';
    if (h >= 15 && h < 20) return 'sera';
    return 'sonno';                      // dalle 20 alle 4
  }
  function saluto(h) {
    if (h >= 5 && h < 13) return 'Buongiorno';
    if (h >= 13 && h < 18) return 'Buon pomeriggio';
    if (h >= 18 && h < 22) return 'Buonasera';
    return 'Buonanotte';
  }
  function dataOggi(d) {
    var s = '';
    try { s = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d); } catch (e) {}
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }
  function dataLunare(d) {
    try { return new Intl.DateTimeFormat('it-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric' }).format(d); } catch (e) { return ''; }
  }
  function rigaCategoria(c, extra) {
    return '<li><a class="riga" href="#adhkar/' + encodeURIComponent(c.k) + '"><span class="riga-testo"><span class="riga-titolo">' + esc(c.titolo) + '</span>' +
      (c.sotto ? '<span class="riga-sotto">' + esc(c.sotto) + '</span>' : '') + '</span>' + FRECCIA + '</a></li>';
  }

  /* ---- «Aya del giorno» e «Una parola»: scelta deterministica, senza salvare nulla ----
     Il numero del giorno locale (lo stesso per tutta la giornata, cambia a mezzanotte) decide quale. */
  function numeroGiorno(d) { return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); }
  function ayaDelGiorno(d) {
    var A = M.Aya;
    if (!Array.isArray(A) || !A.length) return null;
    return A[numeroGiorno(d) % A.length] || null;
  }
  function ayaIt(k) {
    var T = M.AyaIt, t = T && typeof T === 'object' ? T[k] : null;
    return t && typeof t.it === 'string' && t.it ? t : null;          // senza traduzione si mostrano solo arabo e riferimento
  }
  /* Le frasi adatte alla fascia: quelle con la traduzione e senza «m» (valgono sempre) o con la fascia in «m». */
  function frasiPerFascia(f) {
    var F = M.Frasi, T = M.FrasiIt;
    if (!Array.isArray(F) || !T || typeof T !== 'object') return [];
    return F.filter(function (x) {
      var t = x && x.ar && T[x.k];
      if (!t || typeof t.it !== 'string' || !t.it) return false;
      return !Array.isArray(t.m) || !t.m.length || t.m.indexOf(f) >= 0;
    });
  }
  function parolaDelGiorno(d, f) {
    var c = frasiPerFascia(f);
    return c.length ? c[numeroGiorno(d) % c.length] : null;
  }
  /* «etichetta» e «idEtichetta» cambiano nel Santuario, dove la stessa scheda si chiama «Un versetto». */
  function htmlAya(a, etichetta, idEtichetta) {
    var t = ayaIt(a.k);
    var id = idEtichetta || 'aya-etichetta';
    var s = '<section class="aya" aria-labelledby="' + id + '">' +
      '<h2 class="aya-etichetta" id="' + id + '">' + esc(etichetta || 'Aya del giorno') + '</h2>' +
      '<p class="ar" lang="ar" dir="rtl">' + esc(a.ar) + '</p>';
    if (t) s += '<p class="aya-it">' + esc(t.it) + '</p>';
    s += '<p class="aya-rif">' + esc(a.rif) + '</p>';
    if (t) {
      if (t.nota) s += '<p class="aya-nota">' + esc(t.nota) + '</p>';
      s += '<a class="aya-link" href="https://sakina.150796.xyz/" target="_blank" rel="noopener" aria-label="Ascolta la sura in Sakina (si apre in una nuova scheda)">Ascolta la sura in Sakina</a>';
    }
    return s + '</section>';
  }
  function htmlParola(p) {
    var t = M.FrasiIt[p.k];
    return '<figure class="parola"><p class="ar" lang="ar" dir="rtl">' + esc(p.ar) + '</p>' +
      '<blockquote>' + esc(t.it) + '</blockquote>' +
      '<figcaption>' + esc(p.fonte) + '</figcaption></figure>';
  }

  var firmaAdesso = '';
  function disegnaAdesso(forza) {
    var sez = $('#v-adesso');
    if (!sez) return;
    var ora = new Date(), h = ora.getHours();
    var f = fascia(h);
    var risveglio = h >= 4 && h < 9;
    var nAya = Array.isArray(M.Aya) ? M.Aya.length : 0, nFrasi = Array.isArray(M.Frasi) ? M.Frasi.length : 0;
    var firma = [saluto(h), f, risveglio, ora.toDateString(), categorie().length, nAya, nFrasi].join('|');
    if (!forza && firma === firmaAdesso) return;
    firmaAdesso = firma;

    var data = dataOggi(ora), lunare = dataLunare(ora);
    var cat = categoria(f), ris = risveglio ? categoria('risveglio') : null;
    var html = '<h1 class="saluto">' + esc(saluto(h)) + '</h1>';
    if (data) html += '<p class="data">' + esc(data) + '</p>';
    if (lunare) html += '<p class="data">' + esc(lunare) + '</p>';

    if (cat) {
      html += '<a class="momento" href="#adhkar/' + encodeURIComponent(cat.k) + '">' +
        '<span class="momento-etichetta">Per questo momento</span>' +
        '<span class="momento-titolo">' + esc(cat.titolo) + '</span>' +
        '<span class="momento-sotto">' + esc(cat.sotto || '') + '</span></a>';
    }
    html += '<ul class="lista">';
    if (ris) html += rigaCategoria(ris);
    html += '<li><a class="riga" href="#tasbih"><span class="riga-testo"><span class="riga-titolo">Tasbih</span><span class="riga-sotto">Il filo di perle, quando vuoi</span></span>' + FRECCIA + '</a></li>';
    html += '</ul>';
    if (M.Santuario) html += M.Santuario.htmlScelta();

    var aya = ayaDelGiorno(ora);
    if (aya) html += htmlAya(aya);

    var altre = categorie().filter(function (c) { return gruppoDi(c) === 'momenti' && !(cat && c.k === cat.k) && !(ris && c.k === ris.k); });
    if (altre.length) {
      html += '<h2 class="sezione-titolo">Altri momenti</h2><ul class="lista">' + altre.map(function (c) { return rigaCategoria(c); }).join('') + '</ul>';
    }
    var parola = parolaDelGiorno(ora, f);
    if (parola) html += htmlParola(parola);
    sez.innerHTML = html;
  }

  /* ---------- Adhkar ---------- */
  var catAperta = null;          // categoria mostrata nel dettaglio (serve ai bottoni)

  /* La traduzione di una voce: prima quella valida solo in una categoria («<id>@<chiave>»), poi quella generale («<id>»). */
  function traduzione(id, chiaveCat) {
    var T = M.AdhkarIt;           // può essere vuoto o mancare: allora non si mostra nulla
    if (!T || typeof T !== 'object') return '';
    var t = chiaveCat ? T[id + '@' + chiaveCat] : undefined;
    if (typeof t !== 'string' || !t) t = T[id];
    return typeof t === 'string' ? t : '';
  }

  /* I bottoni portano la categoria (data-cat) e la voce: così funzionano anche fuori dal dettaglio di una categoria. */
  function htmlVoce(cat, v) {
    var dataCat = ' data-cat="' + esc(cat ? cat.k : '') + '"';
    var n = Number(v.n) || 1;
    var s = '<article class="voce">';
    if (v.t) s += '<p class="voce-titolo">' + esc(v.t) + '</p>';
    s += '<p class="ar" lang="ar" dir="rtl">' + esc(v.ar) + '</p>';
    var note = Array.isArray(v.note) ? v.note : (v.note ? [v.note] : []);       // oggi un elenco; nella forma vecchia una stringa
    note = note.filter(function (x) { return x; });
    if (note.length) s += '<div class="voce-note">' + note.map(function (x) { return '<p class="ar" lang="ar" dir="rtl">' + esc(x) + '</p>'; }).join('') + '</div>';
    var it = traduzione(v.id, cat && cat.k);
    if (it) s += '<p class="voce-it">' + esc(it) + '</p>';

    var piede = '';
    if (n >= 2 && n <= 9) {
      piede += '<button class="pillola" type="button" data-n="' + n + '" data-i="0" aria-label="Conteggio: 0 di ' + n + '. Tocca per avanzare.">0 / ' + n + '</button>';
    } else if (n >= 10) {
      piede += '<button class="btn secondario" type="button" data-tasbih="' + esc(v.id) + '"' + dataCat + '>Conta nel Tasbih</button>';
    }
    var p = 'hisn/' + v.id + '.mp3';
    if (M.Pacchetto && M.Pacchetto.ha(p)) {
      var suona = !!(M.Audio && M.Audio.inAscolto() === p);
      piede += '<button class="btn-play" type="button" data-p="' + esc(p) + '"' + dataCat + ' aria-pressed="' + suona + '" aria-label="Ascolta">' + svgPlay(suona) + '</button>';
    }
    if (piede) s += '<div class="voce-piede">' + piede + '</div>';
    return s + '</article>';
  }

  function disegnaAdhkar(k) {
    var sez = $('#v-adhkar');
    if (!sez) return;
    var cat = k ? categoria(k) : null;
    catAperta = cat;
    var html = '';
    if (!cat) {
      html += '<div class="intesta"><h1>Adhkar</h1><p class="sotto">Ricordi di Dio per ogni momento.</p></div>';
      GRUPPI.forEach(function (gr) {
        var dentro = categorie().filter(function (c) { return gruppoDi(c) === gr.g; });
        if (!dentro.length) return;                         // una sezione vuota non compare
        html += '<h2 class="sezione-titolo">' + esc(gr.titolo) + '</h2><ul class="lista">' +
          dentro.map(function (c) { return rigaCategoria(c); }).join('') + '</ul>';
      });
    } else {
      html += '<a class="indietro" href="#adhkar"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Indietro</a>';
      html += '<div class="intesta"><h1>' + esc(cat.titolo) + '</h1>' + (cat.sotto ? '<p class="sotto">' + esc(cat.sotto) + '</p>' : '') + '</div>';
      var tutto = cat.k === 'mattino' ? 'bader/bader_adhkar_mattino.mp3' : (cat.k === 'sera' ? 'bader/bader_adhkar_sera.mp3' : '');
      if (tutto && M.Pacchetto && M.Pacchetto.ha(tutto)) {
        var suona = !!(M.Audio && M.Audio.inAscolto() === tutto);
        html += '<div class="azioni-testa"><button class="btn secondario btn-tutto btn-play-tutto" type="button" data-p="' + tutto + '" aria-pressed="' + suona + '">' +
          '<span class="ico">' + svgPlay(suona) + '</span><span>Ascolta tutto</span></button></div>';
      }
      html += (cat.voci || []).map(function (v) { return htmlVoce(cat, v); }).join('');
      html += '<p class="fonte">Fonte: Ḥiṣn al-Muslim, Saʿīd ibn ʿAlī al-Qaḥṭānī.</p>';
    }
    sez.innerHTML = html;
  }

  function suonaOPausa(p, titolo) {
    var A = M.Audio;
    if (!A) return;
    if (A.inAscolto() === p) A.pausa();
    else if (A.corrente() === p) A.riprendi();
    else A.ascolta({ percorso: p, titolo: titolo, ciclo: false });
  }

  /* I bottoni delle voci, in «Adhkar» e nel Santuario. Senza data-cat (è «Ascolta tutto») vale la categoria aperta. */
  function clicVoce(e) {
    var t = e.target.closest ? e.target.closest('button') : null;
    if (!t) return;
    var cat = categoria(t.getAttribute('data-cat') || '') || catAperta;
    if (t.classList.contains('pillola')) {
      var n = parseInt(t.getAttribute('data-n'), 10), i = parseInt(t.getAttribute('data-i'), 10);
      i = i >= n ? 0 : i + 1;                                   // all'ultimo tocco diventa dorata; il seguente torna a 0
      t.setAttribute('data-i', String(i));
      t.textContent = i + ' / ' + n;
      t.classList.toggle('piena', i === n);
      t.setAttribute('aria-label', 'Conteggio: ' + i + ' di ' + n + '. Tocca per ' + (i === n ? 'ricominciare' : 'avanzare') + '.');
      if (M.Audio) M.Audio.tocco();
    } else if (t.hasAttribute('data-tasbih')) {
      var id = t.getAttribute('data-tasbih');
      var voce = cat ? (cat.voci || []).filter(function (v) { return String(v.id) === id; })[0] : null;
      if (voce && M.Tasbih) M.Tasbih.apri({ ar: voce.ar, it: traduzione(voce.id, cat.k), meta: Number(voce.n) === 100 ? 100 : 'libero' });
    } else if (t.hasAttribute('data-p')) {
      suonaOPausa(t.getAttribute('data-p'), cat ? cat.titolo : 'Maladh');
    }
  }
  ['#v-adhkar', '#v-santuario'].forEach(function (s) { var n = $(s); if (n) n.addEventListener('click', clicVoce); });

  /* I pezzi comuni che servono anche al Santuario (js/santuario.js). */
  M.Ui = {
    esc: esc, FRECCIA: FRECCIA, categoria: categoria, rigaCategoria: rigaCategoria,
    htmlVoce: htmlVoce, htmlAya: htmlAya, htmlParola: htmlParola, numeroGiorno: numeroGiorno
  };

  /* I bottoni di ascolto seguono ciò che suona. */
  document.addEventListener('maladh:ascolto', function (e) {
    var suona = e.detail;
    Array.prototype.forEach.call(document.querySelectorAll('main [data-p]'), function (b) {
      var on = b.getAttribute('data-p') === suona;
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      var cont = b.querySelector('.ico') || b;
      cont.innerHTML = svgPlay(on);
      if (b.classList.contains('btn-play')) {
        var nome = b.getAttribute('data-titolo');              // in «Awrad» ogni ▶ dice quale traccia ascolta
        b.setAttribute('aria-label', on ? 'Pausa' : (nome ? 'Ascolta ' + nome : 'Ascolta'));
      }
    });
  });
  document.addEventListener('maladh:pacchetto', function () {
    if (vistaAttuale === 'adhkar' || vistaAttuale === 'santuario') {
      var y = window.scrollY;
      if (vistaAttuale === 'adhkar') disegnaAdhkar(leggiHash().k);
      else if (M.Santuario) M.Santuario.mostra(leggiHash().k);
      window.scrollTo(0, y);
    }
    aggiornaPacchettoUI();
  });

  /* ---------- finestra «Su Maladh» ---------- */
  var sheet = $('#sheet'), card = $('#sheet-card');
  var aperta = false, apertaDa = null;
  var SFONDO = ['#top', '#main', '#barra', '#lettore'];

  function apriFinestra() {
    if (aperta) return;
    apertaDa = document.activeElement;
    aperta = true;
    SFONDO.forEach(function (s) { var n = $(s); if (n) n.inert = true; });
    $('#opt-suono').checked = M.Audio ? M.Audio.impostazioni().suono : true;
    aggiornaPacchettoUI();
    sheet.hidden = false;
    card.scrollTop = 0;
    card.focus();
  }
  function chiudiFinestra() {
    if (!aperta) return;
    aperta = false;
    sheet.hidden = true;
    SFONDO.forEach(function (s) { var n = $(s); if (n) n.inert = false; });
    /* il fuoco torna dov'era (di solito il bottone «i»); se quell'elemento è sparito, al bottone «i» */
    var da = apertaDa && apertaDa !== document.body && document.body.contains(apertaDa) ? apertaDa : $('#btn-info');
    apertaDa = null;
    da.focus();
  }
  M.apriSuMaladh = apriFinestra;       // serve anche a «Awrad», quando mancano le registrazioni
  $('#btn-info').addEventListener('click', apriFinestra);
  $('#sheet-chiudi').addEventListener('click', chiudiFinestra);
  sheet.addEventListener('click', function (e) { if (e.target === sheet) chiudiFinestra(); });
  document.addEventListener('keydown', function (e) {
    if (!aperta) return;
    if (e.key === 'Escape') { e.preventDefault(); chiudiFinestra(); return; }
    if (e.key !== 'Tab') return;
    var f = Array.prototype.filter.call(card.querySelectorAll('button, input, a[href], [tabindex]:not([tabindex="-1"])'), function (n) { return !n.disabled && !n.hidden && n.offsetParent !== null; });
    if (!f.length) return;
    var primo = f[0], ultimo = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === primo || document.activeElement === card)) { e.preventDefault(); ultimo.focus(); }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primo.focus(); }
  });

  $('#opt-suono').addEventListener('change', function (e) { if (M.Audio) M.Audio.impostaSuono(e.target.checked); });

  /* ---------- le tue registrazioni (pacchetto .zip) ---------- */
  var occupato = false;
  var CARTELLE = [['hisn', 'Adhkar'], ['bader', 'Dhikr'], ['rabbana', 'Rabbana'], ['shadhili', 'Ahzab'], ['special', 'Awrad e Jawshan']];
  /* «Adhkar 85 · Dhikr 5 · …»: le registrazioni per cartella, solo per le cartelle presenti. */
  function riepilogoCartelle(elenco) {
    var conto = {};
    elenco.forEach(function (p) { var c = String(p).split('/')[0]; conto[c] = (conto[c] || 0) + 1; });
    return CARTELLE.filter(function (c) { return conto[c[0]]; }).map(function (c) { return c[1] + ' ' + conto[c[0]]; }).join(' · ');
  }
  function aggiornaPacchettoUI() {
    var P = M.Pacchetto;
    if (!P) return;
    var n = P.elenco().length;
    $('#pk-stato').textContent = n === 0 ? 'Nessuna registrazione caricata.' : (n === 1 ? '1 registrazione in questo telefono.' : n + ' registrazioni in questo telefono.');
    $('#pk-cartelle').textContent = riepilogoCartelle(P.elenco());
    $('#pk-cartelle').hidden = !$('#pk-cartelle').textContent;
    $('#pk-togli').disabled = occupato || n === 0;
    $('#pk-carica').disabled = occupato;
  }
  function barra(f) {
    var b = $('#pk-barra');
    var perc = Math.max(0, Math.min(100, Math.round(f * 100)));
    $('#pk-barra-i').style.width = perc + '%';
    b.setAttribute('aria-valuenow', String(perc));
  }
  $('#pk-carica').addEventListener('click', function () { $('#pk-file').click(); });
  $('#pk-file').addEventListener('change', async function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file || occupato) return;
    occupato = true;
    $('#pk-msg').textContent = 'Sto salvando le registrazioni: puoi lasciare aperta questa finestra.';
    barra(0); $('#pk-barra').hidden = false;
    aggiornaPacchettoUI();
    try {
      var r = await M.Pacchetto.carica(file, function (fatti, tot) { barra(tot ? fatti / tot : 0); });
      $('#pk-msg').textContent = r.salvate === 1 ? 'Fatto: 1 registrazione salvata.' : 'Fatto: ' + r.salvate + ' registrazioni salvate.';
    } catch (err) {
      $('#pk-msg').textContent = (err && err.message) || 'Non sono riuscito a leggere il pacchetto.';
    } finally {
      occupato = false;
      $('#pk-barra').hidden = true;
      e.target.value = '';
      aggiornaPacchettoUI();
    }
  });
  $('#pk-togli').addEventListener('click', async function () {
    if (!window.confirm('Togliere dal telefono tutte le registrazioni caricate?')) return;
    if (M.Audio) M.Audio.ferma();
    await M.Pacchetto.svuota();
    $('#pk-msg').textContent = 'Registrazioni tolte.';
    aggiornaPacchettoUI();
  });

  /* ---------- versione (js/version.js, scritto da tools/aggiorna.py) ---------- */
  function mostraVersione() {
    var el = $('#app-versione'), V = M.Version;
    if (!el || !V) return;
    var m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(V.date || '');
    var mesi = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
    var quando = m ? parseInt(m[3], 10) + ' ' + mesi[parseInt(m[2], 10) - 1] + ' ' + m[1] + ', ore ' + m[4] + ':' + m[5] : '';
    el.innerHTML = 'Versione ' + esc(V.v) + (quando ? '<br>Ultimo aggiornamento: ' + esc(quando) : '');
  }

  /* ---------- avvio ---------- */
  $('.salta').addEventListener('click', function (e) { e.preventDefault(); $('#main').focus(); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) return;
    if (vistaAttuale === 'adesso') disegnaAdesso(false);
    if (vistaAttuale === 'santuario' && M.Santuario) M.Santuario.mostra(leggiHash().k);   // a mezzanotte cambia il versetto
    if (vistaAttuale === 'tasbih' && M.Tasbih) M.Tasbih.mostra();
  });
  setInterval(function () { if (!document.hidden && vistaAttuale === 'adesso') disegnaAdesso(false); }, 60000);

  mostraVersione();
  vai();
  if (M.Pacchetto) M.Pacchetto.verifica();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
