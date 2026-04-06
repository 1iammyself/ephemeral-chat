/**
 * Device fingerprinting for attestation.
 *
 * Derives a stable device identifier using:
 * 1. Canvas 2D rendering fingerprint
 * 2. WebGL renderer/vendor strings
 * 3. Navigator properties (platform, language, hardwareConcurrency, deviceMemory)
 * 4. Screen properties (width, height, colorDepth, pixelRatio)
 *
 * The raw fingerprint strings are SHA-256 hashed to produce a 32-byte device ID.
 * The ID is stored in IndexedDB under 'device_info' store.
 *
 * Privacy: fingerprint never leaves the device except as input to attestation.
 * Re-generation: if IndexedDB is cleared, a new fingerprint is generated.
 *
 * @module crypto/device-fingerprint
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const DB_NAME = 'ephchat-device';
const DB_VERSION = 1;
const STORE_NAME = 'device_info';
const FINGERPRINT_KEY = 'fingerprint';

// ─── IndexedDB helpers ────────────────────────────────────────────────────────

/**
 * Open (or create) the device IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = (event) => reject(event.target.error);
  });
}

/**
 * Read the stored fingerprint from IndexedDB.
 * @returns {Promise<string|null>} hex fingerprint or null if not found
 */
async function readFromDb() {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(FINGERPRINT_KEY);

      request.onsuccess = (event) => {
        const record = event.target.result;
        resolve(record ? record.value : null);
      };
      request.onerror = (event) => reject(event.target.error);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

/**
 * Persist a fingerprint hex string to IndexedDB.
 * @param {string} hexString
 * @returns {Promise<void>}
 */
async function writeToDb(hexString) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const record = { id: FINGERPRINT_KEY, value: hexString, timestamp: Date.now() };
      const request = store.put(record);

      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
      tx.oncomplete = () => { db.close(); resolve(); };
    });
  } catch {
    // IndexedDB unavailable — silently skip persistence
  }
}

/**
 * Delete the stored fingerprint from IndexedDB.
 * @returns {Promise<void>}
 */
async function deleteFromDb() {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(FINGERPRINT_KEY);

      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(event.target.error);
      tx.oncomplete = () => { db.close(); resolve(); };
    });
  } catch {
    // Nothing to clear or IndexedDB unavailable
  }
}

// ─── Fingerprint source collectors ───────────────────────────────────────────

/**
 * Collect a canvas 2D rendering fingerprint string.
 * Uses OffscreenCanvas when available, falls back to a DOM canvas.
 * Returns an empty string if canvas is blocked.
 * @returns {string}
 */
function collectCanvasFingerprint() {
  try {
    let canvas;
    let ctx;

    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(200, 50);
      ctx = canvas.getContext('2d');
    } else {
      canvas = document.createElement('canvas');
      canvas.width = 200;
      canvas.height = 50;
      ctx = canvas.getContext('2d');
    }

    if (!ctx) return '';

    // Draw with specific styles to maximise renderer variation
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 200, 50);
    ctx.fillStyle = '#069';
    ctx.fillText('ephchat\uD83D\uDD12', 2, 2);
    ctx.fillStyle = 'rgba(102,204,0,0.7)';
    ctx.fillText('ephchat\uD83D\uDD12', 4, 4);

    // OffscreenCanvas does not have toDataURL; convert to blob URL string approximation
    if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
      // Use ImageData as a stable string proxy
      const imageData = ctx.getImageData(0, 0, 200, 50);
      return Array.from(imageData.data.subarray(0, 400)).join(',');
    }

    return canvas.toDataURL();
  } catch {
    return '';
  }
}

/**
 * Collect WebGL RENDERER and VENDOR strings.
 * Tries webgl2 first, falls back to webgl.
 * Returns an empty string if WebGL is blocked or unavailable.
 * @returns {string}
 */
function collectWebGLFingerprint() {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');

    if (!gl) return '';

    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (!ext) return '';

    const renderer = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '';
    const vendor = gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '';

    return `${vendor}::${renderer}`;
  } catch {
    return '';
  }
}

/**
 * Collect stable navigator properties.
 * @returns {string}
 */
function collectNavigatorFingerprint() {
  try {
    const parts = [
      navigator.platform || '',
      navigator.language || '',
      String(navigator.hardwareConcurrency || ''),
      // deviceMemory is non-standard; may be undefined in some browsers
      String(navigator.deviceMemory != null ? navigator.deviceMemory : ''),
    ];
    return parts.join('|');
  } catch {
    return '';
  }
}

/**
 * Collect screen and window properties.
 * @returns {string}
 */
function collectScreenFingerprint() {
  try {
    const parts = [
      String(screen.width || ''),
      String(screen.height || ''),
      String(screen.colorDepth || ''),
      String(window.devicePixelRatio || ''),
    ];
    return parts.join('|');
  } catch {
    return '';
  }
}

// ─── Hashing ──────────────────────────────────────────────────────────────────

/**
 * SHA-256 hash a string and return the result as a lowercase hex string.
 * @param {string} input
 * @returns {Promise<string>} 64-char hex string
 */
async function sha256Hex(input) {
  const encoded = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a fresh device fingerprint without reading from IndexedDB.
 *
 * Collects canvas, WebGL, navigator, and screen signals, concatenates them,
 * and returns their SHA-256 hash as a 64-character hex string.
 *
 * Gracefully degrades: if canvas or WebGL are blocked, only the remaining
 * signals are used. Never throws — returns best-effort result.
 *
 * @returns {Promise<string>} hex SHA-256 fingerprint (64 chars)
 */
export async function generateDeviceFingerprint() {
  try {
    const canvas = collectCanvasFingerprint();
    const webgl = collectWebGLFingerprint();
    const nav = collectNavigatorFingerprint();
    const screen_ = collectScreenFingerprint();

    const raw = [canvas, webgl, nav, screen_].join('|||');
    return await sha256Hex(raw);
  } catch {
    // Absolute last-resort fallback: hash a random value so we always return something
    const fallback = String(Date.now()) + String(Math.random());
    return await sha256Hex(fallback).catch(() => '0'.repeat(64));
  }
}

/**
 * Return the device fingerprint, reading from IndexedDB when available.
 *
 * If IndexedDB holds a previously stored fingerprint, it is returned immediately.
 * Otherwise a new fingerprint is generated, persisted to IndexedDB, and returned.
 * If IndexedDB is unavailable the fingerprint is still generated and returned.
 *
 * Never throws — returns best-effort fingerprint.
 *
 * @returns {Promise<string>} hex SHA-256 fingerprint (64 chars)
 */
export async function getDeviceFingerprint() {
  try {
    const stored = await readFromDb();
    if (stored) return stored;

    const fingerprint = await generateDeviceFingerprint();
    await writeToDb(fingerprint);
    return fingerprint;
  } catch {
    return generateDeviceFingerprint();
  }
}

/**
 * Clear the stored device fingerprint from IndexedDB.
 *
 * After calling this, the next call to getDeviceFingerprint() will generate
 * and store a fresh fingerprint.
 *
 * @returns {Promise<void>}
 */
export async function clearDeviceFingerprint() {
  await deleteFromDb();
}
