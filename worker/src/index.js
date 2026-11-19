// maladh-push: notifiche Web Push senza payload all'ora delle preghiere.
// Il server riceve solo l'indirizzo push e un elenco di istanti: mai la posizione.
import { creaJwt } from './vapid.js';

const MAX_CORPO = 8 * 1024;
const MAX_ORARI = 80;
const FINESTRA_FUTURO = 11 * 24 * 3600;
const VALIDITA_AVVISO = 600; // secondi: oltre, l'avviso scaduto non si invia
const PARALLELI = 20;
const GIORNI_INATTIVITA = 30;
const MAX_PUSH_PER_GIRO = 40; // piano gratuito: 50 sottorichieste per invocazione
const MAX_ISCRIZIONI = 1000;
const STATI_DEFINITIVI = [400, 401, 403, 404, 410];
const MAX_LEGAMI = 1000;
const GIORNI_LEGAMI = 60;
// Percorsi che può chiamare l'app Marsa (il collegamento lo crea soltanto Maladh).
const PERCORSI_MARSA = ['/pausa', '/stato', '/scollega'];
const PERCORSI = ['/iscrivi', '/cancella', '/collega', '/pausa', '/stato', '/scollega'];

const HOST_AMMESSI = ['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'];
const SUFFISSI_AMMESSI = ['.push.apple.com', '.notify.windows.com'];

function hostAmmesso(host) {
  return HOST_AMMESSI.includes(host) || SUFFISSI_AMMESSI.some((s) => host.endsWith(s));
}

function endpointValido(endpoint) {
  if (typeof endpoint !== 'string' || endpoint.length > 2048) return null;
  let u;
  try {
    u = new URL(endpoint);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  if (u.port && u.port !== '443') return null;
  if (!hostAmmesso(u.hostname)) return null;
  return u;
}

async function sha256Hex(testo) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(testo));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function origineConsentita(origine, env, percorso) {
  if (!origine) return false;
  if (origine === env.ORIGINE) return true;
  if (env.ORIGINE_MARSA && origine === env.ORIGINE_MARSA) return PERCORSI_MARSA.includes(percorso);
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origine);
}

// Il codice del collegamento: si accetta con o senza trattini, minuscolo o maiuscolo.
// Del codice si conserva soltanto l'impronta (SHA-256): mai in chiaro, mai nei log.
const ALFABETO_CODICE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
async function improntaDa(codice) {
  if (typeof codice !== 'string' || codice.length > 64) return null;
  const pulito = codice.replace(/[-\s]/g, '').toUpperCase();
  if (!ALFABETO_CODICE.test(pulito)) return null;
  return sha256Hex(pulito);
}
function oggi() { return Math.floor(Date.now() / 86400000); }

function intestazioniCors(origine) {
  return {
    'Access-Control-Allow-Origin': origine,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function risposta(stato, origine) {
  return new Response(null, { status: stato, headers: origine ? intestazioniCors(origine) : {} });
}

function rispostaJson(oggetto, stato, origine) {
  const intestazioni = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...(origine ? intestazioniCors(origine) : {}) };
  return new Response(JSON.stringify(oggetto), { status: stato, headers: intestazioni });
}

// Legge il corpo JSON con tetto di 8 KB; ritorna {errore: stato} oppure {dati}.
async function leggiJson(request) {
  const dichiarata = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(dichiarata) && dichiarata > MAX_CORPO) return { errore: 413 };
  const lettore = request.body ? request.body.getReader() : null;
  const pezzi = [];
  let totale = 0;
  if (lettore) {
    for (;;) {
      const { done, value } = await lettore.read();
      if (done) break;
      totale += value.byteLength;
      if (totale > MAX_CORPO) {
        try { await lettore.cancel(); } catch {}
        return { errore: 413 };
      }
      pezzi.push(value);
    }
  }
  const tutto = new Uint8Array(totale);
  let pos = 0;
  for (const p of pezzi) { tutto.set(p, pos); pos += p.byteLength; }
  try {
    const dati = JSON.parse(new TextDecoder().decode(tutto));
    if (dati === null || typeof dati !== 'object' || Array.isArray(dati)) return { errore: 400 };
    return { dati };
  } catch {
    return { errore: 400 };
  }
}

