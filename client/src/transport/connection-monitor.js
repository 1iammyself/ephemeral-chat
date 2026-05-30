/**
 * Connection Monitor
 *
 * Application-level liveness detector that sits on top of Socket.IO.
 *
 * Socket.IO's own ping/pong is configured very leniently on the server
 * (pingTimeout=300s) so that mobile users with screens off are not dropped.
 * The downside is that a *half-open* connection — where the socket still
 * looks "connected" but no packets actually flow — can linger for minutes
 * before Socket.IO notices. That is the exact situation that used to force
 * users to manually refresh.
 *
 * This monitor sends a tiny `hb` (heartbeat) every HEARTBEAT_INTERVAL and
 * expects an ack within HEARTBEAT_TIMEOUT. Missed acks demote the connection
 * to `degraded` and then `reconnecting`, at which point we proactively kick
 * Socket.IO to reconnect instead of waiting out its long timeout.
 *
 * States (coarse, UI-friendly):
 *   - 'idle'          no socket attached (e.g. on the Home screen); silent
 *   - 'online'        link is healthy, acks flowing
 *   - 'degraded'      one missed heartbeat; link is shaky but not dead yet
 *   - 'reconnecting'  socket is down / heartbeats failing; recovery in progress
 *   - 'offline'       the device itself reports no network
 *
 * The monitor never persists anything and never touches message content —
 * it only reports connection health.
 */

const HEARTBEAT_INTERVAL_MS = 5000; // how often we probe a connected socket
const HEARTBEAT_TIMEOUT_MS = 3000; // how long we wait for an ack
const MISSES_BEFORE_RECONNECT = 2; // consecutive misses that trigger a forced reconnect

/** @typedef {'online'|'degraded'|'reconnecting'|'offline'} ConnectionState */

class ConnectionMonitor {
  constructor() {
    /** @type {ConnectionState} */
    this.state = 'idle';
    this.socket = null;
    this.listeners = new Set();
    this.heartbeatTimer = null;
    this.consecutiveMisses = 0;
    this._inFlight = false;
    this._boundOnline = () => this._handleBrowserOnline();
    this._boundOffline = () => this._handleBrowserOffline();
    this._browserListenersSet = false;
  }

  /**
   * Attach the monitor to a live Socket.IO client instance.
   * Safe to call again with the same socket (no-op) or a new one (re-attach).
   * @param {import('socket.io-client').Socket} socket
   */
  attach(socket) {
    if (this.socket === socket) return;
    this.detach();
    this.socket = socket;

    socket.on('connect', this._onConnect);
    socket.on('disconnect', this._onDisconnect);
    socket.io.on('reconnect_attempt', this._onReconnectAttempt);

    if (!this._browserListenersSet && typeof window !== 'undefined') {
      window.addEventListener('online', this._boundOnline);
      window.addEventListener('offline', this._boundOffline);
      this._browserListenersSet = true;
    }

    // Seed initial state from current socket/browser status
    if (socket.connected) {
      this._setState('online');
      this._startHeartbeat();
    } else {
      this._setState(this._browserOffline() ? 'offline' : 'reconnecting');
    }
  }

  /** Detach socket + browser listeners and stop probing. */
  detach() {
    this._stopHeartbeat();
    if (this.socket) {
      this.socket.off('connect', this._onConnect);
      this.socket.off('disconnect', this._onDisconnect);
      this.socket.io?.off('reconnect_attempt', this._onReconnectAttempt);
    }
    this.socket = null;
    this._setState('idle');
  }

  /** @returns {ConnectionState} */
  getState() {
    return this.state;
  }

  /** True when the link is healthy enough to send immediately. */
  isHealthy() {
    return this.state === 'online';
  }

  /**
   * Subscribe to state changes. Fires immediately with the current state.
   * @param {(state: ConnectionState) => void} cb
   * @returns {() => void} unsubscribe
   */
  subscribe(cb) {
    this.listeners.add(cb);
    try { cb(this.state); } catch { /* listener errors must not break the monitor */ }
    return () => this.listeners.delete(cb);
  }

  // ── Socket event handlers (bound as arrow props for stable refs) ──

  _onConnect = () => {
    this.consecutiveMisses = 0;
    this._setState('online');
    this._startHeartbeat();
  };

  _onDisconnect = () => {
    this._stopHeartbeat();
    this._setState(this._browserOffline() ? 'offline' : 'reconnecting');
  };

  _onReconnectAttempt = () => {
    if (this.state !== 'offline') this._setState('reconnecting');
  };

  _handleBrowserOnline() {
    // Device network returned — nudge the socket to reconnect right away.
    if (this.socket && this.socket.disconnected) {
      try { this.socket.connect(); } catch { /* ignore */ }
    }
    if (this.state === 'offline') this._setState('reconnecting');
  }

  _handleBrowserOffline() {
    this._stopHeartbeat();
    this._setState('offline');
  }

  // ── Heartbeat loop ──

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => this._beat(), HEARTBEAT_INTERVAL_MS);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this._inFlight = false;
  }

  _beat() {
    const socket = this.socket;
    if (!socket || socket.disconnected) {
      this._setState(this._browserOffline() ? 'offline' : 'reconnecting');
      return;
    }
    if (this._inFlight) return; // don't stack probes

    this._inFlight = true;
    socket.timeout(HEARTBEAT_TIMEOUT_MS).emit('hb', (err) => {
      this._inFlight = false;
      if (err) {
        this._onMiss();
      } else {
        this.consecutiveMisses = 0;
        this._setState('online');
      }
    });
  }

  _onMiss() {
    this.consecutiveMisses += 1;
    if (this.consecutiveMisses >= MISSES_BEFORE_RECONNECT) {
      // The link is effectively dead even though the socket still claims to be
      // connected. Force Socket.IO to tear down and reconnect now instead of
      // waiting out its multi-minute ping timeout.
      this._setState('reconnecting');
      const socket = this.socket;
      if (socket) {
        try {
          socket.disconnect();
          socket.connect();
        } catch { /* ignore */ }
      }
    } else {
      this._setState('degraded');
    }
  }

  // ── State plumbing ──

  _browserOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
  }

  _setState(next) {
    if (this.state === next) return;
    this.state = next;
    this.listeners.forEach((cb) => {
      try { cb(next); } catch { /* listener errors must not break the monitor */ }
    });
  }
}

const connectionMonitor = new ConnectionMonitor();
export default connectionMonitor;
export { HEARTBEAT_INTERVAL_MS, HEARTBEAT_TIMEOUT_MS };
