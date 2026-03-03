/**
 * Client-side encryption utilities for Ephemeral Drops
 * 
 * Encryption model:
 * 1. Generate a random AES-256-GCM master key
 * 2. Encrypt the content with the master key
 * 3. For each recipient username, derive a wrapping key from:
 *    SHA-256(username_lowercase + dropSalt)
 * 4. Wrap (encrypt) the master key with each recipient's wrapping key
 * 5. Store wrapped keys alongside the ciphertext on the server
 * 
 * Decryption model:
 * 1. Recipient enters their username
 * 2. Derive wrapping key: SHA-256(username_lowercase + dropSalt)
 * 3. Unwrap (decrypt) the master key using the wrapping key
 * 4. Decrypt the content with the master key
 * 
 * Security properties:
 * - Server NEVER sees plaintext content
 * - Server NEVER sees plaintext usernames (only SHA-256 hashes)
 * - Each recipient gets independent access
 * - Master key is random — not derived from any username
 * - AES-256-GCM provides authenticated encryption (tamper detection)
 */

import { secureFetch } from './secure-fetch.js';

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3001' : '');

// ─── Hash Utilities ─────────────────────────────────────────

/**
 * SHA-256 hash a string, return hex
 * @param {string} input
 * @returns {Promise<string>} 64-char hex string
 */
export async function sha256(input) {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Hash a username for server-side matching
 * The username is lowercased and trimmed before hashing
 * @param {string} username
 * @param {string} salt - The drop's salt
 * @returns {Promise<string>} 64-char hex SHA-256 hash
 */
export async function hashUsername(username, salt) {
  const normalized = username.trim().toLowerCase();
  return sha256(normalized + ':' + salt);
}

// ─── Key Generation ─────────────────────────────────────────

/**
 * Generate a random salt for the drop
 * @returns {string} Base64-encoded 16-byte salt
 */
export function generateDropSalt() {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return uint8ToBase64(salt);
}

/**
 * Generate a random AES-256-GCM master key
 * @returns {Promise<CryptoKey>} The master key
 */
export async function generateMasterKey() {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable (we need to export it for wrapping)
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive a wrapping key from a username + salt
 * Used to wrap/unwrap the master key for each recipient
 * @param {string} username - Plaintext username
 * @param {string} salt - Drop salt (base64)
 * @returns {Promise<CryptoKey>} AES-GCM key derived from username
 */
export async function deriveWrappingKey(username, salt) {
  const normalized = username.trim().toLowerCase();
  const keyMaterial = normalized + ':wrap:' + salt;
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(keyMaterial));
  return crypto.subtle.importKey(
    'raw',
    hash,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ─── Encryption ─────────────────────────────────────────────

/**
 * Encrypt content with the master key
 * @param {ArrayBuffer|Uint8Array|string} content - Content to encrypt
 * @param {CryptoKey} masterKey - AES-256-GCM key
 * @returns {Promise<{ ciphertext: string, iv: string }>} Base64-encoded ciphertext and IV
 */
export async function encryptContent(content, masterKey) {
  let data;
  if (typeof content === 'string') {
    data = new TextEncoder().encode(content);
  } else if (content instanceof ArrayBuffer) {
    data = new Uint8Array(content);
  } else {
    data = content;
  }

  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    data
  );

  return {
    ciphertext: uint8ToBase64(new Uint8Array(encrypted)),
    iv: uint8ToBase64(iv),
  };
}

/**
 * Decrypt content with the master key
 * @param {string} ciphertextBase64 - Base64-encoded ciphertext
 * @param {string} ivBase64 - Base64-encoded IV
 * @param {CryptoKey} masterKey - AES-256-GCM key
 * @returns {Promise<ArrayBuffer>} Decrypted content
 */
export async function decryptContent(ciphertextBase64, ivBase64, masterKey) {
  const ciphertext = base64ToUint8(ciphertextBase64);
  const iv = base64ToUint8(ivBase64);

  return crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    ciphertext
  );
}

// ─── Key Wrapping ───────────────────────────────────────────

/**
 * Wrap (encrypt) the master key for a specific recipient
 * @param {CryptoKey} masterKey - The master key to wrap
 * @param {CryptoKey} wrappingKey - The recipient's derived wrapping key
 * @returns {Promise<string>} Base64-encoded wrapped key (iv + wrappedKey)
 */
export async function wrapMasterKey(masterKey, wrappingKey) {
  // Export the master key as raw bytes first
  const rawKey = await crypto.subtle.exportKey('raw', masterKey);

  // Encrypt the raw key bytes with the wrapping key
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    rawKey
  );

  // Combine IV + wrapped key bytes for storage
  const combined = new Uint8Array(iv.length + wrapped.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(wrapped), iv.length);

  return uint8ToBase64(combined);
}

