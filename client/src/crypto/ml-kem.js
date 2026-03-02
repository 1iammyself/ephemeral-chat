/**
 * ML-KEM (Kyber) — Post-Quantum Key Encapsulation Mechanism
 * 
 * Uses the `mlkem` npm package (NIST FIPS 203 ML-KEM-768 implementation).
 * ML-KEM-768 is NIST's selected post-quantum KEM standard.
 * 
 * If the library is not available, the module gracefully degrades
 * and the PQXDH layer will use classical-only key exchange.
 * 
 * @module crypto/ml-kem
 */

let kyberInstance = null;
let kyberLoadAttempted = false;

/**
 * Attempt to load the ML-KEM-768 module.
 * Call this once at app startup; it's a no-op if already loaded.
 * 
 * @returns {Promise<boolean>} true if ML-KEM is available
 */
export async function initMLKEM() {
  if (kyberInstance) return true;
  if (kyberLoadAttempted) return false;
  
  kyberLoadAttempted = true;
  
  try {
    // Dynamic import — Vite will bundle this; tree-shakeable
    const { MlKem768 } = await import('mlkem');
    kyberInstance = new MlKem768();
    console.log('🔐 ML-KEM-768 initialized (NIST FIPS 203 — production grade)');
    return true;
  } catch (e) {
    console.warn('⚠️ ML-KEM not available, using classical-only key exchange:', e.message);
    return false;
  }
}

/**
 * Check if ML-KEM is available
 * @returns {boolean}
 */
export function isMLKEMAvailable() {
  return kyberInstance !== null;
}

/**
 * Generate an ML-KEM-768 keypair
 * @returns {Promise<{publicKey: Uint8Array, secretKey: Uint8Array}>}
 */
export async function mlkemKeyGen() {
  if (!kyberInstance) {
    throw new Error('ML-KEM not initialized. Call initMLKEM() first.');
  }
  const [publicKey, secretKey] = await kyberInstance.generateKeyPair();
  return { publicKey, secretKey };
}

/**
 * Encapsulate: generate a shared secret and ciphertext from a public key
 * @param {Uint8Array} publicKey - Recipient's ML-KEM public key
 * @returns {Promise<{ciphertext: Uint8Array, sharedSecret: Uint8Array}>}
 */
export async function mlkemEncaps(publicKey) {
  if (!kyberInstance) {
    throw new Error('ML-KEM not initialized');
  }
  const [ciphertext, sharedSecret] = await kyberInstance.encap(publicKey);
  return { ciphertext, sharedSecret };
}

/**
 * Decapsulate: recover the shared secret from a ciphertext and secret key
 * @param {Uint8Array} ciphertext - The encapsulated ciphertext
 * @param {Uint8Array} secretKey - Our ML-KEM secret key
 * @returns {Promise<Uint8Array>} Shared secret (32 bytes)
 */
export async function mlkemDecaps(ciphertext, secretKey) {
  if (!kyberInstance) {
    throw new Error('ML-KEM not initialized');
  }
  return kyberInstance.decap(ciphertext, secretKey);
}

// ─── Serialization ─────────────────────────────────────────

/**
 * Encode ML-KEM public key to base64 for transport
 * @param {Uint8Array} publicKey 
 * @returns {string}
 */
export function mlkemPublicKeyToBase64(publicKey) {
  return btoa(String.fromCharCode(...publicKey))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decode ML-KEM public key from base64
 * @param {string} base64 
 * @returns {Uint8Array}
 */
export function base64ToMLKEMPublicKey(base64) {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encode ML-KEM ciphertext to base64 for transport
 * @param {Uint8Array} ciphertext 
 * @returns {string}
 */
export function mlkemCiphertextToBase64(ciphertext) {
  return btoa(String.fromCharCode(...ciphertext))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decode ML-KEM ciphertext from base64
 * @param {string} base64 
 * @returns {Uint8Array}
 */
export function base64ToMLKEMCiphertext(base64) {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
