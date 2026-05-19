/**
 * PQXDH — Post-Quantum Extended Diffie-Hellman Key Exchange
 * 
 * Implements a hybrid key exchange combining:
 *   - X25519 (classical Diffie-Hellman) — proven secure
 *   - ML-KEM-768 (post-quantum KEM) — quantum-resistant
 * 
 * Both must be broken to compromise the session key.
 * This follows Signal's PQXDH approach.
 * 
 * The output shared secret feeds into the Double Ratchet as the
 * initial root key.
 * 
 * @module crypto/pqxdh
 */

import { generateX25519Keypair, x25519DH, serializePublicKey, publicKeyToBase64, base64ToPublicKey } from './x25519.js';
import { initMLKEM, isMLKEMAvailable, mlkemKeyGen, mlkemEncaps, mlkemDecaps, mlkemPublicKeyToBase64, base64ToMLKEMPublicKey, mlkemCiphertextToBase64, base64ToMLKEMCiphertext } from './ml-kem.js';
import { hkdf } from './hkdf.js';

// ─── Key Bundle ────────────────────────────────────────────

/**
 * @typedef {Object} PQXDHKeyBundle
 * @property {Object} identityKey - Long-lived X25519 identity keypair
 * @property {Object} ephemeralKey - One-time X25519 ephemeral keypair
 * @property {Object} pqKey - ML-KEM-768 keypair (if available)
 * @property {boolean} pqAvailable - Whether post-quantum is active
 */

/**
 * Generate a PQXDH key bundle for this session.
 * Contains both classical and post-quantum key material.
 * 
 * @returns {Promise<PQXDHKeyBundle>}
 */
export async function generateKeyBundle() {
  // Initialize ML-KEM if not already done
  await initMLKEM();
  
  // Generate classical X25519 keys
  const identityKey = await generateX25519Keypair();
  const ephemeralKey = await generateX25519Keypair();
  
  // Generate post-quantum ML-KEM key (if available)
  let pqKey = null;
  const pqAvailable = isMLKEMAvailable();
  
  if (pqAvailable) {
    pqKey = await mlkemKeyGen();
  }
  
  return { identityKey, ephemeralKey, pqKey, pqAvailable };
}

/**
 * Serialize the PUBLIC part of a key bundle for transmission.
 * Only sends public keys — private keys never leave the device.
 * 
 * @param {PQXDHKeyBundle} bundle 
 * @returns {Object} Serializable public key bundle
 */
export function serializeKeyBundle(bundle) {
  const serialized = {
    v: 2, // Protocol version (v2 = PQXDH)
    ik: publicKeyToBase64(bundle.identityKey.publicKeyRaw),
    ek: publicKeyToBase64(bundle.ephemeralKey.publicKeyRaw),
    pq: bundle.pqAvailable && bundle.pqKey
      ? mlkemPublicKeyToBase64(bundle.pqKey.publicKey)
      : null,
    isNative: bundle.identityKey._native // So peer knows which DH to use
  };
  return serialized;
}

/**
 * Deserialize a received public key bundle
 * @param {Object} data - Received bundle data
 * @returns {Object} Parsed public key bundle
 */
export function deserializeKeyBundle(data) {
  return {
    version: data.v || 1,
    identityKeyRaw: base64ToPublicKey(data.ik),
    ephemeralKeyRaw: base64ToPublicKey(data.ek),
    pqPublicKey: data.pq ? base64ToMLKEMPublicKey(data.pq) : null,
    isNative: data.isNative
  };
}

// ─── Key Validation ────────────────────────────────────────

/**
 * Reject all-zero X25519 public keys (small subgroup attack).
 * @param {Uint8Array} key
 * @returns {boolean}
 */
function isValidPublicKey(key) {
  if (!key || key.length !== 32) return false;
  // Reject all-zero key (small subgroup)
  return key.some(b => b !== 0);
}

// ─── Key Agreement ─────────────────────────────────────────

/**
 * Perform PQXDH key agreement as the INITIATOR (Alice).
 * 
 * Alice has Bob's public key bundle and computes the shared secret.
 * 
 * Shared Secret = HKDF(
 *   DH(Alice_identity, Bob_identity) ||
 *   DH(Alice_ephemeral, Bob_identity) ||
 *   DH(Alice_ephemeral, Bob_ephemeral) ||
 *   [ML-KEM shared secret, if available]
 * )
 * 
 * @param {PQXDHKeyBundle} ourBundle - Our key bundle
 * @param {Object} peerPublicBundle - Peer's deserialized public bundle
 * @returns {Promise<{sharedSecret: Uint8Array, pqCiphertext: string|null, peerEphemeralKey: Uint8Array}>}
 */
