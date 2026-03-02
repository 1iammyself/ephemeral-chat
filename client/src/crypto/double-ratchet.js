/**
 * Double Ratchet Algorithm — Per-message key ratcheting
 * 
 * Implements the Signal-style Double Ratchet for Ephemeral Chat.
 * Each message is encrypted with a unique key. Compromising one key
 * only reveals that one message (forward secrecy + post-compromise security).
 * 
 * Architecture:
 *   - Root Ratchet: advances on DH ratchet step (new ECDH exchange)
 *   - Sending Chain: derives message keys for outgoing messages
 *   - Receiving Chain: derives message keys for incoming messages
 *   - DH Ratchet: periodically rotates the root key via new X25519 exchange
 * 
 * @module crypto/double-ratchet
 */

import { deriveChainKeys, deriveRootKeys, hkdf } from './hkdf.js';
import { generateX25519Keypair, x25519DH, serializePublicKey, publicKeyToBase64, base64ToPublicKey } from './x25519.js';

// Maximum number of skipped message keys to store (prevents DoS)
const MAX_SKIP = 256;

// ─── Ratchet State ─────────────────────────────────────────

/**
 * @typedef {Object} RatchetState
 * @property {Uint8Array} rootKey - Current root key (32 bytes)
 * @property {Uint8Array} sendChainKey - Current sending chain key
 * @property {Uint8Array} recvChainKey - Current receiving chain key
 * @property {Object} dhSelf - Our current DH keypair {publicKey, privateKey, publicKeyRaw, _native}
 * @property {Uint8Array|null} dhRemote - Peer's current DH public key (raw)
 * @property {number} sendCounter - Messages sent in current sending chain
 * @property {number} recvCounter - Messages received in current receiving chain
 * @property {number} prevSendCounter - Messages sent in previous sending chain
 * @property {Map<string, Uint8Array>} skippedKeys - Stored keys for out-of-order messages
 */

/**
 * Create a new Double Ratchet session as the INITIATOR.
 * The initiator has performed the initial key agreement and sends first.
 * 
 * @param {Uint8Array} sharedSecret - Initial shared secret from PQXDH or simple DH (32 bytes)
 * @param {Uint8Array} remotePublicKey - Peer's initial DH public key (raw bytes)
 * @returns {Promise<RatchetState>} Initialized ratchet state
 */
export async function initRatchetInitiator(sharedSecret, remotePublicKey) {
  // Generate our DH keypair
  const dhSelf = await generateX25519Keypair();
  
  // Perform DH with the remote's initial key
  const dhOutput = await x25519DH(dhSelf.privateKey, remotePublicKey, dhSelf._native);
  
  // Derive root key and send chain key from shared secret + DH
  const { rootKey, chainKey: sendChainKey } = await deriveRootKeys(sharedSecret, dhOutput);
  
  return {
    rootKey,
    sendChainKey,
    recvChainKey: null,       // Set when we receive first message from peer
    dhSelf,
    dhRemote: remotePublicKey,
    sendCounter: 0,
    recvCounter: 0,
    prevSendCounter: 0,
    skippedKeys: new Map()
  };
}

/**
 * Create a new Double Ratchet session as the RESPONDER.
 * The responder receives the first message and ratchets on it.
 * 
 * @param {Uint8Array} sharedSecret - Initial shared secret from PQXDH or simple DH (32 bytes)
 * @param {Object} dhKeypair - Our pre-generated DH keypair
 * @returns {Promise<RatchetState>} Initialized ratchet state
 */
export async function initRatchetResponder(sharedSecret, dhKeypair) {
  return {
    rootKey: sharedSecret,
    sendChainKey: null,       // Set after first DH ratchet
    recvChainKey: null,       // Set when we receive first message
    dhSelf: dhKeypair,
    dhRemote: null,           // Set when we receive first message
    sendCounter: 0,
    recvCounter: 0,
    prevSendCounter: 0,
    skippedKeys: new Map()
  };
}

// ─── Encrypt ───────────────────────────────────────────────

/**
 * Encrypt a message using the Double Ratchet.
 * Advances the sending chain and returns the encrypted message + header.
 * 
 * @param {RatchetState} state - Current ratchet state (MUTATED)
 * @param {string} plaintext - Message to encrypt
 * @returns {Promise<{header: Object, ciphertext: string, iv: string}>}
 */
