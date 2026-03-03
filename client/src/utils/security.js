/**
 * Client-side security utilities for ephemeral chat
 * Handles credential hashing and secure transmission
 *
 * === v2 Secure Session (ECDH + AES-256-GCM) ===
 * Each room uses a per-session ECDH key agreement:
 *   1. Both peers generate an ephemeral ECDH keypair
 *   2. Public keys are exchanged via Socket.IO (key-bundle-offer / answer)
 *   3. Both derive the same shared secret via ECDH + HKDF
 *   4. All messages are encrypted with AES-256-GCM using the shared key
 *
 * This replaces the broken PQXDH + Double Ratchet with something that
 * actually works reliably across all browsers and platforms.
 */

import { initTrafficPadding, stopTrafficPadding, padMessage, unpadMessage, withJitter } from '../crypto/traffic-padding.js';
import { initOHTTP, ohttpFetch } from '../crypto/ohttp.js';
import { initPrivacyPass, getAuthToken } from '../crypto/privacy-pass.js';

// Session Store: Maps roomCode -> { privateKey, publicKeyRaw, sharedKey, ready }
const secureSessions = new Map();

// Generate an ECDH keypair using the best available curve
async function generateECDHKeypair() {
  try {
    // Prefer X25519 (Chrome 113+, Safari 17.4+, Firefox 128+)
    const kp = await crypto.subtle.generateKey({ name: 'X25519' }, false, ['deriveBits']);
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    return { privateKey: kp.privateKey, publicKeyRaw: pub, curve: 'X25519' };
  } catch (e) {
    // Fallback to P-256 (universal support)
    const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    return { privateKey: kp.privateKey, publicKeyRaw: pub, curve: 'P-256' };
  }
}

// Perform ECDH key agreement - returns 32 bytes of shared secret
async function ecdh(ourPrivateKey, peerPublicRaw, curve) {
  const importAlg = curve === 'X25519' ? { name: 'X25519' } : { name: 'ECDH', namedCurve: 'P-256' };
  const peerPub = await crypto.subtle.importKey('raw', peerPublicRaw, importAlg, false, []);
  const bits = await crypto.subtle.deriveBits(
    curve === 'X25519' ? { name: 'X25519', public: peerPub } : { name: 'ECDH', public: peerPub },
    ourPrivateKey,
    256
  );
  return new Uint8Array(bits);
}

// HKDF-SHA256 - derives an AES key from raw key material
async function deriveAESKey(sharedSecret, salt, info) {
  const baseKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// AES-256-GCM encrypt
async function aesEncrypt(plaintext, aesKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, enc.encode(plaintext));
  return { ciphertext: _uint8ToBase64(new Uint8Array(ct)), iv: _uint8ToBase64(iv) };
}

// AES-256-GCM decrypt
async function aesDecrypt(ciphertextB64, ivB64, aesKey) {
  const ct = _base64ToUint8(ciphertextB64);
  const iv = _base64ToUint8(ivB64);
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, aesKey, ct);
  return new TextDecoder().decode(pt);
}

// Base64 helpers
function _uint8ToBase64(arr) {
  let s = '';
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  return btoa(s);
}