export async function pqxdhInitiator(ourBundle, peerPublicBundle) {
  const isNative = ourBundle.identityKey._native;

  // Validate remote public keys before DH to prevent small subgroup attacks
  if (!isValidPublicKey(peerPublicBundle.identityKeyRaw)) {
    throw new Error('PQXDH: invalid peer identity key (all-zero or wrong length)');
  }
  if (!isValidPublicKey(peerPublicBundle.ephemeralKeyRaw)) {
    throw new Error('PQXDH: invalid peer ephemeral key (all-zero or wrong length)');
  }

  // Classical DH components
  const dh1 = await x25519DH(
    ourBundle.identityKey.privateKey,
    peerPublicBundle.identityKeyRaw,
    isNative
  );
  
  const dh2 = await x25519DH(
    ourBundle.ephemeralKey.privateKey,
    peerPublicBundle.identityKeyRaw,
    isNative
  );
  
  const dh3 = await x25519DH(
    ourBundle.ephemeralKey.privateKey,
    peerPublicBundle.ephemeralKeyRaw,
    isNative
  );
  
  // Combine DH outputs
  let combinedSecret = concatArrays(dh1, dh2, dh3);
  
  // Post-quantum component (if both sides support it)
  let pqCiphertext = null;
  
  if (ourBundle.pqAvailable && peerPublicBundle.pqPublicKey) {
    const { ciphertext, sharedSecret: pqSharedSecret } = await mlkemEncaps(
      peerPublicBundle.pqPublicKey
    );
    
    combinedSecret = concatArrays(combinedSecret, pqSharedSecret);
    pqCiphertext = mlkemCiphertextToBase64(ciphertext);
    
  } else {
  }
  
  // Derive final shared secret via HKDF
  const info = new TextEncoder().encode('ephchat-pqxdh-v2');
  const salt = new Uint8Array(32); // All-zero salt per Signal spec
  const sharedSecret = await hkdf(combinedSecret, salt, info, 32);
  
  // Securely erase intermediate values (best-effort in JS)
  dh1.fill(0);
  dh2.fill(0);
  dh3.fill(0);
  combinedSecret.fill(0);
  
  return {
    sharedSecret,
    pqCiphertext,
    peerEphemeralKey: peerPublicBundle.ephemeralKeyRaw
  };
}

/**
 * Perform PQXDH key agreement as the RESPONDER (Bob).
 * 
 * Bob receives Alice's initial message containing her public bundle
 * and the ML-KEM ciphertext.
 * 
 * @param {PQXDHKeyBundle} ourBundle - Our key bundle  
 * @param {Object} peerPublicBundle - Peer's deserialized public bundle
 * @param {string|null} pqCiphertext - ML-KEM ciphertext from initiator (base64)
 * @returns {Promise<{sharedSecret: Uint8Array, peerEphemeralKey: Uint8Array}>}
 */
export async function pqxdhResponder(ourBundle, peerPublicBundle, pqCiphertext) {
  const isNative = ourBundle.identityKey._native;

  // Validate remote public keys before DH to prevent small subgroup attacks
  if (!isValidPublicKey(peerPublicBundle.identityKeyRaw)) {
    throw new Error('PQXDH: invalid peer identity key (all-zero or wrong length)');
  }
  if (!isValidPublicKey(peerPublicBundle.ephemeralKeyRaw)) {
    throw new Error('PQXDH: invalid peer ephemeral key (all-zero or wrong length)');
  }

  // Classical DH components (same as initiator but with swapped roles)
  const dh1 = await x25519DH(
    ourBundle.identityKey.privateKey,
    peerPublicBundle.identityKeyRaw,
    isNative
  );
  
  const dh2 = await x25519DH(
    ourBundle.identityKey.privateKey,
    peerPublicBundle.ephemeralKeyRaw,
    isNative
  );
  
  const dh3 = await x25519DH(
    ourBundle.ephemeralKey.privateKey,
    peerPublicBundle.ephemeralKeyRaw,
    isNative
  );
  
  // Combine DH outputs
  let combinedSecret = concatArrays(dh1, dh2, dh3);
  
  // Post-quantum component
  if (ourBundle.pqAvailable && ourBundle.pqKey && pqCiphertext) {
    const ciphertextBytes = base64ToMLKEMCiphertext(pqCiphertext);
    const pqSharedSecret = await mlkemDecaps(ciphertextBytes, ourBundle.pqKey.secretKey);
    
    combinedSecret = concatArrays(combinedSecret, pqSharedSecret);
    
  }
  
  // Derive final shared secret via HKDF
  const info = new TextEncoder().encode('ephchat-pqxdh-v2');
  const salt = new Uint8Array(32);
  const sharedSecret = await hkdf(combinedSecret, salt, info, 32);
  
  // Securely erase intermediate values
  dh1.fill(0);
  dh2.fill(0);
  dh3.fill(0);
  combinedSecret.fill(0);
  
  return {
    sharedSecret,
    peerEphemeralKey: peerPublicBundle.ephemeralKeyRaw
  };
}

// ─── Utility ───────────────────────────────────────────────

/**
 * Concatenate multiple Uint8Arrays
 * @param  {...Uint8Array} arrays 
 * @returns {Uint8Array}
 */
function concatArrays(...arrays) {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/**
 * Get a summary of the key exchange for logging (no secrets exposed)
 * @param {PQXDHKeyBundle} bundle 
 * @returns {Object}
 */
export function pqxdhDebugInfo(bundle) {
  return {
    version: 'PQXDH v2',
    classicalCurve: bundle.identityKey._native ? 'X25519' : 'P-256',
    postQuantum: bundle.pqAvailable ? 'ML-KEM-768' : 'none',
    identityKeyFingerprint: publicKeyToBase64(bundle.identityKey.publicKeyRaw).substring(0, 12) + '...',
    ephemeralKeyFingerprint: publicKeyToBase64(bundle.ephemeralKey.publicKeyRaw).substring(0, 12) + '...'
  };
}
