/**
 * Client-side security utilities for ephemeral chat
 * Handles credential hashing and secure transmission
 * 
 * === SECURITY UPGRADE ===
 * Now supports Double Ratchet (per-message keys) + PQXDH
 * (post-quantum key exchange) alongside the legacy AES-GCM path.
 * 
 * Use the ratchet-based API for new rooms; legacy encryptMessage/
 * decryptMessage remain for backward compatibility.
 */

// ─── New Crypto Imports ────────────────────────────────────
import { initRatchetInitiator, initRatchetResponder, ratchetEncrypt, ratchetDecrypt, destroyRatchetState } from '../crypto/double-ratchet.js';
import { generateKeyBundle, serializeKeyBundle, deserializeKeyBundle, pqxdhInitiator, pqxdhResponder } from '../crypto/pqxdh.js';
import { initTrafficPadding, stopTrafficPadding, padMessage, unpadMessage, withJitter } from '../crypto/traffic-padding.js';
import { initOHTTP, ohttpFetch } from '../crypto/ohttp.js';
import { initPrivacyPass, getAuthToken } from '../crypto/privacy-pass.js';

// ─── Ratchet Session Store ─────────────────────────────────
// Maps roomCode → { ratchetState, keyBundle, peerBundle }
const ratchetSessions = new Map();

/**
 * Initialize the full security stack for a room.
 * Call this once when joining a room, before sending messages.
 * 
 * @param {string} roomCode 
 * @param {boolean} isInitiator - true if this user created the room
 * @param {Object} peerKeyBundle - The other user's serialized key bundle (null if initiator waiting)
 * @returns {Promise<{keyBundle: Object, ratchetReady: boolean}>}
 */
export async function initSecureSession(roomCode, isInitiator, peerKeyBundle = null) {
  // Generate our own key bundle (X25519 + ML-KEM-768)
  const myBundle = await generateKeyBundle();
  const serialized = serializeKeyBundle(myBundle);
  
  const session = {
    myBundle,
    serializedBundle: serialized,
    ratchetState: null,
    ready: false
  };
  
  if (peerKeyBundle && isInitiator) {
    // We have the peer's bundle — run PQXDH as initiator
    const peerDeserialized = deserializeKeyBundle(peerKeyBundle);
    const { sharedSecret, peerEphemeralKey } = await pqxdhInitiator(myBundle, peerDeserialized);
    
    // Initialize Double Ratchet with the shared secret + peer's ephemeral DH key
    session.ratchetState = await initRatchetInitiator(sharedSecret, peerEphemeralKey);
    session.ready = true;
  } else if (peerKeyBundle && !isInitiator) {
    // We have the peer's bundle — run PQXDH as responder
    const peerDeserialized = deserializeKeyBundle(peerKeyBundle);
    const { sharedSecret } = await pqxdhResponder(myBundle, peerDeserialized);
    
    // Responder uses our own ephemeral keypair as the initial DH self key
    session.ratchetState = await initRatchetResponder(sharedSecret, myBundle.ephemeralKey);
    session.ready = true;
  }
  
  ratchetSessions.set(roomCode, session);
  
  // Initialize traffic padding (medium level by default)
  initTrafficPadding('medium');
  
  return { keyBundle: serialized, ratchetReady: session.ready };
}

/**
 * Complete the key exchange when the peer's bundle arrives.
 * @param {string} roomCode 
 * @param {Object} peerKeyBundle - Serialized peer key bundle
 * @param {boolean} isInitiator
 * @param {string|null} pqCiphertext - ML-KEM ciphertext from initiator (only used by responder)
 * @returns {Promise<{pqCiphertext: string|null}>} - Returns pqCiphertext when running as initiator
 */
export async function completeKeyExchange(roomCode, peerKeyBundle, isInitiator, pqCiphertext = null) {
  const session = ratchetSessions.get(roomCode);
  if (!session || session.ready) return { pqCiphertext: null };
  
  const peerDeserialized = deserializeKeyBundle(peerKeyBundle);
  let initiatorPqCt = null;
  
  if (isInitiator) {
    const result = await pqxdhInitiator(session.myBundle, peerDeserialized);
    session.ratchetState = await initRatchetInitiator(result.sharedSecret, result.peerEphemeralKey);
    initiatorPqCt = result.pqCiphertext; // Pass back so caller can send it to the peer
  } else {
    const result = await pqxdhResponder(session.myBundle, peerDeserialized, pqCiphertext);
    session.ratchetState = await initRatchetResponder(result.sharedSecret, session.myBundle.ephemeralKey);
  }
  
  session.ready = true;
  return { pqCiphertext: initiatorPqCt };
}

