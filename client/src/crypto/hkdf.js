/**
 * HKDF — HMAC-based Key Derivation Function (RFC 5869)
 * 
 * Used by the Double Ratchet to derive chain keys and message keys.
 * Implemented using Web Crypto API (SubtleCrypto).
 * 
 * @module crypto/hkdf
 */

/**
 * HKDF-Extract: Extract a pseudorandom key from input keying material
 * PRK = HMAC-SHA-256(salt, IKM)
 * 
 * @param {Uint8Array} salt - Optional salt (if empty, uses zero-filled array)
 * @param {Uint8Array} ikm - Input keying material
 * @returns {Promise<ArrayBuffer>} Pseudorandom key (PRK)
 */
export async function hkdfExtract(salt, ikm) {
  if (!salt || salt.length === 0) {
    salt = new Uint8Array(32); // Zero-filled for SHA-256
  }
  
  const key = await crypto.subtle.importKey(
    'raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  
  return crypto.subtle.sign('HMAC', key, ikm);
}

/**
 * HKDF-Expand: Expand PRK to desired length
 * Uses HMAC-SHA-256 in a feedback loop.
 * 
 * @param {ArrayBuffer|Uint8Array} prk - Pseudorandom key from Extract
 * @param {Uint8Array} info - Context/application-specific info
 * @param {number} length - Desired output length in bytes (max 255 * 32)
 * @returns {Promise<Uint8Array>} Output keying material
 */
export async function hkdfExpand(prk, info, length) {
  const prkArray = prk instanceof ArrayBuffer ? new Uint8Array(prk) : prk;
  
  if (length > 255 * 32) {
    throw new Error('HKDF-Expand: requested length too large');
  }
  
  const key = await crypto.subtle.importKey(
    'raw', prkArray, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  
  const n = Math.ceil(length / 32);
  const okm = new Uint8Array(n * 32);
  let prev = new Uint8Array(0);
  
  for (let i = 0; i < n; i++) {
    const input = new Uint8Array(prev.length + info.length + 1);
    input.set(prev, 0);
    input.set(info, prev.length);
    input[prev.length + info.length] = i + 1;
    
    const block = await crypto.subtle.sign('HMAC', key, input);
    prev = new Uint8Array(block);
    okm.set(prev, i * 32);
  }
  
  return okm.slice(0, length);
}

/**
 * Complete HKDF: Extract + Expand
 * 
 * @param {Uint8Array} ikm - Input keying material
 * @param {Uint8Array} salt - Salt
 * @param {Uint8Array} info - Context info
 * @param {number} length - Output length
 * @returns {Promise<Uint8Array>} Derived key material
 */
export async function hkdf(ikm, salt, info, length) {
  const prk = await hkdfExtract(salt, ikm);
  return hkdfExpand(prk, info, length);
}

/**
 * Derive two keys from a chain key (for Double Ratchet).
 * Returns (new_chain_key, message_key).
 * 
 * chain_key_next = HMAC(chain_key, 0x01)
 * message_key    = HMAC(chain_key, 0x02)
 * 
 * @param {Uint8Array} chainKey - Current chain key (32 bytes)
 * @returns {Promise<{chainKey: Uint8Array, messageKey: Uint8Array}>}
 */
export async function deriveChainKeys(chainKey) {
  const key = await crypto.subtle.importKey(
    'raw', chainKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  
  const chainInput = new Uint8Array([0x01]);
  const msgInput = new Uint8Array([0x02]);
  
  const [nextChainKey, messageKey] = await Promise.all([
    crypto.subtle.sign('HMAC', key, chainInput),
    crypto.subtle.sign('HMAC', key, msgInput)
  ]);
  
  return {
    chainKey: new Uint8Array(nextChainKey),
    messageKey: new Uint8Array(messageKey)
  };
}

/**
 * Derive root key and chain key from root key + DH output.
 * Used when the DH ratchet advances.
 * 
 * (new_root_key, chain_key) = HKDF(root_key, dh_output, "ephchat-ratchet", 64)
 * 
 * @param {Uint8Array} rootKey - Current root key (32 bytes)
 * @param {Uint8Array} dhOutput - Shared secret from DH exchange (32 bytes)
 * @returns {Promise<{rootKey: Uint8Array, chainKey: Uint8Array}>}
 */
export async function deriveRootKeys(rootKey, dhOutput) {
  // Per Signal DR spec: rootKey is used as HKDF salt, dhOutput as IKM
  // hkdf(ikm=dhOutput, salt=rootKey, info, length)
  const info = new TextEncoder().encode('ephchat-ratchet');
  const derived = await hkdf(dhOutput, rootKey, info, 64);
  
  return {
    rootKey: derived.slice(0, 32),
    chainKey: derived.slice(32, 64)
  };
}

// ─── Utility ──────────────────────────────────────────────

/**
 * Constant-time comparison of two Uint8Arrays
 * @param {Uint8Array} a 
 * @param {Uint8Array} b 
 * @returns {boolean}
 */
export function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}
