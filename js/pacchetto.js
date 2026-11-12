/* Maladh – le registrazioni dell'utente.
   Le registrazioni non stanno nel sito: l'utente carica dal telefono un pacchetto .zip (anche più di uno, uno per cartella)
   e qui lo si scompatta nella Cache del browser («maladh-audio-v1»), da dove il service worker le serve all'ascolto.

   Il lettore dello zip non carica mai l'intero file in memoria: legge solo la coda (indice dello zip) e poi,
   voce per voce, il pezzo che serve con file.slice(). Le funzioni «pure» di lettura stanno in Maladh.Pacchetto._zip
   e funzionano con qualunque Blob (così si provano anche con Node). */
(function () {
  'use strict';

  var M = window.Maladh = window.Maladh || {};

  var CACHE_AUDIO = 'maladh-audio-v1';
  var CHIAVE_INDICE = 'maladh.audio_indice';
  var PREFISSO = 'audio/p/';
  var RE_PERCORSO = /^[a-z0-9_\-]+(\/[a-z0-9_\-]+)*\.mp3$/i;
  var MAX_VOCI = 5000;                 // difesa: un indice più grande non è plausibile

  var SIG_EOCD = 0x06054b50;
  var SIG_CD = 0x02014b50;
  var SIG_LOCALE = 0x04034b50;
  var SIG_ZIP64_LOC = 0x07064b50;

  var MSG_ZIP64 = 'Questo pacchetto è troppo grande (formato Zip64): dividilo in più pacchetti, per esempio uno per cartella.';

  function nomeValido(p) { return typeof p === 'string' && p.length <= 200 && RE_PERCORSO.test(p); }

  /* ---------- lettura dello zip (funzioni pure, provabili con Node) ---------- */

  async function leggi(blob, inizio, fine) {
    return new DataView(await blob.slice(inizio, fine).arrayBuffer());
  }

  /* Legge l'indice (central directory) di uno zip. Restituisce un elenco di
     { nome, metodo, compresso, originale, offset } per le sole voci con un nome accettato. */
  async function leggiIndice(file) {
    var tot = file.size;
    if (tot < 22) throw new Error('Il file non sembra un pacchetto .zip.');

    var coda = Math.min(tot, 65557);                     // 22 byte della EOCD + 65535 di commento
    var base = tot - coda;
    var dv = await leggi(file, base, tot);
    var eocd = -1;
    for (var i = coda - 22; i >= 0; i--) {
      if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Il file non sembra un pacchetto .zip.');

    if (eocd >= 20 && dv.getUint32(eocd - 20, true) === SIG_ZIP64_LOC) throw new Error(MSG_ZIP64);
    var voci = dv.getUint16(eocd + 10, true);
    var cdDim = dv.getUint32(eocd + 12, true);
    var cdOff = dv.getUint32(eocd + 16, true);
    if (voci === 0xFFFF || cdDim === 0xFFFFFFFF || cdOff === 0xFFFFFFFF) throw new Error(MSG_ZIP64);
    if (cdOff + cdDim > tot) throw new Error('Il pacchetto è danneggiato (indice fuori posto).');

    var cd = await leggi(file, cdOff, cdOff + cdDim);
    var testo = new TextDecoder('utf-8');
    var out = [];
    var p = 0;
    for (var n = 0; n < voci && p + 46 <= cdDim; n++) {
      if (cd.getUint32(p, true) !== SIG_CD) throw new Error('Il pacchetto è danneggiato (indice illeggibile).');
      var flag = cd.getUint16(p + 8, true);
      var metodo = cd.getUint16(p + 10, true);
      var comp = cd.getUint32(p + 20, true);
      var orig = cd.getUint32(p + 24, true);
      var lNome = cd.getUint16(p + 28, true);
      var lExtra = cd.getUint16(p + 30, true);
      var lComm = cd.getUint16(p + 32, true);
      var off = cd.getUint32(p + 42, true);
      if (p + 46 + lNome > cdDim) throw new Error('Il pacchetto è danneggiato (indice troncato).');
      var nome = testo.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, lNome));
      p += 46 + lNome + lExtra + lComm;

      if (nome.charAt(nome.length - 1) === '/') continue;           // cartella
      if (!nomeValido(nome)) continue;                               // tutto ciò che non è una registrazione si ignora
      if (comp === 0xFFFFFFFF || orig === 0xFFFFFFFF || off === 0xFFFFFFFF) throw new Error(MSG_ZIP64);
      if (flag & 1) throw new Error('Il pacchetto è protetto da password: non posso aprirlo.');
      out.push({ nome: nome.toLowerCase(), metodo: metodo, compresso: comp, originale: orig, offset: off });
      if (out.length > MAX_VOCI) throw new Error('Il pacchetto contiene troppi file.');
    }
    return out;
  }

  /* Restituisce il contenuto di una voce come Blob audio/mpeg. */
  async function leggiVoce(file, voce) {
    var h = await leggi(file, voce.offset, voce.offset + 30);
    if (h.getUint32(0, true) !== SIG_LOCALE) throw new Error('Il pacchetto è danneggiato (voce illeggibile).');
    var inizio = voce.offset + 30 + h.getUint16(26, true) + h.getUint16(28, true);
    var fine = inizio + voce.compresso;
    if (fine > file.size) throw new Error('Il pacchetto è danneggiato o incompleto.');

    if (voce.metodo === 0) return file.slice(inizio, fine, 'audio/mpeg');
    if (voce.metodo === 8) {
      if (typeof DecompressionStream !== 'function') throw new Error('Questo telefono non sa aprire i pacchetti compressi: usa un pacchetto creato senza compressione.');
      var flusso = file.slice(inizio, fine).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      var b = await new Response(flusso).blob();
      return b.slice(0, b.size, 'audio/mpeg');
    }
    throw new Error('Il pacchetto usa un tipo di compressione che non conosco.');
  }

  /* ---------- indice delle registrazioni salvate (localStorage) ---------- */

  function pulisci(arr) {
    var visti = {}, out = [];
    if (!Array.isArray(arr)) return out;
    for (var i = 0; i < arr.length && out.length < MAX_VOCI; i++) {
      var s = arr[i];
      if (!nomeValido(s)) continue;
      s = s.toLowerCase();
      if (visti[s]) continue;
      visti[s] = 1;
      out.push(s);
    }
    return out.sort();
  }
  function leggiIndiceSalvato() {
    try { return pulisci(JSON.parse(localStorage.getItem(CHIAVE_INDICE) || '[]')); } catch (e) { return []; }
  }
  function scriviIndiceSalvato(arr) {
    try { localStorage.setItem(CHIAVE_INDICE, JSON.stringify(arr)); } catch (e) {}
  }

  var indice = leggiIndiceSalvato();
  var insieme = {};
  function ricostruisci() { insieme = {}; indice.forEach(function (p) { insieme[p] = 1; }); }
  ricostruisci();

  function imposta(arr) {
    var nuovo = pulisci(arr);
    var uguale = nuovo.length === indice.length && nuovo.every(function (p, i) { return p === indice[i]; });
    indice = nuovo;
    ricostruisci();
    scriviIndiceSalvato(indice);
    if (!uguale) avvisa();
  }
  function avvisa() {
    try { document.dispatchEvent(new CustomEvent('maladh:pacchetto')); } catch (e) {}
  }

  function chiave(percorso) { return new URL(PREFISSO + percorso, document.baseURI).href; }

  /* ---------- API ---------- */

  var Pacchetto = M.Pacchetto = {
    ha: function (percorso) { return typeof percorso === 'string' && insieme[percorso.toLowerCase()] === 1; },
    indirizzo: function (percorso) { return chiave(String(percorso).toLowerCase()); },
    elenco: function () { return indice.slice(); },

    /* Scompatta un .zip nella Cache e AGGIUNGE le registrazioni a quelle già presenti.
       avanza(byteFatti, byteTotali, nome). Restituisce { salvate }. In caso di errore lancia un Error
       con un messaggio italiano (e ciò che era già stato salvato resta salvato). */
    carica: async function (file, avanza) {
      if (!file || typeof file.slice !== 'function') throw new Error('Non ho ricevuto nessun file.');
      if (!('caches' in window)) throw new Error('Questo browser non può tenere le registrazioni in memoria.');
      try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}

      var voci = await leggiIndice(file);
      if (!voci.length) throw new Error('In questo file non ho trovato registrazioni (cerco file .mp3 dentro cartelle come hisn, bader, rabbana…).');

      var totale = voci.reduce(function (s, v) { return s + v.originale; }, 0);
      var fatti = 0;
      var cache = await caches.open(CACHE_AUDIO);
      var salvate = [];
      var errore = null;

      for (var i = 0; i < voci.length; i++) {
        var v = voci[i];
        if (avanza) { try { avanza(fatti, totale, v.nome); } catch (e) {} }
        try {
          var blob = await leggiVoce(file, v);
          var risposta = new Response(blob, { status: 200, headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': String(blob.size) } });
          try {
            await cache.put(chiave(v.nome), risposta);
          } catch (e) {
            errore = new Error('Lo spazio nel telefono è finito. Registrazioni salvate: ' + salvate.length + '. Libera un po’ di spazio e carica di nuovo lo stesso pacchetto.');
            break;
          }
        } catch (e) {
          errore = new Error((e && e.message ? e.message : 'Lettura non riuscita.') + ' Registrazioni salvate: ' + salvate.length + '.');
          break;
        }
        salvate.push(v.nome);
        fatti += v.originale;
      }
      if (avanza && !errore) { try { avanza(totale, totale, ''); } catch (e) {} }

      if (salvate.length) imposta(indice.concat(salvate));
      if (errore) throw errore;
      return { salvate: salvate.length };
    },

    /* Toglie tutte le registrazioni dal telefono. */
    svuota: async function () {
      try { if ('caches' in window) await caches.delete(CACHE_AUDIO); } catch (e) {}
      imposta([]);
    },

    /* Riallinea l'indice alle registrazioni realmente presenti nella Cache. */
    verifica: async function () {
      if (!('caches' in window)) return indice.slice();
      try {
        var cache = await caches.open(CACHE_AUDIO);
        var richieste = await cache.keys();
        var base = new URL(PREFISSO, document.baseURI).href;
        var trovate = [];
        richieste.forEach(function (r) {
          if (r.url.indexOf(base) !== 0) return;
          var p = r.url.slice(base.length);
          try { p = decodeURIComponent(p); } catch (e) {}
          if (nomeValido(p)) trovate.push(p);
        });
        imposta(trovate);
      } catch (e) { /* cache non leggibile: si tiene l'indice com'è */ }
      return indice.slice();
    },

    _zip: { leggiIndice: leggiIndice, leggiVoce: leggiVoce, nomeValido: nomeValido }
  };
})();
