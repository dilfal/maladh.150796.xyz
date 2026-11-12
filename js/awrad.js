/* Maladh – «Awrad»: litanie da ascoltare, in raccolte (js/raccolte_dati.js).
   Elenco delle raccolte (#awrad) e dettaglio di una raccolta (#awrad/<k>). Il ▶ compare solo per le tracce
   che l'utente ha caricato nel telefono (Maladh.Pacchetto). Nell'interfaccia sta solo l'autore dell'opera, mai chi recita.
   Come per il resto di Maladh: niente conteggi, niente cronologia, niente promemoria. */
(function () {
  'use strict';

  var M = window.Maladh = window.Maladh || {};

  var vista = null;            // <section id="v-awrad">
  var attuale = null;          // raccolta aperta nel dettaglio (null = elenco)

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function raccolte() { return Array.isArray(M.Raccolte) ? M.Raccolte : []; }
  function raccolta(k) { return raccolte().filter(function (r) { return r.k === k; })[0] || null; }
  function nelTelefono(p) { return !!(M.Pacchetto && M.Pacchetto.ha(p)); }

  var FRECCIA = '<svg class="freccia" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var INDIETRO = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function svgPlay(suona) {
    return '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="' + (suona ? 'M7 5h3.4v14H7zM13.6 5H17v14h-3.4z' : 'M8 5.2v13.6L19 12z') + '" fill="currentColor"/></svg>';
  }

  /* L'immagine è decorativa. Se non si carica, resta il fondo della scheda. */
  function foto(r, grande) {
    return '<span class="rc-foto' + (grande ? ' grande' : '') + '"><img src="' + esc(r.img) + '" alt="" loading="lazy" width="1200" height="675" decoding="async"></span>';
  }

  /* ---------- elenco delle raccolte ---------- */
  function htmlElenco() {
    var s = '<div class="intesta"><h1>Awrad</h1><p class="sotto">Litanie da ascoltare, con calma.</p></div>';
    s += raccolte().map(function (r) {
      return '<a class="rc-scheda" href="#awrad/' + encodeURIComponent(r.k) + '">' + foto(r, false) +
        '<span class="rc-testo"><span class="riga-titolo">' + esc(r.titolo) + '</span>' +
        '<span class="rc-autore">' + esc(r.autore) + '</span>' +
        '<span class="riga-sotto">' + esc(r.sotto) + '</span></span></a>';
    }).join('');
    return s;
  }

  /* ---------- dettaglio di una raccolta ---------- */
  function htmlTraccia(r, t) {
    var s = '<li class="traccia"><div class="traccia-testo">';
    if (t.ar) s += '<div class="ar traccia-ar" lang="ar" dir="rtl">' + esc(t.ar) + '</div>';
    s += '<span class="riga-titolo">' + esc(t.t) + '</span>';
    if (t.it) s += '<span class="riga-sotto">' + esc(t.it) + '</span>';
    s += '</div>';
    if (nelTelefono(t.p)) {
      var suona = !!(M.Audio && M.Audio.inAscolto() === String(t.p).toLowerCase());
      s += '<button class="btn-play" type="button" data-p="' + esc(t.p) + '" data-titolo="' + esc(t.t) + '" aria-pressed="' + suona + '" aria-label="' + (suona ? 'Pausa' : 'Ascolta ' + esc(t.t)) + '">' + svgPlay(suona) + '</button>';
    }
    return s + '</li>';
  }

  function htmlRabbana() {
    var R = M.Rabbana;
    if (!Array.isArray(R) || !R.length) return '';
    var T = M.RabbanaIt && typeof M.RabbanaIt === 'object' ? M.RabbanaIt : {};
    var s = '<h2 class="sezione-titolo">Le quaranta invocazioni</h2>';
    s += R.map(function (v) {
      var it = typeof T[String(v.n)] === 'string' ? T[String(v.n)] : '';
      return '<article class="voce"><p class="voce-titolo">' + esc(v.n) + ' · ' + esc(v.rif) + '</p>' +
        '<p class="ar" lang="ar" dir="rtl">' + esc(v.ar) + '</p>' +
        (it ? '<p class="voce-it">' + esc(it) + '</p>' : '') + '</article>';
    }).join('');
    return s + '<p class="fonte">Testo coranico: Tanzil.net.</p>';
  }

  function htmlRaccolta(r) {
    var s = '<a class="indietro" href="#awrad">' + INDIETRO + 'Indietro</a>';
    s += foto(r, true);
    s += '<div class="intesta"><h1>' + esc(r.titolo) + '</h1>';
    if (r.ar) s += '<p class="ar rc-ar" lang="ar" dir="rtl">' + esc(r.ar) + '</p>';
    s += '<p class="sotto">' + esc(r.autore) + '</p></div>';

    var tracce = r.tracce || [];
    if (tracce.length && !tracce.some(function (t) { return nelTelefono(t.p); })) {
      s += '<div class="rc-avviso"><p class="nota">Queste registrazioni non sono in questo telefono. Puoi caricarle da «Su Maladh».</p>' +
        '<button class="btn secondario" type="button" data-su-maladh>Apri Su Maladh</button></div>';
    }
    s += '<ul class="lista tracce">' + tracce.map(function (t) { return htmlTraccia(r, t); }).join('') + '</ul>';
    if (r.k === 'rabbana') s += htmlRabbana();
    return s;
  }

  function disegna() {
    if (!vista) return;
    vista.innerHTML = attuale ? htmlRaccolta(attuale) : htmlElenco();
  }

  /* ---------- ascolto ---------- */
  function suonaOPausa(r, t) {
    var A = M.Audio;
    if (!A) return;
    var p = String(t.p).toLowerCase();
    if (A.inAscolto() === p) A.pausa();
    else if (A.corrente() === p) A.riprendi();
    else A.ascolta({ percorso: t.p, titolo: t.t, autore: r.autore, ciclo: false });
  }

  function collega() {
    vista.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('button') : null;
      if (!b) return;
      if (b.hasAttribute('data-su-maladh')) {
        if (M.apriSuMaladh) M.apriSuMaladh();
      } else if (b.hasAttribute('data-p') && attuale) {
        var p = b.getAttribute('data-p');
        var t = (attuale.tracce || []).filter(function (x) { return x.p === p; })[0];
        if (t) suonaOPausa(attuale, t);
      }
    });
    /* L'evento «error» non risale: lo si ascolta in cattura. L'immagine si nasconde e resta il fondo della scheda. */
    vista.addEventListener('error', function (e) {
      if (e.target && e.target.tagName === 'IMG') e.target.hidden = true;
    }, true);
  }

  /* ---------- API ---------- */
  function mostra(k) {
    if (!vista) {
      vista = document.getElementById('v-awrad');
      if (!vista) return;
      collega();
    }
    attuale = k ? raccolta(k) : null;       // una chiave sconosciuta mostra l'elenco
    disegna();
  }

  M.Awrad = { mostra: mostra };

  /* Se arrivano o spariscono registrazioni, si ridisegna restando dov'ero (solo se Awrad è la vista visibile). */
  document.addEventListener('maladh:pacchetto', function () {
    if (!vista || vista.hidden) return;
    var y = window.scrollY;
    disegna();
    window.scrollTo(0, y);
  });
})();
