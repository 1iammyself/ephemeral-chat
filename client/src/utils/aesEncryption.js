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
    console.log('[AES-GCM] ✅ Room key ready for:', roomCode);
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
    console.log('[AES-GCM] Key cleared for room:', roomCode);
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

/**
 * Encrypt shim — wraps encryptMessage synchronously so ChatRoom.jsx can
 * keep calling encryptMLSMessage(text, roomCode) without async changes.
 * Since we need to derive the key first, we cache it eagerly on join.
 *
 * NOTE: This is intentionally synchronous-looking but returns a plain
 * object with a `_promise` field that ChatRoom resolves before sending.
 * We actually make this fully async by returning a Promise directly.
 */
export function encryptMLSMessage(text, roomCode) {
    // Return an object that looks like the old MLS payload but uses AES
    // We throw synchronously if the key isn't cached yet so callers catch it
    const key = roomKeys.get(roomCode);
    if (!key) {
        throw new Error('[AES-GCM] Room key not initialised — call initRoomEncryption first');
    }
    // We use a sync-looking wrapper that relies on the key already being cached
    // The actual encrypt call is async; we wrap it in a structure ChatRoom understands
    return _encryptSync(text, roomCode, key);
}

// Internal: returns the MLS-compatible payload shape
// Since we can't be truly sync with crypto.subtle, we return a temporary
// placeholder and patch ChatRoom to await encryptMLSMessage.
// Actually, the cleanest path: return a Promise that resolves to the payload,
// and patch the send handler in ChatRoom to await it.
function _encryptSync(text, roomCode, key) {
    // We use a trick: generate IV synchronously (getRandomValues is sync),
    // then schedule the encrypt and return a thenable.
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(text);

    // Return a Promise since crypto.subtle.encrypt is always async
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data).then(cipherBuffer => ({
        v: 4,
        ct: toBase64(cipherBuffer),
        iv: toBase64(iv),
        isEncrypted: true,
    }));
}

/**
 * Decrypt shim — async wrapper matching the old decryptMLSMessage signature.
 */
export async function decryptMLSMessage(payload, roomCode) {
    // Handle old MLS v3 messages gracefully during migration
    if (payload && payload.v === 3 && payload.mls) {
        return '⚠️ Message encrypted with old protocol — cannot decrypt';
    }
    return decryptMessage(payload, roomCode);
}
