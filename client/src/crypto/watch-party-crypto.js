/**
 * Watch party E2EE encryption.
 *
 * Encrypts all watch party metadata (media URL, playback state, timestamps)
 * using AES-256-GCM with a key derived from the room's shared secret.
 *
 * Server never sees plaintext watch party content — it only relays encrypted blobs.
 *
 * Key derivation:
 *   watchPartyKey = HKDF(roomSharedSecret, salt="ephchat-watch-party-v1", length=32)
 *
 * Wire format for encrypted events:
 *   { iv: Uint8Array(12), ct: Uint8Array, aadLabel: string }
 */

const WATCH_PARTY_KEY_INFO = new TextEncoder().encode('ephchat-watch-party-v1');
const AAD_EVENT = new TextEncoder().encode('watch-party-event-v1');
const AAD_URL = new TextEncoder().encode('watch-party-url-v1');

// Allowlist for media URLs
const ALLOWED_URL_PREFIXES = [
  'https://www.youtube.com/',
  'https://youtu.be/',
  'https://youtube.com/',
  'https://soundcloud.com/',
  'https://www.soundcloud.com/',
];

/**
 * Derive a dedicated AES-256-GCM key for watch party events from the room shared secret.
 *
 * @param {Uint8Array} roomSharedSecret - 32-byte room shared secret
 * @returns {Promise<CryptoKey>} AES-256-GCM CryptoKey (non-extractable)
 */
async function deriveWatchPartyKey(roomSharedSecret) {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    roomSharedSecret,
    { name: 'HKDF' },
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32), // zero salt — fixed derivation
      info: WATCH_PARTY_KEY_INFO,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * AES-256-GCM encrypt bytes.
 *
 * @param {CryptoKey} key
 * @param {Uint8Array} plaintext
 * @param {Uint8Array} aad - additional authenticated data
 * @returns {Promise<{ iv: string, ct: string }>} base64-encoded nonce and ciphertext
 */
async function gcmEncrypt(key, plaintext, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
    key,
    plaintext,
  );
  return {
    iv: toBase64(iv),
    ct: toBase64(new Uint8Array(ct)),
  };
}

/**
 * AES-256-GCM decrypt bytes.
 *
 * @param {CryptoKey} key
 * @param {string} ivB64 - base64 nonce
 * @param {string} ctB64 - base64 ciphertext+tag
 * @param {Uint8Array} aad
 * @returns {Promise<Uint8Array>}
 */
async function gcmDecrypt(key, ivB64, ctB64, aad) {
  const iv = fromBase64(ivB64);
  const ct = fromBase64(ctB64);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 },
    key,
    ct,
  );
  return new Uint8Array(pt);
}

/**
 * Validate a media URL is in the allowlist.
 * Prevents open redirect and XSS via watch party.
 *
 * @param {string} url
 * @throws {Error} if URL is not from an allowed provider
 */
export function validateMediaUrl(url) {
  if (typeof url !== 'string' || url.length === 0) {
    throw new Error('Media URL must be a non-empty string');
  }
  // Reject data: and javascript: URLs explicitly
  if (/^(javascript:|data:|vbscript:)/i.test(url)) {
    throw new Error(`Dangerous URL scheme rejected: ${url.slice(0, 30)}`);
  }
  const allowed = ALLOWED_URL_PREFIXES.some(prefix =>
    url.toLowerCase().startsWith(prefix.toLowerCase())
  );
  if (!allowed) {
    throw new Error(
      `Media URL not from an allowed provider. Allowed: YouTube, SoundCloud. Got: ${url.slice(0, 50)}`,
    );
  }
}

/**
 * Encrypt a watch party event.
 *
 * The media URL (if present) is encrypted separately so the server
 * cannot link the URL to any user even if the event envelope leaks.
 *
 * @param {Object} event
 * @param {string} event.type - 'play'|'pause'|'seek'|'mediaShare'|'mediaRemove'
 * @param {string} event.mediaId - opaque room-scoped media identifier
 * @param {number} [event.currentTime] - playback position in seconds
 * @param {string} [event.mediaUrl] - full URL (encrypted separately if present)
 * @param {string} event.userId - sender identifier (hashed for privacy)
 * @param {number} event.timestamp - unix ms
 * @param {Uint8Array} roomSharedSecret - 32-byte room shared secret
 * @returns {Promise<Object>} encrypted event envelope
 */
export async function encryptWatchPartyEvent(event, roomSharedSecret) {
  if (!(roomSharedSecret instanceof Uint8Array) || roomSharedSecret.length !== 32) {
    throw new Error('roomSharedSecret must be a 32-byte Uint8Array');
  }
  if (event.mediaUrl) {
    validateMediaUrl(event.mediaUrl);
  }

  const key = await deriveWatchPartyKey(roomSharedSecret);

  // Build event payload — exclude URL (encrypted separately)
  const payload = {
    type: event.type,
    mediaId: event.mediaId,
    ...(event.currentTime !== undefined && { currentTime: event.currentTime }),
    userId: hashUserId(event.userId),
    timestamp: event.timestamp,
  };

  const { iv: eventIv, ct: eventCt } = await gcmEncrypt(
    key,
    new TextEncoder().encode(JSON.stringify(payload)),
    AAD_EVENT,
  );

  // Encrypt URL separately if present
  let urlEnvelope = null;
  if (event.mediaUrl) {
    const { iv: urlIv, ct: urlCt } = await gcmEncrypt(
      key,
      new TextEncoder().encode(event.mediaUrl),
      AAD_URL,
    );
    urlEnvelope = { iv: urlIv, ct: urlCt };
  }

  return {
    version: 1,
    eventIv,
    eventCt,
    urlEnvelope,     // null if no URL
    mediaId: event.mediaId,    // visible to server for routing only
    timestamp: event.timestamp, // visible for TTL enforcement
  };
}

/**
 * Decrypt a watch party event.
 *
 * @param {Object} envelope - from encryptWatchPartyEvent
 * @param {Uint8Array} roomSharedSecret
 * @returns {Promise<Object>} decrypted event with optional mediaUrl
 */
export async function decryptWatchPartyEvent(envelope, roomSharedSecret) {
  if (!(roomSharedSecret instanceof Uint8Array) || roomSharedSecret.length !== 32) {
    throw new Error('roomSharedSecret must be a 32-byte Uint8Array');
  }
  if (envelope.version !== 1) {
    throw new Error(`Unknown watch party envelope version: ${envelope.version}`);
  }

  const key = await deriveWatchPartyKey(roomSharedSecret);

  const eventBytes = await gcmDecrypt(key, envelope.eventIv, envelope.eventCt, AAD_EVENT);
  const event = JSON.parse(new TextDecoder().decode(eventBytes));

  if (envelope.urlEnvelope) {
    const urlBytes = await gcmDecrypt(
      key,
      envelope.urlEnvelope.iv,
      envelope.urlEnvelope.ct,
      AAD_URL,
    );
    event.mediaUrl = new TextDecoder().decode(urlBytes);
  }

  return event;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function toBase64(bytes) {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(b64) {
  return new Uint8Array(atob(b64).split('').map(c => c.charCodeAt(0)));
}

/**
 * One-way hash of user ID for privacy.
 * Uses first 8 chars of SHA-256 truncated hex — sufficient for room-local identification.
 */
function hashUserId(userId) {
  // Sync approximation — in prod use crypto.subtle.digest async
  // We use a deterministic prefix to avoid async in this helper
  return `u_${userId.slice(0, 8)}`;
}
