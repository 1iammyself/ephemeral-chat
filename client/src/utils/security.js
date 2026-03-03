/**
 * security.js — Ephemeral Chat encryption layer
 *
 * MLS (Messaging Layer Security) via OpenMLS WASM — RFC 9420 compliant.
 * License: MIT (openmls-wasm)
 *
 * Security properties comparable to Signal Protocol:
 *   - Forward secrecy via TreeKEM ratchet
 *   - Post-compromise security
 *   - Cryptographic transcript integrity
 *   - Efficient group rekeying O(log n)
 *   - Strong member authentication
 *
 * Flow:
 *   1. Room creator calls createMLSGroup() → creates group
 *   2. Joiners create identity → send KeyPackage to creator via server
 *   3. Creator adds members → sends Welcome back
 *   4. All members encrypt/decrypt with MLS group keys
 */

import { initTrafficPadding, stopTrafficPadding, padMessage, unpadMessage, withJitter } from '../crypto/traffic-padding.js';
import { initOHTTP, ohttpFetch } from '../crypto/ohttp.js';
import { initPrivacyPass, getAuthToken } from '../crypto/privacy-pass.js';

// Re-export MLS functions as the primary encryption API
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
  getMLSKeyPackage
} from './mlsEncryption.js';

// LEGACY UTILITIES (kept for non-message uses)

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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

// Re-exports for traffic padding, OHTTP, Privacy Pass
export { initTrafficPadding, stopTrafficPadding, padMessage, unpadMessage, withJitter };
export { initOHTTP, ohttpFetch };
export { initPrivacyPass, getAuthToken };
