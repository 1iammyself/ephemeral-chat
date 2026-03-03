/**
 * security.js — Ephemeral Chat encryption layer
 *
 * Encryption: AES-256-GCM via Web Crypto API (SubtleCrypto).
 * Key derivation: HKDF-SHA-256 from the roomCode.
 *
 * All members of a room share the same symmetric key (derived from the
 * room code they both know), so there is no handshake or key-exchange
 * message needed. Every client can encrypt and decrypt immediately on join.
 *
 * Security properties:
 *   - Forward secrecy: keys are in-memory only, cleared on room leave
 *   - Authenticated encryption: AES-GCM provides integrity + authenticity
 *   - Server blindness: server stores only opaque base64 ciphertext
 *   - Per-message random IVs prevent IV reuse
 */

import { initTrafficPadding, stopTrafficPadding, padMessage, unpadMessage, withJitter } from '../crypto/traffic-padding.js';
import { initOHTTP, ohttpFetch } from '../crypto/ohttp.js';
import { initPrivacyPass, getAuthToken } from '../crypto/privacy-pass.js';

// Re-export AES encryption functions using the same names ChatRoom uses
export {
  initMLS,
  createMLSGroup,
  createMLSIdentity,
  joinMLSGroup,
  addMemberToGroup,
  encryptMLSMessage,
  decryptMLSMessage,
  destroyMLSSession,
  isMLSReady,
  isMLSCreator,
  getMLSKeyPackage,
  // Also export the direct AES API for any future use
  initRoomEncryption,
  encryptMessage,
  decryptMessage,
  destroyRoomEncryption,
} from './aesEncryption.js';

// ─── Password Hashing ────────────────────────────────────────────────────

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Input Sanitisation ─────────────────────────────────────────────────

export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ─── Token / Key Generators ─────────────────────────────────────────────

export function generateToken(length = 32) {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

export function generateRoomKey(length = 32) {
  const arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Traffic Padding / OHTTP / Privacy Pass re-exports ──────────────────
export { initTrafficPadding, stopTrafficPadding, padMessage, unpadMessage, withJitter };
export { initOHTTP, ohttpFetch };
export { initPrivacyPass, getAuthToken };
