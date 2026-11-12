/* Maladh – il nome (facoltativo) e la schermata d'apertura.
   Il nome sta solo in questo telefono (localStorage, chiave «maladh.nome») e non viene mai inviato da nessuna parte.
   Si scrive nella pagina sempre con textContent o con l'escape di Maladh.Ui: mai con innerHTML grezzo.
   Questo file si carica subito dopo il velo #splash: lo riempie col saluto e lo toglie quando ha finito.
   Se il JavaScript manca o si ferma, il velo sparisce comunque da solo (animazione CSS «splash-via»). */
(function () {
  'use strict';

  var M = window.Maladh = window.Maladh || {};
  var CHIAVE = 'maladh.nome';
  var MAX = 30;

  /* Spazi ai bordi tolti, spazi multipli ridotti a uno, niente a capo né caratteri di controllo, al massimo 30 caratteri. */
  function pulisci(s) {
    var t = String(s == null ? '' : s)
      .replace(/[\x00-\x1f\x7f-\x9f\u2028\u2029]/g, ' ')
      .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return Array.from(t).slice(0, MAX).join('').trim();
  }

  function leggiSalvato() {
    try { return pulisci(localStorage.getItem(CHIAVE)); } catch (e) { return ''; }
  }
  var nome = leggiSalvato();          // se localStorage non c'è, il nome vale solo finché la pagina resta aperta

  var N = M.Nome = {};
  N.MAX = MAX;
  N.pulisci = pulisci;
  N.leggi = function () { return nome; };
  /* Salva il nome pulito (vuoto = lo toglie) e lo restituisce. */
  N.imposta = function (v) {
    nome = pulisci(v);
    try {
      if (nome) localStorage.setItem(CHIAVE, nome); else localStorage.removeItem(CHIAVE);
    } catch (e) {}
    return nome;
  };
  /* Il saluto dello splash: neutro rispetto al genere. Senza nome, stringa vuota. */
  N.pace = function () { return nome ? 'Pace a te, ' + nome : ''; };

  /* ---------- schermata d'apertura ---------- */
  var sp = document.getElementById('splash');
  if (!sp) return;

  var saluto = document.getElementById('splash-saluto');
  if (saluto && nome) { saluto.textContent = N.pace(); saluto.hidden = false; }

  var tolto = false, chiudendo = false;
  function togli() {
    if (tolto) return;
    tolto = true;
    ['pointerdown', 'keydown'].forEach(function (n) { document.removeEventListener(n, chiudi, true); });
    if (sp.parentNode) sp.parentNode.removeChild(sp);
  }
  /* Un tocco o un tasto la chiude subito (dissolvenza breve). Il tocco resta al velo: non attraversa verso la pagina. */
  function chiudi() {
    if (chiudendo || tolto) return;
    chiudendo = true;
    sp.classList.add('chiude');
    setTimeout(togli, 200);
  }
  ['pointerdown', 'keydown'].forEach(function (n) { document.addEventListener(n, chiudi, true); });
  sp.addEventListener('animationend', function (e) { if (e.target === sp) togli(); });
  setTimeout(togli, 2600);            // rete di sicurezza: dopo la dissolvenza (1,2 s + 0,4 s) il velo se ne va comunque
})();
