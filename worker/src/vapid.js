// Firma VAPID (JWT ES256) con sola WebCrypto.

const codifica = new TextEncoder();

export function b64url(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let chiaveInCache = null;
let jwkInCache = null;

async function importaChiave(jwkJson) {
  if (chiaveInCache && jwkInCache === jwkJson) return chiaveInCache;
  const jwk = JSON.parse(jwkJson);
  chiaveInCache = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  jwkInCache = jwkJson;
  return chiaveInCache;
}

// aud = origine dell'endpoint; ritorna il JWT compatto.
export async function creaJwt(jwkJson, aud, sub, adesso) {
  const intestazione = b64url(codifica.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const corpo = b64url(codifica.encode(JSON.stringify({ aud, exp: adesso + 12 * 3600, sub })));
  const daFirmare = `${intestazione}.${corpo}`;
  const chiave = await importaChiave(jwkJson);
  // WebCrypto restituisce già il formato raw r||s (64 byte).
  const firma = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, chiave, codifica.encode(daFirmare));
  return `${daFirmare}.${b64url(firma)}`;
}