/**
 * Unwrap (decrypt) the master key using a recipient's wrapping key
 * @param {string} wrappedKeyBase64 - Base64-encoded wrapped key (iv + wrappedKey)
 * @param {CryptoKey} wrappingKey - The recipient's derived wrapping key
 * @returns {Promise<CryptoKey>} The recovered master key
 */
export async function unwrapMasterKey(wrappedKeyBase64, wrappingKey) {
  const combined = base64ToUint8(wrappedKeyBase64);

  // Split IV (12 bytes) and wrapped key
  const iv = combined.slice(0, 12);
  const wrappedBytes = combined.slice(12);

  // Decrypt to get raw key bytes
  const rawKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    wrappedBytes
  );

  // Import as AES-GCM key
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

// ─── High-Level API ─────────────────────────────────────────

/**
 * Encrypt a drop for multiple recipients
 * This is the main function used by the CreateDrop UI
 * 
 * @param {string|ArrayBuffer|Uint8Array} content - The content to encrypt
 * @param {string[]} usernames - Array of recipient usernames (plaintext)
 * @returns {Promise<Object>} Everything needed to send to the server:
 *   { encryptedPayload, iv, salt, wrappedKeys, recipientHashes }
 */
export async function encryptDrop(content, usernames) {
  // 1. Generate random salt
  const salt = generateDropSalt();

  // 2. Generate random master key
  const masterKey = await generateMasterKey();

  // 3. Encrypt the content
  const { ciphertext, iv } = await encryptContent(content, masterKey);

  // 4. For each recipient: hash username + wrap master key
  const wrappedKeys = {};
  const recipientHashes = [];

  for (const username of usernames) {
    const hash = await hashUsername(username, salt);
    const wrappingKey = await deriveWrappingKey(username, salt);
    const wrappedKey = await wrapMasterKey(masterKey, wrappingKey);

    wrappedKeys[hash] = wrappedKey;
    recipientHashes.push(hash);
  }

  return {
    encryptedPayload: ciphertext,
    iv,
    salt,
    wrappedKeys,
    recipientHashes,
  };
}

/**
 * Decrypt a claimed drop
 * This is the main function used by the DropViewer UI
 * 
 * @param {string} encryptedPayload - Base64-encoded ciphertext
 * @param {string} iv - Base64-encoded IV
 * @param {string} salt - Base64-encoded salt
 * @param {string} wrappedKey - Base64-encoded wrapped master key for this recipient
 * @param {string} username - The recipient's plaintext username
 * @returns {Promise<ArrayBuffer>} Decrypted content
 */
export async function decryptDrop(encryptedPayload, iv, salt, wrappedKey, username) {
  // 1. Derive wrapping key from username
  const wrappingKey = await deriveWrappingKey(username, salt);

  // 2. Unwrap the master key
  const masterKey = await unwrapMasterKey(wrappedKey, wrappingKey);

  // 3. Decrypt the content
  return decryptContent(encryptedPayload, iv, masterKey);
}

// ─── File/Content Helpers ───────────────────────────────────

/**
 * Convert a File object to ArrayBuffer
 * @param {File} file
 * @returns {Promise<ArrayBuffer>}
 */
