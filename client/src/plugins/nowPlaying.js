/**
 * Capacitor NowPlaying Plugin Bridge
 *
 * JavaScript interface for the native Android NowPlayingPlugin.
 * Reads active MediaSession metadata to detect what the user is
 * currently listening to (Spotify, YouTube Music, etc.).
 *
 * On non-native platforms, returns null (graceful no-op).
 * On Electron, the Electron bridge handles this separately.
 */

import { registerPlugin } from '@capacitor/core';
import { isCapacitor, isAndroid } from '../utils/platform';

// Register the native plugin (only loads on Android)
const NativeNowPlaying = isCapacitor ? registerPlugin('NowPlaying') : null;

let pollingInterval = null;
let lastTitle = null;
let lastArtist = null;
let listeners = [];

/**
 * Sanitize and truncate a string for safe transport.
 * Strips HTML tags and limits length to prevent injection/abuse.
 */
function sanitizeField(str, maxLen = 120) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>/g, '')   // Strip HTML tags
    .replace(/[<>"'&]/g, '')   // Remove dangerous chars
    .trim()
    .substring(0, maxLen);
}

/**
 * Validate and sanitize a nowPlaying object from any source (native or Watch Party).
 * Returns a safe object or null.
 */
function sanitizeNowPlaying(raw) {
  if (!raw || typeof raw !== 'object') return null;

  const title = sanitizeField(raw.title, 120);
  if (!title) return null;  // Must have a title

  return {
    title,
    artist: sanitizeField(raw.artist, 80),
    source: sanitizeField(raw.source, 30),
  };
}

/**
 * NowPlaying Plugin interface
 */
const NowPlaying = {
  /**
   * Check if native Now Playing detection is available
   */
  isAvailable() {
    return isCapacitor && isAndroid && NativeNowPlaying !== null;
  },

  /**
   * Get current playback status.
   * Returns { nowPlaying: { title, artist, source } | null, permissionNeeded: boolean }
   */
  async getStatus() {
    if (!this.isAvailable()) {
      return { nowPlaying: null, permissionNeeded: false };
    }
    try {
      return await NativeNowPlaying.getStatus();
    } catch (e) {
      return { nowPlaying: null, permissionNeeded: false };
    }
  },

  /**
   * Open the system Notification Listener settings so the user
   * can grant us MediaSession access.
   */
  async requestPermission() {
    if (!this.isAvailable()) return { opened: false };
    try {
      return await NativeNowPlaying.requestPermission();
    } catch (e) {
      return { opened: false };
    }
  },

  /**
   * Start polling for Now Playing changes.
   * @param {number} intervalMs - Poll interval in ms (default 4000)
   * @param {function} onChange - Called with nowPlaying object on changes
   */
  startPolling(intervalMs = 4000, onChange) {
    if (!this.isAvailable()) return;

    this.stopPolling();

    if (onChange) {
      listeners.push(onChange);
    }

    lastTitle = null;
    lastArtist = null;

    pollingInterval = setInterval(async () => {
      try {
        const { nowPlaying: raw } = await NativeNowPlaying.getStatus();
        const nowPlaying = sanitizeNowPlaying(raw);
        const title = nowPlaying?.title || null;
        const artist = nowPlaying?.artist || null;

        // Only emit when something changed
        if (title !== lastTitle || artist !== lastArtist) {
          lastTitle = title;
          lastArtist = artist;
          for (const cb of listeners) {
            try { cb(nowPlaying); } catch (_) {}
          }
        }
      } catch (_) {}
    }, intervalMs);
  },

  /**
   * Stop polling.
   */
  stopPolling() {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
    listeners = [];
    lastTitle = null;
    lastArtist = null;
  },

  /**
   * Register a change listener (can be called before startPolling).
   */
  onUpdate(cb) {
    if (typeof cb === 'function') {
      listeners.push(cb);
    }
  },

  /**
   * Remove all listeners.
   */
  offUpdate() {
    listeners = [];
  },
};

export { sanitizeNowPlaying };
export default NowPlaying;
