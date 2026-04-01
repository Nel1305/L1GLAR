/* ═══════════════════════════════════════════════════
   MARKET PLACE L1 GLAR — crypto.js
   Chiffrement AES-256-GCM bout-en-bout (Web Crypto)
   Messages chiffrés AVANT envoi à Supabase
═══════════════════════════════════════════════════ */

const CHAT_SECRET = 'GLAR-L1-GLAR-2025-MARKETPLACE';
let _key = null;

async function getCryptoKey() {
  if (_key) return _key;
  const enc    = new TextEncoder();
  const raw    = await crypto.subtle.importKey('raw', enc.encode(CHAT_SECRET), 'PBKDF2', false, ['deriveKey']);
  _key         = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('glar-v1'), iterations: 100000, hash: 'SHA-256' },
    raw, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
  );
  return _key;
}

async function encryptMsg(text) {
  const key  = await getCryptoKey();
  const iv   = crypto.getRandomValues(new Uint8Array(12));
  const enc  = new TextEncoder();
  const ct   = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(text));
  const buf  = new Uint8Array(iv.length + ct.byteLength);
  buf.set(iv, 0); buf.set(new Uint8Array(ct), iv.length);
  return btoa(String.fromCharCode(...buf));
}

async function decryptMsg(b64) {
  try {
    const key   = await getCryptoKey();
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const iv    = bytes.slice(0, 12);
    const ct    = bytes.slice(12);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(plain);
  } catch { return '[message chiffré]'; }
}
