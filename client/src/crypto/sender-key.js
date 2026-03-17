/**
 * sender-key.js — Megolm-style group session encryption
 *
 * Provides per-sender symmetric encryption with forward secrecy via chain
 * advancement. Used for group rooms (>2 peers) where per-pair Double Ratchet
 * sessions would require O(n²) encryptions per message.
 *
 * Each sender has one key state per room. The chain advances with each message
 * so past keys cannot decrypt future messages (forward secrecy).
 */

import { hkdf } from './hkdf.js';

// ─── Generate ──────────────────────────────────────────────

/**
 * Generate a new sender key state.
 * @returns {Promise<{key: Uint8Array, counter: number, id: string}>}
 */
export async function generateSenderKey() {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const idBytes = crypto.getRandomValues(new Uint8Array(8));
  const id = btoa(String.fromCharCode(...idBytes)).replace(/[+/=]/g, '').substring(0, 8);
  return { key: new Uint8Array(key), counter: 0, id };
}

// ─── Encrypt ──────────────────────────────────────────────

/**
 * Encrypt a plaintext with the current sender key, advancing the chain.
 * @param {{ key: Uint8Array, counter: number, id: string }} state - Mutated in place
 * @param {string} plaintext
 * @returns {Promise<{ct: string, iv: string, counter: number, skId: string}>}
 */
export async function encryptWithSenderKey(state, plaintext) {
  const counter = state.counter;

  // Derive per-message key
  const messageKey = await _deriveSenderMessageKey(state.key, counter);

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(plaintext);

  const cryptoKey = await crypto.subtle.importKey('raw', messageKey, 'AES-GCM', false, ['encrypt']);
  const cipherBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, data);

  // Advance chain key
  state.key = await _advanceChainKey(state.key);
  state.counter++;

  messageKey.fill(0);

  return {
    ct: _toBase64(new Uint8Array(cipherBuffer)),
    iv: _toBase64(iv),
    counter,
    skId: state.id,
  };
}

// ─── Decrypt ──────────────────────────────────────────────

/**
 * Decrypt a sender-key encrypted message, advancing the receiver's chain state.
 *
 * The receiver stores the chain key at distribution time (counter N).
 * To decrypt message at counter M >= N:
 *   1. Advance the chain from N to M, discarding intermediate message keys.
 *   2. Derive the message key at counter M and use it to decrypt.
 *   3. Update the stored state to counter M+1 (discard old chain key).
 *
 * This gives forward secrecy: after decryption, past keys cannot be recovered.
 *
 * @param {{ key: Uint8Array, counter: number, id: string }} state - Mutable receiver state
 * @param {{ ct: string, iv: string, counter: number }} payload
 * @returns {Promise<string>}
 */
export async function decryptWithSenderKey(state, payload) {
  const targetCounter = payload.counter;

  if (targetCounter < state.counter) {
    throw new Error(
      `[SenderKey] Cannot decrypt message at counter ${targetCounter}: ` +
      `chain already advanced to ${state.counter} (no backward secrecy)`
    );
  }

  // Advance the chain from state.counter to targetCounter, discarding
  // intermediate message keys (forward secrecy for skipped messages).
  let currentKey = new Uint8Array(state.key);
  for (let i = state.counter; i < targetCounter; i++) {
    // Derive and discard this counter's message key
    const skippedMsgKey = await _deriveSenderMessageKey(currentKey, i);
    skippedMsgKey.fill(0);
    // Advance the chain
    const next = await _advanceChainKey(currentKey);
    currentKey.fill(0);
    currentKey = next;
  }

  // Derive the message key at targetCounter
  const messageKey = await _deriveSenderMessageKey(currentKey, targetCounter);

  // Decrypt
  const cryptoKey = await crypto.subtle.importKey('raw', messageKey, 'AES-GCM', false, ['decrypt']);
  const cipherBytes = _fromBase64(payload.ct);
  const iv = _fromBase64(payload.iv);
  const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, cipherBytes);

  // Advance chain one more step and update stored state (discard used key)
  const nextChainKey = await _advanceChainKey(currentKey);
  currentKey.fill(0);
  messageKey.fill(0);

  // Update mutable state: key is now the chain key at targetCounter+1
  state.key.fill(0);
  state.key = nextChainKey;
  state.counter = targetCounter + 1;

  return new TextDecoder().decode(plainBuffer);
}

// ─── Serialization ─────────────────────────────────────────

/**
 * Serialize a sender key state for DR-encrypted distribution to new room members.
 * @param {{ key: Uint8Array, counter: number, id: string }} state
 * @returns {{ key: string, counter: number, id: string }}
 */
export function serializeSenderKey(state) {
  return {
    key: _toBase64(state.key),
    counter: state.counter,
    id: state.id,
  };
}

/**
 * Deserialize a received sender key distribution.
 * @param {{ key: string, counter: number, id: string }} data
 * @returns {{ key: Uint8Array, counter: number, id: string }}
 */
export function deserializeSenderKey(data) {
  return {
    key: _fromBase64(data.key),
    counter: data.counter,
    id: data.id,
  };
}

// ─── Zeroize ───────────────────────────────────────────────

/**
 * Zeroize and discard a sender key state.
 * @param {{ key: Uint8Array }} state
 */
export function destroySenderKey(state) {
  if (state?.key instanceof Uint8Array) state.key.fill(0);
}

// ─── Internals ─────────────────────────────────────────────

async function _deriveSenderMessageKey(chainKey, counter) {
  const counterBytes = new Uint8Array(4);
  new DataView(counterBytes.buffer).setUint32(0, counter, false);
  const info = new Uint8Array([...new TextEncoder().encode('sender-msg'), ...counterBytes]);
  return hkdf(chainKey, new Uint8Array(32), info, 32);
}

async function _advanceChainKey(chainKey) {
  const info = new TextEncoder().encode('sender-chain-advance');
  return hkdf(chainKey, new Uint8Array(32), info, 32);
}

function _toBase64(buf) {
  let binary = '';
  for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
  return btoa(binary);
}

function _fromBase64(b64) {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return arr;
}
