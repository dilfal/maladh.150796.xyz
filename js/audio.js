/* Maladh – suoni.
   1. Suoni sintetizzati con Web Audio: il «tocco» (una perla di legno) e la «fine» del giro (due note di campanella).
   2. Sottofondo di natura (pioggia, mare, fiume) in ciclo, con dissolvenza.
   3. Lettore delle registrazioni caricate dall'utente (un solo elemento audio, controlli sul blocco schermo). */
(function () {
  'use strict';

  var M = window.Maladh = window.Maladh || {};
  var A = M.Audio = {};

  /* ---------- impostazioni: maladh.impostazioni = { suono: true, natura: '' } ---------- */
  var NATURE = ['pioggia', 'mare', 'fiume'];
  var CHIAVE_IMP = 'maladh.impostazioni';

  function leggiImpostazioni() {
    var o = { suono: true, natura: '' };
    try {
      var r = JSON.parse(localStorage.getItem(CHIAVE_IMP) || '{}');
      if (r && typeof r === 'object') {
        if (r.suono === false) o.suono = false;
        if (NATURE.indexOf(r.natura) >= 0) o.natura = r.natura;
      }
    } catch (e) {}
    return o;
  }
  var imp = leggiImpostazioni();
  imp.natura = '';          // il sottofondo non riparte da solo: si sceglie ogni volta
  function salvaImpostazioni() { try { localStorage.setItem(CHIAVE_IMP, JSON.stringify(imp)); } catch (e) {} }

  A.impostazioni = function () { return { suono: imp.suono, natura: imp.natura }; };
  A.impostaSuono = function (v) { imp.suono = !!v; salvaImpostazioni(); };

  /* ---------- contesto Web Audio: nasce al primo tocco dell'utente ---------- */
  var ctx = null;
  function contesto() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  /* Su iPhone il suono si sblocca solo dentro un gesto dell'utente: si prova a ogni gesto finché il contesto non gira. */
  function sblocca() {
    var c = contesto();
    if (!c) return;
    if (c.state === 'running') {
      ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach(function (n) { document.removeEventListener(n, sblocca, true); });
    }
    try {                                    // un istante di silenzio, come vuole Safari
      var b = c.createBuffer(1, 1, 22050), s = c.createBufferSource();
      s.buffer = b; s.connect(c.destination); s.start(0);
    } catch (e) {}
  }
  ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach(function (n) {
    document.addEventListener(n, sblocca, { capture: true, passive: true });
  });

  /* Una nota con inviluppo: attacco rapido, discesa esponenziale. */
  function nota(c, t, freq, durata, volume, tipo, discesa) {
    var o = c.createOscillator(), g = c.createGain();
    o.type = tipo || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (discesa) o.frequency.exponentialRampToValueAtTime(discesa, t + Math.min(durata, 0.07));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(volume, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + durata);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + durata + 0.03);
  }

  /* La perla di legno: breve, morbida, con una rapida discesa di frequenza. */
  A.tocco = function () {
    if (!imp.suono) return;
    var c = contesto(); if (!c) return;
    var t = c.currentTime;
    nota(c, t, 620, 0.085, 0.16, 'sine', 230);
    nota(c, t, 1240, 0.04, 0.035, 'sine', 700);
  };

  /* Fine del giro: due note dolci di campanella, con coda di circa due secondi. */
  A.fine = function () {
    if (!imp.suono) return;
    var c = contesto(); if (!c) return;
    var t = c.currentTime + 0.02;
    [[784, 0], [1175, 0.3]].forEach(function (n) {
      var t0 = t + n[1];
      nota(c, t0, n[0], 2.1, 0.11, 'sine');
      nota(c, t0, n[0] * 2.76, 1.1, 0.025, 'sine');       // armonica inarmonica: dà il timbro di campana
      nota(c, t0, n[0] * 4.1, 0.5, 0.01, 'sine');
    });
  };

  /* ---------- sottofondo di natura ---------- */
  var buffer = {};            // nome -> AudioBuffer decodificato
  var natura = { nome: '', sorgente: null, guadagno: null, richiesta: 0 };

  function decodifica(c, dati) {
    return new Promise(function (ok, no) {
      var r = c.decodeAudioData(dati, ok, no);
      if (r && typeof r.then === 'function') r.then(ok, no);
    });
  }
  function fermaNatura(subito) {
    var s = natura.sorgente, g = natura.guadagno;
    natura.sorgente = null; natura.guadagno = null;
    if (!s || !g || !ctx) return;
    var t = ctx.currentTime;
    try {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + (subito ? 0.05 : 0.5));
      s.stop(t + (subito ? 0.08 : 0.55));
    } catch (e) { try { s.stop(); } catch (e2) {} }
  }

  /* Avvia il sottofondo 'pioggia' | 'mare' | 'fiume', oppure lo ferma con ''. */
  A.natura = async function (nome) {
    if (NATURE.indexOf(nome) < 0) nome = '';
    var mia = ++natura.richiesta;
    fermaNatura(false);
    natura.nome = nome;
    imp.natura = nome;
    salvaImpostazioni();
    avvisaNatura();
    if (!nome) return;
    var c = contesto();
    if (!c) return;
    try {
      if (!buffer[nome]) {
        var r = await fetch('audio/natura/natura_' + nome + '.mp3');
        if (!r.ok) throw new Error('file mancante');
        buffer[nome] = await decodifica(c, await r.arrayBuffer());
      }
      if (mia !== natura.richiesta) return;           // nel frattempo si è scelto altro
      var s = c.createBufferSource(), g = c.createGain();
      s.buffer = buffer[nome]; s.loop = true;
      var t = c.currentTime;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.5, t + 0.5);
      s.connect(g); g.connect(c.destination);
      s.start(t);
      natura.sorgente = s; natura.guadagno = g;
    } catch (e) {
      if (mia === natura.richiesta) { natura.nome = ''; imp.natura = ''; salvaImpostazioni(); avvisaNatura(); }
    }
  };
  A.naturaCorrente = function () { return natura.nome; };
  function avvisaNatura() { try { document.dispatchEvent(new CustomEvent('maladh:natura', { detail: natura.nome })); } catch (e) {} }

  /* ---------- lettore delle registrazioni ---------- */
  var el = null;                 // l'unico HTMLAudioElement
  var corrente = null;           // { percorso, titolo, ciclo }
  var trascina = false;
  var ui = null;

  function interfaccia() {
    if (ui) return ui;
    ui = {
      box: document.getElementById('lettore'),
      play: document.getElementById('lt-play'),
      icona: document.getElementById('lt-icona'),
      titolo: document.getElementById('lt-titolo'),
      tempo: document.getElementById('lt-tempo'),
      pos: document.getElementById('lt-pos'),
      chiudi: document.getElementById('lt-chiudi')
    };
    if (!ui.box) return ui;
    ui.play.addEventListener('click', function () { if (el && el.paused) A.riprendi(); else A.pausa(); });
    ui.chiudi.addEventListener('click', function () { A.ferma(); });
    var inizia = function () { trascina = true; };
    var finisce = function () { trascina = false; };
    ui.pos.addEventListener('pointerdown', inizia);
    ui.pos.addEventListener('touchstart', inizia, { passive: true });
    ['pointerup', 'pointercancel', 'touchend', 'touchcancel', 'change', 'blur'].forEach(function (n) { ui.pos.addEventListener(n, finisce); });
    ui.pos.addEventListener('input', function () {
      var d = durata();
      if (el && d) { el.currentTime = (ui.pos.value / 1000) * d; mostraTempo(); }
    });
    return ui;
  }

  function durata() { return el && isFinite(el.duration) && el.duration > 0 ? el.duration : 0; }
  function formatta(s) {
    s = Math.max(0, Math.floor(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x;
  }
  function mostraTempo() {
    if (!ui || !ui.box) return;
    var d = durata();
    ui.tempo.textContent = formatta(el ? el.currentTime : 0) + ' / ' + (d ? formatta(d) : '--:--');
    if (!trascina) {
      var f = d ? Math.min(1, el.currentTime / d) : 0;
      ui.pos.value = String(Math.round(f * 1000));
      ui.pos.style.setProperty('--p', (f * 100).toFixed(2) + '%');
    } else {
      ui.pos.style.setProperty('--p', (ui.pos.value / 10) + '%');
    }
    if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && d) {
      try { navigator.mediaSession.setPositionState({ duration: d, playbackRate: el.playbackRate || 1, position: Math.min(el.currentTime, d) }); } catch (e) {}
    }
  }
  function mostraStato() {
    if (!ui || !ui.box) return;
    var suona = !!(el && !el.paused && corrente);
    ui.icona.setAttribute('d', suona ? 'M7 5h3.4v14H7zM13.6 5H17v14h-3.4z' : 'M8 5.2v13.6L19 12z');
    ui.play.setAttribute('aria-label', suona ? 'Pausa' : 'Riprendi');
    document.body.classList.toggle('con-lettore', !!corrente);
    ui.box.hidden = !corrente;
  }
  function annuncia() {
    var p = (el && !el.paused && corrente) ? corrente.percorso : null;
    try { document.dispatchEvent(new CustomEvent('maladh:ascolto', { detail: p })); } catch (e) {}
  }

  function creaElemento() {
    if (el) return el;
    el = new Audio();
    el.preload = 'metadata';
    el.setAttribute('playsinline', '');
    ['play', 'playing', 'pause'].forEach(function (n) { el.addEventListener(n, function () { mostraStato(); annuncia(); }); });
    ['timeupdate', 'durationchange', 'loadedmetadata', 'seeked'].forEach(function (n) { el.addEventListener(n, mostraTempo); });
    el.addEventListener('ended', function () { mostraStato(); annuncia(); });
    el.addEventListener('error', function () {
      if (!corrente) return;
      if (ui && ui.tempo) ui.tempo.textContent = 'Non riesco ad aprire questa registrazione.';
      mostraStato(); annuncia();
    });
    return el;
  }

  function mediaSession(titolo, autore) {
    if (!('mediaSession' in navigator)) return;
    try {
      navigator.mediaSession.metadata = new window.MediaMetadata({ title: titolo, artist: autore || 'Maladh' });
      var az = function (n, f) { try { navigator.mediaSession.setActionHandler(n, f); } catch (e) {} };
      az('play', function () { A.riprendi(); });
      az('pause', function () { A.pausa(); });
      az('seekto', function (d) { if (el && d && typeof d.seekTime === 'number') el.currentTime = d.seekTime; });
      az('seekbackward', function (d) { if (el) el.currentTime = Math.max(0, el.currentTime - ((d && d.seekOffset) || 15)); });
      az('seekforward', function (d) { if (el) el.currentTime = Math.min(durata() || el.currentTime, el.currentTime + ((d && d.seekOffset) || 15)); });
    } catch (e) {}
  }

  /* Fa ascoltare una registrazione del pacchetto: ascolta({ percorso, titolo, ciclo, autore }).
     «autore» (facoltativo) è l’autore dell’opera e va nel blocco schermo; senza, resta «Maladh». */
  A.ascolta = function (o) {
    if (!o || !M.Pacchetto || !M.Pacchetto.ha(o.percorso)) return;
    interfaccia();
    var e = creaElemento();
    corrente = { percorso: String(o.percorso).toLowerCase(), titolo: String(o.titolo || ''), ciclo: !!o.ciclo };
    e.loop = corrente.ciclo;
    e.src = M.Pacchetto.indirizzo(corrente.percorso);
    if (ui && ui.titolo) ui.titolo.textContent = corrente.titolo;
    mediaSession(corrente.titolo, o.autore ? String(o.autore) : '');
    mostraStato(); mostraTempo();
    var p = e.play();
    if (p && p.catch) p.catch(function () { mostraStato(); annuncia(); });
  };
  A.pausa = function () { if (el) el.pause(); };
  A.riprendi = function () {
    if (!el || !corrente) return;
    var p = el.play();
    if (p && p.catch) p.catch(function () {});
  };
  A.ferma = function () {
    if (!el) return;
    el.pause();
    el.removeAttribute('src');
    try { el.load(); } catch (e) {}
    corrente = null;
    if ('mediaSession' in navigator) { try { navigator.mediaSession.metadata = null; } catch (e) {} }
    mostraStato(); annuncia();
  };
  A.corrente = function () { return corrente ? corrente.percorso : null; };         // caricata (anche in pausa)
  A.inAscolto = function () { return (el && !el.paused && corrente) ? corrente.percorso : null; };   // sta suonando

  /* Se il pacchetto viene svuotato, la traccia in corso non esiste più. */
  document.addEventListener('maladh:pacchetto', function () {
    if (corrente && M.Pacchetto && !M.Pacchetto.ha(corrente.percorso)) A.ferma();
  });
})();
