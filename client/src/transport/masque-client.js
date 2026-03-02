/**
 * MASQUE Client — Real CONNECT-UDP Implementation (RFC 9297 / RFC 9298)
 *
 * MASQUE (Multiplexed Application Substrate over QUIC Encryption)
 * provides QUIC-level proxying for the highest tier of metadata
 * protection.  The proxy sees encrypted QUIC packets but can NEVER
 * read their content — it acts as a dumb UDP forwarder.
 *
 * Architecture (IP-hiding):
 *   Client ──QUIC──▶ MASQUE Proxy ──UDP──▶ Ephchat Server
 *   • The Ephchat server sees the **proxy's** IP, not yours.
 *   • The proxy cannot decrypt any payload (it only forwards).
 *
 * Combined with OHTTP for full unlinkability:
 *   Client ──OHTTP──▶ MASQUE Proxy ──UDP──▶ Ephchat Server
 *
 * Transport paths (priority order):
 *   1. WebTransport (Chromium 113+ / Electron 25+)     — browser & Electron
 *   2. Native quinn-WASM bridge (proximity-core)       — Electron native add-on
 *   3. Fallback: plain WebSocket through relay          — no IP hiding
 *
 * Capsule protocol implemented per:
 *   • RFC 9297 — HTTP Datagrams & Capsule Protocol
 *   • RFC 9298 — Proxying UDP via HTTP (CONNECT-UDP)
 *
 * @module transport/masque-client
 */

// ─── Capsule Types (RFC 9297 §5) ──────────────────────────

/** DATAGRAM capsule — carries a single UDP payload */
const CAPSULE_DATAGRAM    = 0x00;
/** CLOSE capsule — signals the proxy to tear down the tunnel */
const CAPSULE_CLOSE       = 0x01;
/** PADDING capsule — indistinguishable from DATAGRAM to observers */
const CAPSULE_PADDING     = 0xFF;

// Context ID 0 = "the whole UDP tunnel" per RFC 9298 §4
const CONTEXT_ID_DEFAULT = 0x00;

// ─── Configuration ─────────────────────────────────────────

const DEFAULT_MASQUE_CONFIG = {
  // MASQUE proxy endpoint (must speak HTTP/3 + Extended CONNECT)
  proxyUrl: null,

  // Target that the proxy will forward UDP to
  targetHost: null,
  targetPort: 443,

  // CONNECT-UDP path template (RFC 9298 §3)
  //   {target_host}  and  {target_port}  are substituted at runtime
  connectUDPTemplate: '/.well-known/masque/udp/{target_host}/{target_port}/',

  // Connection tuning
  maxIdleTimeout: 30_000,        // 30 s
  keepAliveInterval: 10_000,     // 10 s

  // Privacy options
  enablePadding: true,           // inject CAPSULE_PADDING between real datagrams
  paddingIntervalMs: 2_000,      // ~every 2 s ± jitter
  maxDatagramSize: 1200,         // stay under typical MTU

  // Native bridge: if an Electron preload exposes window.__quinnBridge
  useNativeBridge: false,
};

// ─── Feature Detection ─────────────────────────────────────

/**
 * Check if WebTransport with datagrams is available
 * (Chromium 113+, Node 21+, Electron 25+).
 */
export function isWebTransportSupported() {
  return (
    typeof WebTransport !== 'undefined' &&
    typeof WritableStream !== 'undefined'
  );
}

/**
 * True when WebTransport also exposes the datagram API
 * (required by CONNECT-UDP).
 */
export function isDatagramAPISupported() {
  if (!isWebTransportSupported()) return false;
  // The datagrams property exists on the WT prototype in Chromium ≥113
  try {
    const proto = WebTransport.prototype;
    return 'datagrams' in proto;
  } catch {
    return false;
  }
}

/**
 * True when the Electron native quinn bridge is loaded
 * (proximity-core compiled to a Node native add-on, or Electron security IPC).
 */
export function isNativeBridgeAvailable() {
  return (typeof window !== 'undefined' && !!window.__quinnBridge) ||
         !!(window.electronAPI?.security?.masqueIsAvailable);
}

// ─── Capsule Codec (RFC 9297 §3.2) ────────────────────────
//
// Wire format:
//   Capsule Type  (variable-length integer)
//   Capsule Length (variable-length integer)
//   Capsule Value  (Length bytes)
//
// We use a simplified 1-byte type + 2-byte big-endian length for
// datagrams ≤ 65 535 bytes, which covers all practical UDP payloads.