export async function ratchetEncrypt(state, plaintext) {
  if (!state.sendChainKey) {
    throw new Error('Cannot encrypt: sending chain not initialized. Wait for peer DH key.');
  }
  
  // Advance the sending chain
  const { chainKey: nextChainKey, messageKey } = await deriveChainKeys(state.sendChainKey);
  state.sendChainKey = nextChainKey;
  
  // Build header
  const header = {
    dh: publicKeyToBase64(state.dhSelf.publicKeyRaw),
    n: state.sendCounter,
    pn: state.prevSendCounter
  };
  
  state.sendCounter++;
  
  // Encrypt with AES-256-GCM using the derived message key
  const { encrypted, iv } = await aesGcmEncrypt(plaintext, messageKey);
  
  // Securely erase message key (best-effort in JS)
  messageKey.fill(0);
  
  return { header, ciphertext: encrypted, iv };
}

// ─── Decrypt ───────────────────────────────────────────────

/**
 * Decrypt a message using the Double Ratchet.
 * Handles DH ratchet advancement if the peer has a new public key.
 * Handles out-of-order messages via skipped key storage.
 * 
 * @param {RatchetState} state - Current ratchet state (MUTATED)
 * @param {Object} header - Message header {dh, n, pn}
 * @param {string} ciphertext - Encrypted message (base64)
 * @param {string} iv - Initialization vector (base64)
 * @returns {Promise<string>} Decrypted plaintext
 */
export async function ratchetDecrypt(state, header, ciphertext, iv) {
  const remoteDHKey = base64ToPublicKey(header.dh);
  
  // Check if we have a skipped key for this message
  const skippedKey = trySkippedKeys(state, header);
  if (skippedKey) {
    const plaintext = await aesGcmDecrypt(ciphertext, iv, skippedKey);
    skippedKey.fill(0);
    return plaintext;
  }
  
  // Check if we need to advance the DH ratchet
  if (!state.dhRemote || !arraysEqual(remoteDHKey, state.dhRemote)) {
    // Skip any remaining messages in the current receiving chain
    await skipMessageKeys(state, header.pn);
    
    // Perform DH ratchet step
    await dhRatchetStep(state, remoteDHKey);
  }
  
  // Skip any message keys before this one
  await skipMessageKeys(state, header.n);
  
  // Advance the receiving chain
  const { chainKey: nextChainKey, messageKey } = await deriveChainKeys(state.recvChainKey);
  state.recvChainKey = nextChainKey;
  state.recvCounter++;
  
  // Decrypt
  const plaintext = await aesGcmDecrypt(ciphertext, iv, messageKey);
  
  // Securely erase message key
  messageKey.fill(0);
  
  return plaintext;
}

// ─── DH Ratchet Step ───────────────────────────────────────

/**
 * Perform a DH ratchet step — generates new keys and advances the root chain
 * @param {RatchetState} state - Ratchet state (MUTATED)
 * @param {Uint8Array} remoteDHKey - Peer's new DH public key
 */
async function dhRatchetStep(state, remoteDHKey) {
  state.prevSendCounter = state.sendCounter;
  state.sendCounter = 0;
  state.recvCounter = 0;
  state.dhRemote = remoteDHKey;
  
  // DH with our current key and their new key → derive receiving chain
  const dhOutput1 = await x25519DH(state.dhSelf.privateKey, remoteDHKey, state.dhSelf._native);
  const recv = await deriveRootKeys(state.rootKey, dhOutput1);
  state.rootKey = recv.rootKey;
  state.recvChainKey = recv.chainKey;
  
  // Generate new DH keypair
  state.dhSelf = await generateX25519Keypair();
  
  // DH with our new key and their key → derive sending chain
  const dhOutput2 = await x25519DH(state.dhSelf.privateKey, remoteDHKey, state.dhSelf._native);
  const send = await deriveRootKeys(state.rootKey, dhOutput2);
  state.rootKey = send.rootKey;
  state.sendChainKey = send.chainKey;
}

// ─── Skipped Message Keys ──────────────────────────────────

/**
 * Store skipped message keys for out-of-order delivery
 * @param {RatchetState} state - Ratchet state
 * @param {number} until - Skip until this counter value
 */