async function iscrivi(dati, env, origine) {
  if (!endpointValido(dati.endpoint)) return risposta(400, origine);
  if (!Array.isArray(dati.orari)) return risposta(400, origine);
  const adesso = Math.floor(Date.now() / 1000);
  const orari = [];
  const visti = new Set();
  for (const t of dati.orari) {
    if (!Number.isInteger(t) || t < adesso || t > adesso + FINESTRA_FUTURO || visti.has(t)) continue;
    visti.add(t);
    orari.push(t);
    if (orari.length >= MAX_ORARI) break;
  }
  const id = await sha256Hex(dati.endpoint);
  if (orari.length > 0) {
    // Con un legame in pausa non si accetta nessun avviso nuovo.
    const inPausa = await env.DB.prepare(
      'SELECT 1 AS p FROM collegamenti c JOIN legami l ON l.impronta = c.impronta WHERE c.iscrizione = ? AND l.pausa = 1',
    ).bind(id).first();
    if (inPausa) return rispostaJson({ pausa: true }, 409, origine);
  }
  const conteggio = await env.DB.prepare(
    'SELECT (SELECT count(*) FROM iscrizioni) AS tot, (SELECT count(*) FROM iscrizioni WHERE id = ?) AS esiste',
  ).bind(id).first();
  if (!conteggio.esiste && conteggio.tot >= MAX_ISCRIZIONI) return risposta(503, origine);
  const istruzioni = [
    env.DB.prepare('DELETE FROM avvisi WHERE iscrizione = ?').bind(id),
    env.DB.prepare('INSERT OR REPLACE INTO iscrizioni (id, endpoint, aggiornato) VALUES (?, ?, ?)').bind(id, dati.endpoint, adesso),
    ...orari.map((t) => env.DB.prepare('INSERT OR IGNORE INTO avvisi (iscrizione, at) VALUES (?, ?)').bind(id, t)),
  ];
  await env.DB.batch(istruzioni);
  return risposta(204, origine);
}

async function cancella(dati, env, origine) {
  if (typeof dati.endpoint !== 'string' || dati.endpoint.length > 2048) return risposta(400, origine);
  const id = await sha256Hex(dati.endpoint);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM avvisi WHERE iscrizione = ?').bind(id),
    env.DB.prepare('DELETE FROM collegamenti WHERE iscrizione = ?').bind(id),
    env.DB.prepare('DELETE FROM iscrizioni WHERE id = ?').bind(id),
  ]);
  return risposta(204, origine);
}

/* ---------- collegamento facoltativo con Marsa ----------
   Il server sa solo: un'impronta casuale, se è in pausa o no, e il giorno dell'ultimo contatto. Nessuna data del ciclo, nessuno storico. */
async function collega(dati, env, origine) {
  const impronta = await improntaDa(dati.codice);
  if (!impronta) return risposta(400, origine);
  let id = null;
  if (dati.endpoint !== undefined && dati.endpoint !== null) {
    if (!endpointValido(dati.endpoint)) return risposta(400, origine);
    id = await sha256Hex(dati.endpoint);
  }
  const giorno = oggi();
  const conteggio = await env.DB.prepare(
    'SELECT (SELECT count(*) FROM legami) AS tot, (SELECT count(*) FROM legami WHERE impronta = ?) AS esiste',
  ).bind(impronta).first();
  if (!conteggio.esiste && conteggio.tot >= MAX_LEGAMI) return risposta(503, origine);
  await env.DB.prepare(
    'INSERT INTO legami (impronta, pausa, toccato) VALUES (?, 0, ?) ON CONFLICT(impronta) DO UPDATE SET toccato = excluded.toccato',
  ).bind(impronta, giorno).run();
  const riga = await env.DB.prepare('SELECT pausa FROM legami WHERE impronta = ?').bind(impronta).first();
  if (id) {
    // Si lega solo un'iscrizione già presente sul server.
    const ha = await env.DB.prepare('SELECT 1 AS x FROM iscrizioni WHERE id = ?').bind(id).first();
    if (ha) {
      const istruzioni = [env.DB.prepare('INSERT OR REPLACE INTO collegamenti (iscrizione, impronta) VALUES (?, ?)').bind(id, impronta)];
      if (riga.pausa) istruzioni.push(env.DB.prepare('DELETE FROM avvisi WHERE iscrizione = ?').bind(id));
      await env.DB.batch(istruzioni);
    }
  }
  return rispostaJson({ pausa: !!riga.pausa }, 200, origine);
}

