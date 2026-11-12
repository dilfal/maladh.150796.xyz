/* Maladh – «Santuario interiore»: «Come ti senti ora?».
   Cinque stati d'animo; ognuno porta a un versetto, a poche suppliche e a dove restare ancora.
   Qui non c'è testo arabo: ogni voce è un rimando a dati già scaricati dagli script in tools/
   (js/aya_dati.js, js/adhkar_dati.js, js/rabbana_dati.js, js/frasi_dati.js). Un rimando che non si trova viene saltato.
   La scelta non si salva da nessuna parte: niente cronologia, niente conteggi, niente «umore del giorno». */
(function () {
  'use strict';

  var M = window.Maladh = window.Maladh || {};

  /* aya:    chiavi di Maladh.Aya; se ne mostra una sola, scelta con il numero del giorno
     voci:   { c: categoria degli adhkar, id: voce di Hisn al-Muslim } oppure { r: numero tra i 40 Rabbana }
     parola: chiave di Maladh.Frasi (facoltativa)
     poi:    dove restare ancora: { adhkar: chiave }, { tasbih: true }, { awrad: chiave della raccolta o '' per l'elenco, sotto: testo } */
  var STATI = [
    {
      k: 'solitudine', titolo: 'Solitudine', sotto: 'Anche quando nessuno è accanto, Dio è vicino.',
      aya: ['50:16', '2:186', '20:46', '93:3-5'],
      voci: [{ c: 'afflizione', id: 123 }, { r: 38 }],
      parola: 'qudsi:15a',
      poi: [{ adhkar: 'protezione' }, { tasbih: true }, { awrad: 'shadhili', sotto: 'Tra le litanie: Ḥizb al-Khalwa, il ritiro' }]
    },
    {
      k: 'ansia', titolo: 'Ansia', sotto: 'Ciò che pesa si può posare qui, un poco alla volta.',
      aya: ['13:28', '65:3', '9:51', '20:25-28', '3:173'],
      voci: [{ c: 'afflizione', id: 121 }, { c: 'protezione', id: 128 }, { r: 28 }],
      parola: 'qudsi:15b',
      poi: [{ adhkar: 'paura' }, { adhkar: 'afflizione' }, { tasbih: true }]
    },
    {
      k: 'gratitudine', titolo: 'Gratitudine', sotto: 'Una gioia riconosciuta diventa lode.',
      aya: ['2:152', '16:53', '42:28', '35:2'],
      voci: [{ c: 'gratitudine', id: 218 }, { r: 33 }],
      parola: 'ihya:shukr_basir',
      poi: [{ adhkar: 'gratitudine' }, { tasbih: true }, { awrad: 'shadhili', sotto: 'Tra le litanie: Ḥizb al-Ḥamd, la lode continua' }]
    },
    {
      k: 'afflizione', titolo: 'Afflizione', sotto: 'Il dolore si può dire a Dio così com’è.',
      aya: ['94:5-6', '12:86', '21:83', '21:87-88', '93:3-5'],
      voci: [{ c: 'afflizione', id: 120 }, { c: 'afflizione', id: 122 }, { r: 4 }],
      parola: 'qudsi:1',
      poi: [{ adhkar: 'afflizione' }, { adhkar: 'difficolta' }, { awrad: 'rifai', sotto: 'Tra le litanie: Ḥizb al-Faraj, sollievo dalle angosce' }]
    },
    {
      k: 'pace', titolo: 'Pace', sotto: 'Un momento per restare, senza chiedere nulla.',
      aya: ['89:27-30', '13:28', '33:41-43', '10:62'],
      voci: [{ c: 'preghiera', id: 66 }, { r: 8 }],
      parola: 'ihya:rida_latf',
      poi: [{ tasbih: true }, { awrad: '' }]
    }
  ];

  var vista = null;            // <section id="v-santuario">
  var attuale = null;          // stato aperto (null = la scelta)

  var INDIETRO = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function stato(k) { return STATI.filter(function (s) { return s.k === k; })[0] || null; }
  function trova(elenco, campo, valore) {
    return (Array.isArray(elenco) ? elenco : []).filter(function (x) { return x && String(x[campo]) === String(valore); })[0] || null;
  }

  /* ---------- i pezzi di una pagina ---------- */
  function ayaDi(s, U) {
    var presenti = s.aya.map(function (k) { return trova(M.Aya, 'k', k); }).filter(function (a) { return a; });
    return presenti.length ? presenti[U.numeroGiorno(new Date()) % presenti.length] : null;
  }

  function htmlRabbana(n, U) {
    var v = trova(M.Rabbana, 'n', n);
    if (!v) return '';
    var T = M.RabbanaIt && typeof M.RabbanaIt === 'object' ? M.RabbanaIt : {};
    var it = typeof T[String(v.n)] === 'string' ? T[String(v.n)] : '';
    return '<article class="voce"><p class="voce-titolo">' + U.esc(v.rif) + '</p>' +
      '<p class="ar" lang="ar" dir="rtl">' + U.esc(v.ar) + '</p>' +
      (it ? '<p class="voce-it">' + U.esc(it) + '</p>' : '') + '</article>';
  }

  function htmlVoci(s, U) {
    var hisn = false, corano = false;
    var html = s.voci.map(function (x) {
      if (x.r) {
        var r = htmlRabbana(x.r, U);
        if (r) corano = true;
        return r;
      }
      var cat = U.categoria(x.c);
      var v = cat ? trova(cat.voci, 'id', x.id) : null;
      if (!v) return '';
      hisn = true;
      return U.htmlVoce(cat, v);
    }).join('');
    if (!html) return '';
    var fonti = [];
    if (hisn) fonti.push('Ḥiṣn al-Muslim, Saʿīd ibn ʿAlī al-Qaḥṭānī');
    if (corano) fonti.push('testo coranico da Tanzil.net');
    return '<h2 class="sezione-titolo">Parole per questo momento</h2>' + html +
      '<p class="fonte">' + (fonti.length > 1 ? 'Fonti: ' : 'Fonte: ') + U.esc(fonti.join('; ')) + '.</p>';
  }

  function riga(href, titolo, sotto, U) {
    return '<li><a class="riga" href="' + href + '"><span class="riga-testo"><span class="riga-titolo">' + U.esc(titolo) + '</span>' +
      (sotto ? '<span class="riga-sotto">' + U.esc(sotto) + '</span>' : '') + '</span>' + U.FRECCIA + '</a></li>';
  }

  function htmlPoi(s, U) {
    var righe = s.poi.map(function (x) {
      if (x.tasbih) return riga('#tasbih', 'Tasbih', 'Il filo di perle, quando vuoi', U);
      if (typeof x.adhkar === 'string') {
        var cat = U.categoria(x.adhkar);
        return cat ? U.rigaCategoria(cat) : '';
      }
      if (typeof x.awrad === 'string') {
        if (!x.awrad) return riga('#awrad', 'Awrad', 'Litanie da ascoltare, con calma', U);
        var r = trova(M.Raccolte, 'k', x.awrad);
        return r ? riga('#awrad/' + encodeURIComponent(r.k), r.titolo, x.sotto || r.sotto, U) : '';
      }
      return '';
    }).join('');
    return righe ? '<h2 class="sezione-titolo">Se vuoi restare ancora</h2><ul class="lista">' + righe + '</ul>' : '';
  }

  function htmlParola(s, U) {
    if (!s.parola) return '';
    var p = trova(M.Frasi, 'k', s.parola);
    var t = p && M.FrasiIt && typeof M.FrasiIt === 'object' ? M.FrasiIt[p.k] : null;
    return p && p.ar && t && typeof t.it === 'string' && t.it ? U.htmlParola(p) : '';
  }

  /* ---------- le due pagine ---------- */
  function htmlStato(s, U) {
    var h = '<a class="indietro" href="#adesso">' + INDIETRO + 'Indietro</a>';
    h += '<div class="intesta"><p class="st-etichetta">Santuario interiore</p><h1>' + U.esc(s.titolo) + '</h1>' +
      '<p class="sotto">' + U.esc(s.sotto) + '</p></div>';
    var a = ayaDi(s, U);
    if (a) h += U.htmlAya(a, 'Un versetto', 'st-aya-etichetta');
    h += htmlVoci(s, U) + htmlPoi(s, U) + htmlParola(s, U);
    return h + '<p class="st-nota">Maladh non ricorda ciò che scegli.</p>';
  }

  function htmlElenco(U) {
    return '<a class="indietro" href="#adesso">' + INDIETRO + 'Indietro</a>' +
      '<div class="intesta"><p class="st-etichetta">Santuario interiore</p><h1>Come ti senti ora?</h1>' +
      '<p class="sotto">Scegli ciò che somiglia di più a questo momento. Maladh non lo ricorda.</p></div>' +
      '<ul class="lista">' + STATI.map(function (s) {
        return riga('#santuario/' + encodeURIComponent(s.k), s.titolo, s.sotto, U);
      }).join('') + '</ul>';
  }

  /* La domanda con i cinque stati, da mettere nella vista «Adesso». */
  function htmlScelta() {
    var U = M.Ui;
    if (!U) return '';
    return '<section class="stati" aria-labelledby="stati-titolo"><h2 class="sezione-titolo" id="stati-titolo">Come ti senti ora?</h2>' +
      '<div class="chips">' + STATI.map(function (s) {
        return '<a class="chip" href="#santuario/' + encodeURIComponent(s.k) + '">' + U.esc(s.titolo) + '</a>';
      }).join('') + '</div></section>';
  }

  /* ---------- API ---------- */
  function mostra(k) {
    if (!vista) vista = document.getElementById('v-santuario');
    var U = M.Ui;
    if (!vista || !U) return;
    attuale = k ? stato(k) : null;          // una chiave sconosciuta mostra la scelta
    vista.innerHTML = attuale ? htmlStato(attuale, U) : htmlElenco(U);
  }

  M.Santuario = { mostra: mostra, htmlScelta: htmlScelta, stati: STATI };
})();
