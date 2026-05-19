/**
 * Native FFI bridge for Rust crypto layer.
 *
 * Loads the WASM module compiled from native-crypto/ and provides
 * JavaScript wrappers for AES-GCM encrypt/decrypt, HKDF derive,
 * and PQXDH key exchange functions.
 *
 * Memory management: caller allocates output buffers in WASM memory,
 * bridge handles malloc/free lifecycle.
 *
 * Error codes (MUST match Rust src/ffi.rs):
 *   0  = success
 *  -1  = null pointer
 *  -2  = invalid length
 *  -3  = decryption failed
 *  -4  = key derivation failed
 *  -5  = serialization error
 *  -6  = invalid input
 *  -99 = panic caught
 */

let _wasmModule = null;

const ERR_MESSAGES = {
  0: 'Success',
  '-1': 'Null pointer passed to FFI function',
  '-2': 'Invalid key/data length',
  '-3': 'Decryption failed (authentication tag mismatch or corrupted ciphertext)',
  '-4': 'Key derivation operation failed',
  '-5': 'Serialization error',
  '-6': 'Invalid input',
  '-99': 'Internal panic caught across FFI boundary',
};

/**
 * Load and initialize the Rust WASM module.
 * Idempotent — safe to call multiple times.
 *
 * In development: loaded from `/wasm/ephchat_crypto.wasm` (copy from native-crypto/target/release/)
 * In production: bundled by Vite wasm plugin
 */
export async function loadNativeCrypto() {
  if (_wasmModule) return _wasmModule;

  try {
    // Dynamic import of WASM — Vite handles this with the ?init suffix
    const { default: init } = await import('/wasm/ephchat_crypto.wasm?init');
    _wasmModule = await init();

    // Sanity check
    if (typeof _wasmModule.ephchat_aes_gcm_encrypt !== 'function') {
      throw new Error('WASM module missing expected exports');
    }

    return _wasmModule;
  } catch (err) {
    throw new Error(`Native crypto unavailable: ${err.message}`);
  }
}

/**
 * Returns true if the WASM module has been loaded.
 */
export function isNativeCryptoAvailable() {
  return _wasmModule !== null;
}

// ─── Memory helpers ────────────────────────────────────────────────────────

function _write(mod, data) {
  const ptr = mod.ephchat_malloc(data.length);
  if (ptr === 0) throw new Error('WASM malloc returned null');
  const view = new Uint8Array(mod.memory.buffer);
  view.set(data, ptr);
  return ptr;
}

function _read(mod, ptr, len) {
  return new Uint8Array(mod.memory.buffer.slice(ptr, ptr + len));
}

function _readUsize(mod, ptr) {
  // usize = 4 bytes on wasm32
  return new Uint32Array(mod.memory.buffer)[ptr / 4];
}

function _free(mod, ptr) {
  if (ptr && ptr !== 0) mod.ephchat_free_buffer(ptr);
}

function _checkError(rc) {
  if (rc !== 0) {
    const msg = ERR_MESSAGES[String(rc)] || `Unknown error code: ${rc}`;
    throw new Error(`[NativeCrypto] ${msg}`);
  }
}

// ─── AES-256-GCM ──────────────────────────────────────────────────────────

/**
 * Encrypt plaintext with AES-256-GCM using the native Rust implementation.
 *
 * @param {Uint8Array} key - 32-byte encryption key
 * @param {Uint8Array} plaintext
 * @param {Uint8Array} [aad] - additional authenticated data (optional)
 * @returns {Promise<Uint8Array>} ciphertext as [12B nonce || ct || 16B tag]
 */
export async function encryptAESGCM(key, plaintext, aad = new Uint8Array(0)) {
  if (key.length !== 32) throw new Error('Key must be exactly 32 bytes');

  const mod = _wasmModule || await loadNativeCrypto();

  const keyPtr = _write(mod, key);
  const ptPtr = plaintext.length > 0 ? _write(mod, plaintext) : 0;
  const aadPtr = aad.length > 0 ? _write(mod, aad) : 0;

  // Output: 12 (nonce) + plaintext.length + 16 (tag)
  const outCapacity = 12 + plaintext.length + 16;
  const outPtr = mod.ephchat_malloc(outCapacity);
  const outLenPtr = mod.ephchat_malloc(4); // wasm32 usize = 4 bytes

  try {
    const rc = mod.ephchat_aes_gcm_encrypt(
      keyPtr,
      ptPtr,
      plaintext.length,
      aadPtr,
      aad.length,
      outPtr,
      outCapacity,
      outLenPtr,
    );
    _checkError(rc);

    const outLen = _readUsize(mod, outLenPtr);
    return _read(mod, outPtr, outLen);
  } finally {
    _free(mod, keyPtr);
    if (ptPtr) _free(mod, ptPtr);
    if (aadPtr) _free(mod, aadPtr);
    _free(mod, outPtr);
    _free(mod, outLenPtr);
  }
}

/**
 * Decrypt AES-256-GCM ciphertext using the native Rust implementation.
 *
 * @param {Uint8Array} key - 32-byte key
 * @param {Uint8Array} ciphertext - [12B nonce || ct || 16B tag]
 * @param {Uint8Array} [aad] - additional authenticated data
 * @returns {Promise<Uint8Array>} plaintext
 * @throws if authentication fails (tampered ciphertext or wrong AAD)
 */
