/**
 * security.js — Ephemeral Chat encryption layer
 *
 * ECDH key exchange (X25519 preferred, P-256 fallback) + HKDF-SHA256 + AES-256-GCM
 *
 * Flow:
 *   1. Both peers call initSecureSession() → generates ECDH keypair
 *   2. Public keys are exchanged via server (key-bundle-offer / answer)
 *   3. When peer's bundle arrives, call completeKeyExchange() → derives shared AES key
 *   4. encryptMessageSecure() / decryptMessageSecure() use that shared key
 *
 * Every function has explicit console logging so you can trace failures in DevTools.
 */

import { initTrafficPadding, stopTrafficPadding, padMessage, unpadMessage, withJitter } from '../crypto/traffic-padding.js';
import { initOHTTP, ohttpFetch } from '../crypto/ohttp.js';
import { initPrivacyPass, getAuthToken } from '../crypto/privacy-pass.js';

// ═══════════════════════════════════════════════════════════
// SESSION STORE
// ═══════════════════════════════════════════════════════════
const secureSessions = new Map();

// ═══════════════════════════════════════════════════════════
// LOW-LEVEL CRYPTO HELPERS
// ═══════════════════════════════════════════════════════════

async function generateECDHKeypair() {
  // Try X25519 first (modern browsers)
  try {
    var kp = await crypto.subtle.generateKey({ name: 'X25519' }, false, ['deriveBits']);
    var pub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
    console.log('[security] Generated X25519 keypair, pubkey length:', pub.length);
    return { privateKey: kp.privateKey, publicKeyRaw: pub, curve: 'X25519' };
  } catch (e) {
    console.log('[security] X25519 not available, falling back to P-256:', e.message);
  }
  // Fallback: P-256 (works everywhere)
  var kp2 = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  var pub2 = new Uint8Array(await crypto.subtle.exportKey('raw', kp2.publicKey));
  console.log('[security] Generated P-256 keypair, pubkey length:', pub2.length);
  return { privateKey: kp2.privateKey, publicKeyRaw: pub2, curve: 'P-256' };
}

async function performECDH(ourPrivateKey, peerPublicRaw, curve) {
  var algName = curve === 'X25519' ? 'X25519' : 'ECDH';
  var importAlg = curve === 'X25519' ? { name: 'X25519' } : { name: 'ECDH', namedCurve: 'P-256' };
  var peerPubKey = await crypto.subtle.importKey('raw', peerPublicRaw, importAlg, false, []);
  var deriveBitsAlg = curve === 'X25519'
    ? { name: 'X25519', public: peerPubKey }
    : { name: 'ECDH', public: peerPubKey };
  var rawBits = await crypto.subtle.deriveBits(deriveBitsAlg, ourPrivateKey, 256);
  return new Uint8Array(rawBits);
}

async function hkdfDeriveKey(sharedSecret, saltBytes, infoBytes) {
  var hkdfKey = await crypto.subtle.importKey('raw', sharedSecret, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: saltBytes, info: infoBytes },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function aesGcmEncrypt(plaintext, aesKey) {
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var encoded = new TextEncoder().encode(plaintext);
  var cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, aesKey, encoded);
  return {
    ciphertext: uint8ToBase64(new Uint8Array(cipherBuf)),
    iv: uint8ToBase64(iv)
  };
}

async function aesGcmDecrypt(ciphertextB64, ivB64, aesKey) {
  var ct = base64ToUint8(ciphertextB64);
  var iv = base64ToUint8(ivB64);
  var plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, aesKey, ct);
  return new TextDecoder().decode(plainBuf);
}

// ═══════════════════════════════════════════════════════════
// BASE64 HELPERS
// ═══════════════════════════════════════════════════════════

function uint8ToBase64(arr) {
  var binary = '';
  for (var i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary);
}

function base64ToUint8(b64) {
  var binary = atob(b64);
  var arr = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}

