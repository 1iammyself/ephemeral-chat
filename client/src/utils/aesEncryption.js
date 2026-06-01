/**
 * aesEncryption.js — AES-256-GCM E2EE for Ephemeral Chat
 *
 * Uses the Web Crypto API (SubtleCrypto) — no external dependencies.
 *
 * Each room operates on a shared symmetric key derived from the roomCode
 * via HKDF-SHA-256. Because all members know the roomCode, all members
 * can decrypt — providing E2EE against the server without any handshake.
 *
 * Security properties:
 *   - Confidentiality from the server (server only sees ciphertext)
 *   - Authenticated encryption (AES-GCM provides integrity + authenticity)
 *   - Per-message random IVs (12 bytes) prevent IV reuse
 *   - Key derivation via HKDF so the raw roomCode is never used as a key
 *
 * Message format: { v: 4, ct: base64Ciphertext, iv: base64IV, isEncrypted: true }
 */

import { padMessage, unpadMessage } from '../crypto/traffic-padding.js';

// ─── Per-room key cache ────────────────────────────────────────────────────
/** @type {Map<string, CryptoKey>} */
const roomKeys = new Map();

// ─── Helpers ──────────────────────────────────────────────────────────────

function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

function fromBase64(b64) {
    const binary = atob(b64);
    const arr = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
    return arr;
}

// ─── Key Derivation ───────────────────────────────────────────────────────

/**
 * Derive a room AES-256-GCM key from the roomCode using HKDF-SHA-256.
 * The derived key is cached per roomCode so derivation only happens once.
 *
 * @param {string} roomCode
 * @returns {Promise<CryptoKey>}
 */
async function getRoomKey(roomCode) {
    if (roomKeys.has(roomCode)) return roomKeys.get(roomCode);

    // Import the roomCode as raw key material for HKDF
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(roomCode),
        { name: 'HKDF' },
        false,
        ['deriveKey']
    );

    // Derive a 256-bit AES-GCM key
    const key = await crypto.subtle.deriveKey(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            // Fixed salt & info — same for all clients on the same room
            // NOTE: Static salt means rooms with identical codes derive identical keys.
            // Room codes have sufficient entropy (10-char crypto random) to mitigate this.
            // v5 (PQXDH+DR) provides proper forward secrecy and per-session keys.
            salt: new TextEncoder().encode('ephchat-aes-v4-salt'),
            info: new TextEncoder().encode('ephchat-room-message-key'),
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );

    roomKeys.set(roomCode, key);
    return key;
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Initialise encryption for a room.
 * Pre-derives and caches the room key so the first encrypt/decrypt is fast.
 *
 * @param {string} roomCode
 */
export async function initRoomEncryption(roomCode) {
    await getRoomKey(roomCode);
}

/**
 * Encrypt a plaintext string for a room.
 *
 * @param {string} text       — plaintext to encrypt
 * @param {string} roomCode   — room identifier used to derive the key
 * @returns {Promise<{ v: 4, ct: string, iv: string, isEncrypted: true }>}
 */
export async function encryptMessage(text, roomCode) {
    const key = await getRoomKey(roomCode);
    const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit random IV
    const data = new TextEncoder().encode(text);

    const cipherBuffer = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
    );

    return {
        v: 4,
        ct: toBase64(cipherBuffer),
        iv: toBase64(iv),
        isEncrypted: true,
    };
}

/**
 * Decrypt an AES-GCM encrypted message payload.
 *
 * @param {{ v: 4, ct: string, iv: string }} payload
 * @param {string} roomCode
 * @returns {Promise<string>} decrypted plaintext
 */
export async function decryptMessage(payload, roomCode) {
    if (!payload || payload.v !== 4 || !payload.ct || !payload.iv) {
        throw new Error('Invalid AES-GCM payload');
    }

    const key = await getRoomKey(roomCode);
    const iv = fromBase64(payload.iv);
    const cipherBytes = fromBase64(payload.ct);

    const plainBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        cipherBytes
    );

    return new TextDecoder().decode(plainBuffer);
}

/**
 * Destroy the cached key for a room (call on room leave).
 *
 * @param {string} roomCode
 */
export function destroyRoomEncryption(roomCode) {
    roomKeys.delete(roomCode);
}

// ─── MLS compat shims ─────────────────────────────────────────────────────
// These no-op stubs let ChatRoom.jsx keep its existing MLS imports without
// throwing, while all actual work is done by the functions above.

export function initMLS() { return Promise.resolve(); }
export function createMLSGroup() { return {}; }
export function createMLSIdentity() { return { keyPackage: null }; }
export function joinMLSGroup() { }
export function addMemberToGroup() { return { welcome: '', commit: '', proposal: '' }; }
export function destroyMLSSession(roomCode) { destroyRoomEncryption(roomCode); }
export function isMLSReady() { return true; }  // always ready — no handshake
export function isMLSCreator() { return false; }
export function getMLSKeyPackage() { return null; }

