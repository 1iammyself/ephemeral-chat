/**
 * Whisper Chains — layered X25519 + AES-GCM per-user DM encryption
 *
 * Each whisper is encrypted for a single recipient using their X25519
 * identity key. The sender generates an ephemeral keypair per message
 * (forward secrecy within the chain), performs ECDH, derives an AES-GCM
 * key via HKDF, and sends only ciphertext to the server.
 *
 * Hop tracking: the plaintext envelope includes { chainId, hop, maxHops }
 * so recipients know how many times the message has been forwarded, and
 * whether they can pass it on.
 */

import { generateX25519Keypair, x25519DH } from './x25519.js';
import { hkdf } from './hkdf.js';

// ── Helpers ──────────────────────────────────────────────────

function bytesToBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(b64) {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

async function deriveAESKey(sharedSecret) {
  const info = new TextEncoder().encode('WhisperChain-v1');
  const salt = new Uint8Array(32);
  const keyBytes = await hkdf(sharedSecret, salt, info, 32);
  return crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

// ── Public API ────────────────────────────────────────────────

/**
 * Encrypt a whisper for a single recipient.
 *
 * @param {string} plaintext  The secret text to send
 * @param {string} recipientIkB64  Recipient's identity public key (base64)
 * @param {boolean} recipientIsNative  Whether recipient uses native X25519
 * @param {string} chainId  Unique chain identifier (nanoid / random)
 * @param {number} hop  Current hop number (starts at 1)
 * @param {number} maxHops  Maximum chain length
 * @returns {Promise<{ephPubKey: string, ciphertext: string, iv: string}>}
 */
export async function encryptWhisper(plaintext, recipientIkB64, recipientIsNative, chainId, hop, maxHops) {
  const eph = await generateX25519Keypair();
  const recipientPubRaw = base64ToBytes(recipientIkB64);
  const sharedSecret = await x25519DH(eph.privateKey, recipientPubRaw, eph._native && recipientIsNative);
  const key = await deriveAESKey(sharedSecret);

  const envelope = JSON.stringify({ chainId, hop, maxHops, content: plaintext, ts: Date.now() });
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(envelope));

  return {
    ephPubKey: bytesToBase64(eph.publicKeyRaw),
    ciphertext: bytesToBase64(new Uint8Array(ct)),
    iv: bytesToBase64(iv),
    isNative: eph._native,
  };
}

/**
 * Decrypt an incoming whisper using our own identity private key.
 *
 * @param {string} ephPubKeyB64  Sender's ephemeral public key (base64)
 * @param {string} ciphertextB64  AES-GCM ciphertext (base64)
 * @param {string} ivB64  IV (base64)
 * @param {CryptoKey} myIdentityPrivateKey  Our X25519 private key
 * @param {boolean} senderIsNative  Whether sender used native X25519
 * @returns {Promise<{chainId: string, hop: number, maxHops: number, content: string, ts: number}>}
 */
export async function decryptWhisper(ephPubKeyB64, ciphertextB64, ivB64, myIdentityPrivateKey, senderIsNative) {
  const ephPubRaw = base64ToBytes(ephPubKeyB64);
  const sharedSecret = await x25519DH(myIdentityPrivateKey, ephPubRaw, senderIsNative);
  const key = await deriveAESKey(sharedSecret);

  const iv = base64ToBytes(ivB64);
  const ct = base64ToBytes(ciphertextB64);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(plain));
}

/**
 * Generate a random chain ID (16 hex chars).
 */
export function newChainId() {
  return Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
}