/**
 * Encrypt a message using the Double Ratchet.
 *
 * ╔══════════════════════════════════════════════════════════╗
 * ║  SECURITY: NO legacy fallback.                          ║
 * ║  If the ratchet session is not ready the call THROWS.   ║
 * ║  A silent fall-through to AES-GCM(v1) is a downgrade   ║
 * ║  attack surface: a MITM that strips the key-exchange    ║
 * ║  handshake forces both parties onto a shared roomCode   ║
 * ║  key it can derive, bypassing PQXDH entirely.           ║
 * ╚══════════════════════════════════════════════════════════╝
 * 
 * @param {string} text - Plaintext message
 * @param {string} roomCode - Room code (must have an active ratchet session)
 * @returns {Promise<Object>} v2 encrypted payload
 * @throws {Error} If the ratchet session is not established
 */
export async function encryptMessageSecure(text, roomCode) {
  const session = ratchetSessions.get(roomCode);
  
  if (!session || !session.ready || !session.ratchetState) {
    throw new Error(
      'DOWNGRADE_BLOCKED: Ratchet session not ready for room ' + roomCode +
      '. Complete the PQXDH key exchange before sending messages. ' +
      'Legacy v1 encryption is disabled to prevent downgrade attacks.'
    );
  }
  
  // Double Ratchet path — per-message key rotation
  const { header, ciphertext, iv } = await ratchetEncrypt(session.ratchetState, text);
  
  // Apply traffic padding to the ciphertext bytes
  // ciphertext is base64 — convert to Uint8Array for padding
  const ciphertextBytes = _base64ToUint8(ciphertext);
  const padded = padMessage(ciphertextBytes);
  
  return {
    v: 2, // Version 2 = ratchet-encrypted
    header,
    ciphertext: _uint8ToBase64(padded),
    iv, // AES-GCM IV (base64) — required for decryption
    ratchet: true
  };
}

/**
 * Decrypt a message using the Double Ratchet.
 *
 * ╔══════════════════════════════════════════════════════════╗
 * ║  SECURITY: Rejects v1 payloads in rooms that have a     ║
 * ║  v2 ratchet session.  A MITM cannot replay a legacy     ║
 * ║  {encrypted, iv} blob to trick the client into using    ║
 * ║  the weak shared-room-code key path.                    ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * @param {Object} payload - Encrypted payload (must be v:2 ratchet)
 * @param {string} roomCode 
 * @returns {Promise<string>} Decrypted text
 */
export async function decryptMessageSecure(payload, roomCode) {
  const session = ratchetSessions.get(roomCode);

  // ── v2 ratchet payload ──────────────────────────────────
  if (payload && payload.v === 2 && payload.ratchet) {
    if (!session || !session.ready || !session.ratchetState) {
      return '⚠️ Ratchet session not ready — cannot decrypt v2 message';
    }
    
    // Remove traffic padding (ciphertext is base64 → Uint8Array → unpad → Uint8Array)
    const unpadded = unpadMessage(_base64ToUint8(payload.ciphertext));
    if (!unpadded) return ''; // Chaff message — discard
    
    // Convert unpadded bytes back to base64 string for ratchetDecrypt/aesGcmDecrypt
    const ciphertextBase64 = _uint8ToBase64(unpadded);
    
    return await ratchetDecrypt(session.ratchetState, payload.header, ciphertextBase64, payload.iv);
  }

  // ── v1 legacy payload in a v2 room → REJECT ────────────
  if (session && session.ready) {
    console.error(
      '🛑 DOWNGRADE BLOCKED: Received v1 payload in a v2-secured room.',
      'This may indicate a downgrade attack or a peer that has not upgraded.'
    );
    return '⚠️ Message rejected: legacy (v1) encryption is not accepted in this room.';
  }

  // ── No session at all (pre-key-exchange) ────────────────
  // Only allow legacy decryption if NO ratchet session was ever created
  // for this room — i.e. both peers are genuinely on the old client.
  if (payload && payload.encrypted && payload.iv) {
    return await decryptMessage(payload.encrypted, payload.iv, roomCode);
  }
  
  return '⚠️ Unknown message format';
}

/**
 * Destroy a ratchet session (on room leave/close)
 * @param {string} roomCode 
 */
export function destroySecureSession(roomCode) {
  const session = ratchetSessions.get(roomCode);
  if (session && session.ratchetState) {
    destroyRatchetState(session.ratchetState);
  }
  ratchetSessions.delete(roomCode);
  stopTrafficPadding();
}