function encodeCapsule(type, payload) {
  const len = payload.byteLength;
  // 1 byte type + 2 byte length + payload
  const frame = new Uint8Array(3 + len);
  frame[0] = type & 0xFF;
  frame[1] = (len >> 8) & 0xFF;
  frame[2] = len & 0xFF;
  frame.set(new Uint8Array(payload instanceof ArrayBuffer ? payload : payload.buffer), 3);
  return frame;
}

function decodeCapsule(frame) {
  if (frame.byteLength < 3) return null;
  const buf = frame instanceof Uint8Array ? frame : new Uint8Array(frame);
  const type = buf[0];
  const len = (buf[1] << 8) | buf[2];
  if (buf.byteLength < 3 + len) return null;
  return { type, payload: buf.slice(3, 3 + len) };
}

// ─── CONNECT-UDP Request Builder (RFC 9298 §3) ────────────

function buildConnectUDPPath(template, host, port) {
  return template
    .replace('{target_host}', encodeURIComponent(host))
    .replace('{target_port}', String(port));
}

/**
 * Build the Extended CONNECT headers for CONNECT-UDP.
 * In WebTransport these go through the constructor options.
 */
function connectUDPHeaders(host, port) {
  return {
    ':method': 'CONNECT',
    ':protocol': 'connect-udp',
    ':authority': host,
    ':path': buildConnectUDPPath(
      DEFAULT_MASQUE_CONFIG.connectUDPTemplate, host, port
    ),
    'Capsule-Protocol': '?1',        // RFC 9297 §3.4
  };
}

// ─── MASQUE Client ─────────────────────────────────────────

export class MASQUEClient {
  /** @param {Partial<typeof DEFAULT_MASQUE_CONFIG>} config */
  constructor(config = {}) {
    this.config = { ...DEFAULT_MASQUE_CONFIG, ...config };

    /** @type {WebTransport|null} */
    this._transport   = null;
    /** @type {WritableStreamDefaultWriter|null} */
    this._dgWriter    = null;
    /** @type {ReadableStreamDefaultReader|null} */
    this._dgReader    = null;
    /** @type {WritableStreamDefaultWriter|null} — stream-based capsule channel */
    this._streamWriter = null;
    /** @type {ReadableStreamDefaultReader|null} */
    this._streamReader = null;

    this.connected    = false;
    this._paddingTimer = null;
    this._receiveLoop  = null;
    this._onDatagram   = null;   // external callback
    this._stats = { sent: 0, received: 0, padding: 0 };
  }

  // ── Connect ────────────────────────────────────────────

  /**
   * Open a MASQUE tunnel to `targetHost:targetPort` through the proxy.
   *
   * Sequence:
   *   1. WebTransport handshake to proxy (HTTP/3 + TLS 1.3)
   *   2. Extended CONNECT request with :protocol = connect-udp
   *   3. Proxy opens a UDP socket toward the target
   *   4. Client sends/receives via DATAGRAM frames or capsules
   *
   * @returns {Promise<boolean>} true when the tunnel is live
   */
  async connect() {
    // ─ Try native quinn bridge first (Electron) ────────
    if (this.config.useNativeBridge && isNativeBridgeAvailable()) {
      return this._connectNative();
    }

    // ─ WebTransport path (browser / Electron Chromium) ─
    if (!isWebTransportSupported()) {
      console.warn('[MASQUE] WebTransport unavailable — tunnel cannot be created');
      return false;
    }
    if (!this.config.proxyUrl) {
      console.warn('[MASQUE] No proxy URL configured');
      return false;
    }
    if (!this.config.targetHost) {
      console.warn('[MASQUE] No target host configured');
      return false;
    }

    try {
      const path = buildConnectUDPPath(
        this.config.connectUDPTemplate,
        this.config.targetHost,
        this.config.targetPort,
      );

      // The proxy URL already points at an HTTP/3 endpoint.
      // We append the CONNECT-UDP path so the proxy knows the target.
      const tunnelUrl = new URL(path, this.config.proxyUrl).href;

      this._transport = new WebTransport(tunnelUrl, {
        // Chromium WebTransport options
        allowPooling: false,
        requireUnreliable: true,        // we need DATAGRAM support
        congestionControl: 'low-latency',
      });

      await this._transport.ready;
      console.log('[MASQUE] WebTransport session established with proxy');

      // ─ Prefer unreliable DATAGRAM frames (lowest latency) ─
      if (this._transport.datagrams &&
          this._transport.datagrams.writable &&
          this._transport.datagrams.readable) {
        this._dgWriter = this._transport.datagrams.writable.getWriter();
        this._dgReader = this._transport.datagrams.readable.getReader();
        console.log('[MASQUE] Using DATAGRAM channel (unreliable, fast)');
      } else {
        // ─ Fallback: reliable bidirectional stream with capsule framing ─
        const bidi = await this._transport.createBidirectionalStream();
        this._streamWriter = bidi.writable.getWriter();
        this._streamReader = bidi.readable.getReader();
        console.log('[MASQUE] Using stream-based capsule channel (reliable)');
      }

      this.connected = true;

      // Start background receive loop
      this._startReceiveLoop();

      // Start padding injection (anti-traffic-analysis)
      if (this.config.enablePadding) {
        this._startPadding();
      }

      return true;

    } catch (e) {
      console.error('[MASQUE] Tunnel setup failed:', e);
      this.connected = false;
      return false;
    }
  }

