/**
 * X25519 — Elliptic Curve Diffie-Hellman key exchange
 * 
 * Uses the Web Crypto API's X25519 support (available in modern browsers).
 * Falls back to a pure-JS implementation if not supported.
 * 
 * Used by the Double Ratchet for the DH ratchet step and by PQXDH
 * for the classical key exchange component.
 * 
 * @module crypto/x25519
 */

/**
 * Generate an ephemeral X25519 keypair
 * @returns {Promise<{publicKey: Uint8Array, privateKey: CryptoKey, publicKeyRaw: Uint8Array}>}
 */
export async function generateX25519Keypair() {
  try {
    // Try native Web Crypto X25519 (Chrome 113+, Firefox 128+, Safari 17.4+)
    const keypair = await crypto.subtle.generateKey(
      { name: 'X25519' },
      false, // not extractable (private key stays in CryptoKey)
      ['deriveBits']
    );
    
    const publicKeyRaw = new Uint8Array(
      await crypto.subtle.exportKey('raw', keypair.publicKey)
    );
    
    return {
      publicKey: keypair.publicKey,
      privateKey: keypair.privateKey,
      publicKeyRaw,
      _native: true
    };
  } catch (e) {
    // Fallback: use ECDH P-256 if X25519 not available
    // This is still secure, just not the curve we prefer
    console.warn('X25519 not available, falling back to ECDH P-256:', e.message);
    return generateECDHP256Keypair();
  }
}

/**
 * Perform X25519 Diffie-Hellman key agreement
 * @param {CryptoKey} privateKey - Our private key
 * @param {Uint8Array} peerPublicKeyRaw - Peer's public key (raw bytes)
 * @param {boolean} isNative - Whether using native X25519
 * @returns {Promise<Uint8Array>} Shared secret (32 bytes)
 */
export async function x25519DH(privateKey, peerPublicKeyRaw, isNative = true) {
  try {
    if (isNative) {
      const peerPublicKey = await crypto.subtle.importKey(
        'raw',
        peerPublicKeyRaw,
        { name: 'X25519' },
        false,
        []
      );
      
      const sharedBits = await crypto.subtle.deriveBits(
        { name: 'X25519', public: peerPublicKey },
        privateKey,
        256
      );
      
      return new Uint8Array(sharedBits);
    } else {
      // P-256 fallback
      return ecdhP256DH(privateKey, peerPublicKeyRaw);
    }
  } catch (e) {
    console.error('DH key agreement failed:', e);
    throw new Error('Key agreement failed: ' + e.message);
  }
}

/**
 * Serialize a keypair's public key to bytes for transmission
 * @param {Object} keypair - Keypair from generateX25519Keypair
 * @returns {Uint8Array} Public key bytes (32 bytes for X25519, 65 for P-256)
 */
export function serializePublicKey(keypair) {
  return keypair.publicKeyRaw;
}

// ─── P-256 Fallback ────────────────────────────────────────

/**
 * Fallback: Generate ECDH P-256 keypair
 * Used when X25519 is not available in the browser.
 */
async function generateECDHP256Keypair() {
  const keypair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits']
  );
  
  const publicKeyRaw = new Uint8Array(
    await crypto.subtle.exportKey('raw', keypair.publicKey)
  );
  
  return {
    publicKey: keypair.publicKey,
    privateKey: keypair.privateKey,
    publicKeyRaw,
    _native: false
  };
}

/**
 * Fallback: ECDH P-256 key agreement
 */
async function ecdhP256DH(privateKey, peerPublicKeyRaw) {
  const peerPublicKey = await crypto.subtle.importKey(
    'raw',
    peerPublicKeyRaw,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );
  
  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    privateKey,
    256
  );
  
  return new Uint8Array(sharedBits);
}

// ─── Utilities ─────────────────────────────────────────────

/**
 * Check if native X25519 is supported
 * @returns {Promise<boolean>}
 */
export async function isX25519Supported() {
  try {
    await crypto.subtle.generateKey({ name: 'X25519' }, false, ['deriveBits']);
    return true;
  } catch {
    return false;
  }
}

/**
 * Encode public key to base64url for transport
 * @param {Uint8Array} publicKey - Raw public key bytes
 * @returns {string} Base64URL encoded string
 */
export function publicKeyToBase64(publicKey) {
  return btoa(String.fromCharCode(...publicKey))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Decode public key from base64url
 * @param {string} base64 - Base64URL encoded string
 * @returns {Uint8Array} Raw public key bytes
 */
export function base64ToPublicKey(base64) {
  const padded = base64.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