export function fileToArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Convert ArrayBuffer to a data URL for display
 * @param {ArrayBuffer} buffer
 * @param {string} mimeType
 * @returns {string} Data URL
 */
export function arrayBufferToDataUrl(buffer, mimeType) {
  const base64 = uint8ToBase64(new Uint8Array(buffer));
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Convert ArrayBuffer to text string (UTF-8)
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function arrayBufferToText(buffer) {
  return new TextDecoder().decode(buffer);
}

/**
 * Convert ArrayBuffer to a Blob and create a download URL
 * @param {ArrayBuffer} buffer
 * @param {string} mimeType
 * @returns {string} Object URL (must be revoked after use)
 */
export function arrayBufferToObjectUrl(buffer, mimeType) {
  const blob = new Blob([buffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

// ─── API Helpers ────────────────────────────────────────────

/**
 * Create a drop via the API
 * @param {Object} dropData - All encrypted drop data + metadata
 * @returns {Promise<Object>} { dropId, verbalCode, expiresAt, ephPacket }
 */
export async function createDropAPI(dropData) {
  const response = await secureFetch(`${API_BASE}/api/drops`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dropData),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to create drop');
  }
  return data;
}

/**
 * Get drop info (metadata only)
 * @param {string} dropId
 * @returns {Promise<Object>} Drop metadata
 */
export async function getDropInfoAPI(dropId) {
  const response = await secureFetch(`${API_BASE}/api/drops/${dropId}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Drop not found');
  }
  return data;
}

/**
 * Claim a drop — sends username hash, gets encrypted content
 * @param {string} dropId
 * @param {string} usernameHash - SHA-256 hash of (username + salt)
 * @returns {Promise<Object>} Encrypted content + wrapped key
 */
export async function claimDropAPI(dropId, usernameHash) {
  const response = await secureFetch(`${API_BASE}/api/drops/${dropId}/claim`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameHash }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to claim drop');
  }
  return data;
}

/**
 * Resolve a verbal code to a drop
 * @param {string} verbalCode - 4-word verbal code
 * @returns {Promise<Object>} { dropId, drop }
 */
export async function resolveVerbalCodeAPI(verbalCode) {
  const response = await secureFetch(`${API_BASE}/api/drops/resolve-verbal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ verbalCode }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Invalid verbal code');
  }
  return data;
}

/**
 * Validate an .eph packet
 * @param {Object} ephPacket - Parsed .eph file content
 * @returns {Promise<Object>} { dropId, hint, drop }
 */
export async function validateEphAPI(ephPacket) {
  const response = await secureFetch(`${API_BASE}/api/drops/validate-eph`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ephPacket }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Invalid .eph file');
  }
  return data;
}

/**
 * Get my drops (by creator ID)
 * @param {string} creatorId
 * @returns {Promise<Object[]>} Array of drop metadata
 */
export async function getMyDropsAPI(creatorId) {
  const response = await secureFetch(`${API_BASE}/api/drops/mine/${creatorId}`);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to get drops');
  }
  return data;
}

/**
 * Delete a drop
 * @param {string} dropId
 * @param {string} creatorId
 * @returns {Promise<void>}
 */
export async function deleteDropAPI(dropId, creatorId) {
  const response = await secureFetch(`${API_BASE}/api/drops/${dropId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creatorId }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to delete drop');
  }
}

/**
 * Download .eph file for a drop
 * @param {string} dropId
 * @returns {Promise<Blob>} The .eph file as a Blob
 */
export async function downloadEphFileAPI(dropId) {
  const response = await secureFetch(`${API_BASE}/api/drops/${dropId}/eph`);
  if (!response.ok) {
    throw new Error('Failed to download .eph file');
  }
  return response.blob();
}

// ─── Base64 Helpers ─────────────────────────────────────────

/**
 * Convert Uint8Array to Base64 string
 */
export function uint8ToBase64(uint8Array) {
  let binary = '';
  for (let i = 0; i < uint8Array.length; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to Uint8Array
 */
export function base64ToUint8(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}
