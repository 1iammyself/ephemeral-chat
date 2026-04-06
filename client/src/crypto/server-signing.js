/**
 * server-signing.js — Ed25519 server-response verification + TOFU pinning
 *
 * On first connect, fetches the server's Ed25519 public key and pins it
 * in IndexedDB (Trust On First Use). On subsequent page loads, verifies
 * the live server key matches the pinned one before accepting it.
 *
 * Verified events: key-bundle-roster, peer-key-bundle
 *
 * If server signing is not available (old server, degraded mode) the
 * verification step is skipped gracefully — callers check isServerSigningReady().
 */

const DB_NAME = 'ephchat-server-pin';
const DB_VERSION = 1;
const STORE_NAME = 'server_keys';
const PIN_RECORD_ID = 'server-ed25519';

// In-memory cache after first successful init
let _pinnedCryptoKey = null;

// ─── IndexedDB Helpers ──────────────────────────────────────

function _openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = () => reject(req.error);
  });
}

async function _getStoredPin() {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(PIN_RECORD_ID);
    req.onsuccess = () => resolve(req.result?.key ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function _storePin(publicKeyBase64) {
  const db = await _openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ id: PIN_RECORD_ID, key: publicKeyBase64, pinnedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function _importPublicKey(base64Der) {
  const der = Uint8Array.from(atob(base64Der), c => c.charCodeAt(0));
  return crypto.subtle.importKey('spki', der, { name: 'Ed25519' }, false, ['verify']);
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Fetch the server's Ed25519 public key and pin it (TOFU).
 *
 * - First call ever: fetches from /api/server-key, stores in IndexedDB.
 * - Subsequent calls: loads stored pin, checks it matches the live server key.
 *   A mismatch throws (TOFU violation — possible key rotation or MITM).
 *
 * Failure is non-fatal for chat functionality — callers should catch and
 * continue in degraded mode (no signature verification).
 *
 * @throws {Error} On TOFU violation (key changed since first pin)
 */
export async function initServerSigning() {
  let remoteKeyBase64;
  try {
    const res = await fetch('/api/server-key');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const body = await res.json();
    remoteKeyBase64 = body.publicKey;
    if (typeof remoteKeyBase64 !== 'string' || remoteKeyBase64.length < 40) {
      throw new Error('Invalid publicKey in response');
    }
  } catch (e) {
    // Server doesn't support signing (older version) — skip silently
    console.warn('[ServerSigning] /api/server-key unavailable, signature verification disabled:', e.message);
    return;
  }

  const storedKeyBase64 = await _getStoredPin();

  if (storedKeyBase64 && storedKeyBase64 !== remoteKeyBase64) {
    throw new Error(
      '[ServerSigning] TOFU violation: server Ed25519 key changed since first pin. ' +
      'Pinned: ' + storedKeyBase64.slice(0, 16) + '... ' +
      'Live: ' + remoteKeyBase64.slice(0, 16) + '...'
    );
  }

  if (!storedKeyBase64) {
    await _storePin(remoteKeyBase64);
  }

  _pinnedCryptoKey = await _importPublicKey(remoteKeyBase64);
}

/**
 * Verify a server-signed socket payload.
 *
 * The server signed JSON.stringify(data_without_sig). We reconstruct that
 * exact string by destructuring _sig out before serialising.
 *
 * @param {Object} data - Payload containing `_sig` field
 * @returns {Promise<boolean>} true if signature is valid, false if not or if not initialised
 */
export async function verifyServerSignature(data) {
  if (!_pinnedCryptoKey) return false;
  const { _sig, ...unsigned } = data;
  if (!_sig) return false;
  try {
    const sigBytes = Uint8Array.from(atob(_sig), c => c.charCodeAt(0));
    const msgBytes = new TextEncoder().encode(JSON.stringify(unsigned));
    return await crypto.subtle.verify('Ed25519', _pinnedCryptoKey, sigBytes, msgBytes);
  } catch {
    return false;
  }
}

/**
 * Whether the server signing key is pinned and ready for verification.
 * If false, verifyServerSignature() will always return false.
 */
export function isServerSigningReady() {
  return _pinnedCryptoKey !== null;
}