function pubKeyToBase64Url(raw) {
  return uint8ToBase64(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToPubKey(b64url) {
  var b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  return base64ToUint8(b64);
}

// ═══════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════

/**
 * Step 1: Initialize a secure session. Call when joining a room.
 * Returns a keyBundle to broadcast to peers.
 * The session is NOT ready yet — you must call completeKeyExchange() when
 * you receive a peer's key bundle.
 */
export async function initSecureSession(roomCode, isInitiator, peerKeyBundle) {
  console.log('[security] initSecureSession called for room:', roomCode, 'isInitiator:', isInitiator);

  // If there's already a session, destroy it first (handles rejoin)
  if (secureSessions.has(roomCode)) {
    console.log('[security] Destroying existing session for room:', roomCode);
    destroySecureSession(roomCode);
  }

  var kp = await generateECDHKeypair();

  var session = {
    privateKey: kp.privateKey,
    publicKeyRaw: kp.publicKeyRaw,
    curve: kp.curve,
    sharedKey: null,
    ready: false,
    isInitiator: isInitiator
  };
  secureSessions.set(roomCode, session);

  var keyBundle = {
    v: 2,
    ik: pubKeyToBase64Url(kp.publicKeyRaw),
    ek: pubKeyToBase64Url(kp.publicKeyRaw),
    pq: null,
    curve: kp.curve
  };

  console.log('[security] Session created for room:', roomCode, 'curve:', kp.curve, 'bundle.ik length:', keyBundle.ik.length);

  try { initTrafficPadding('medium'); } catch (e) { /* ignore */ }

  return { keyBundle: keyBundle, ratchetReady: false };
}

/**
 * Step 2: Complete the key exchange when a peer's key bundle arrives.
 * Performs ECDH → HKDF → derives shared AES-256-GCM key.
 * After this, the session is READY and you can encrypt/decrypt.
 */
export async function completeKeyExchange(roomCode, peerKeyBundle, isInitiator, pqCiphertext) {
  console.log('[security] completeKeyExchange called for room:', roomCode);

  var session = secureSessions.get(roomCode);
  if (!session) {
    console.error('[security] FATAL: No session found for room:', roomCode, '— was initSecureSession called?');
    return { pqCiphertext: null };
  }

  if (session.ready) {
    console.log('[security] Session already ready for room:', roomCode, '— skipping');
    return { pqCiphertext: null };
  }

  if (!peerKeyBundle) {
    console.error('[security] FATAL: peerKeyBundle is null/undefined');
    return { pqCiphertext: null };
  }

  // Extract peer's public key
  var peerPubB64 = peerKeyBundle.ik || peerKeyBundle.ek;
  if (!peerPubB64) {
    console.error('[security] FATAL: peerKeyBundle has no ik or ek field:', JSON.stringify(peerKeyBundle));
    return { pqCiphertext: null };
  }

  var peerCurve = peerKeyBundle.curve || session.curve;
  console.log('[security] Peer curve:', peerCurve, 'Our curve:', session.curve);

  // Curve mismatch check
  if (peerCurve !== session.curve) {
    console.error('[security] FATAL: Curve mismatch! We use', session.curve, 'but peer uses', peerCurve);
    throw new Error('Curve mismatch: ' + session.curve + ' vs ' + peerCurve);
  }

  var peerPubRaw = base64UrlToPubKey(peerPubB64);
  console.log('[security] Peer public key decoded, length:', peerPubRaw.length);

  // ECDH → 32 bytes shared secret
  var sharedSecret = await performECDH(session.privateKey, peerPubRaw, session.curve);
  console.log('[security] ECDH complete, shared secret length:', sharedSecret.length);

  // HKDF → AES-256-GCM key
  // Salt: deterministic from both public keys (sorted so both sides get same salt)
  var myPubB64 = pubKeyToBase64Url(session.publicKeyRaw);
  var peerPubB64Clean = pubKeyToBase64Url(peerPubRaw);
  var sortedPubs = [myPubB64, peerPubB64Clean].sort().join(':');
  var saltBytes = new TextEncoder().encode(sortedPubs);
  var infoBytes = new TextEncoder().encode('ephchat-v2-session');

  session.sharedKey = await hkdfDeriveKey(sharedSecret, saltBytes, infoBytes);
  session.ready = true;

  // Zero out the raw shared secret
  for (var i = 0; i < sharedSecret.length; i++) sharedSecret[i] = 0;

  console.log('[security] *** SESSION READY *** for room:', roomCode, '(' + session.curve + ')');
  return { pqCiphertext: null };
}

/**
 * Step 3a: Encrypt a message.
 * Returns { v: 2, ciphertext, iv, ratchet: true }
 */
export async function encryptMessageSecure(text, roomCode) {
  var session = secureSessions.get(roomCode);
  if (!session) {
    throw new Error('[security] encryptMessageSecure: No session for room ' + roomCode);
  }
  if (!session.ready || !session.sharedKey) {
    throw new Error('[security] encryptMessageSecure: Session not ready for room ' + roomCode + ' (ready=' + session.ready + ', hasKey=' + !!session.sharedKey + ')');
  }

  var result = await aesGcmEncrypt(text, session.sharedKey);
  return {
    v: 2,
    ciphertext: result.ciphertext,
    iv: result.iv,
    ratchet: true
  };
}

/**
 * Step 3b: Decrypt a message.
 */
export async function decryptMessageSecure(payload, roomCode) {
  var session = secureSessions.get(roomCode);

  // v2 encrypted payload
  if (payload && payload.v === 2 && payload.ratchet) {
    if (!session || !session.ready || !session.sharedKey) {
      console.warn('[security] Cannot decrypt v2 message — session not ready for room:', roomCode);
      return '\u26a0\ufe0f Secure session not ready — cannot decrypt';
    }
    try {
      return await aesGcmDecrypt(payload.ciphertext, payload.iv, session.sharedKey);
    } catch (e) {
      console.error('[security] v2 decrypt error:', e.message);
      return '\u26a0\ufe0f Decryption failed';
    }
  }

  // Legacy v1 payload
  if (payload && payload.encrypted && payload.iv) {
    try {
      return await decryptMessage(payload.encrypted, payload.iv, roomCode);
    } catch (e) {
      console.error('[security] v1 decrypt error:', e.message);
      return '\u26a0\ufe0f Decryption failed (v1)';
    }
  }

  return '\u26a0\ufe0f Unknown message format';
}

/**
 * Destroy the session (on room leave).
 */
export function destroySecureSession(roomCode) {
  var session = secureSessions.get(roomCode);
  if (session) {
    session.sharedKey = null;
    session.privateKey = null;
    session.publicKeyRaw = null;
    secureSessions.delete(roomCode);
    console.log('[security] Session destroyed for room:', roomCode);
  }
  try { stopTrafficPadding(); } catch (e) { /* ignore */ }
}

/**
 * Get our own key bundle (to send back in key-bundle-answer).
 */
export function getKeyBundle(roomCode) {
  var session = secureSessions.get(roomCode);
  if (!session) {
    console.warn('[security] getKeyBundle: no session for room:', roomCode);
    return null;
  }
  return {
    v: 2,
    ik: pubKeyToBase64Url(session.publicKeyRaw),
    ek: pubKeyToBase64Url(session.publicKeyRaw),
    pq: null,
    curve: session.curve
  };
}

/**
 * Check if session is ready (for UI gating).
 */
export function isSessionReady(roomCode) {
  var session = secureSessions.get(roomCode);
  return !!(session && session.ready && session.sharedKey);
}

// ═══════════════════════════════════════════════════════════
// LEGACY UTILITIES
// ═══════════════════════════════════════════════════════════

export async function hashPassword(password) {
  var encoder = new TextEncoder();
  var data = encoder.encode(password);
  var hashBuffer = await crypto.subtle.digest('SHA-256', data);
  var hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

async function deriveKeyFromCode(code) {
  var encoder = new TextEncoder();
  var keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(code), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: encoder.encode('ephemeral-chat-salt'), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptMessage(text, roomCode) {
  var key = await deriveKeyFromCode(roomCode);
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var encoder = new TextEncoder();
  var encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, encoder.encode(text));
  return {
    encrypted: btoa(String.fromCharCode.apply(null, new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode.apply(null, iv))
  };
}

export async function decryptMessage(encrypted, iv, roomCode) {
  var key = await deriveKeyFromCode(roomCode);
  var encryptedBytes = Uint8Array.from(atob(encrypted), function(c) { return c.charCodeAt(0); });
  var ivBytes = Uint8Array.from(atob(iv), function(c) { return c.charCodeAt(0); });
  var decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, key, encryptedBytes);
  return new TextDecoder().decode(decrypted);
}

export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

export function generateToken(length) {
  if (!length) length = 32;
  var arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

export function generateRoomKey(length) {
  if (!length) length = 32;
  var arr = new Uint8Array(length);
  crypto.getRandomValues(arr);
  return Array.from(arr, function(b) { return b.toString(16).padStart(2, '0'); }).join('');
}

// Re-exports
export { initTrafficPadding, stopTrafficPadding, padMessage, unpadMessage, withJitter };
export { initOHTTP, ohttpFetch };
export { initPrivacyPass, getAuthToken };