async function pausa(dati, env, origine) {
  const impronta = await improntaDa(dati.codice);
  if (!impronta || typeof dati.pausa !== 'boolean') return risposta(400, origine);
  const r = await env.DB.prepare('UPDATE legami SET pausa = ?, toccato = ? WHERE impronta = ?')
    .bind(dati.pausa ? 1 : 0, oggi(), impronta).run();
  if (!r.meta.changes) return risposta(404, origine);
  if (dati.pausa) {
    await env.DB.prepare('DELETE FROM avvisi WHERE iscrizione IN (SELECT iscrizione FROM collegamenti WHERE impronta = ?)').bind(impronta).run();
  }
  return rispostaJson({ pausa: dati.pausa }, 200, origine);
}

async function stato(dati, env, origine) {
  const impronta = await improntaDa(dati.codice);
  if (!impronta) return risposta(400, origine);
  const r = await env.DB.prepare('UPDATE legami SET toccato = ? WHERE impronta = ?').bind(oggi(), impronta).run();
  if (!r.meta.changes) return risposta(404, origine);
  const riga = await env.DB.prepare('SELECT pausa FROM legami WHERE impronta = ?').bind(impronta).first();
  return rispostaJson({ pausa: !!(riga && riga.pausa) }, 200, origine);
}

async function scollega(dati, env, origine) {
  const impronta = await improntaDa(dati.codice);
  if (!impronta) return risposta(400, origine);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM collegamenti WHERE impronta = ?').bind(impronta),
    env.DB.prepare('DELETE FROM legami WHERE impronta = ?').bind(impronta),
  ]);
  return rispostaJson({ ok: true }, 200, origine);
}

const GESTORI = { '/iscrivi': iscrivi, '/cancella': cancella, '/collega': collega, '/pausa': pausa, '/stato': stato, '/scollega': scollega };

async function gestisci(request, env) {
  const url = new URL(request.url);
  const origineRichiesta = request.headers.get('Origin');
  const consentita = origineConsentita(origineRichiesta, env, url.pathname);

  if (!PERCORSI.includes(url.pathname)) {
    return new Response(null, { status: 404 });
  }

  if (request.method === 'OPTIONS') {
    return consentita ? risposta(204, origineRichiesta) : new Response(null, { status: 403 });
  }
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  // Una richiesta del browser da un'altra origine non viene nemmeno elaborata.
  if (origineRichiesta && !consentita) return new Response(null, { status: 403 });
  const origine = consentita ? origineRichiesta : null;

  const { errore, dati } = await leggiJson(request);
  if (errore) return risposta(errore, origine);

  try {
    return await GESTORI[url.pathname](dati, env, origine);
  } catch {
    return risposta(500, origine);
  }
}

// Esegue la funzione su ogni elemento con al massimo `limite` operazioni alla volta.
async function inParallelo(elementi, limite, funzione) {
  let indice = 0;
  const operai = Array.from({ length: Math.min(limite, elementi.length) }, async () => {
    while (indice < elementi.length) {
      const mio = elementi[indice++];
      try { await funzione(mio); } catch {}
    }
  });
  await Promise.all(operai);
}

