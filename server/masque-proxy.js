/**
 * MASQUE CONNECT-UDP Proxy — RFC 9297 / RFC 9298
 *
 * Implements the server-side MASQUE proxy using WebSocket transport as the
 * carrier (HTTP/1.1 upgrade). This acts as transport-path 3 (WebSocket relay)
 * for clients that lack WebTransport / HTTP/3 support.
 *
 * Endpoint: /.well-known/masque/udp/:host/:port/
 *   • Client connects via WebSocket upgrade
 *   • Server opens a UDP socket toward :host::port
 *   • Bidirectional relay using RFC 9297 capsule framing
 *
 * Security constraints:
 *   • Target host is validated against an allowlist (same server only by default)
 *   • Connection rate-limited: MAX_CONNS_PER_IP concurrent tunnels per client IP
 *   • Idle tunnels (no traffic for IDLE_TIMEOUT_MS) are torn down automatically
 */

const http = require('http');
const dgram = require('dgram');
const { logger } = require('./utils');

// ─── Configuration ──────────────────────────────────────────

const IDLE_TIMEOUT_MS = 30_000;   // close tunnels idle for 30 s
const MAX_CONNS_PER_IP = 5;       // max concurrent tunnels per client IP
const MAX_DATAGRAM_SIZE = 1_500;   // bytes — discard oversized datagrams

// Allow tunneling only to the main server itself.
// Automatically includes the deployed hostname from PUBLIC_URL.
// Set MASQUE_ALLOWED_HOSTS=* to remove restriction (not recommended in prod).
const _masquePublicHost = (() => {
  if (!process.env.PUBLIC_URL) return null;
  try { return new URL(process.env.PUBLIC_URL).hostname; } catch (_) { return null; }
})();
const _masqueDefaults = ['127.0.0.1', '::1', 'localhost', ...(_masquePublicHost ? [_masquePublicHost] : [])].join(',');
const ALLOWED_HOSTS_ENV = process.env.MASQUE_ALLOWED_HOSTS || _masqueDefaults;
const ALLOWED_HOSTS = new Set(ALLOWED_HOSTS_ENV.split(',').map(h => h.trim()));

// ─── Capsule codec (RFC 9297 §3.2) — 1-byte type + 2-byte BE length ──

const CAPSULE_DATAGRAM = 0x00;
const CAPSULE_CLOSE    = 0x01;

function encodeCapsule(type, payload) {
  const len = payload.length;
  const frame = Buffer.alloc(3 + len);
  frame[0] = type;
  frame.writeUInt16BE(len, 1);
  payload.copy(frame, 3);
  return frame;
}

function decodeCapsule(buf) {
  if (buf.length < 3) return null;
  const type = buf[0];
  const len = buf.readUInt16BE(1);
  if (buf.length < 3 + len) return null;
  return { type, payload: buf.slice(3, 3 + len), consumed: 3 + len };
}

// ─── Per-IP connection tracking ─────────────────────────────

const connsByIp = new Map(); // ip → Set of socket objects

function trackConn(ip, ws) {
  let set = connsByIp.get(ip);
  if (!set) { set = new Set(); connsByIp.set(ip, set); }
  set.add(ws);
}

function untrackConn(ip, ws) {
  const set = connsByIp.get(ip);
  if (!set) return;
  set.delete(ws);
  if (set.size === 0) connsByIp.delete(ip);
}

function connCountFor(ip) {
  return connsByIp.get(ip)?.size || 0;
}

// ─── HTTP Upgrade Handler ────────────────────────────────────

/**
 * Attach MASQUE CONNECT-UDP handler to an existing http.Server.
 * Uses raw HTTP upgrade (no ws library dependency) — works alongside Socket.IO.
 *
 * @param {http.Server} httpServer
 */