// ─── Size-bucket padding (flagged, backward-compatible) ────────────────────
// Pads the ciphertext to a fixed bucket so a network observer cannot infer
// message size. Rollout is staged to avoid breaking deployed clients:
//   - Receivers ALWAYS unpad a payload marked { p: 1 } (ship this first).
//   - Senders only pad once size padding is explicitly enabled (flip on after
//     every client understands the flag).
// Default: OFF — wired and tested, but not applied until setSizePadding(true).
let _sizePaddingEnabled = false;

/** Enable/disable outgoing size-bucket padding. Receivers always unpad p:1. */
export function setSizePadding(enabled) {
    _sizePaddingEnabled = !!enabled;
}

/** Whether outgoing size padding is currently enabled. */
export function isSizePaddingEnabled() {
    return _sizePaddingEnabled;
}

/** Locate the base64 ciphertext field for a v4/v5 payload, or null. */
function _ctPath(payload) {
    if (payload?.v === 5 && payload.dr) return ['dr', 'ciphertext'];
    if (payload?.v === 5 && payload.sk) return ['sk', 'ct'];
    if (payload?.v === 4 && typeof payload.ct === 'string') return ['ct'];
    return null;
}

/** Return a copy of payload with its ciphertext padded and marked { p: 1 }. */
function _padPayload(payload) {
    const path = _ctPath(payload);
    if (!path) return payload;
    const cur = path.length === 1 ? payload[path[0]] : payload[path[0]][path[1]];
    const padded = toBase64(padMessage(fromBase64(cur)));
    if (path.length === 1) return { ...payload, [path[0]]: padded, p: 1 };
    return { ...payload, [path[0]]: { ...payload[path[0]], [path[1]]: padded }, p: 1 };
}

/** Reverse _padPayload: if marked { p: 1 }, unpad the ciphertext field. */
function _unpadPayload(payload) {
    if (payload?.p !== 1) return payload;
    const path = _ctPath(payload);
    if (!path) return payload;
    const cur = path.length === 1 ? payload[path[0]] : payload[path[0]][path[1]];
    const unp = unpadMessage(fromBase64(cur));
    if (!unp) return payload;
    const restored = toBase64(unp);
    const { p, ...rest } = payload;
    if (path.length === 1) return { ...rest, [path[0]]: restored };
    return { ...rest, [path[0]]: { ...payload[path[0]], [path[1]]: restored } };
}

/**
 * Encrypt shim — routes to v5 (PQXDH + DR) when E2EE is ready,
 * otherwise falls back to v4 AES-GCM. Applies size padding when enabled.
 */
export async function encryptMLSMessage(text, roomCode) {
    let payload;
    // v5 path: PQXDH + Double Ratchet (or Megolm-style for groups)
    // Lazy import to avoid circular deps; _e2eeManager is set by initE2EEForRoom.
    if (_e2eeManager && _e2eeManager.isE2EEReady(roomCode)) {
        payload = await _e2eeManager.encryptE2EE(text, roomCode);
    } else {
        // v4 fallback: shared AES-256-GCM key (all room members can decrypt)
        const key = roomKeys.get(roomCode);
        if (!key) {
            throw new Error('[AES-GCM] Room key not initialised — call initRoomEncryption first');
        }
        payload = await _encryptSync(text, roomCode, key);
    }
    return _sizePaddingEnabled ? _padPayload(payload) : payload;
}

// Internal: v4 AES-GCM encrypt (NEVER modified — backward-compat baseline)
function _encryptSync(text, roomCode, key) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(text);
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data).then(cipherBuffer => ({
        v: 4,
        ct: toBase64(cipherBuffer),
        iv: toBase64(iv),
        isEncrypted: true,
    }));
}

/**
 * Decrypt shim — routes v5 to E2EE manager, v4 to AES, v3 to warning.
 */
export async function decryptMLSMessage(payload, roomCode) {
    // Forward-compatible: undo size padding before routing, regardless of the
    // local send-side toggle, so any client emitting padded messages works.
    payload = _unpadPayload(payload);

    // v5: PQXDH + Double Ratchet / Megolm
    if (payload?.v === 5) {
        if (_e2eeManager) {
            return _e2eeManager.decryptE2EE(payload, roomCode);
        }
        return '⚠️ v5 message received but E2EE manager not initialized';
    }
    // v3: legacy MLS — cannot decrypt
    if (payload && payload.v === 3 && payload.mls) {
        return '⚠️ Message encrypted with old protocol — cannot decrypt';
    }
    // v4: AES-256-GCM shared key — unchanged
    return decryptMessage(payload, roomCode);
}

// ─── E2EE Manager Integration ─────────────────────────────────────────────
// Holds a reference to the e2ee-manager module once initE2EEForRoom is called.
// This avoids a circular import: aesEncryption ← security ← ChatRoom → e2ee-manager.
let _e2eeManager = null;

/**
 * Wire in the E2EE manager so encryptMLSMessage/decryptMLSMessage can use it.
 * Called by security.js after importing e2ee-manager.
 * @param {Object} manager - { isE2EEReady, encryptE2EE, decryptE2EE }
 */
export function registerE2EEManager(manager) {
    _e2eeManager = manager;
}
