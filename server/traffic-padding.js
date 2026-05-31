/**
 * Server-side Traffic Padding — Chaff Detection & Stripping
 * 
 * Works with client/src/crypto/traffic-padding.js to:
 *   1. Detect and silently drop chaff messages (FLAG_CHAFF = 0x01)
 *   2. Strip padding from real messages before processing
 *   3. Add server-side padding to responses (constant-size envelopes)
 *   4. Inject server-originated chaff to mask traffic patterns
 * 
 * The server NEVER logs or processes chaff — it's indistinguishable
 * from real traffic to any observer, but the server knows to drop it.
 * 
 * @module traffic-padding
 */

const crypto = require('crypto');

// Must match client-side constants
const FLAG_REAL = 0x00;
const FLAG_CHAFF = 0x01;
const HEADER_SIZE = 5; // 1 byte flag + 4 bytes length

// Server chaff generation — per-room interval tracking
const roomChaffIntervals = new Map();
const DEFAULT_CHAFF_INTERVAL = 3000; // 3 seconds

// ─── Message Processing ────────────────────────────────────

/**
 * Check if a message is chaff (should be silently dropped).
 * @param {Buffer|Uint8Array} paddedMessage 
 * @returns {boolean}
 */
function isChaff(paddedMessage) {
  if (!paddedMessage || paddedMessage.length < HEADER_SIZE) {
    return false;
  }
  
  const buf = Buffer.isBuffer(paddedMessage) ? paddedMessage : Buffer.from(paddedMessage);
  return buf[0] === FLAG_CHAFF;
}

/**
 * Strip padding from a real message.
 * @param {Buffer|Uint8Array} paddedMessage 
 * @returns {Buffer} Original message without padding
 */
function stripPadding(paddedMessage) {
  const buf = Buffer.isBuffer(paddedMessage) ? paddedMessage : Buffer.from(paddedMessage);
  
  if (buf.length < HEADER_SIZE) {
    return buf; // Not padded, return as-is
  }
  
  const flag = buf[0];
  if (flag === FLAG_CHAFF) {
    return null; // Chaff — should have been caught by isChaff()
  }
  
  if (flag !== FLAG_REAL) {
    return buf; // Unknown format, return as-is
  }
  
  // Read original length (big-endian uint32)
  const originalLength = buf.readUInt32BE(1);
  
  if (originalLength + HEADER_SIZE > buf.length) {
    return buf; // Invalid length, return as-is
  }
  
  return buf.slice(HEADER_SIZE, HEADER_SIZE + originalLength);
}

/**
 * Pad a response to a fixed bucket size.
 * @param {Buffer} message 
 * @param {number} targetSize - Target bucket size (0 = auto)
 * @returns {Buffer} Padded message
 */
function padResponse(message, targetSize = 0) {
  const buf = Buffer.isBuffer(message) ? message : Buffer.from(message);
  
  // Choose bucket size
  //   1536 added for ML-KEM-768: pubkey (1184B) + 5B header = 1189B,
  //   ciphertext (1088B) + 5B header = 1093B — both fit in 1536.
  const buckets = [256, 512, 1024, 1536, 4096, 16384, 65536];
  const neededSize = HEADER_SIZE + buf.length;
  
  let size = targetSize;
  if (size === 0) {
    size = buckets.find(b => b >= neededSize) || neededSize;
  }
  
  const padded = Buffer.alloc(size);
  
  // Write header
  padded[0] = FLAG_REAL;
  padded.writeUInt32BE(buf.length, 1);
  
  // Write message
  buf.copy(padded, HEADER_SIZE);
  
  // Fill remaining with random bytes
  if (size > neededSize) {
    crypto.randomFillSync(padded, neededSize, size - neededSize);
  }
  
  return padded;
}

/**
 * Generate a chaff message of random size (for server-originated chaff)
 * @returns {Buffer}
 */
function generateChaff() {
  // Include 1536 so server chaff is indistinguishable from ML-KEM key-exchange traffic
  const buckets = [256, 512, 1024, 1536];
  const size = buckets[Math.floor(Math.random() * buckets.length)];
  
  const chaff = crypto.randomBytes(size);
  chaff[0] = FLAG_CHAFF;
  
  return chaff;
}

// ─── Socket.IO Integration ─────────────────────────────────

