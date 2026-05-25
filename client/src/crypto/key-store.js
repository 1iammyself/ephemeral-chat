/**
 * key-store.js — Ephemeral identity key lifecycle
 *
 * Private keys are NOT persisted to IndexedDB or localStorage.
 * They live in-memory only and are discarded on page reload (intentional —
 * ephemeral chat has no persistent identity).
 *
 * Public key caching is available for UX but not required.
 *
 * Android helpers (encryptForRoom, decryptForRoom, ensureKeystoreKey) delegate
 * leaf-level message encryption to the Android Keystore via KeystorePlugin.
 * These are no-ops / return null on non-Android platforms.
 */

import { Capacitor } from '@capacitor/core';
import { KeystorePlugin } from '../capacitor/security-plugins';
import { secureZero } from './secure-zero.js';

const isAndroid = Capacitor.getPlatform() === 'android';

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

  if (bundle.identityKey?.privateKey instanceof Uint8Array) secureZero(bundle.identityKey.privateKey);
  if (bundle.ephemeralKey?.privateKey instanceof Uint8Array) secureZero(bundle.ephemeralKey.privateKey);
  if (bundle.pqKey?.secretKey instanceof Uint8Array) secureZero(bundle.pqKey.secretKey);

  keyBundles.delete(roomCode);
}

// ─── Android Keystore helpers ────────────────────────────────────────────────
// These functions are Android-only. On all other platforms they are no-ops
// and return null, leaving the caller to use WebCrypto directly.

/**
 * Encrypt plaintext bytes using the Android Keystore (AES-256-GCM) on Android,
 * or return null on other platforms so the caller falls back to WebCrypto.
 *
 * @param {string} keyAlias - Keystore key alias for the room session
 * @param {Uint8Array|ArrayBuffer} plaintext
 * @returns {Promise<{ ciphertext: string, iv: string }|null>}
 */
export async function encryptForRoom(keyAlias, plaintext) {
  if (!isAndroid) return null;
  const b64 = btoa(String.fromCharCode(...new Uint8Array(plaintext)));
  return KeystorePlugin.encrypt({ keyAlias, plaintext: b64 });
}

/**
 * Decrypt ciphertext using the Android Keystore on Android,
 * or return null on other platforms.
 *
 * @param {string} keyAlias - Keystore key alias for the room session
 * @param {string} ciphertext - base64-encoded ciphertext
 * @param {string} iv - base64-encoded IV
 * @returns {Promise<Uint8Array|null>}
 */
export async function decryptForRoom(keyAlias, ciphertext, iv) {
  if (!isAndroid) return null;
  const result = await KeystorePlugin.decrypt({ keyAlias, ciphertext, iv });
  return Uint8Array.from(atob(result.plaintext), c => c.charCodeAt(0));
}

/**
 * Ensure a Keystore AES-256-GCM key exists for the given alias.
 * Creates the key if it is absent. Android-only; no-op on other platforms.
 *
 * @param {string} keyAlias
 * @returns {Promise<void>}
 */
export async function ensureKeystoreKey(keyAlias) {
  if (!isAndroid) return;
  const { exists } = await KeystorePlugin.keyExists({ keyAlias });
  if (!exists) {
    await KeystorePlugin.generateKey({ keyAlias });
  }
}