function attachMASQUEProxy(httpServer) {
  httpServer.on('upgrade', (req, socket, head) => {
    // Only handle MASQUE CONNECT-UDP paths
    const match = req.url?.match(
      /^\/.well-known\/masque\/udp\/([^/]+)\/(\d+)\/?$/
    );
    if (!match) return; // let Socket.IO handle other upgrades

    const rawHost = decodeURIComponent(match[1]);
    const targetPort = parseInt(match[2], 10);

    if (
      isNaN(targetPort) ||
      targetPort < 1 ||
      targetPort > 65535
    ) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    // Allowlist check
    if (ALLOWED_HOSTS_ENV !== '*' && !ALLOWED_HOSTS.has(rawHost)) {
      logger.warn(`[MASQUE] Blocked tunnel to disallowed host: ${rawHost}`);
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    // Rate limit
    const clientIp = req.socket.remoteAddress || 'unknown';
    if (connCountFor(clientIp) >= MAX_CONNS_PER_IP) {
      logger.warn(`[MASQUE] Rate limit hit for IP ${clientIp}`);
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }

    // Perform the WebSocket upgrade handshake manually
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    const crypto = require('crypto');
    const acceptKey = crypto
      .createHash('sha1')
      .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
      .digest('base64');

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${acceptKey}\r\n` +
      '\r\n'
    );

    _handleTunnel(socket, rawHost, targetPort, clientIp);
  });

  logger.info('[MASQUE] CONNECT-UDP proxy attached at /.well-known/masque/udp/{host}/{port}/');
}

// ─── Tunnel Handler ──────────────────────────────────────────

function _handleTunnel(ws, targetHost, targetPort, clientIp) {
  trackConn(clientIp, ws);

  // UDP socket toward target
  const udp = dgram.createSocket('udp4');
  let idleTimer = null;
  let recvBuf = Buffer.alloc(0);

  function resetIdle() {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      logger.info(`[MASQUE] Idle timeout for tunnel to ${targetHost}:${targetPort}`);
      teardown();
    }, IDLE_TIMEOUT_MS);
  }

  function teardown() {
    if (idleTimer) clearTimeout(idleTimer);
    try { udp.close(); } catch (_) {}
    try {
      // Send WebSocket close frame (opcode 0x8, no payload)
      ws.write(Buffer.from([0x88, 0x00]));
      ws.destroy();
    } catch (_) {}
    untrackConn(clientIp, ws);
  }

  resetIdle();

  // ── UDP → WebSocket (target replies) ─────────────────────
  udp.on('message', (msg) => {
    if (msg.length > MAX_DATAGRAM_SIZE) return; // drop oversized
    resetIdle();
    try {
      const capsule = encodeCapsule(CAPSULE_DATAGRAM, msg);
      // Wrap in a WebSocket binary frame
      ws.write(_wsFrame(capsule));
    } catch (e) {
      logger.warn('[MASQUE] UDP→WS write error:', e.message);
    }
  });

  udp.on('error', (err) => {
    logger.warn('[MASQUE] UDP error:', err.message);
    teardown();
  });

  // ── WebSocket → UDP (client sends) ───────────────────────
  ws.on('data', (chunk) => {
    recvBuf = Buffer.concat([recvBuf, chunk]);

    // Peel WebSocket frames from recvBuf
    let offset = 0;
    while (offset < recvBuf.length) {
      const frame = _wsParseFrame(recvBuf, offset);
      if (!frame) break; // incomplete frame, wait for more data

      offset += frame.consumed;

      if (frame.opcode === 0x8) { teardown(); return; } // close
      if (frame.opcode !== 0x2 && frame.opcode !== 0x0) continue; // ignore non-binary

      // Decode capsule from frame payload
      const capsule = decodeCapsule(frame.payload);
      if (!capsule) continue;

      if (capsule.type === CAPSULE_CLOSE) { teardown(); return; }
      if (capsule.type !== CAPSULE_DATAGRAM) continue;

      if (capsule.payload.length > MAX_DATAGRAM_SIZE) continue;
      resetIdle();
      udp.send(capsule.payload, targetPort, targetHost, (err) => {
        if (err) logger.warn('[MASQUE] UDP send error:', err.message);
      });
    }

    recvBuf = recvBuf.slice(offset);
  });

  ws.on('close', teardown);
  ws.on('error', (err) => {
    logger.warn('[MASQUE] WS error:', err.message);
    teardown();
  });
}

// ─── Minimal WebSocket frame codec ──────────────────────────

/**
 * Build a minimal WebSocket binary frame (server→client, unmasked).
 */
function _wsFrame(payload) {
  const len = payload.length;
  let header;
  if (len < 126) {
    header = Buffer.from([0x82, len]); // FIN + opcode binary, 1-byte length
  } else if (len < 65536) {
    header = Buffer.from([0x82, 126, (len >> 8) & 0xff, len & 0xff]);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x82;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(len), 2);
  }
  return Buffer.concat([header, payload]);
}

/**
 * Parse a single WebSocket frame from a buffer starting at offset.
 * Returns null if incomplete; otherwise { opcode, payload, consumed }.
 * Client frames are masked — we unmask them.
 */
function _wsParseFrame(buf, offset = 0) {
  if (buf.length - offset < 2) return null;
  const b0 = buf[offset];
  const b1 = buf[offset + 1];
  const opcode = b0 & 0x0f;
  const masked  = !!(b1 & 0x80);
  let payloadLen = b1 & 0x7f;
  let pos = offset + 2;

  if (payloadLen === 126) {
    if (buf.length - pos < 2) return null;
    payloadLen = buf.readUInt16BE(pos);
    pos += 2;
  } else if (payloadLen === 127) {
    if (buf.length - pos < 8) return null;
    payloadLen = Number(buf.readBigUInt64BE(pos));
    pos += 8;
  }

  if (masked) {
    if (buf.length - pos < 4) return null;
    const maskKey = buf.slice(pos, pos + 4);
    pos += 4;
    if (buf.length - pos < payloadLen) return null;
    const data = Buffer.alloc(payloadLen);
    for (let i = 0; i < payloadLen; i++) {
      data[i] = buf[pos + i] ^ maskKey[i % 4];
    }
    return { opcode, payload: data, consumed: pos - offset + payloadLen };
  } else {
    if (buf.length - pos < payloadLen) return null;
    return { opcode, payload: buf.slice(pos, pos + payloadLen), consumed: pos - offset + payloadLen };
  }
}

module.exports = { attachMASQUEProxy };