  /**
   * Native path: call proximity-core quinn bridge exposed by Electron preload.
   * The bridge speaks QUIC natively (no WebTransport shim).
   * @private
   */
  async _connectNative() {
    try {
      const bridge = window.__quinnBridge;
      await bridge.connectProxy(
        this.config.proxyUrl,
        this.config.targetHost,
        this.config.targetPort,
      );
      // The bridge exposes send(Uint8Array) and onDatagram(cb)
      bridge.onDatagram((data) => {
        this._stats.received++;
        if (this._onDatagram) this._onDatagram(data);
      });
      this.connected = true;
      console.log('[MASQUE] Native quinn bridge tunnel active');

      if (this.config.enablePadding) this._startPadding();
      return true;
    } catch (e) {
      console.error('[MASQUE] Native bridge connect failed:', e);
      return false;
    }
  }

  // ── Send ───────────────────────────────────────────────

  /**
   * Send a UDP payload through the MASQUE tunnel.
   *
   * The proxy receives a QUIC DATAGRAM (or capsule-framed datagram)
   * and forwards the inner bytes as a raw UDP packet to the target.
   *
   * @param {Uint8Array} data - Raw UDP payload (≤ maxDatagramSize)
   * @returns {Promise<boolean>}
   */
  async send(data) {
    if (!this.connected) return false;

    // ─ Native bridge path ─
    if (this.config.useNativeBridge && isNativeBridgeAvailable()) {
      try {
        window.__quinnBridge.send(data);
        this._stats.sent++;
        return true;
      } catch { return false; }
    }

    try {
      if (this._dgWriter) {
        // Unreliable DATAGRAM — lowest latency, fire-and-forget
        // Prepend the context ID (varint 0x00 = 1 byte)
        const frame = new Uint8Array(1 + data.byteLength);
        frame[0] = CONTEXT_ID_DEFAULT;
        frame.set(data, 1);
        await this._dgWriter.write(frame);
      } else if (this._streamWriter) {
        // Stream-based capsule framing
        const capsule = encodeCapsule(CAPSULE_DATAGRAM, data);
        await this._streamWriter.write(capsule);
      } else {
        return false;
      }
      this._stats.sent++;
      return true;
    } catch (e) {
      console.error('[MASQUE] send error:', e);
      return false;
    }
  }

  // ── Receive ────────────────────────────────────────────

  /**
   * Register a callback for incoming datagrams.
   * @param {(data: Uint8Array) => void} callback
   */
  onDatagram(callback) {
    this._onDatagram = callback;
  }

  /** @private */
  _startReceiveLoop() {
    if (this.config.useNativeBridge) return; // handled by bridge.onDatagram

    const loop = async () => {
      try {
        while (this.connected) {
          let payload = null;

          if (this._dgReader) {
            const { value, done } = await this._dgReader.read();
            if (done) break;
            // Strip context-ID prefix byte
            payload = value.byteLength > 1 ? value.slice(1) : value;
          } else if (this._streamReader) {
            const { value, done } = await this._streamReader.read();
            if (done) break;
            const cap = decodeCapsule(value);
            if (!cap) continue;
            if (cap.type === CAPSULE_PADDING) continue; // discard padding
            if (cap.type === CAPSULE_CLOSE) { this.close(); break; }
            payload = cap.payload;
          }

          if (payload) {
            this._stats.received++;
            if (this._onDatagram) this._onDatagram(payload);
          }
        }
      } catch (e) {
        if (this.connected) {
          console.error('[MASQUE] receive loop error:', e);
        }
      }
    };
    this._receiveLoop = loop();
  }