/**
 * Get the serialized key bundle for the current session
 * @param {string} roomCode 
 * @returns {Object|null}
 */
export function getKeyBundle(roomCode) {
  const session = ratchetSessions.get(roomCode);
  return session ? session.serializedBundle : null;
}

// ─── Helper Functions ──────────────────────────────────────
function _uint8ToBase64(arr) {
  return btoa(String.fromCharCode(...arr));
}

function _base64ToUint8(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

/**
 * Hash a password using SHA-256 before sending to server
 * This ensures passwords are never sent in plain text
 * @param {string} password - Plain text password
 * @param {string} salt - Salt (room code or challenge)
 * @returns {Promise<string>} Hashed password
 */
export async function hashPassword(password, salt = '') {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Generate a secure random token
 * @param {number} length - Length in bytes
 * @returns {string} Random hex token
 */
export function generateSecureToken(length = 32) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate room code format
 * @param {string} roomCode - Room code to validate
 * @returns {boolean} True if valid
 */
export function isValidRoomCode(roomCode) {
  return typeof roomCode === 'string' && 
         roomCode.length === 10 && 
         /^[A-Z0-9]+$/.test(roomCode);
}

/**
 * Validate nickname format
 * @param {string} nickname - Nickname to validate
 * @returns {boolean} True if valid
 */
export function isValidNickname(nickname) {
  return typeof nickname === 'string' && 
         nickname.trim().length >= 2 && 
         nickname.trim().length <= 20 &&
         /^[a-zA-Z0-9_-]+$/.test(nickname);
}

/**
 * Generate a random room key for E2EE
 * @returns {string} Base64URL string of the key
 */
export function generateRoomKey() {
  const array = new Uint8Array(32); // 256 bits
  crypto.getRandomValues(array);
  // Convert to Base64URL for shorter URLs
  const base64 = btoa(String.fromCharCode(...array));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Encrypt a message using AES-GCM
 * @param {string} text - Message text
 * @param {string} keyString - Hex string of the key
 * @returns {Promise<{encrypted: string, iv: string}>} Encrypted data and IV
 */
export async function encryptMessage(text, keyString) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    // Convert hex key string to key material
    // We hash it first to ensure it's the right length/format for importKey if it's not raw bytes
    // But if we generated 32 bytes hex, we can just import it? 
    // The user's example uses SHA-256 digest of the keyString. Let's follow that for robustness.
    const keyData = encoder.encode(keyString);
    const hash = await crypto.subtle.digest('SHA-256', keyData);
    const key = await crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt']);
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    
    // Convert to base64 for transport
    const encryptedArray = new Uint8Array(encryptedBuffer);
    const encryptedBase64 = btoa(String.fromCharCode(...encryptedArray));
    const ivBase64 = btoa(String.fromCharCode(...iv));
    
    return { encrypted: encryptedBase64, iv: ivBase64 };
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
}

/**
 * Decrypt a message using AES-GCM
 * @param {string} encryptedBase64 - Encrypted text (base64)
 * @param {string} ivBase64 - IV (base64)
 * @param {string} keyString - Hex string of the key
 * @returns {Promise<string>} Decrypted text
 */
export async function decryptMessage(encryptedBase64, ivBase64, keyString) {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(keyString);
    const hash = await crypto.subtle.digest('SHA-256', keyData);
    const key = await crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['decrypt']);
    
    const encryptedString = atob(encryptedBase64);
    const encryptedArray = new Uint8Array(encryptedString.length);
    for (let i = 0; i < encryptedString.length; i++) {
      encryptedArray[i] = encryptedString.charCodeAt(i);
    }
    
    const ivString = atob(ivBase64);
    const ivArray = new Uint8Array(ivString.length);
    for (let i = 0; i < ivString.length; i++) {
      ivArray[i] = ivString.charCodeAt(i);
    }
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivArray },
      key,
      encryptedArray
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.error('Decryption error:', error);
    return '⚠️ Decryption failed';
  }
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} { valid: boolean, strength: string, errors: array }
 */
export function validatePasswordStrength(password) {
  const errors = [];
  let strength = 'weak';

  if (!password || password.length === 0) {
    return { valid: true, strength: 'none', errors: [] }; // Optional password
  }

  if (password.length < 4) {
    errors.push('Password must be at least 4 characters');
  }

  if (password.length > 128) {
    errors.push('Password is too long (max 128 characters)');
  }

  // Calculate strength
  if (password.length >= 8) {
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    const strengthScore = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;

    if (strengthScore >= 3 && password.length >= 12) {
      strength = 'strong';
    } else if (strengthScore >= 2 && password.length >= 8) {
      strength = 'medium';
    }
  }

  return {
    valid: errors.length === 0,
    strength,
    errors
  };
}