export async function decryptAESGCM(key, ciphertext, aad = new Uint8Array(0)) {
  if (key.length !== 32) throw new Error('Key must be exactly 32 bytes');
  if (ciphertext.length < 28) throw new Error('Ciphertext too short (minimum 28 bytes)');

  const mod = _wasmModule || await loadNativeCrypto();

  const keyPtr = _write(mod, key);
  const ctPtr = _write(mod, ciphertext);
  const aadPtr = aad.length > 0 ? _write(mod, aad) : 0;

  // Plaintext is at most ciphertext - 12 (nonce) - 16 (tag)
  const outCapacity = ciphertext.length - 28;
  const outPtr = mod.ephchat_malloc(Math.max(outCapacity, 1));
  const outLenPtr = mod.ephchat_malloc(4);

  try {
    const rc = mod.ephchat_aes_gcm_decrypt(
      keyPtr,
      ctPtr,
      ciphertext.length,
      aadPtr,
      aad.length,
      outPtr,
      outCapacity,
      outLenPtr,
    );
    _checkError(rc);

    const outLen = _readUsize(mod, outLenPtr);
    return _read(mod, outPtr, outLen);
  } finally {
    _free(mod, keyPtr);
    _free(mod, ctPtr);
    if (aadPtr) _free(mod, aadPtr);
    _free(mod, outPtr);
    _free(mod, outLenPtr);
  }
}

// ─── HKDF-SHA256 ──────────────────────────────────────────────────────────

/**
 * HKDF-SHA256 key derivation using the native Rust implementation.
 *
 * @param {Uint8Array} ikm - input key material
 * @param {Uint8Array|null} salt - optional salt (null = RFC 5869 default)
 * @param {Uint8Array} info - context/application info
 * @param {number} outputLength - desired output length in bytes (1–8160)
 * @returns {Promise<Uint8Array>}
 */
export async function hkdfDerive(ikm, salt, info, outputLength) {
  if (outputLength < 1 || outputLength > 8160) {
    throw new Error(`Output length must be 1–8160 bytes, got ${outputLength}`);
  }

  const mod = _wasmModule || await loadNativeCrypto();

  const ikmPtr = _write(mod, ikm);
  const saltPtr = salt && salt.length > 0 ? _write(mod, salt) : 0;
  const infoPtr = info && info.length > 0 ? _write(mod, info) : 0;
  const outPtr = mod.ephchat_malloc(outputLength);

  try {
    const rc = mod.ephchat_hkdf_derive(
      ikmPtr,
      ikm.length,
      saltPtr,
      salt?.length ?? 0,
      infoPtr,
      info?.length ?? 0,
      outPtr,
      outputLength,
    );
    _checkError(rc);

    return _read(mod, outPtr, outputLength);
  } finally {
    _free(mod, ikmPtr);
    if (saltPtr) _free(mod, saltPtr);
    if (infoPtr) _free(mod, infoPtr);
    _free(mod, outPtr);
  }
}

// ─── PQXDH ────────────────────────────────────────────────────────────────

/**
 * Generate a PQXDH responder key bundle (Bob's side).
 * Returns the JSON-serialized bundle to be shared with initiators.
 *
 * @returns {Promise<string>} JSON-encoded PQXDHPublicBundle
 */
export async function pqxdhGenerateBundle() {
  const mod = _wasmModule || await loadNativeCrypto();

  // Bundle JSON can be up to ~4KB (ML-KEM-768 public key = 1184 bytes base64-encoded)
  const outCapacity = 8192;
  const outPtr = mod.ephchat_malloc(outCapacity);
  const outLenPtr = mod.ephchat_malloc(4);

  try {
    const rc = mod.ephchat_pqxdh_generate_bundle(outPtr, outCapacity, outLenPtr);
    _checkError(rc);

    const outLen = _readUsize(mod, outLenPtr);
    const bytes = _read(mod, outPtr, outLen);
    return new TextDecoder().decode(bytes);
  } finally {
    _free(mod, outPtr);
    _free(mod, outLenPtr);
  }
}

/**
 * Create a PQXDH initial message (Alice's side).
 *
 * @param {string} bundleJson - JSON from pqxdhGenerateBundle()
 * @returns {Promise<{sharedSecret: Uint8Array, initialMessage: Uint8Array}>}
 */
export async function pqxdhCreateInitialMessage(bundleJson) {
  const mod = _wasmModule || await loadNativeCrypto();

  const bundleBytes = new TextEncoder().encode(bundleJson);
  const bundlePtr = _write(mod, bundleBytes);

  const sharedSecretPtr = mod.ephchat_malloc(32);
  const msgCapacity = 4096; // 32 + 1088 + overhead
  const msgPtr = mod.ephchat_malloc(msgCapacity);
  const msgLenPtr = mod.ephchat_malloc(4);

  try {
    const rc = mod.ephchat_pqxdh_create_initial_message(
      bundlePtr,
      bundleBytes.length,
      sharedSecretPtr,
      32,
      msgPtr,
      msgCapacity,
      msgLenPtr,
    );
    _checkError(rc);

    const sharedSecret = _read(mod, sharedSecretPtr, 32);
    const msgLen = _readUsize(mod, msgLenPtr);
    const initialMessage = _read(mod, msgPtr, msgLen);

    return { sharedSecret, initialMessage };
  } finally {
    _free(mod, bundlePtr);
    _free(mod, sharedSecretPtr);
    _free(mod, msgPtr);
    _free(mod, msgLenPtr);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export const nativeCrypto = {
  load: loadNativeCrypto,
  isAvailable: isNativeCryptoAvailable,
  encryptAESGCM,
  decryptAESGCM,
  hkdfDerive,
  pqxdhGenerateBundle,
  pqxdhCreateInitialMessage,
};

export default nativeCrypto;
