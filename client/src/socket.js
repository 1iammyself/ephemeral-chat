import { io } from 'socket.io-client';
import { resolveBaseUrl } from './utils/resolve-url.js';
import { AttestationProvider } from './capacitor/attestation-provider';
import { initServerSigning } from './crypto/server-signing.js';

/**
 * Simplified Socket.IO Manager based on working branch implementation
 */
class SocketManager {
  constructor() {
    this.socket = null;
    this.isConnected = false;
    this.roomType = 'ephemeral';
    this.listeners = new Map();
  }

  getServerUrl() {
    // Socket.IO needs '/' instead of '' for same-origin
    return resolveBaseUrl() || '/';
  }

  async connect() {
    if (this.socket && this.isConnected) return this.socket;

    const SERVER_URL = this.getServerUrl();

    // Attach device attestation headers for mobile clients (M5)
    let attestationAuth = {};
    try {
      const attest = await AttestationProvider.getAttestation();
      if (attest.token) {
        attestationAuth = {
          'x-device-attestation': attest.token,
          'x-attestation-nonce': attest.nonce,
        };
      }
    } catch {
      // Attestation failure is non-fatal — proceed without it
    }

    this.socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      extraHeaders: attestationAuth,
    });

    this.socket.on('connect', () => {
      this.isConnected = true;

      // Pin server's Ed25519 signing key on first connect (TOFU)
      initServerSigning().catch(err => {
      });

      // Re-apply listeners
      this.listeners.forEach((callbacks, event) => {
        callbacks.forEach(callback => {
          this.socket.off(event, callback); // Prevent duplicates
          this.socket.on(event, callback);
        });
      });
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
    });

    this.socket.on('connect_error', (error) => {
      this.isConnected = false;
    });

    // ── Mobile visibility-change handler ──
    // When the user's screen turns on or they switch back to the app,
    // mobile OSes often kill the WebSocket. We detect this and reconnect immediately.
    this._setupVisibilityHandler();

    return this.socket;
  }

  /**
   * Listen for page visibility changes (screen on/off, tab switch, app foreground/background).
   * On resume: if the socket is disconnected or stale, force a reconnect immediately
   * instead of waiting for the normal reconnection backoff.
   */
  _setupVisibilityHandler() {
    if (this._visibilityHandlerSet) return;
    this._visibilityHandlerSet = true;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {

        if (!this.socket) return;

        if (this.socket.disconnected || !this.isConnected) {
          // Socket is dead – force an immediate reconnect
          this.socket.connect();
          // We rely on Socket.IO's built-in ping/pong interval to detect stale connections
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);

    // Also handle the `resume` / `online` events which fire on some mobile browsers
    window.addEventListener('online', () => {
      if (this.socket && (this.socket.disconnected || !this.isConnected)) {
        this.socket.connect();
      }
    });

    // iOS-specific: pageshow with persisted=true means restored from bfcache
    window.addEventListener('pageshow', (event) => {
      if (event.persisted && this.socket && (this.socket.disconnected || !this.isConnected)) {
        this.socket.connect();
      }
    });
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);

    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      if (callback) {
        this.listeners.set(event, this.listeners.get(event).filter(cb => cb !== callback));
      } else {
        this.listeners.delete(event);
      }
    }

    if (this.socket) {
      if (callback) {
        this.socket.off(event, callback);
      } else {
        this.socket.off(event);
      }
    }
  }

  emit(event, data, callback) {
    if (this.socket) {
      this.socket.emit(event, data, callback);
    } else {
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }

  setRoomType(type) {
    this.roomType = type;
  }
}

const socketManager = new SocketManager();
export default socketManager;