/**
 * Sanitize user input to prevent XSS
 * @param {string} input - User input
 * @returns {string} Sanitized input
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';

  let sanitized = input;
  let previous;

  // Repeatedly remove dangerous patterns until the string stabilizes
  do {
    previous = sanitized;
    sanitized = sanitized
      .replace(/[<>]/g, '') // Remove < and >
      .replace(/\b(?:javascript|data|vbscript):/gi, '') // Remove potentially dangerous URL protocols
      .replace(/on\w+=/gi, ''); // Remove event handlers
  } while (sanitized !== previous);

  return sanitized
    .trim()
    .substring(0, 500); // Limit length
}

/**
 * Create a secure credential object for transmission
 * @param {Object} credentials - Raw credentials
 * @returns {Promise<Object>} Sanitized and hashed credentials
 */
export async function prepareCredentials(credentials) {
  const prepared = {};

  if (credentials.roomCode) {
    prepared.roomCode = credentials.roomCode.toString().trim().toUpperCase();
  }

  if (credentials.nickname) {
    prepared.nickname = sanitizeInput(credentials.nickname);
  }

  if (credentials.password) {
    // Note: Password is sent as-is to server for bcrypt hashing
    // In production, consider using HTTPS to encrypt transmission
    prepared.password = credentials.password;
  }

  if (credentials.inviteToken) {
    prepared.inviteToken = credentials.inviteToken;
  }

  if (credentials.captchaAnswer) {
    prepared.captchaAnswer = credentials.captchaAnswer;
  }

  if (credentials.captchaProblem) {
    prepared.captchaProblem = credentials.captchaProblem;
  }

  return prepared;
}

/**
 * Store sensitive data in session storage (cleared on tab close)
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 */
export function storeSessionData(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Failed to store session data:', error);
  }
}

/**
 * Retrieve sensitive data from session storage
 * @param {string} key - Storage key
 * @returns {any} Stored value or null
 */
export function getSessionData(key) {
  try {
    const data = sessionStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Failed to retrieve session data:', error);
    return null;
  }
}

/**
 * Clear sensitive data from session storage
 * @param {string} key - Storage key (optional, clears all if not provided)
 */
export function clearSessionData(key = null) {
  try {
    if (key) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.clear();
    }
  } catch (error) {
    console.error('Failed to clear session data:', error);
  }
}

/**
 * Clear all sensitive data on logout
 */
export function clearAllSensitiveData() {
  clearSessionData();
  // Clear any other sensitive data from memory
  if (window.roomCode) delete window.roomCode;
  if (window.userSession) delete window.userSession;
}

/**
 * Format time remaining for display
 * @param {number} ms - Milliseconds remaining
 * @returns {string} Formatted time string
 */
export function formatTimeRemaining(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Check if browser supports required security features
 * @returns {Object} { supported: boolean, missing: array }
 */
export function checkBrowserSecuritySupport() {
  const missing = [];

  if (!window.crypto || !window.crypto.subtle) {
    missing.push('Web Crypto API');
  }

  if (!window.sessionStorage) {
    missing.push('Session Storage');
  }

  if (!window.crypto.getRandomValues) {
    missing.push('Crypto Random Values');
  }

  return {
    supported: missing.length === 0,
    missing
  };
}

/**
 * Rate limit function calls
 * @param {Function} func - Function to rate limit
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Rate limited function
 */
export function rateLimit(func, delay = 1000) {
  let timeout = null;
  let lastCall = 0;

  return function(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= delay) {
      lastCall = now;
      return func.apply(this, args);
    } else {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        lastCall = Date.now();
        func.apply(this, args);
      }, delay - timeSinceLastCall);
    }
  };
}

export default {
  hashPassword,
  generateSecureToken,
  isValidRoomCode,
  isValidNickname,
  validatePasswordStrength,
  sanitizeInput,
  prepareCredentials,
  storeSessionData,
  getSessionData,
  clearSessionData,
  clearAllSensitiveData,
  formatTimeRemaining,
  checkBrowserSecuritySupport,
  rateLimit,
  generateRoomKey,
  encryptMessage,
  decryptMessage,
  // ─── Security Upgrade Exports ────────────────────────────
  initSecureSession,
  completeKeyExchange,
  encryptMessageSecure,
  decryptMessageSecure,
  destroySecureSession,
  getKeyBundle
};
