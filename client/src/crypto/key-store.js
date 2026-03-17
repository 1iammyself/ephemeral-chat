/**
 * key-store.js — Ephemeral identity key lifecycle
 *
 * Private keys are NOT persisted to IndexedDB or localStorage.
 * They live in-memory only and are discarded on page reload (intentional —
 * ephemeral chat has no persistent identity).
 *
 * Public key caching is available for UX but not required.
 */

/** @type {Map<string, Object>} roomCode → full key bundle (includes private keys) */
const keyBundles = new Map();

/**
 * Store a key bundle for a room session.
 * @param {string} roomCode
 * @param {Object} bundle - Full key bundle from generateKeyBundle()
 */
export function storeKeyBundle(roomCode, bundle) {
  keyBundles.set(roomCode, bundle);
}

/**
 * Retrieve the key bundle for a room session.
 * @param {string} roomCode
 * @returns {Object|null}
 */
export function getKeyBundle(roomCode) {
  return keyBundles.get(roomCode) || null;
}

/**
 * Zeroize and discard the key bundle for a room session.
 * @param {string} roomCode
 */
export function destroyKeyBundle(roomCode) {
  const bundle = keyBundles.get(roomCode);
  if (!bundle) return;

  // Best-effort zeroization of raw key bytes
  if (bundle.identityKey?.privateKey instanceof Uint8Array) bundle.identityKey.privateKey.fill(0);
  if (bundle.ephemeralKey?.privateKey instanceof Uint8Array) bundle.ephemeralKey.privateKey.fill(0);
  if (bundle.pqKey?.secretKey instanceof Uint8Array) bundle.pqKey.secretKey.fill(0);

  keyBundles.delete(roomCode);
}