/**
 * Socket.IO middleware that processes padded messages.
 * Intercepts incoming messages, strips padding, drops chaff.
 * 
 * @param {import('socket.io').Socket} socket 
 * @param {Function} next 
 */
function trafficPaddingMiddleware(socket, next) {
  // Store original emit
  const originalEmit = socket.emit.bind(socket);
  
  // Intercept incoming events for chaff detection
  const originalOn = socket.on.bind(socket);
  
  socket.on = function(event, handler) {
    if (event === 'padded-message') {
      // Special handler for padded messages
      return originalOn(event, (data) => {
        if (!data || !data.payload) {
          return handler(data);
        }
        
        const payload = Buffer.from(data.payload, 'base64');
        
        if (isChaff(payload)) {
          // Silently drop chaff — don't even acknowledge
          return;
        }
        
        // Strip padding and forward
        const stripped = stripPadding(payload);
        if (stripped) {
          handler({ ...data, payload: stripped.toString('base64') });
        }
      });
    }
    
    return originalOn(event, handler);
  };
  
  next();
}

/**
 * Start sending server-originated chaff to a room.
 * This masks the pattern of real messages even when the chat is idle.
 * 
 * @param {import('socket.io').Server} io 
 * @param {string} roomCode 
 * @param {number} intervalMs 
 */
function startServerChaff(io, roomCode, intervalMs = DEFAULT_CHAFF_INTERVAL) {
  const key = `chaff:${roomCode}`;
  
  // Don't start duplicate intervals for the same room
  if (roomChaffIntervals.has(roomCode)) {
    return;
  }
  
  const interval = setInterval(() => {
    const room = io.sockets.adapter.rooms.get(roomCode);
    if (!room || room.size === 0) {
      // Room is empty, stop chaff
      clearInterval(interval);
      roomChaffIntervals.delete(roomCode);
      return;
    }
    
    // Send chaff to all room members
    const chaff = generateChaff();
    io.to(roomCode).emit('padded-message', {
      payload: chaff.toString('base64'),
      from: '__server__',
      timestamp: Date.now()
    });
  }, intervalMs + Math.floor(Math.random() * 2000)); // Add jitter

  roomChaffIntervals.set(roomCode, interval);
}

/**
 * Stop server chaff for a room
 * @param {string} roomCode 
 */
function stopServerChaff(roomCode) {
  const interval = roomChaffIntervals.get(roomCode);
  if (interval) {
    clearInterval(interval);
    roomChaffIntervals.delete(roomCode);
  }
}

// ─── Express Middleware ────────────────────────────────────

/**
 * Express middleware for padding HTTP API responses
 */
function padResponseMiddleware(req, res, next) {
  // OHTTP-inner-routed requests (marked by the gateway) must NOT be padded.
  // The OHTTP gateway's inner-router captures only {status, body} and drops
  // response headers, so the X-Padded marker would be lost and the client
  // could never strip the envelope — breaking every /api call made over OHTTP.
  // Padding here is also redundant: the response is re-wrapped in an opaque
  // encrypted OHTTP response before it leaves the gateway.
  if (req.headers['x-ohttp-inner'] === '1') {
    return next();
  }

  // /api/config is the bootstrap discovery endpoint. Clients read it with a
  // plain fetch() BEFORE any privacy layer is initialized — it's how they
  // learn the OHTTP relay URL in the first place. Padding it makes that plain
  // .json() throw, which silently disables OHTTP self-configuration on
  // Tauri/Capacitor. It carries only public service URLs, so leave it unpadded.
  if (req.originalUrl.split('?')[0] === '/api/config') {
    return next();
  }

  // Store original json method
  const originalJson = res.json.bind(res);

  res.json = function(data) {
    const jsonStr = JSON.stringify(data);
    const padded = padResponse(Buffer.from(jsonStr));
    
    res.set('Content-Type', 'application/octet-stream');
    res.set('X-Padded', '1');
    return res.send(padded);
  };
  
  next();
}

module.exports = {
  isChaff,
  stripPadding,
  padResponse,
  generateChaff,
  trafficPaddingMiddleware,
  startServerChaff,
  stopServerChaff,
  padResponseMiddleware,
  FLAG_REAL,
  FLAG_CHAFF,
  HEADER_SIZE
};