function _base64ToUint8(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function _pubToBase64(raw) {
  return _uint8ToBase64(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function _base64ToPub(b64) {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/');
  return _base64ToUint8(padded);
}


// ================================================================
// PUBLIC API - same surface as before so ChatRoom.jsx is untouched
// ================================================================

/**
 * Initialize a secure session for a room.
 * Generates our ECDH keypair and stores it.
 * The session becomes "ready" once completeKeyExchange() runs.
 */
export async function initSecureSession(roomCode, isInitiator, peerKeyBundle) {
  const kp = await generateECDHKeypair();

  const session = {
    privateKey: kp.privateKey,
    publicKeyRaw: kp.publicKeyRaw,
    curve: kp.curve,
    sharedKey: null,
    ready: false,
    isInitiator: isInitiator
  };

  secureSessions.set(roomCode, session);

  // The key bundle that gets sent over the wire
  const keyBundle = {
    v: 2,
    ik: _pubToBase64(kp.publicKeyRaw),
    ek: _pubToBase64(kp.publicKeyRaw),
    pq: null,
    curve: kp.curve
  };

  // Initialize traffic padding (non-blocking)
  try { initTrafficPadding('medium'); } catch (e) { /* ignore */ }

  return { keyBundle: keyBundle, ratchetReady: false };
}

/**
 * Complete the key exchange when the peer's key bundle arrives.
 * Derives the shared AES-256 key from ECDH + HKDF.
 */
export async function completeKeyExchange(roomCode, peerKeyBundle, _isInitiator, _pqCiphertext) {
  const session = secureSessions.get(roomCode);
  if (!session) {
    console.warn('completeKeyExchange: no session for', roomCode);
    return { pqCiphertext: null };
  }
  if (session.ready) {
    return { pqCiphertext: null };
  }

  // Determine peer's curve
  const peerCurve = peerKeyBundle.curve || session.curve;
  const peerPubRaw = _base64ToPub(peerKeyBundle.ik || peerKeyBundle.ek);

  // If curves don't match, we can't do DH
  if (peerCurve !== session.curve) {
    throw new Error('Curve mismatch: we use ' + session.curve + ', peer uses ' + peerCurve);
  }

  // ECDH shared secret (32 bytes)
  const sharedSecret = await ecdh(session.privateKey, peerPubRaw, session.curve);

  // HKDF to derive AES-256-GCM key
  // Salt = sorted concat of both public keys (deterministic for both sides)
  const myPub64 = _pubToBase64(session.publicKeyRaw);
  const peerPub64 = _pubToBase64(peerPubRaw);
  const sortedPubs = [myPub64, peerPub64].sort().join(':');
  const salt = new TextEncoder().encode(sortedPubs);
  const info = new TextEncoder().encode('ephchat-v2-session');

  session.sharedKey = await deriveAESKey(sharedSecret, salt, info);
  session.ready = true;

  // Erase raw shared secret
  sharedSecret.fill(0);

  console.log('[security] Secure session ready for room', roomCode, '(' + session.curve + ')');
  return { pqCiphertext: null };
}

/**
 * Encrypt a message using the session key.
 */
export async function encryptMessageSecure(text, roomCode) {
  const session = secureSessions.get(roomCode);
  if (!session || !session.ready || !session.sharedKey) {
    throw new Error('Secure session not ready for room ' + roomCode);
  }

  const { ciphertext, iv } = await aesEncrypt(text, session.sharedKey);

  return {
    v: 2,
    ciphertext: ciphertext,
    iv: iv,
    ratchet: true
  };
}

/**
 * Decrypt a message.
 */
export async function decryptMessageSecure(payload, roomCode) {
  const session = secureSessions.get(roomCode);

  // v2 payload
  if (payload && payload.v === 2 && payload.ratchet) {
    if (!session || !session.ready || !session.sharedKey) {
      return '\u26a0\ufe0f Secure session not ready - cannot decrypt';
    }
    try {
      return await aesDecrypt(payload.ciphertext, payload.iv, session.sharedKey);
    } catch (e) {
      console.error('v2 decrypt failed:', e);
      return '\u26a0\ufe0f Decryption failed';
    }
  }

  // Legacy v1 payload (pre-key-exchange or old client)
  if (payload && payload.encrypted && payload.iv) {
    try {
      return await decryptMessage(payload.encrypted, payload.iv, roomCode);
    } catch (e) {
      return '\u26a0\ufe0f Decryption failed (v1)';
    }
  }

  return '\u26a0\ufe0f Unknown message format';
}

/**
 * Destroy the secure session for a room.
 */
export function destroySecureSession(roomCode) {
  const session = secureSessions.get(roomCode);
  if (session) {
    session.sharedKey = null;
    session.privateKey = null;
    session.publicKeyRaw = null;
    secureSessions.delete(roomCode);
  }
  try { stopTrafficPadding(); } catch (e) { /* ignore */ }
}

/**
 * Get the current key bundle for a room.
 */
export function getKeyBundle(roomCode) {
  const session = secureSessions.get(roomCode);
  if (!session) return null;
  return {
    v: 2,
    ik: _pubToBase64(session.publicKeyRaw),
    ek: _pubToBase64(session.publicKeyRaw),
    pq: null,
    curve: session.curve
  };
}


// ================================================================
// LEGACY UTILITIES - kept for backward compat
// ================================================================

/**
 * Hash a password using SHA-256
 */
export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

/**
 * Derive a stable AES-GCM key from a room code (v1 legacy).
 */
async function deriveKeyFromCode(code) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(code), 'PBKDF2', false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('ephemeral-chat-salt'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a message (v1 legacy - room-code derived key)
 */
export async function encryptMessage(text, roomCode) {
  const key = await deriveKeyFromCode(roomCode);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encoder.encode(text)
  );
  return {
    encrypted: btoa(String.fromCharCode.apply(null, new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode.apply(null, iv))
  };
}

/**
 * Decrypt a message (v1 legacy)
 */
export async function decryptMessage(encrypted, iv, roomCode) {
  const key = await deriveKeyFromCode(roomCode);
  const encryptedBytes = Uint8Array.from(atob(encrypted), function(c) { return c.charCodeAt(0); });
  const ivBytes = Uint8Array.from(atob(iv), function(c) { return c.charCodeAt(0); });
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBytes },
    key,
    encryptedBytes
  );
  return new TextDecoder().decode(decrypted);
}

/**
 * Sanitize user input (XSS prevention).
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate a secure random token
 */
export function generateToken(length) {
  if (!length) length = 32;
  var arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

/**
 * Generate a random room key (used for E2EE room creation)
 */
export function generateRoomKey(length) {
  if (!length) length = 32;
  var arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// Re-export traffic-padding + privacy-pass + OHTTP utilities
export { initTrafficPadding, stopTrafficPadding, padMessage, unpadMessage, withJitter };
export { initOHTTP, ohttpFetch };
export { initPrivacyPass, getAuthToken };