async function skipMessageKeys(state, until) {
  if (!state.recvChainKey) return;
  
  if (state.recvCounter + MAX_SKIP < until) {
    throw new Error('Too many skipped messages — possible attack');
  }
  
  while (state.recvCounter < until) {
    const { chainKey, messageKey } = await deriveChainKeys(state.recvChainKey);
    state.recvChainKey = chainKey;
    
    // Store with composite key: dhPublicKey + counter
    const keyId = `${publicKeyToBase64(state.dhRemote || new Uint8Array(32))}:${state.recvCounter}`;
    state.skippedKeys.set(keyId, messageKey);
    
    state.recvCounter++;
    
    // Enforce maximum stored keys
    if (state.skippedKeys.size > MAX_SKIP) {
      const firstKey = state.skippedKeys.keys().next().value;
      const oldKey = state.skippedKeys.get(firstKey);
      if (oldKey) oldKey.fill(0);
      state.skippedKeys.delete(firstKey);
    }
  }
}

/**
 * Try to find a stored skipped key for this message
 * @param {RatchetState} state - Ratchet state
 * @param {Object} header - Message header
 * @returns {Uint8Array|null} Message key if found
 */
function trySkippedKeys(state, header) {
  const keyId = `${header.dh}:${header.n}`;
  const key = state.skippedKeys.get(keyId);
  if (key) {
    state.skippedKeys.delete(keyId);
    return key;
  }
  return null;
}

// ─── AES-256-GCM Encryption ───────────────────────────────

/**
 * Encrypt plaintext with AES-256-GCM using a message key
 * @param {string} plaintext - Text to encrypt
 * @param {Uint8Array} messageKey - 32-byte message key
 * @returns {Promise<{encrypted: string, iv: string}>} Base64 encoded ciphertext and IV
 */
async function aesGcmEncrypt(plaintext, messageKey) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  const key = await crypto.subtle.importKey(
    'raw', messageKey, 'AES-GCM', false, ['encrypt']
  );
  
  const encryptedBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  const encryptedArray = new Uint8Array(encryptedBuffer);
  const encrypted = btoa(String.fromCharCode(...encryptedArray));
  const ivBase64 = btoa(String.fromCharCode(...iv));
  
  return { encrypted, iv: ivBase64 };
}

/**
 * Decrypt ciphertext with AES-256-GCM using a message key
 * @param {string} ciphertextBase64 - Base64 encoded ciphertext
 * @param {string} ivBase64 - Base64 encoded IV
 * @param {Uint8Array} messageKey - 32-byte message key
 * @returns {Promise<string>} Decrypted plaintext
 */
async function aesGcmDecrypt(ciphertextBase64, ivBase64, messageKey) {
  const encryptedString = atob(ciphertextBase64);
  const encryptedArray = new Uint8Array(encryptedString.length);
  for (let i = 0; i < encryptedString.length; i++) {
    encryptedArray[i] = encryptedString.charCodeAt(i);
  }
  
  const ivString = atob(ivBase64);
  const iv = new Uint8Array(ivString.length);
  for (let i = 0; i < ivString.length; i++) {
    iv[i] = ivString.charCodeAt(i);
  }
  
  const key = await crypto.subtle.importKey(
    'raw', messageKey, 'AES-GCM', false, ['decrypt']
  );
  
  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encryptedArray
  );
  
  return new TextDecoder().decode(decryptedBuffer);
}

// ─── Utilities ─────────────────────────────────────────────

function arraysEqual(a, b) {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Destroy a ratchet state — zeroize all key material
 * MUST be called when leaving a room
 * @param {RatchetState} state - State to destroy
 */
export function destroyRatchetState(state) {
  if (state.rootKey) state.rootKey.fill(0);
  if (state.sendChainKey) state.sendChainKey.fill(0);
  if (state.recvChainKey) state.recvChainKey.fill(0);
  
  for (const [, key] of state.skippedKeys) {
    key.fill(0);
  }
  state.skippedKeys.clear();
  
  state.dhSelf = null;
  state.dhRemote = null;
}

/**
 * Export ratchet state for debug/logging (DOES NOT expose keys)
 * @param {RatchetState} state 
 * @returns {Object} Safe-to-log state summary
 */
export function debugRatchetState(state) {
  return {
    hasRootKey: !!state.rootKey,
    hasSendChain: !!state.sendChainKey,
    hasRecvChain: !!state.recvChainKey,
    hasDHRemote: !!state.dhRemote,
    sendCounter: state.sendCounter,
    recvCounter: state.recvCounter,
    prevSendCounter: state.prevSendCounter,
    skippedKeyCount: state.skippedKeys.size,
    dhSelfPublic: state.dhSelf ? publicKeyToBase64(state.dhSelf.publicKeyRaw).substring(0, 8) + '...' : null
  };
}
