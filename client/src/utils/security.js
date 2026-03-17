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
import { initE2EE, destroyE2EESession, isE2EEReady, encryptE2EE, decryptE2EE, handleIncomingKeyBundle } from '../crypto/e2ee-manager.js';
import { registerE2EEManager } from './aesEncryption.js';

// Wire the E2EE manager into the AES shim so v5 routing works transparently
registerE2EEManager({ isE2EEReady, encryptE2EE, decryptE2EE });

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

// Re-export E2EE manager functions
export { initE2EE, destroyE2EESession, handleIncomingKeyBundle };

// ─── Password Hashing ────────────────────────────────────────────────────

/**
 * Hash a password using PBKDF2-SHA-256 with a fixed salt.
 * The fixed salt is acceptable here because the server applies bcrypt on
 * top. PBKDF2 prevents the server from receiving the raw plaintext while
 * providing iterative hardening against brute-force of the transmitted hash.
 *
 * 100 000 iterations matches OWASP 2024 recommendation for PBKDF2-SHA-256.
 */
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = encoder.encode('ephchat-password-salt-v2');
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  const derived = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    keyMaterial,
    256
  );
  const hashArray = Array.from(new Uint8Array(derived));
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
