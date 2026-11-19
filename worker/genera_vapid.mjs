// Genera la coppia di chiavi VAPID (P-256) e la salva fuori dal repository.
import { webcrypto as crypto } from 'node:crypto';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PERCORSO = process.argv[2];
if (!PERCORSO) {
  console.error('Uso: node genera_vapid.mjs <file di uscita .json, fuori dal repository>');
  process.exit(1);
}

if (existsSync(PERCORSO)) {
  console.log('Il file esiste già: non sovrascrivo.');
  process.exit(0);
}

const coppia = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const pubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', coppia.publicKey));
const privateJwk = await crypto.subtle.exportKey('jwk', coppia.privateKey);
const b64url = (u8) => Buffer.from(u8).toString('base64url');

mkdirSync(dirname(PERCORSO), { recursive: true });
writeFileSync(PERCORSO, JSON.stringify({ publicKey: b64url(pubRaw), privateJwk }, null, 2));
console.log('Chiavi create in ' + PERCORSO);
console.log('Chiave pubblica: ' + b64url(pubRaw));
