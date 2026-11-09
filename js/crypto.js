/* ═══════════════════════════════════════════════════
   N MARKET — crypto.js  (COMPATIBILITÉ UNIQUEMENT)
   Sert uniquement à relire les ANCIENS messages du chat, qui étaient
   « chiffrés » côté navigateur avec une clé publique dans le code (donc
   sans valeur de confidentialité). Les nouveaux messages sont stockés en
   clair et protégés par RLS + TLS. Voir SECURITE_LISEZMOI.md.
═══════════════════════════════════════════════════ */

const LEGACY_CHAT_SECRET = 'GLAR-L1-GLAR-2025-MARKETPLACE';
let _key = null;

async function getCryptoKey() {
  if (_key) return _key;
  const enc = new TextEncoder();
  const raw = await crypto.subtle.importKey('raw', enc.encode(LEGACY_CHAT_SECRET), 'PBKDF2', false, ['deriveKey']);
  _key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: enc.encode('glar-v1'), iterations: 100000, hash: 'SHA-256' },
    raw, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
  return _key;
}

async function decryptMsg(b64) {
  try {
    const key   = await getCryptoKey();
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, key, bytes.slice(12));
    return new TextDecoder().decode(plain);
  } catch { return '[message illisible]'; }
}