async function inviaPush(endpoint, env, adesso, cacheJwt) {
  const aud = new URL(endpoint).origin;
  let jwt = cacheJwt.get(aud);
  if (!jwt) {
    jwt = await creaJwt(env.VAPID_PRIVATE, aud, env.VAPID_SUBJECT, adesso);
    cacheJwt.set(aud, jwt);
  }
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      TTL: String(VALIDITA_AVVISO),
      Urgency: 'high',
      Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC}`,
    },
  });
  try { await r.body?.cancel(); } catch {}
  return r.status;
}

async function eseguiAvvisi(env, adesso) {
  // Avvisi maturi e ancora validi, i più vecchi prima.
  const { results } = await env.DB.prepare(
    'SELECT a.iscrizione AS id, i.endpoint AS endpoint FROM avvisi a JOIN iscrizioni i ON i.id = a.iscrizione WHERE a.at <= ? AND a.at > ? ORDER BY a.at ASC',
  ).bind(adesso, adesso - VALIDITA_AVVISO).all();

  // Un solo push per iscrizione a ogni giro; al massimo MAX_PUSH_PER_GIRO, il resto al giro dopo.
  const daInviare = new Map();
  for (const r of results) {
    if (daInviare.size >= MAX_PUSH_PER_GIRO) break;
    if (!daInviare.has(r.id)) daInviare.set(r.id, r.endpoint);
  }

  const esiti = new Map(); // id -> 'ok' | 'morta'; assente = si ritenta al giro dopo
  const cacheJwt = new Map();
  await inParallelo([...daInviare], PARALLELI, async ([id, endpoint]) => {
    const stato = await inviaPush(endpoint, env, adesso, cacheJwt);
    if (stato >= 200 && stato < 300) esiti.set(id, 'ok');
    else if (STATI_DEFINITIVI.includes(stato)) esiti.set(id, 'morta');
    // 429, 5xx, errori di rete: la riga resta e si ritenta finché è valida.
  });

  // Avvisi scaduti: via sempre. Poi gli esiti, tutto in un solo batch.
  const istruzioni = [env.DB.prepare('DELETE FROM avvisi WHERE at <= ?').bind(adesso - VALIDITA_AVVISO)];
  for (const [id, esito] of esiti) {
    if (esito === 'ok') {
      istruzioni.push(env.DB.prepare('DELETE FROM avvisi WHERE iscrizione = ? AND at <= ?').bind(id, adesso));
    } else {
      istruzioni.push(env.DB.prepare('DELETE FROM avvisi WHERE iscrizione = ?').bind(id));
      istruzioni.push(env.DB.prepare('DELETE FROM collegamenti WHERE iscrizione = ?').bind(id));
      istruzioni.push(env.DB.prepare('DELETE FROM iscrizioni WHERE id = ?').bind(id));
    }
  }
  await env.DB.batch(istruzioni);
}

async function pulisciVecchie(env, adesso) {
  const limite = adesso - GIORNI_INATTIVITA * 24 * 3600;
  await env.DB.prepare(
    'DELETE FROM iscrizioni WHERE aggiornato < ? AND NOT EXISTS (SELECT 1 FROM avvisi WHERE avvisi.iscrizione = iscrizioni.id)',
  ).bind(limite).run();
  // Legami senza contatti da 60 giorni, con i loro collegamenti; e collegamenti rimasti senza iscrizione.
  const giornoLimite = Math.floor(adesso / 86400) - GIORNI_LEGAMI;
  await env.DB.batch([
    env.DB.prepare('DELETE FROM collegamenti WHERE impronta IN (SELECT impronta FROM legami WHERE toccato < ?)').bind(giornoLimite),
    env.DB.prepare('DELETE FROM legami WHERE toccato < ?').bind(giornoLimite),
    env.DB.prepare('DELETE FROM collegamenti WHERE iscrizione NOT IN (SELECT id FROM iscrizioni) OR impronta NOT IN (SELECT impronta FROM legami)'),
  ]);
}

export default {
  fetch: (request, env) => gestisci(request, env),

  async scheduled(event, env) {
    const adesso = Math.floor(Date.now() / 1000);
    await eseguiAvvisi(env, adesso);
    const quando = new Date(event.scheduledTime);
    if (quando.getUTCHours() === 3 && quando.getUTCMinutes() === 0) await pulisciVecchie(env, adesso);
  },
};