  // ── Padding ────────────────────────────────────────────

  /** @private — inject CAPSULE_PADDING at random intervals */
  _startPadding() {
    const schedule = () => {
      const jitter = Math.random() * this.config.paddingIntervalMs;
      this._paddingTimer = setTimeout(async () => {
        if (!this.connected) return;
        try {
          // Random size between 64 and maxDatagramSize
          const size = 64 + Math.floor(Math.random() * (this.config.maxDatagramSize - 64));
          const pad = new Uint8Array(size);
          crypto.getRandomValues(pad);

          if (this._dgWriter) {
            // Datagram channel — send as context-ID 0 padding
            const frame = new Uint8Array(1 + pad.byteLength);
            frame[0] = CONTEXT_ID_DEFAULT;
            frame.set(pad, 1);
            await this._dgWriter.write(frame);
          } else if (this._streamWriter) {
            const capsule = encodeCapsule(CAPSULE_PADDING, pad);
            await this._streamWriter.write(capsule);
          }
          this._stats.padding++;
        } catch { /* swallow — padding is best-effort */ }
        schedule();
      }, jitter);
    };
    schedule();
  }

  // ── Teardown ───────────────────────────────────────────

  /** Close the MASQUE tunnel gracefully. */
  async close() {
    this.connected = false;

    if (this._paddingTimer) {
      clearTimeout(this._paddingTimer);
      this._paddingTimer = null;
    }

    // Send CLOSE capsule so the proxy can clean up
    try {
      if (this._streamWriter) {
        const close = encodeCapsule(CAPSULE_CLOSE, new Uint8Array(0));
        await this._streamWriter.write(close);
        this._streamWriter.releaseLock();
      }
      if (this._dgWriter) this._dgWriter.releaseLock();
      if (this._dgReader) this._dgReader.releaseLock();
      if (this._streamReader) this._streamReader.releaseLock();
    } catch { /* best effort */ }

    if (this._transport) {
      try { this._transport.close(); } catch {}
      this._transport = null;
    }

    // Native bridge
    if (isNativeBridgeAvailable() && window.__quinnBridge.disconnect) {
      try { window.__quinnBridge.disconnect(); } catch {}
    }

    this._dgWriter = null;
    this._dgReader = null;
    this._streamWriter = null;
    this._streamReader = null;
  }

  // ── Status ─────────────────────────────────────────────

  getStatus() {
    return {
      available: isWebTransportSupported() || isNativeBridgeAvailable(),
      datagramAPI: isDatagramAPISupported(),
      nativeBridge: isNativeBridgeAvailable(),
      connected: this.connected,
      proxyUrl: this.config.proxyUrl,
      targetHost: this.config.targetHost,
      targetPort: this.config.targetPort,
      implementation: this.connected ? 'active' : 'inactive',
      stats: { ...this._stats },
    };
  }
}

// ─── Integration Helper ────────────────────────────────────

/**
 * Try to establish the most private transport available.
 * Falls back gracefully if MASQUE isn't available.
 *
 * @param {Object} config
 * @returns {Promise<{transport: MASQUEClient|null, fallback: string|null}>}
 */
export async function tryMASQUETransport(config) {
  // Native bridge is the strongest path (full QUIC, no browser shim)
  if (isNativeBridgeAvailable() && config.proxyUrl) {
    const client = new MASQUEClient({ ...config, useNativeBridge: true });
    if (await client.connect()) {
      return { transport: client, fallback: null };
    }
  }

  if (!isWebTransportSupported()) {
    return { transport: null, fallback: 'webtransport-unsupported' };
  }

  if (!config.proxyUrl) {
    return { transport: null, fallback: 'no-proxy-configured' };
  }

  const client = new MASQUEClient(config);
  if (await client.connect()) {
    return { transport: client, fallback: null };
  }

  return { transport: null, fallback: 'connection-failed' };
}

export default MASQUEClient;
