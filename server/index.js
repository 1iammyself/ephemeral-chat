/**
 * Ephemeral Chat Server
 * Express + Socket.IO server for Private, temporary chat rooms
 */

require('dotenv').config();
const nodeCrypto = require('crypto');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { Chess } = require('./utils/chess');
const { createClient } = require('redis');
const RoomManager = require('./rooms');
const SecurityManager = require('./security');
const authUtils = require('./auth-utils');
const Cap = require('@cap.js/server');
const RateLimit = require('express-rate-limit');
const {
  generateRandomNickname,
  sanitizeInput,
  isValidRoomCode,
  isValidNickname,
  getTTLOptions,
  logger
} = require('./utils');
const { convertAudioToAAC } = require('./utils/audio-converter');

const helmet = require('helmet');
const { RtcTokenBuilder, RtcRole } = require('agora-token');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { startRelayServer, registerTransfer, unregisterTransfer, clearSocketTransfers } = require('./relay-manager');
const { DropManager } = require('./drops');
const { createDropRoutes } = require('./drops-routes');
const { setupNearbyNamespace } = require('./nearby');

// ─── Security Hardening Modules ────────────────────────────
const keyRegistry = require('./key-registry');
const { initGatewayKeys, ohttpGatewayMiddleware, startKeyRotation: startOHTTPKeyRotation, stopKeyRotation: stopOHTTPKeyRotation } = require('./ohttp-gateway');
const { initIssuer, attachPrivacyPassRoutes, privacyPassAuth, startCleanup: startPPCleanup, stopCleanup: stopPPCleanup } = require('./privacy-pass-issuer');
const { attachICESignaling } = require('./ice-signaling');
const { startOHTTPRelay, stopOHTTPRelay } = require('./ohttp-relay-server');
const { attachMASQUEProxy } = require('./masque-proxy');
const { attachWebAuthnRoutes } = require('./webauthn');
const { trafficPaddingMiddleware, startServerChaff, stopServerChaff, isChaff, stripPadding, padResponseMiddleware } = require('./traffic-padding');
const { LinkPreviewService } = require('./link-preview');
const { initializeAttestation } = require('./device-attestation-verifier');
const { initSigningKey, signSocketPayload, getPublicKeyBase64 } = require('./middleware/response-signing');

// Initialize Cap.js for proof-of-work CAPTCHA
if (!process.env.CAP_SECRET) {
  throw new Error('[FATAL] CAP_SECRET environment variable is required. Set it in your .env file.');
}
const cap = new Cap({
  tokens_per_challenge: 1,
  secret: process.env.CAP_SECRET,
});

// Initialize in-memory storage
logger.info('🔌 Using in-memory storage for rooms and messages');

// Initialize Drop Manager (Ephemeral Drops feature)
const dropManager = new DropManager();
logger.info('📦 Ephemeral Drops system initialized');

async function initializeServer() {
  logger.info('Starting server with in-memory storage...');
  // Initialize Redis if configured
  await initializeRedis();

  // ─── Security Hardening Init ────────────────────────────
  // OHTTP Gateway (RFC 9458) — metadata-protecting relay
  try {
    await initGatewayKeys();
    ohttpGatewayMiddleware(app);
    startOHTTPKeyRotation(24 * 60 * 60 * 1000); // Rotate keys every 24h
    logger.info('🔒 OHTTP Gateway initialized');
  } catch (e) {
    logger.warn('⚠️  OHTTP Gateway init failed (non-fatal):', e.message);
  }

  // Privacy Pass (RFC 9578) — anonymous auth tokens
  try {
    initIssuer();
    attachPrivacyPassRoutes(app);
    startPPCleanup(5 * 60 * 1000); // Clean spent tokens every 5 min
    logger.info('🎫 Privacy Pass Issuer initialized');
  } catch (e) {
    logger.warn('⚠️  Privacy Pass init failed (non-fatal):', e.message);
  }

  // ICE Signaling — P2P hole punching relay
  try {
    attachICESignaling(io, {
      getRoomMembers: (roomCode) => io.sockets.adapter.rooms.get(roomCode)
    });
    logger.info('🕳️  ICE Signaling attached for P2P hole punching');
  } catch (e) {
    logger.warn('⚠️  ICE Signaling init failed (non-fatal):', e.message);
  }

  // OHTTP Relay — RFC 9458 separate-origin relay (PORT+1)
  try {
    startOHTTPRelay();
  } catch (e) {
    logger.warn('⚠️  OHTTP Relay start failed (non-fatal):', e.message);
  }

  // MASQUE CONNECT-UDP Proxy — RFC 9297/9298 (WebSocket transport)
  try {
    attachMASQUEProxy(server);
    logger.info('🌀 MASQUE CONNECT-UDP proxy active');
  } catch (e) {
    logger.warn('⚠️  MASQUE proxy init failed (non-fatal):', e.message);
  }

  // WebAuthn / Passkeys — FIDO2 registration and authentication
  try {
    attachWebAuthnRoutes(app);
  } catch (e) {
    logger.warn('⚠️  WebAuthn routes init failed (non-fatal):', e.message);
  }

  // Device Attestation — Android/iOS authenticity verification
  try {
    initializeAttestation();
  } catch (e) {
    logger.warn('⚠️  Device attestation init failed (non-fatal):', e.message);
  }

  // Ed25519 response signing — clients verify key-bundle events
  try {
    initSigningKey();
    logger.info('✅ Ed25519 response signing initialized');
  } catch (e) {
    logger.warn('⚠️  Response signing init failed (non-fatal):', e.message);
  }

  // Start e2ecp relay process - REMOVED (Lazy loaded now)
  // startRelayServer();

  logger.info('✅ Server initialized');
}

const app = express();
const server = http.createServer(app);

// If running behind a reverse proxy (Render, Heroku, nginx, Cloudflare, etc.)
// Express must be told to trust the proxy so that req.ip and
// express-rate-limit can read the correct originating IP from X-Forwarded-For.
// Set TRUST_PROXY=true in your environment or the platform-specific env var
// (we already check `process.env.RENDER` elsewhere) to enable this.
if (process.env.TRUST_PROXY === 'true' || process.env.RENDER) {
  // Use a value of 1 to trust the first proxy in front of the app.
  // If you have multiple proxies you can set a higher number or a subnet.
  app.set('trust proxy', 1);
  logger.info('Express trust proxy enabled (trust proxy = 1)');
}

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Serve static files from .well-known directory (for Digital Asset Links)
app.use('/.well-known', express.static(path.join(__dirname, '../client/public/.well-known')));

// Serve static files from the client dist directory in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
}

// Middleware for Safari Audio compatibility
app.use((req, res, next) => {
  if (req.path.endsWith('.mp4')) {
    res.setHeader('Content-Type', 'audio/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

// Proxy logic for e2ecp - REMOVED (Client connects directly to 8080)
// const relayPort = process.env.RELAY_PORT || 8080;
// const e2ecpProxy = createProxyMiddleware({ ... });
// app.use('/e2ecp', e2ecpProxy);

// Detect environment

// Always use a whitelist for CORS, even in development.
// When ALLOWED_ORIGINS is not set, default to localhost dev origins plus the
// deployed PUBLIC_URL so local and production both work without manual config.
const { isDev, getPublicUrl, getFileServerUrl } = require('./url-config');

const _corsDefaults = [
  ...(isDev() ? [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:5174',
  ] : []),
  ...(process.env.PUBLIC_URL ? [process.env.PUBLIC_URL] : []),
  ...(process.env.BASE_URL ? [process.env.BASE_URL] : []),
];
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : _corsDefaults;

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Privacy-Pass'],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar', 'X-Padded'],
  maxAge: 86400 // 24 hours
};

// ─── Security Headers (OWASP baseline) ─────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: [
        "'self'",
        'wss:',
        'https:',
        // Allow socket.io and OHTTP relay connections
        ...(process.env.PUBLIC_URL ? [process.env.PUBLIC_URL.replace(/^http/, 'ws')] : []),
      ].filter(Boolean),
      mediaSrc: ["'self'", 'blob:'],
      workerSrc: ["'self'", 'blob:'],
      frameSrc: ["'none'"],
      frameAncestors: ["'none'"],       // Stronger clickjacking protection than X-Frame-Options
      objectSrc: ["'none'"],
      baseUri: ["'none'"],              // Prevent base tag injection
      formAction: ["'self'"],           // Prevent form hijacking to external targets
      manifestSrc: ["'self'"],
      upgradeInsecureRequests: [],      // Force HTTPS for all sub-resources
      blockAllMixedContent: [],         // Belt-and-suspenders mixed content block
    },
    // Collect violations in dev for tuning (remove reportUri in prod if not configured)
    ...(process.env.CSP_REPORT_URI ? { reportUri: process.env.CSP_REPORT_URI } : {}),
  },
  crossOriginEmbedderPolicy: false, // Allow SharedArrayBuffer for WebRTC
  // Additional security headers
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'no-referrer' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
}));

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Configure WebSocket with CORS and additional settings
const io = socketIo(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
    maxAge: 86400 // 24 hours
  },
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  maxHttpBufferSize: 1e7, // 10MB to accommodate large audio/image strings
  pingTimeout: 300000, // 300 seconds (5 min – generous for mobile screen-off)
  pingInterval: 60000, // 60 seconds
  cookie: false,
  serveClient: false,
  allowEIO3: true,
  perMessageDeflate: false // Disable to prevent Base64 corruption
});

// Initialize the Nearby Transfer signaling namespace
setupNearbyNamespace(io);

// Server-side timeouts for timed games (anagram)
const gameTimeouts = new Map();
const recentHangmanWordsByRoom = new Map();
const hangmanCpuGuessTimers = new Map();

// Shared scoring helper for anagram rounds (used in all reveal paths)
function getScrabbleScore(word = '') {
  const values = {
    A: 1, E: 1, I: 1, O: 1, U: 1, L: 1, N: 1, S: 1, T: 1, R: 1,
    D: 2, G: 2,
    B: 3, C: 3, M: 3, P: 3,
    F: 4, H: 4, V: 4, W: 4, Y: 4,
    K: 5,
    J: 8, X: 8,
    Q: 10, Z: 10,
  };
  return String(word).split('').reduce((sum, ch) => sum + (values[ch] || 0), 0);
}

function applyAnagramRoundScores(gd) {
  const basePoints = { novice: 10, adept: 15, expert: 20, master: 30 }[gd.difficulty] || 10;
  if (!gd.streaks) gd.streaks = {};
  gd.players.forEach(p => {
    const ans = gd.answers?.[p.id];
    if (ans && ans.word === gd.word) {
      const timeSecs = ans.submittedAt && gd.startedAt ? (ans.submittedAt - gd.startedAt) / 1000 : gd.timeLimit;
      const speedBonus = Math.max(0, Math.floor((gd.timeLimit - timeSecs) / 5));
      const letterScore = getScrabbleScore(ans.word);
      const lengthBonus = Math.max(0, ans.word.length - 4) * 2;
      const levelMultiplier = 1 + (((gd.currentRound || 1) - 1) * 0.05);
      gd.streaks[p.id] = (gd.streaks[p.id] || 0) + 1;
      const streakBonus = gd.streaks[p.id] >= 5 ? 10 : gd.streaks[p.id] >= 3 ? 5 : 0;
      const streakMultiplier = Math.min(2, 1 + ((gd.streaks[p.id] || 0) * 0.1));
      if (!gd.scores[p.id]) gd.scores[p.id] = 0;
      let points = (basePoints + letterScore + lengthBonus + speedBonus + streakBonus);
      points = Math.round(points * levelMultiplier * streakMultiplier);

      if (ans.doublePoints) points *= 2;
      if (ans.speedBoost) points += 3;

      gd.scores[p.id] += points;
    } else {
      gd.streaks[p.id] = 0;
    }
  });
}

const PORT = process.env.PORT || 3001

// Elevated limit for encrypted file drop endpoints FIRST (base64-encoded payloads can be large)
// Must come before the global 1 MB middleware so large drop bodies aren't rejected early.
app.use('/api/drops', express.json({ limit: '50mb' }));
// Global JSON limit — 1 MB for all other routes
app.use(express.json({ limit: '1mb' }));

// ─── Traffic Padding Middleware (RFC-compliant traffic analysis resistance) ──
// Pads all JSON API responses to fixed bucket sizes so network observers
// cannot infer content type or message length from packet sizes.
// Intentional blanket coverage: uniform padding prevents traffic analysis across all /api routes.
app.use('/api', padResponseMiddleware);

// ─── Privacy Pass Auth Middleware (RFC 9578) ────────────────
// Validates anonymous auth tokens on all /api routes.
// If no token is present, the request proceeds normally (soft validation).
// If a token IS present but invalid/spent, the request is rejected with 401.
// Privacy Pass is soft-validation: requests without tokens proceed normally.
// It serves as an anti-abuse signal, not access control.
app.use('/api', privacyPassAuth);

// Root endpoint for API status / health checks
app.get('/', (req, res) => {
  res.json({
    status: 'online',
    message: 'Ephemeral Chat API Server',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Server Ed25519 public key — clients pin this for TOFU signature verification
app.get('/api/server-key', (req, res) => {
  const publicKey = getPublicKeyBase64();
  if (!publicKey) return res.status(503).json({ error: 'Signing key not initialised' });
  res.json({ publicKey, algorithm: 'Ed25519' });
});

// Runtime configuration endpoint — consumed by Electron and Capacitor clients
// that cannot rely on build-time VITE_ variables to discover service URLs.
app.get('/api/config', (req, res) => {
  // Derive the canonical public URL from env or from the incoming request
  const publicUrl = process.env.PUBLIC_URL ||
    `${req.protocol}://${req.get('host')}`;

  // OHTTP relay: prefer explicit env var, then derive from relay port.
  const { RELAY_PORT: ohttpRelayPort } = require('./ohttp-relay-server');
  let ohttpRelayUrl;
  if (process.env.OHTTP_RELAY_URL) {
    ohttpRelayUrl = process.env.OHTTP_RELAY_URL;
  } else {
    // Strip any existing port from publicUrl then append relay port
    try {
      const _pu = new URL(publicUrl);
      ohttpRelayUrl = `${_pu.protocol}//${_pu.hostname}:${ohttpRelayPort}/ohttp/request`;
    } catch (_) {
      ohttpRelayUrl = `${getPublicUrl()}/ohttp/request`.replace(`:${process.env.PORT || 3001}`, `:${ohttpRelayPort}`);
    }
  }

  const wsBase = publicUrl.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:');

  res.json({
    apiUrl:           publicUrl,
    wsUrl:            wsBase,
    ohttpRelayUrl,
    ohttpGatewayUrl:  `${publicUrl}/ohttp/request`,
    masqueBaseUrl:    `${wsBase}/.well-known/masque/udp/`,
    privacyPassIssuerUrl: `${publicUrl}/privacy-pass`,
  });
});

// Rate limiting storage
const rateLimits = new Map();

// Room metadata for Lobby/Host logic
// Roles: 'host', 'tier1', 'tier2', 'user'
// Use Object.create(null) to eliminate prototype chain — prevents __proto__ / constructor
// prototype pollution attacks when roomCode values are used as keys.
const roomData = Object.create(null); // { [roomId]: { hostId: string, lobbyLimit: number, lobbyCount: number, userRoles: { [socketId]: role } } }

// Track which socket IDs are currently waiting in the knock lobby, per room.
// approve-guest / deny-guest must verify guestId is in this set before acting.
const pendingKnocks = new Map(); // roomCode → Set<socketId>

// Track deferred (grace-period) user removals so they can be cancelled on reconnect
// Key: sessionToken, Value: { timeoutId, socketId, roomCode }
const deferredRemovals = new Map();

// Initialize Redis client (optional)
let redisClient = null;
let roomManager;
let securityManager;
let linkPreviewService;

async function initializeRedis() {
  try {
    if (process.env.REDIS_URL) {
      redisClient = createClient({ url: process.env.REDIS_URL });
      await redisClient.connect();
      logger.info('✅ Connected to Redis');
    } else {
      logger.info('⚠️  Redis not configured, using in-memory storage');
    }
  } catch (error) {
    logger.info('⚠️  Redis connection failed, using in-memory storage:', error.message);
    redisClient = null;
  }

  roomManager = new RoomManager(redisClient);
  roomManager.setIo(io); // Pass io reference for stale user detection
  securityManager = new SecurityManager();

  // Initialize Link Preview Service (uses Redis for cache if available, otherwise in-memory)
  linkPreviewService = new LinkPreviewService(redisClient);
  linkPreviewService.setIo(io);

  // Periodic cleanup for security manager + link preview cache
  setInterval(() => {
    securityManager.cleanup();
    linkPreviewService.cleanup();
  }, 60 * 60 * 1000); // Every hour

  // Periodic cleanup for expired persistent rooms
  setInterval(async () => {
    try {
      await roomManager.cleanupExpiredRooms();
    } catch (error) {
      logger.error('Error in room cleanup job:', error);
    }
  }, 5 * 60 * 1000); // Every 5 minutes

  // Periodic stale-user cleanup: sweep all rooms for disconnected sockets
  setInterval(async () => {
    try {
      const allRooms = roomManager.rooms; // In-memory Map
      if (!allRooms || allRooms.size === 0) return;

      for (const [roomCode, room] of allRooms.entries()) {
        if (!room.users || room.users.length === 0) continue;

        const before = room.users.length;
        // Build a Set of socketIds that have a pending deferred removal (grace period)
        const deferredSocketIds = new Set();
        for (const [, def] of deferredRemovals.entries()) {
          if (def.roomCode === roomCode) deferredSocketIds.add(def.socketId);
        }
        // Keep users that are either still connected OR within their grace period
        const activeUsers = room.users.filter(u =>
          io.sockets.sockets.has(u.socketId) || deferredSocketIds.has(u.socketId)
        );

        if (activeUsers.length !== before) {
          const removed = before - activeUsers.length;
          room.users = activeUsers;
          await roomManager.saveRoom(roomCode, room);
          logger.info(`🧹 Periodic cleanup: removed ${removed} stale user(s) from room ${roomCode}`);

          // Update roomData host if the host was stale
          if (roomData[roomCode]) {
            const socketRoom = io.sockets.adapter.rooms.get(roomCode);
            const liveMembers = Array.from(socketRoom || []);

            if (liveMembers.length > 0 && !liveMembers.includes(roomData[roomCode].hostId)) {
              const newHostId = liveMembers[0];
              roomData[roomCode].hostId = newHostId;
              if (!roomData[roomCode].userRoles) roomData[roomCode].userRoles = {};
              roomData[roomCode].userRoles[newHostId] = 'host';
              io.to(newHostId).emit('promoted-to-host');
              logger.info(`👑 Periodic cleanup: reassigned host to ${newHostId} in room ${roomCode}`);
            } else if (liveMembers.length === 0) {
              delete roomData[roomCode];
            }

            // Broadcast updated user list
            if (roomData[roomCode] && liveMembers.length > 0) {
              const enrichedUsers = getEnrichedUsers(roomCode);
              io.to(roomCode).emit('users-updated', { users: enrichedUsers });
            }
          }
        }
      }
    } catch (error) {
      logger.error('Error in stale user cleanup job:', error);
    }
  }, 30 * 1000); // Every 30 seconds
}

// Rate limiting function
function checkRateLimit(socketId, maxMessages = 30, windowMs = 60000) {
  const now = Date.now();
  const userLimits = rateLimits.get(socketId) || { count: 0, resetTime: now + windowMs };

  if (now > userLimits.resetTime) {
    userLimits.count = 0;
    userLimits.resetTime = now + windowMs;
  }

  userLimits.count++;
  rateLimits.set(socketId, userLimits);

  return userLimits.count <= maxMessages;
}

// Helper to get users with roles attached
function getEnrichedUsers(roomCode) {
  const room = roomData[roomCode];
  if (!room) return [];

  const roomSocket = io.sockets.adapter.rooms.get(roomCode);
  if (!roomSocket) return [];

  return Array.from(roomSocket).map(socketId => {
    const s = io.sockets.sockets.get(socketId);
    return {
      socketId,
      nickname: s?.nickname || 'Unknown',
      role: room.userRoles?.[socketId] || (room.hostId === socketId ? 'host' : 'user')
    };
  });
}

// ─── Ephemeral Drops API Routes ─────────────────────────────
app.use('/api/drops', createDropRoutes(dropManager));
logger.info('📦 Drop API routes mounted at /api/drops');

// REST API Routes
app.get('/api/invite/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { roomCode } = req.query; // Optional room code to validate against

    // console.log(`Validating invite token: ${token} for room: ${roomCode || 'any'}`);

    const result = await roomManager.validateInviteToken(token, roomCode || null, false);

    if (result.valid) {
      // console.log(`Token validation successful for room ${result.roomCode}`);
      res.json({
        success: true,
        roomCode: result.roomCode,
        requiresPassword: result.room?.settings?.passwordHash ? true : false,
        isPermanent: result.isPermanent
      });
    } else {
      // console.log('Token validation failed:', result.error);
      res.status(400).json({
        success: false,
        error: result.error || 'Invalid or expired token'
      });
    }
  } catch (error) {
    logger.error('Error validating invite token:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Route to manually/on-demand start the relay server
app.post('/api/start-relay', (req, res) => {
  const { secret } = req.body;
  const expected = String(process.env.CAP_SECRET);
  if (!secret || String(secret).length !== expected.length || !nodeCrypto.timingSafeEqual(
    Buffer.from(String(secret)),
    Buffer.from(expected)
  )) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  try {
    startRelayServer();
    res.json({ success: true, message: 'Relay server starting...' });
  } catch (error) {
    logger.error('Failed to start relay server via API:', error);
    res.status(500).json({ success: false, error: 'Failed to start relay server' });
  }
});


// Cap.js API endpoints for proof-of-work CAPTCHA
app.post('/api/cap/challenge', async (req, res) => {
  try {
    const challenge = await cap.createChallenge();
    res.json(challenge);
  } catch (error) {
    logger.error('Error generating Cap challenge:', error);
    res.status(500).json({ error: 'Failed to generate challenge' });
  }
});

app.post('/api/cap/redeem', async (req, res) => {
  logger.info('Received Cap redeem request');
  logger.info('Request body:', req.body);
  try {
    const { token, solution } = req.body;
    // The widget might send 'token' or 'solution' or both.
    // Let's try to validate using the available data.

    // Check if we should use redeemChallenge or validateToken
    // Based on prototype, redeemChallenge exists.

    // Try validateToken first (as we did)
    // const result = await cap.validateToken(token);

    // Let's try redeemChallenge if validateToken failed or as primary
    // Assuming the widget sends the token it received + solution?
    // Or maybe just the token?

    // If the widget sends { token: '...' }, let's try passing that.

    let result;
    if (cap.redeemChallenge) {
      // Note: redeemChallenge might be the correct method for the server-side check
      // It might expect the token and the solution?
      // Let's assume it takes the object sent by the widget.
      result = await cap.redeemChallenge(req.body);
    } else {
      result = await cap.validateToken(token);
    }

    logger.info('Verification result:', result);

    // If result is an object, send it directly. If boolean, wrap it.
    if (typeof result === 'object') {
      res.json(result);
    } else {
      res.json({ success: result });
    }
  } catch (error) {
    logger.error('Error redeeming Cap token:', error);
    res.status(500).json({ success: false, error: 'Failed to verify token' });
  }
});

/**
 * Generate an invite token for a room
 * POST /api/rooms/:roomCode/invite
 * Body: { password: string } (if room is password protected)
 */
app.post('/api/rooms/:roomCode/invite', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { password } = req.body;

    // Verify room exists and password is correct if required
    const room = await roomManager.getRoom(roomCode);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (room.settings.passwordHash) {
      if (!password) {
        return res.status(400).json({ error: 'Password is required for this room' });
      }
      const isMatch = await bcrypt.compare(password, room.settings.passwordHash);
      if (!isMatch) {
        return res.status(401).json({ error: 'Incorrect password' });
      }
    }

    // Generate the invite link using the server-configured public URL only.
    // Never use the client-supplied Origin/Referer header — it is attacker-controlled
    // and would allow open redirect attacks via crafted invite links.
    const serverBaseUrl = process.env.PUBLIC_URL || process.env.BASE_URL || null;
    const invite = await roomManager.generateInviteLink(roomCode, {
      isPermanent: false,
      expiryMs: 25 * 60 * 1000, // 25 minutes
      baseUrl: serverBaseUrl
    });

    res.json({
      success: true,
      inviteLink: invite.url,
      url: invite.url,
      verbalCode: invite.verbalCode,
      expiresIn: '25 minutes'
    });

  } catch (error) {
    logger.error('Error generating invite:', error);
    res.status(500).json({
      error: 'Failed to generate invite',
      details: error.message
    });
  }
});

/**
 * Join room using verbal code
 * POST /api/verbal-join
 * Body: { verbalCode: "clarity compass journey peace" }
 */
app.post('/api/verbal-join', async (req, res) => {
  try {
    const { verbalCode } = req.body;

    if (!verbalCode || typeof verbalCode !== 'string') {
      return res.status(400).json({ success: false, error: 'Verbal code is required' });
    }

    // Validate format: 4 words separated by spaces
    const words = verbalCode.toLowerCase().trim().split(/\s+/);
    if (words.length !== 4) {
      return res.status(400).json({ success: false, error: 'Invalid code format. Expected 4 words separated by spaces.' });
    }

    // Look up the token by verbal code
    const result = roomManager.findTokenByVerbalCode(verbalCode);

    if (!result) {
      return res.status(404).json({ success: false, error: 'Code not found or expired' });
    }

    // Verify room still exists
    const room = await roomManager.getRoom(result.roomCode);
    if (!room) {
      return res.status(404).json({ success: false, error: 'Room no longer exists' });
    }

    res.json({
      success: true,
      roomCode: result.roomCode,
      token: result.token,
      requiresPassword: !!room.settings?.passwordHash
    });

  } catch (error) {
    logger.error('Error processing verbal join:', error);
    res.status(500).json({ success: false, error: 'Failed to process verbal code' });
  }
});

app.post('/api/rooms', async (req, res) => {
  try {
    const { messageTTL, password, maxUsers, capToken, creatorId, persistenceMode, customCode, hp_email, hp_website, hp_timestamp, autoApprove, preApprovedList } = req.body;

    logger.info('HTTP room creation request:', { messageTTL, password: password ? '[REDACTED]' : undefined, maxUsers, hasCapToken: !!capToken, creatorId: !!creatorId, persistenceMode });

    // Honeypot validation - bots fill these hidden fields, humans don't
    if (hp_email || hp_website) {
      logger.warn('Honeypot triggered - bot detected', { hp_email: !!hp_email, hp_website: !!hp_website });
      // Return success to not alert the bot, but don't create the room
      return res.json({ success: true, roomCode: 'bot-trap-' + nodeCrypto.randomBytes(6).toString('hex') });
    }

    // Timestamp validation - form should take at least 1 second to fill (bots are instant)
    if (hp_timestamp) {
      const formTime = Date.now() - parseInt(hp_timestamp, 10);
      if (formTime < 1000) { // Less than 1 second
        logger.warn('Form submitted too quickly - likely bot', { formTime });
        return res.json({ success: true, roomCode: 'bot-trap-' + nodeCrypto.randomBytes(6).toString('hex') });
      }
    }

    // Legacy: Validate Cap token if provided (for backward compatibility)
    if (capToken) {
      const isValid = await cap.validateToken(capToken);
      if (!isValid) {
        logger.error('Invalid Cap token');
        return res.status(400).json({ error: 'Verification failed. Please try again.' });
      }
    }

    const settings = {};
    if (messageTTL && getTTLOptions()[messageTTL] !== undefined) {
      settings.messageTTL = getTTLOptions()[messageTTL];
    }
    if (password && typeof password === 'string' && password.length > 0) {
      settings.password = sanitizeInput(password);
    }
    if (maxUsers && typeof maxUsers === 'number' && maxUsers >= 1 && maxUsers <= 200) {
      settings.maxUsers = maxUsers;
    }

    // NEW: Add creator ID and persistence mode
    if (creatorId && typeof creatorId === 'string') {
      settings.creatorId = sanitizeInput(creatorId);
    }
    if (persistenceMode && typeof persistenceMode === 'string') {
      settings.persistenceMode = sanitizeInput(persistenceMode);
    }
    if (customCode && typeof customCode === 'string') {
      settings.customCode = sanitizeInput(customCode);
    }

    const roomCode = await roomManager.createRoom(settings);

    // Store auto-approve and pre-approved list in roomData for this room
    if (!roomData[roomCode]) {
      roomData[roomCode] = { hostId: null, lobbyLimit: 100, lobbyCount: 0, userRoles: {} };
    }
    roomData[roomCode].autoApprove = !!autoApprove;
    if (Array.isArray(preApprovedList)) {
      roomData[roomCode].preApprovedList = preApprovedList
        .filter(entry => entry && typeof entry.name === 'string' && entry.name.trim().length > 0)
        .map(entry => ({
          name: sanitizeInput(entry.name.trim()).substring(0, 20),
          role: ['admin', 'mod', 'tier1', 'tier2', 'none', 'user'].includes((entry.role || '').toLowerCase())
            ? entry.role.toLowerCase()
            : 'none'
        }))
        .slice(0, 100);
    } else {
      roomData[roomCode].preApprovedList = [];
    }

    res.json({ success: true, roomCode });
  } catch (error) {
    logger.error('Error creating room via HTTP:', error);
    // Never expose raw error.message in production — it can leak internal paths and logic
    const isUserFacing = error.message && (
      error.message.includes('maximum') ||
      error.message.includes('capacity') ||
      error.message.includes('taken') ||
      error.message.includes('Invalid') ||
      error.message.includes('between') ||
      error.message.includes('only contain')
    );
    const clientMessage = isUserFacing ? error.message : 'Failed to create room';
    res.status(500).json({ error: clientMessage });
  }
});



/**
 * Exchange an invite token for room credentials
 * GET /api/invite/:token
 */


app.get('/api/rooms/:roomCode', async (req, res) => {
  try {
    const { roomCode } = req.params;

    if (!isValidRoomCode(roomCode)) {
      return res.status(400).json({ error: 'Invalid room code format' });
    }

    const exists = await roomManager.roomExists(roomCode);
    if (!exists) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const room = await roomManager.getRoom(roomCode);
    res.json({
      exists: true,
      requiresPassword: !!room.settings.passwordHash,
      userCount: room.users.length
    });
  } catch (error) {
    logger.error('Error checking room:', error);
    res.status(500).json({ error: 'Failed to check room' });
  }
});

/**
 * Ephemeral image reveal endpoint
 * POST /api/reveal-image
 * Body: { viewToken }
 */
app.post('/api/reveal-image', async (req, res) => {
  try {
    const { viewToken } = req.body;
    if (!viewToken) return res.status(400).json({ error: 'Missing view token' });

    const tokenData = roomManager.validateViewToken(viewToken);
    if (!tokenData) return res.status(401).json({ error: 'Invalid or expired view token' });

    const { messageId } = tokenData;
    const msgResult = await roomManager.getMessageById(messageId);

    if (!msgResult || !msgResult.message) {
      return res.status(404).json({ error: 'Image not found' });
    }

    const { message } = msgResult;
    if (message.messageType !== 'image') {
      return res.status(400).json({ error: 'Not an image message' });
    }

    // content is base64 data URI: data:image/png;base64,...
    const base64Data = message.content.split(',')[1];
    const imgBuffer = Buffer.from(base64Data, 'base64');
    const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);
    const rawMime = message.content.split(';')[0].split(':')[1];
    const mimeType = ALLOWED_IMAGE_MIMES.has(rawMime) ? rawMime : 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);
    res.send(imgBuffer);
  } catch (error) {
    logger.error('Error revealing image:', error);
    res.status(500).json({ error: 'Failed to reveal image' });
  }
});

/**
 * Agora RTC Token Generation
 * GET /api/agora/token?channelName=roomCode
 */
app.get('/api/agora/token', async (req, res) => {
  try {
    const channelName = req.query.channelName;
    if (!channelName) {
      return res.status(400).json({ error: 'channelName is required' });
    }

    const appId = process.env.AGORA_APP_ID;
    const appCertificate = process.env.AGORA_APP_CERTIFICATE;

    if (!appId || !appCertificate) {
      logger.error('Agora configuration missing');
      return res.status(500).json({ error: 'Agora not configured on server' });
    }

    // Verify the room exists and is not expired before issuing an Agora token.
    // Without this check, any caller can generate valid tokens for arbitrary channel names.
    if (!isValidRoomCode(channelName)) {
      return res.status(400).json({ error: 'Invalid channel name' });
    }
    const agoraRoom = await roomManager.getRoom(channelName);
    if (!agoraRoom) {
      return res.status(404).json({ error: 'Room not found' });
    }
    if (new Date(agoraRoom.expiresAt) < new Date()) {
      return res.status(404).json({ error: 'Room has expired' });
    }

    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 3600;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    // Build token using UID 0 (allows any UID to join)
    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      0,
      role,
      privilegeExpiredTs,
      privilegeExpiredTs
    );

    res.json({ success: true, token, appId });
  } catch (error) {
    logger.error('Error generating Agora token:', error);
    res.status(500).json({ error: 'Failed to generate token' });
  }
});

// Get rooms by creator ID (My Rooms feature)
// Issue a creator token — HMAC(CAP_SECRET, creatorId + clientIP) for authenticated room management.
// IP-bound: tokens issued from one IP cannot enumerate rooms created from another IP.
const creatorTokenLimiter = RateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 5, // 5 token requests per IP per window
  message: { error: 'Too many requests' },
});
app.post('/api/creator-token', creatorTokenLimiter, express.json(), (req, res) => {
  const { creatorId } = req.body;
  if (!creatorId || typeof creatorId !== 'string' || creatorId.length > 128) {
    return res.status(400).json({ error: 'Invalid creator ID' });
  }
  const token = nodeCrypto.createHmac('sha256', process.env.CAP_SECRET)
    .update(creatorId)
    .digest('hex');
  res.json({ token });
});

// GET /api/my-rooms — List rooms created or joined by this creator.
// The creatorId is a 128-bit UUID stored only in the user's sessionStorage —
// sufficient protection for this metadata-only endpoint.
app.get('/api/my-rooms', async (req, res) => {
  try {
    const { creatorId } = req.query;

    if (!creatorId) {
      return res.status(400).json({ error: 'Creator ID required' });
    }

    const createdRooms = await roomManager.getRoomsByCreator(creatorId);
    const joinedRooms = await roomManager.getRoomsByParticipant(creatorId);

    // Combine and deduplicate rooms by their ID
    const allRoomsMap = new Map();
    [...createdRooms, ...joinedRooms].forEach(room => {
      allRoomsMap.set(room.id, room);
    });
    const rooms = Array.from(allRoomsMap.values());

    // Calculate room status for each room using live count
    const calculateRoomStatus = (room, liveCount) => {
      const now = new Date();
      const expiresAt = new Date(room.expiresAt);
      const isExpired = expiresAt < now;
      const hasUsers = liveCount > 0;

      if (isExpired) return 'expired';
      if (hasUsers) return 'active';
      return 'recoverable'; // Empty but not expired
    };

    const enrichedRooms = rooms.map(room => {
      // Use Socket.IO adapter for real-time accurate user count
      const socketRoom = io.sockets.adapter.rooms.get(room.id);
      const liveUserCount = socketRoom ? socketRoom.size : 0;

      return {
        roomCode: room.id,
        createdAt: room.createdAt,
        expiresAt: room.expiresAt,
        persistenceMode: room.settings.persistenceMode || 'ephemeral',
        status: calculateRoomStatus(room, liveUserCount),
        userCount: liveUserCount,
        isOwner: room.creatorId === creatorId,
        timeRemaining: new Date(room.expiresAt) - new Date() // milliseconds
      };
    });

    res.json(enrichedRooms);
  } catch (error) {
    logger.error('Error getting creator rooms:', error);
    res.status(500).json({ error: 'Failed to retrieve rooms' });
  }
});

// Delete room by creator (manual deletion)
app.delete('/api/rooms/:roomCode/delete', async (req, res) => {
  try {
    const { roomCode } = req.params;
    const { creatorId } = req.body;

    if (!creatorId) {
      return res.status(400).json({ error: 'Creator ID required' });
    }

    await roomManager.deleteRoomByCreator(roomCode, creatorId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting room:', error);
    res.status(403).json({ error: error.message });
  }
});

// ─── Socket.IO Traffic Padding Middleware ──────────────────
// Intercepts padded-message events: drops chaff, strips padding from real
// messages. Also starts per-room server-originated chaff on room join.
io.use(trafficPaddingMiddleware);

/**
 * Ensure server-originated chaff is running for a room.
 * Called after any successful join-room.
 * Tracking is managed internally by traffic-padding.js.
 */
function ensureRoomChaff(roomCode) {
  startServerChaff(io, roomCode);
}

/**
 * Stop chaff for a room (called when room empties).
 */
function cleanupRoomChaff(roomCode) {
  stopServerChaff(roomCode);
}

io.on('connection', (socket) => {
  // logger.info(`🔌 User connected: ${socket.id}`);

  // Reusable inactivity timeout handler
  const handleInactivityTimeout = (socketId, userId, roomCode) => {
    // logger.info(`⏰ User ${userId} timed out, disconnecting...`);
    const targetSocket = io.sockets.sockets.get(socketId);
    if (targetSocket) {
      targetSocket.emit('inactivity-timeout', {
        message: 'You have been disconnected due to inactivity'
      });
      targetSocket.disconnect(true);
    }
  };

  // File Transfer Logic
  socket.on('file-transfer-start', async () => {
    try {
      await registerTransfer(socket.id);
      // Tell client where the file server is
      // Hardcoded to 8080 for now as per architecture plan, or use env var
      const fileServerUrl = getFileServerUrl();
      socket.emit('file-server-ready', { url: fileServerUrl });
    } catch (error) {
      logger.error('Failed to start file server:', error);
      socket.emit('file-server-error', { error: 'Failed to start file server' });
    }
  });

  socket.on('file-transfer-end', () => {
    unregisterTransfer(socket.id); // decrement one transfer slot for this socket
  });

  socket.on('create-room', async (data, callback) => {
    try {
      const { messageTTL, password, maxUsers, customCode, totpEnabled } = data || {};

      // logger.info('Creating room with data:', { messageTTL, password, maxUsers });

      const settings = {};
      if (messageTTL && getTTLOptions()[messageTTL] !== undefined) {
        settings.messageTTL = getTTLOptions()[messageTTL];
      }
      if (password && typeof password === 'string' && password.length > 0) {
        settings.password = sanitizeInput(password);
      }
      if (maxUsers && typeof maxUsers === 'number' && maxUsers >= 1 && maxUsers <= 200) {
        settings.maxUsers = maxUsers;
        logger.info('Setting maxUsers to:', maxUsers);
      } else {
        logger.info('Invalid or missing maxUsers, using default');
      }
      if (customCode && typeof customCode === 'string') {
        settings.customCode = sanitizeInput(customCode);
      }

      const roomCode = await roomManager.createRoom(settings);

      // Generate TOTP secret if requested — persisted inside room settings
      // so it survives server restarts for persistent rooms.
      let totpSecret = null;
      if (totpEnabled === true) {
        const { generateSecureToken } = authUtils;
        totpSecret = generateSecureToken(20); // 20 bytes = 160-bit secret
        logger.info(`[TOTP] Room ${roomCode} has TOTP enabled`);
        // Persist inside the room object (survives restarts via RoomManager)
        const createdRoom = await roomManager.getRoom(roomCode);
        if (createdRoom) {
          createdRoom.settings.totpSecret = totpSecret;
          await roomManager.saveRoom(roomCode, createdRoom);
        }
      }

      // Initialize room metadata for Lobby/Host logic
      roomData[roomCode] = {
        hostId: socket.id,
        lobbyLimit: (settings.maxUsers || 50) * 2, // Default 2x max users
        lobbyCount: 0,
        totpSecret: totpSecret || undefined, // undefined = TOTP not required
      };

      callback({ success: true, roomCode, totpSecret }); // creator receives the secret to share
    } catch (error) {
      logger.error('Error creating room:', error);
      callback({ success: false, error: 'Failed to create room' });
    }
  });

  // Knock-to-Join Logic
  socket.on('knock', async ({ roomCode, nickname, password, inviteToken, capToken, totpCode }) => {
    // Reject clearly unsafe room codes that could lead to prototype pollution
    if (
      typeof roomCode !== 'string' ||
      roomCode === '__proto__' ||
      roomCode === 'constructor' ||
      roomCode === 'prototype'
    ) {
      return socket.emit('knock-denied', { reason: 'Invalid room code' });
    }

    // Brute-force lockout check
    const lockStatus = securityManager.isLocked(socket.id);
    if (lockStatus.locked) {
      return socket.emit('knock-denied', { reason: 'Too many failed attempts — try again later', lockedUntil: lockStatus.lockedUntil });
    }

    // 1. Clean stale users from roomManager (sockets that no longer exist)
    try {
      const managedRoom = await roomManager.getRoom(roomCode);
      if (managedRoom && managedRoom.users) {
        // Preserve users within their reconnection grace period
        const deferredSocketIds = new Set();
        for (const [, def] of deferredRemovals.entries()) {
          if (def.roomCode === roomCode) deferredSocketIds.add(def.socketId);
        }
        const activeUsers = managedRoom.users.filter(u =>
          io.sockets.sockets.has(u.socketId) || deferredSocketIds.has(u.socketId)
        );
        if (activeUsers.length !== managedRoom.users.length) {
          logger.info(`🧹 Knock cleanup: removed ${managedRoom.users.length - activeUsers.length} stale user(s) from room ${roomCode}`);
          managedRoom.users = activeUsers;
          await roomManager.saveRoom(roomCode, managedRoom);
        }
      }
    } catch (e) {
      // Non-critical, continue with knock logic
    }

    // 2. Check actual live user count from socket adapter (single source of truth)
    const socketRoom = io.sockets.adapter.rooms.get(roomCode);
    const liveUserCount = socketRoom ? socketRoom.size : 0;

    let room = roomData[roomCode];

    // Hydrate TOTP secret from persisted room if roomData lost it (e.g., after restart)
    if (!room?.totpSecret) {
      const persistedRoom = await roomManager.getRoom(roomCode);
      if (persistedRoom?.settings?.totpSecret) {
        if (!room) {
          roomData[roomCode] = { hostId: null, lobbyLimit: 100, lobbyCount: 0, userRoles: {} };
          room = roomData[roomCode];
        }
        room.totpSecret = persistedRoom.settings.totpSecret;
      }
    }

    // 3. If room is empty (no live sockets), user becomes host automatically.
    //    Credentials must still be validated before granting host status — an empty
    //    room does not waive the password requirement.
    if (liveUserCount === 0) {
      const emptyRoomRecord = await roomManager.getRoom(roomCode);
      if (emptyRoomRecord?.settings?.passwordHash && !inviteToken) {
        if (!password) {
          return socket.emit('knock-denied', { reason: 'Password required for this room' });
        }
        const pwMatch = await bcrypt.compare(password, emptyRoomRecord.settings.passwordHash);
        if (!pwMatch) {
          securityManager.recordFailedAttempt(socket.id);
          return socket.emit('knock-denied', { reason: 'Incorrect password' });
        }
      }

      // Initialize or reset roomData (preserve preApprovedList and totpSecret if set)
      const existingPreApproved = room?.preApprovedList || [];
      const existingAutoApprove = room?.autoApprove || false;
      const existingTotpSecret = room?.totpSecret;
      roomData[roomCode] = {
        hostId: socket.id,
        lobbyLimit: 100,
        lobbyCount: 0,
        userRoles: {},
        autoApprove: existingAutoApprove,
        preApprovedList: existingPreApproved,
        totpSecret: existingTotpSecret,
      };

      logger.info(`👑 Room ${roomCode} is empty, ${nickname} auto-approved as host`);
      return socket.emit('knock-approved', { isHost: true });
    }

    // 4. If room has users but no metadata, create it
    if (!room) {
      const firstUser = Array.from(socketRoom)[0];
      room = {
        hostId: firstUser,
        lobbyLimit: 100,
        lobbyCount: 0,
        userRoles: {},
        autoApprove: false,
        preApprovedList: []
      };
      roomData[roomCode] = room;
    }

    // 4b. Check auto-approve mode — skip the knock/waiting lobby entirely.
    // Even when auto-approving, check the pre-approved list to assign any designated role.
    if (room.autoApprove) {
      if (room.preApprovedList && room.preApprovedList.length > 0) {
        const normalizedNickname = (nickname || '').toLowerCase().trim();
        const matchedEntry = room.preApprovedList.find(
          entry => entry.name.toLowerCase().trim() === normalizedNickname
        );
        if (matchedEntry && matchedEntry.role && matchedEntry.role !== 'none') {
          if (!room.userRoles) room.userRoles = {};
          const roleMap = { admin: 'tier1', mod: 'tier2', tier1: 'tier1', tier2: 'tier2', user: 'user' };
          const internalRole = roleMap[matchedEntry.role.toLowerCase()] || 'user';
          room.userRoles[socket.id] = internalRole;
          logger.info(`✅ Auto-approve: assigned role "${matchedEntry.role}" to pre-approved user "${nickname}" in room ${roomCode}`);
        }
      }
      logger.info(`✅ Auto-approve enabled for room ${roomCode}, auto-approving ${nickname}`);
      return socket.emit('knock-approved', { isHost: false });
    }

    // 4c. Check pre-approved user list — auto-approve if nickname matches
    if (room.preApprovedList && room.preApprovedList.length > 0) {
      const normalizedNickname = (nickname || '').toLowerCase().trim();
      const matchedEntry = room.preApprovedList.find(
        entry => entry.name.toLowerCase().trim() === normalizedNickname
      );

      if (matchedEntry) {
        // Check if the nickname is already taken by someone in the room
        const managedRoom = await roomManager.getRoom(roomCode);
        const nicknameTaken = managedRoom?.users?.some(
          u => (u.nickname || '').toLowerCase().trim() === normalizedNickname
        );

        if (!nicknameTaken) {
          // Assign role if specified in the pre-approved entry
          if (matchedEntry.role && matchedEntry.role !== 'none') {
            if (!room.userRoles) room.userRoles = {};
            // Map friendly role names to internal roles
            const roleMap = { admin: 'tier1', mod: 'tier2', tier1: 'tier1', tier2: 'tier2', user: 'user' };
            const internalRole = roleMap[matchedEntry.role.toLowerCase()] || 'user';
            room.userRoles[socket.id] = internalRole;
          }

          logger.info(`✅ Pre-approved user "${nickname}" auto-approved for room ${roomCode} with role: ${matchedEntry.role || 'user'}`);
          return socket.emit('knock-approved', { isHost: false });
        }
      }
    }

    // 5a. TOTP verification — if room requires it
    if (room.totpSecret) {
      if (!totpCode) {
        return socket.emit('knock-denied', { reason: 'This room requires a TOTP verification code', requiresTotp: true });
      }
      const isValidTotp = authUtils.verifyTOTP(String(totpCode), room.totpSecret);
      if (!isValidTotp) {
        securityManager.recordFailedAttempt(socket.id);
        return socket.emit('knock-denied', { reason: 'Invalid TOTP code — check your authenticator app' });
      }
    }

    // 5. Check Lobby Limit
    if (room.lobbyCount >= room.lobbyLimit) {
      return socket.emit('knock-denied', { reason: 'Lobby is full' });
    }

    // 6. Verify the host is still alive
    const hostSocket = io.sockets.sockets.get(room.hostId);
    const remainingMembers = Array.from(socketRoom);

    if (!hostSocket || !remainingMembers.includes(room.hostId)) {
      // Host is gone — try to find a new host from remaining members
      if (remainingMembers.length > 0) {
        const newHostId = remainingMembers[0];
        room.hostId = newHostId;
        if (!room.userRoles) room.userRoles = {};
        room.userRoles[newHostId] = 'host';
        logger.info(`👑 Host was stale during knock, reassigned to ${newHostId} in room ${roomCode}`);
        io.to(newHostId).emit('promoted-to-host');

        // Now notify the new host about this knock
        io.to(newHostId).emit('user-knocking', {
          socketId: socket.id,
          nickname: sanitizeInput(nickname || 'Unknown')
        });
      } else {
        // No valid members (shouldn't happen since liveUserCount > 0, but safeguard)
        room.hostId = socket.id;
        roomData[roomCode] = room;
        return socket.emit('knock-approved', { isHost: true });
      }
    } else {
      // Host is alive — notify all managers (host and tier1)
      room.lobbyCount++;

      const managers = Array.from(io.sockets.sockets.values()).filter(s => {
        if (s.roomCode !== roomCode) return false;
        const role = room.userRoles?.[s.id] || (room.hostId === s.id ? 'host' : 'user');
        return role === 'host' || role === 'tier1';
      });

      managers.forEach(mgr => {
        mgr.emit('user-knocking', {
          socketId: socket.id,
          nickname: sanitizeInput(nickname || 'Unknown')
        });
      });
    }

    // Track this socket as pending so approve/deny-guest can verify legitimacy
    if (!pendingKnocks.has(roomCode)) pendingKnocks.set(roomCode, new Set());
    pendingKnocks.get(roomCode).add(socket.id);

    socket.emit('knock-pending');
  });

  // Screenshot attempt notification — relay to other users in the room
  socket.on('screenshot-attempt', ({ roomCode: ssRoomCode }) => {
    if (!ssRoomCode || !socket.roomCode || socket.roomCode !== ssRoomCode) return;
    const senderNickname = socket.nickname || 'Someone';
    // Notify all OTHER users in the room (not the sender)
    socket.to(ssRoomCode).emit('screenshot-detected', {
      nickname: senderNickname,
      timestamp: new Date().toISOString()
    });
    logger.info(`📸 Screenshot attempt detected from ${senderNickname} in room ${ssRoomCode}`);
  });

  // Auto-approve toggle — host or tier1 can enable/disable
  socket.on('toggle-auto-approve', ({ roomCode: aaRoomCode, enabled }) => {
    const aaRoom = roomData[aaRoomCode];
    if (!aaRoom) return;
    const requesterRole = aaRoom.userRoles?.[socket.id] || (aaRoom.hostId === socket.id ? 'host' : 'user');
    if (requesterRole !== 'host' && requesterRole !== 'tier1') return;

    aaRoom.autoApprove = !!enabled;
    logger.info(`🔓 Auto-approve ${enabled ? 'enabled' : 'disabled'} for room ${aaRoomCode} by ${socket.nickname}`);

    // Notify all users in the room about the change
    io.to(aaRoomCode).emit('auto-approve-updated', {
      enabled: aaRoom.autoApprove,
      updatedBy: socket.nickname
    });
  });

  // Update pre-approved user list — host or tier1 can modify
  socket.on('update-pre-approved-list', ({ roomCode: palRoomCode, list }) => {
    const palRoom = roomData[palRoomCode];
    if (!palRoom) return;
    const requesterRole = palRoom.userRoles?.[socket.id] || (palRoom.hostId === socket.id ? 'host' : 'user');
    if (requesterRole !== 'host' && requesterRole !== 'tier1') return;

    // Validate and sanitize the list
    if (!Array.isArray(list)) return;
    const sanitizedList = list
      .filter(entry => entry && typeof entry.name === 'string' && entry.name.trim().length > 0)
      .map(entry => ({
        name: sanitizeInput(entry.name.trim()).substring(0, 20),
        role: ['admin', 'mod', 'tier1', 'tier2', 'none', 'user'].includes((entry.role || '').toLowerCase())
          ? entry.role.toLowerCase()
          : 'none'
      }))
      .slice(0, 100); // Max 100 pre-approved users

    palRoom.preApprovedList = sanitizedList;
    logger.info(`📋 Pre-approved list updated for room ${palRoomCode}: ${sanitizedList.length} users by ${socket.nickname}`);

    // Notify all users in the room about the update
    io.to(palRoomCode).emit('pre-approved-list-updated', {
      list: sanitizedList,
      updatedBy: socket.nickname
    });
  });

  socket.on('deny-guest', ({ guestId, roomCode }) => {
    // Verify requester is host or tier1
    const room = roomData[roomCode];
    if (!room) return;
    const requesterRole = room.userRoles?.[socket.id] || (room.hostId === socket.id ? 'host' : 'user');
    if (requesterRole !== 'host' && requesterRole !== 'tier1') return;

    // Only act on sockets that actually sent a knock — prevents arbitrary socket targeting
    if (!pendingKnocks.get(roomCode)?.has(guestId)) return;
    pendingKnocks.get(roomCode).delete(guestId);

    const guestSocket = io.sockets.sockets.get(guestId);
    if (guestSocket) {
      if (roomData[roomCode].lobbyCount > 0) roomData[roomCode].lobbyCount--;
      guestSocket.emit('knock-denied', { reason: 'Entry denied by admin' });
    }

    // Notify all admins to update their pending lists
    io.to(roomCode).emit('guest-denied', { guestId });
  });

  // Enhanced approve-guest to allow tier1 admins
  socket.on('approve-guest', ({ guestId, roomCode }) => {
    const room = roomData[roomCode];
    if (!room) return;
    const requesterRole = room.userRoles?.[socket.id] || (room.hostId === socket.id ? 'host' : 'user');
    if (requesterRole !== 'host' && requesterRole !== 'tier1') return;

    // Only act on sockets that actually sent a knock — prevents arbitrary socket targeting
    if (!pendingKnocks.get(roomCode)?.has(guestId)) return;
    pendingKnocks.get(roomCode).delete(guestId);

    const guestSocket = io.sockets.sockets.get(guestId);
    if (guestSocket) {
      if (room.lobbyCount > 0) room.lobbyCount--;
      guestSocket.emit('knock-approved', { isHost: false });
    }

    // Notify all admins to update their pending lists
    io.to(roomCode).emit('guest-approved', { guestId });
  });

  // Role management - only host can change roles
  socket.on('set-user-role', ({ targetUserId, role, roomCode }) => {
    const room = roomData[roomCode];
    if (!room) return;

    // Only host can change roles
    if (room.hostId !== socket.id) return;

    // Valid roles
    const validRoles = ['tier1', 'tier2', 'user'];
    if (!validRoles.includes(role)) return;

    // Can't change own role
    if (targetUserId === socket.id) return;

    // Target must actually be present in the room — prevents pre-seeding roles for
    // arbitrary socket IDs (including prototype pollution via crafted IDs)
    if (!io.sockets.adapter.rooms.get(roomCode)?.has(targetUserId)) return;

    // Initialize userRoles if needed
    if (!room.userRoles) room.userRoles = {};
    room.userRoles[targetUserId] = role;

    // Notify all users in room about role update
    io.to(roomCode).emit('role-updated', {
      userId: targetUserId,
      role,
      updatedBy: socket.nickname
    });

    // Also send updated users list
    const roomSocket = io.sockets.adapter.rooms.get(roomCode);
    if (roomSocket) {
      const updatedUsers = Array.from(roomSocket).map(socketId => {
        const s = io.sockets.sockets.get(socketId);
        return {
          socketId,
          nickname: s?.nickname || 'Unknown',
          role: room.userRoles?.[socketId] || (room.hostId === socketId ? 'host' : 'user')
        };
      });
      io.to(roomCode).emit('users-updated', { users: updatedUsers });
    }
  });

  // Kick user - host can kick anyone, tier1 can kick tier2 and users
  socket.on('kick-user', async ({ targetUserId, roomCode }) => {
    const room = roomData[roomCode];
    if (!room) return;

    const kickerRole = room.userRoles?.[socket.id] || (room.hostId === socket.id ? 'host' : 'user');
    const targetRole = room.userRoles?.[targetUserId] || (room.hostId === targetUserId ? 'host' : 'user');

    // Permission check
    let canKick = false;
    if (kickerRole === 'host' && targetUserId !== socket.id) {
      canKick = true; // Host can kick anyone except self
    } else if (kickerRole === 'tier1' && (targetRole === 'tier2' || targetRole === 'user')) {
      canKick = true; // Tier1 can kick tier2 and regular users
    }

    if (!canKick) return;

    const targetSocket = io.sockets.sockets.get(targetUserId);
    if (targetSocket) {
      // Notify the kicked user
      targetSocket.emit('kicked', {
        reason: 'You have been removed from this room',
        kickedBy: socket.nickname
      });

      // Force disconnect from room
      targetSocket.leave(roomCode);
      targetSocket.roomCode = null;

      // Remove user from roomManager to properly decrement user count
      await roomManager.leaveRoom(roomCode, targetUserId);

      // Remove from userRoles if exists
      if (room.userRoles?.[targetUserId]) {
        delete room.userRoles[targetUserId];
      }

      // Notify room
      io.to(roomCode).emit('user-kicked', {
        userId: targetUserId,
        nickname: targetSocket.nickname,
        kickedBy: socket.nickname
      });
    }
  });

  // Room Vibe - host, tier1, tier2 can change
  socket.on('update-vibe', ({ vibeId, roomCode }) => {
    const room = roomData[roomCode];
    if (!room) return;

    const userRole = room.userRoles?.[socket.id] || (room.hostId === socket.id ? 'host' : 'user');
    const canChange = userRole === 'host' || userRole === 'tier1' || userRole === 'tier2';
    if (!canChange) return;

    // Valid vibes
    const validVibes = ['default', 'party', 'chill', 'focus', 'campfire', 'ocean', 'forest', 'cafe', 'jazz'];
    if (!validVibes.includes(vibeId)) return;

    // Store vibe on room
    room.vibe = vibeId;

    // Notify all users
    io.to(roomCode).emit('vibe-updated', {
      vibeId,
      updatedBy: socket.nickname
    });
  });

  // Room Topic - host, tier1, tier2 can change
  socket.on('set-room-topic', ({ topic, roomCode }) => {
    const room = roomData[roomCode];
    if (!room) return;

    const userRole = room.userRoles?.[socket.id] || (room.hostId === socket.id ? 'host' : 'user');
    const canChange = userRole === 'host' || userRole === 'tier1' || userRole === 'tier2';
    if (!canChange) return;

    // Sanitize and limit topic length
    const sanitizedTopic = sanitizeInput((topic || '').trim()).substring(0, 100);

    // Store topic on room
    room.topic = sanitizedTopic;

    // Notify all users
    io.to(roomCode).emit('room-topic-updated', {
      topic: sanitizedTopic,
      updatedBy: socket.nickname
    });
  });

  // Timer - host, tier1, tier2
  socket.on('start-timer', ({ duration, roomCode }) => {
    const room = roomData[roomCode];
    if (!room) return;

    const userRole = room.userRoles?.[socket.id] || (room.hostId === socket.id ? 'host' : 'user');
    const canChange = userRole === 'host' || userRole === 'tier1' || userRole === 'tier2';
    if (!canChange) return;

    const durationSec = parseInt(duration);
    if (!durationSec || durationSec <= 0 || durationSec > 86400) return; // cap at 24 hours

    const endTime = Date.now() + (durationSec * 1000);
    room.timer = {
      endTime,
      duration: durationSec,
      isRunning: true
    };

    io.to(roomCode).emit('timer-started', {
      endTime,
      duration: durationSec,
      startedBy: socket.nickname
    });
  });

  socket.on('stop-timer', ({ roomCode }) => {
    const room = roomData[roomCode];
    if (!room) return;

    const userRole = room.userRoles?.[socket.id] || (room.hostId === socket.id ? 'host' : 'user');
    const canChange = userRole === 'host' || userRole === 'tier1' || userRole === 'tier2';
    if (!canChange) return;

    room.timer = null;
    io.to(roomCode).emit('timer-stopped', { stoppedBy: socket.nickname });
  });

  socket.on('join-room', async (data, callback) => {
    try {
      const { roomCode, nickname, password, inviteToken, capToken, sessionToken, userId, hp_email, hp_website, hp_timestamp, totpCode } = data;

      // Brute-force lockout check
      const joinLockStatus = securityManager.isLocked(socket.id);
      if (joinLockStatus.locked) {
        return callback({ success: false, error: 'Too many failed attempts — try again later' });
      }

      // Honeypot validation - bots fill these hidden fields, humans don't
      if (hp_email || hp_website) {
        logger.warn('Honeypot triggered on join - bot detected', { hp_email: !!hp_email, hp_website: !!hp_website });
        // Return success to not alert the bot, but don't actually join
        return callback({ success: false, error: 'Room not found' });
      }

      // Timestamp validation - form should take at least 1 second to fill
      if (hp_timestamp) {
        const formTime = Date.now() - parseInt(hp_timestamp, 10);
        if (formTime < 1000) {
          logger.warn('Form submitted too quickly on join - likely bot', { formTime });
          return callback({ success: false, error: 'Room not found' });
        }
      }

      // 1. Session Resumption Path (Mobile-friendly: check grace period for disconnected sessions)
      if (sessionToken) {
        const session = securityManager.validateSession(sessionToken);

        // Check if this is a reconnection within grace period
        const gracePeriodSession = securityManager.checkGracePeriod(sessionToken);

        if (session && session.roomCode === roomCode) {
          // Re-bind session to new socket
          securityManager.resumeSession(sessionToken, socket.id);

          // Cancel any pending deferred removal for this session
          const deferred = deferredRemovals.get(sessionToken);
          const oldSocketId = deferred?.socketId;
          if (deferred) {
            clearTimeout(deferred.timeoutId);
            deferredRemovals.delete(sessionToken);
            logger.info(`✅ Cancelled deferred removal for session ${sessionToken.substring(0, 8)}…`);
          }

          // ── Evict old stale socket to prevent duplicate nicknames ──
          // The old socket may still be in the adapter room if disconnect processing raced
          // with this reconnect. Force-remove it and notify other clients.
          if (oldSocketId && oldSocketId !== socket.id) {
            const oldSocket = io.sockets.sockets.get(oldSocketId);
            if (oldSocket) {
              oldSocket.leave(roomCode);
              oldSocket.roomCode = null;
              oldSocket.nickname = null;
            }
            // Remove old socket from media watchers to prevent ghost watcher count
            if (io._mediaWatchers?.[roomCode]) {
              io._mediaWatchers[roomCode].delete(oldSocketId);
              if (io._mediaWatchers[roomCode].size === 0) delete io._mediaWatchers[roomCode];
            }
            // Notify other clients so they remove the ghost entry from their user list
            io.to(roomCode).emit('user-left', {
              nickname: nickname || session.nickname,
              socketId: oldSocketId
            });
            logger.info(`🧹 Evicted old socket ${oldSocketId} for reconnecting user`);
          }

          // Also scan for ANY other deferred removals that match the same userId
          // (handles edge case of multiple rapid reconnects)
          for (const [token, def] of deferredRemovals.entries()) {
            if (token !== sessionToken && def.roomCode === roomCode && def.socketId !== socket.id) {
              // Check if this deferred removal belongs to the same user
              const defSession = securityManager.validateSession(token);
              if (defSession && defSession.userId && defSession.userId === (session.userId || socket.id)) {
                clearTimeout(def.timeoutId);
                const staleId = def.socketId;
                const staleSocket = io.sockets.sockets.get(staleId);
                if (staleSocket) {
                  staleSocket.leave(roomCode);
                  staleSocket.roomCode = null;
                }
                // Remove stale socket from media watchers
                if (io._mediaWatchers?.[roomCode]) {
                  io._mediaWatchers[roomCode].delete(staleId);
                  if (io._mediaWatchers[roomCode].size === 0) delete io._mediaWatchers[roomCode];
                }
                io.to(roomCode).emit('user-left', { nickname: nickname || session.nickname, socketId: staleId });
                deferredRemovals.delete(token);
                logger.info(`🧹 Evicted additional stale socket ${staleId} for same user`);
              }
            }
          }

          // Clear from disconnected sessions tracking (successful reconnect)
          securityManager.clearDisconnectedSession(sessionToken);

          socket.join(roomCode);
          ensureRoomChaff(roomCode); // Start traffic-analysis-resistant chaff
          socket.roomCode = roomCode;
          socket.nickname = nickname || session.nickname || generateRandomNickname();
          // Use server-authoritative userId from the session — never trust the client-supplied
          // userId field for role transfers, as it could be another user's ID.
          socket.persistentUserId = session.userId || socket.id;

          const room = await roomManager.getRoom(roomCode);
          if (room) {
            // ── Deduplicate: remove any stale entries for same user before re-adding ──
            const reconnectNickname = socket.nickname;
            const reconnectUserId = session.userId || socket.id;
            const beforeCount = room.users.length;

            // ── Ensure roomData exists for this room ──
            if (!roomData[roomCode]) {
              roomData[roomCode] = {
                hostId: socket.id, // Assume they are host if they are re-creating the metadata
                lobbyLimit: 100,
                lobbyCount: 0,
                userRoles: {},
                vibe: room.vibe || 'default',
                topic: room.topic || '',
                timer: room.timer || null
              };
              logger.info(`🏗️ Re-initialized roomData for ${roomCode} during Session Resumption`);
            }

            // Transfer roles from stale records to the new socket ID in roomData
            const staleUsers = room.users.filter(u =>
              u.socketId !== socket.id &&
              (u.nickname === reconnectNickname || u.id === reconnectUserId)
            );

            if (staleUsers.length > 0) {
              staleUsers.forEach(stale => {
                // Transfer host status
                if (roomData[roomCode].hostId === stale.socketId) {
                  roomData[roomCode].hostId = socket.id;
                  logger.info(`👑 Transferred host status from ${stale.socketId} to ${socket.id} for ${reconnectNickname}`);
                }
                // Transfer other roles (admin, mod, tier1, tier2, etc.)
                if (roomData[roomCode].userRoles && roomData[roomCode].userRoles[stale.socketId]) {
                  roomData[roomCode].userRoles[socket.id] = roomData[roomCode].userRoles[stale.socketId];
                  delete roomData[roomCode].userRoles[stale.socketId];
                  logger.info(`🛡️ Transferred role ${roomData[roomCode].userRoles[socket.id]} to ${socket.id} for ${reconnectNickname}`);
                }

                // Cancel pending deferred removals to prevent delayed role stripping
                for (const [token, def] of deferredRemovals.entries()) {
                  if (def.socketId === stale.socketId) {
                    clearTimeout(def.timeoutId);
                    deferredRemovals.delete(token);
                    logger.info(`✅ Cancelled deferred removal for stale socket ${stale.socketId} during Session Resumption`);
                  }
                }
              });
            }

            room.users = room.users.filter(u =>
              u.socketId === socket.id || // keep the current socket entry if it exists
              (u.nickname !== reconnectNickname && u.id !== reconnectUserId) // keep unrelated users
            );
            if (room.users.length !== beforeCount) {
              logger.info(`🧹 Removed ${beforeCount - room.users.length} stale user entry(ies) for ${reconnectNickname} during session resumption`);
            }

            // Re-add user to room if not already present
            const existingUser = room.users.find(u => u.socketId === socket.id);
            if (!existingUser) {
              room.users.push({
                id: reconnectUserId,
                socketId: socket.id,
                nickname: reconnectNickname,
                joinedAt: new Date().toISOString()
              });
            }
            await roomManager.saveRoom(roomCode, room);

            // Automatically make them host if they are the ONLY person in the room now
            if (room.users.length === 1) {
              roomData[roomCode].hostId = socket.id;
              if (!roomData[roomCode].userRoles) roomData[roomCode].userRoles = {};
              roomData[roomCode].userRoles[socket.id] = 'host';
              logger.info(`👑 Assigned host status to ${socket.id} (${reconnectNickname}) because they are the only user in the room (Session Resume)`);
            }

            // Re-sync game player socketIds for this reconnecting user (chess, TTT, RPS)
            try {
              if (room.messages) {
                let gamesUpdated = false;
                const reconnId = userId || socket.id;
                for (const msg of room.messages) {
                  if (msg.messageType !== 'game' || !msg.gameData) continue;
                  const gd = msg.gameData;

                  // Chess re-sync
                  if (gd.gameType === 'chess' && !gd.winner) {
                    if (gd.players.white && (gd.players.white.id === reconnId || gd.players.white.name === socket.nickname)) {
                      gd.players.white.socketId = socket.id;
                      gd.players.white.name = socket.nickname;
                      if (gd.players.white.id !== reconnId && reconnId) gd.players.white.id = reconnId;
                      gamesUpdated = true;
                    }
                    if (gd.players.black && (gd.players.black.id === reconnId || gd.players.black.name === socket.nickname)) {
                      gd.players.black.socketId = socket.id;
                      gd.players.black.name = socket.nickname;
                      if (gd.players.black.id !== reconnId && reconnId) gd.players.black.id = reconnId;
                      gamesUpdated = true;
                    }
                    if (msg.sender && msg.sender.nickname === socket.nickname && msg.sender.id !== reconnId && reconnId) {
                      msg.sender.id = reconnId;
                      msg.sender.socketId = socket.id;
                      gamesUpdated = true;
                    }
                  }

                  // Tic-Tac-Toe re-sync
                  if (gd.gameType === 'tic-tac-toe' && !gd.winner) {
                    if (gd.players.X && (gd.players.X.id === reconnId || gd.players.X.id === socket.id || gd.players.X.name === socket.nickname)) {
                      gd.players.X.socketId = socket.id;
                      gd.players.X.id = reconnId;
                      gamesUpdated = true;
                    }
                    if (gd.players.O && gd.players.O.id && (gd.players.O.id === reconnId || gd.players.O.id === socket.id || gd.players.O.name === socket.nickname)) {
                      gd.players.O.socketId = socket.id;
                      gd.players.O.id = reconnId;
                      gamesUpdated = true;
                    }
                  }

                  // RPS re-sync
                  if (gd.gameType === 'rock-paper-scissors' && !gd.winner) {
                    if (gd.players.P1 && (gd.players.P1.id === reconnId || gd.players.P1.id === socket.id || gd.players.P1.name === socket.nickname)) {
                      gd.players.P1.socketId = socket.id;
                      gd.players.P1.id = reconnId;
                      gamesUpdated = true;
                    }
                    if (gd.players.P2 && gd.players.P2.id && (gd.players.P2.id === reconnId || gd.players.P2.id === socket.id || gd.players.P2.name === socket.nickname)) {
                      gd.players.P2.socketId = socket.id;
                      gd.players.P2.id = reconnId;
                      gamesUpdated = true;
                    }
                  }

                  // Also fix sender.id for any game message by this user
                  if (msg.sender && msg.sender.nickname === socket.nickname && msg.sender.id !== reconnId && reconnId) {
                    msg.sender.id = reconnId;
                    msg.sender.socketId = socket.id;
                    gamesUpdated = true;
                  }
                }
                if (gamesUpdated) {
                  await roomManager.saveRoom(roomCode, room);
                  for (const msg of room.messages) {
                    if (msg.messageType === 'game' && msg.gameData && !msg.gameData.winner) {
                      io.to(roomCode).emit('message-updated', msg);
                    }
                  }
                }
              }
            } catch (syncErr) {
              logger.error('Error re-syncing games on session resume:', syncErr);
            }

            const timeoutMs = await roomManager.getRoomTimeout(roomCode);
            securityManager.registerUserActivity(socket.id, userId || socket.id, roomCode, handleInactivityTimeout, timeoutMs);

            const messages = await roomManager.getMessages(roomCode, socket.id, socket.persistentUserId);
            const enrichedUsers = getEnrichedUsers(roomCode);

            logger.info(`📱 User ${socket.nickname} reconnected to room ${roomCode} (session resumed)`);

            // Notify others that user is back
            socket.to(roomCode).emit('user-joined', {
              user: {
                socketId: socket.id,
                id: userId || socket.id,
                nickname: socket.nickname,
                role: roomData[roomCode]?.userRoles?.[socket.id] || (roomData[roomCode]?.hostId === socket.id ? 'host' : 'user')
              },
              roomUsers: enrichedUsers,
              isReconnect: true
            });

            return callback({
              success: true,
              room: { ...room, ...roomData[roomCode] },
              users: enrichedUsers,
              messages,
              nickname: socket.nickname,
              sessionToken,
              activeMedia: getActiveMediaArray(roomCode)
            });
          }
        } else if (gracePeriodSession && gracePeriodSession.roomCode === roomCode) {
          // Session expired but within grace period - allow seamless reconnection
          logger.info(`📱 Grace period reconnection for user in room ${roomCode}`);

          // Create a new session for this reconnection
          const newSessionToken = securityManager.createSession(socket.id, userId || socket.id, roomCode);
          securityManager.clearDisconnectedSession(sessionToken);

          // Continue with standard join but skip knock/approval for returning users
          // (Fall through to standard join path but the user should be allowed back)
        }
      }

      // 2. Standard Join Path
      if (!roomCode || !isValidRoomCode(roomCode)) {
        logger.error(`Invalid room code format: ${roomCode}`);
        return callback({ success: false, error: 'Invalid room code format' });
      }

      // TOTP verification for rooms that require it
      // Hydrate TOTP secret from persisted room if roomData lost it (e.g., after restart)
      let joinRoomData = roomData[roomCode];
      if (!joinRoomData?.totpSecret) {
        const persistedJoinRoom = await roomManager.getRoom(roomCode);
        if (persistedJoinRoom?.settings?.totpSecret) {
          if (!joinRoomData) {
            roomData[roomCode] = { hostId: null, lobbyLimit: 100, lobbyCount: 0, userRoles: {} };
            joinRoomData = roomData[roomCode];
          }
          joinRoomData.totpSecret = persistedJoinRoom.settings.totpSecret;
        }
      }
      if (joinRoomData?.totpSecret) {
        if (!totpCode) {
          return callback({ success: false, error: 'This room requires a TOTP verification code', requiresTotp: true });
        }
        const isValidTotp = authUtils.verifyTOTP(String(totpCode), joinRoomData.totpSecret);
        if (!isValidTotp) {
          securityManager.recordFailedAttempt(socket.id);
          return callback({ success: false, error: 'Invalid TOTP code — check your authenticator app' });
        }
      }

      // Validate and sanitize nickname
      let userNickname = nickname && isValidNickname(nickname)
        ? sanitizeInput(nickname)
        : generateRandomNickname();

      // logger.info(`User ${userNickname} (${socket.id}) attempting to join room ${roomCode} with token:`, inviteToken || 'none');

      // First, validate the invite token if provided (don't consume it yet)
      if (inviteToken) {
        // logger.info(`Validating invite token for room ${roomCode}`);
        const tokenValidation = await roomManager.validateInviteToken(inviteToken, roomCode, false);

        if (!tokenValidation.valid) {
          logger.error('Invalid or expired invite token:', tokenValidation.error);
          return callback({
            success: false,
            error: tokenValidation.error || 'Invalid or expired invite token'
          });
        }

        // logger.info(`Token validation successful for room ${roomCode}`);
      }

      // Clean stale user entries (sockets that no longer exist) before joining
      // This prevents "username taken" errors when a user reconnects with the same name
      const roomObj = await roomManager.getRoom(roomCode);
      if (roomObj && roomObj.users) {
        // Find stale sockets (disconnected)
        const staleUsers = roomObj.users.filter(u => !io.sockets.sockets.has(u.socketId));

        if (staleUsers.length > 0) {
          // If any of the stale sockets map to the connecting user (same nickname or ID), transfer roles
          const reconnectNickname = userNickname;
          const reconnectUserId = userId || socket.id;

          const myStaleUsers = staleUsers.filter(u => u.nickname === reconnectNickname || u.id === reconnectUserId);
          if (myStaleUsers.length > 0 && roomData[roomCode]) {
            myStaleUsers.forEach(stale => {
              if (roomData[roomCode].hostId === stale.socketId) {
                roomData[roomCode].hostId = socket.id;
                logger.info(`👑 Transferred host status from ${stale.socketId} to ${socket.id} for ${reconnectNickname} (Standard Join)`);
              }
              if (roomData[roomCode].userRoles && roomData[roomCode].userRoles[stale.socketId]) {
                roomData[roomCode].userRoles[socket.id] = roomData[roomCode].userRoles[stale.socketId];
                delete roomData[roomCode].userRoles[stale.socketId];
                logger.info(`🛡️ Transferred role ${roomData[roomCode].userRoles[socket.id]} to ${socket.id} for ${reconnectNickname} (Standard Join)`);
              }

              // Cancel pending deferred removals to prevent delayed role stripping
              for (const [token, def] of deferredRemovals.entries()) {
                if (def.socketId === stale.socketId) {
                  clearTimeout(def.timeoutId);
                  deferredRemovals.delete(token);
                  logger.info(`✅ Cancelled deferred removal for stale socket ${stale.socketId} during Standard Join`);
                }
              }
            });
          }

          logger.info(`🧹 Cleaning ${staleUsers.length} stale user(s) from room ${roomCode}: ${staleUsers.map(u => u.nickname).join(', ')}`);
          // Preserve users with pending deferred removals (grace period) unless they're the reconnecting user's stale entries
          const deferredSocketIds = new Set();
          for (const [, def] of deferredRemovals.entries()) {
            if (def.roomCode === roomCode) deferredSocketIds.add(def.socketId);
          }
          roomObj.users = roomObj.users.filter(u => io.sockets.sockets.has(u.socketId) || deferredSocketIds.has(u.socketId));
          await roomManager.saveRoom(roomCode, roomObj);
        }
      }

      // Join the room with the provided credentials
      const result = await roomManager.joinRoom(
        roomCode,
        userId,
        userNickname,
        password || '',
        inviteToken || null,
        socket.id
      );

      if (result.success) {
        // Successful join - clear any failed attempts
        securityManager.clearFailedAttempts(socket.id);

        // logger.info(`User ${userNickname} (${socket.id}) successfully joined room ${roomCode}`);
        socket.join(roomCode);
        ensureRoomChaff(roomCode); // Start traffic-analysis-resistant chaff
        socket.roomCode = roomCode;
        socket.nickname = userNickname;
        socket.persistentUserId = userId || socket.id; // Store persistent ID on socket

        // Re-sync game player socketIds for this returning user (chess, TTT, RPS)
        try {
          const freshRoom = await roomManager.getRoom(roomCode);
          if (freshRoom && freshRoom.messages) {
            let gamesUpdated = false;
            for (const msg of freshRoom.messages) {
              if (msg.messageType !== 'game' || !msg.gameData) continue;
              const gd = msg.gameData;

              // Chess re-sync
              if (gd.gameType === 'chess' && !gd.winner) {
                if (gd.players.white && (gd.players.white.id === userId || gd.players.white.name === userNickname)) {
                  gd.players.white.socketId = socket.id;
                  gd.players.white.name = userNickname;
                  if (gd.players.white.id !== userId && userId) gd.players.white.id = userId;
                  gamesUpdated = true;
                  logger.info(`♟️ Re-synced chess white player socketId for ${userNickname} to ${socket.id}`);
                }
                if (gd.players.black && (gd.players.black.id === userId || gd.players.black.name === userNickname)) {
                  gd.players.black.socketId = socket.id;
                  gd.players.black.name = userNickname;
                  if (gd.players.black.id !== userId && userId) gd.players.black.id = userId;
                  gamesUpdated = true;
                  logger.info(`♟️ Re-synced chess black player socketId for ${userNickname} to ${socket.id}`);
                }
              }

              // Tic-Tac-Toe re-sync
              if (gd.gameType === 'tic-tac-toe' && !gd.winner) {
                if (gd.players.X && (gd.players.X.id === userId || gd.players.X.id === socket.id || gd.players.X.name === userNickname)) {
                  gd.players.X.socketId = socket.id;
                  if (userId) gd.players.X.id = userId;
                  gamesUpdated = true;
                }
                if (gd.players.O && gd.players.O.id && (gd.players.O.id === userId || gd.players.O.id === socket.id || gd.players.O.name === userNickname)) {
                  gd.players.O.socketId = socket.id;
                  if (userId) gd.players.O.id = userId;
                  gamesUpdated = true;
                }
              }

              // RPS re-sync
              if (gd.gameType === 'rock-paper-scissors' && !gd.winner) {
                if (gd.players.P1 && (gd.players.P1.id === userId || gd.players.P1.id === socket.id || gd.players.P1.name === userNickname)) {
                  gd.players.P1.socketId = socket.id;
                  if (userId) gd.players.P1.id = userId;
                  gamesUpdated = true;
                }
                if (gd.players.P2 && gd.players.P2.id && (gd.players.P2.id === userId || gd.players.P2.id === socket.id || gd.players.P2.name === userNickname)) {
                  gd.players.P2.socketId = socket.id;
                  if (userId) gd.players.P2.id = userId;
                  gamesUpdated = true;
                }
              }

              // Fix sender.id for any game message by this user
              if (msg.sender && msg.sender.nickname === userNickname && msg.sender.id !== userId && userId) {
                msg.sender.id = userId;
                msg.sender.socketId = socket.id;
                gamesUpdated = true;
              }
            }
            if (gamesUpdated) {
              await roomManager.saveRoom(roomCode, freshRoom);
              // Broadcast updated games to all room members
              for (const msg of freshRoom.messages) {
                if (msg.messageType === 'game' && msg.gameData && !msg.gameData.winner) {
                  io.to(roomCode).emit('message-updated', msg);
                }
              }
            }
          }
        } catch (syncErr) {
          logger.error('Error re-syncing chess games on join:', syncErr);
        }

        // Register user activity and start inactivity timer
        const timeoutMs = await roomManager.getRoomTimeout(roomCode);

        securityManager.registerUserActivity(socket.id, userId, roomCode, handleInactivityTimeout, timeoutMs);

        // Send room data to user
        // Pass socket.id to filter private messages correctly
        const messages = await roomManager.getMessages(roomCode, socket.id, socket.persistentUserId);

        // Ensure roomData exists and merge metadata
        if (!roomData[roomCode]) {
          // Should exist if roomManager has room, but just in case
          roomData[roomCode] = {
            hostId: result.room.users[0]?.socketId || socket.id,
            lobbyLimit: 100,
            lobbyCount: 0,
            userRoles: {},
            vibe: 'default',
            topic: '',
            timer: null
          };
        }

        // If they are the ONLY person in the room now, automatically grant them host
        if (result.room.users.length === 1 && roomData[roomCode]) {
          roomData[roomCode].hostId = socket.id;
          logger.info(`👑 Assigned host status to ${socket.id} (${userNickname}) because they are the only user in the room (Standard Join)`);
        }

        const extendedRoom = {
          ...result.room,
          hostId: roomData[roomCode].hostId,
          userRoles: roomData[roomCode].userRoles || {},
          vibe: roomData[roomCode].vibe || 'default',
          topic: roomData[roomCode].topic || '',
          timer: roomData[roomCode].timer || null,
          autoApprove: roomData[roomCode].autoApprove || false,
          preApprovedList: roomData[roomCode].preApprovedList || []
        };

        const enrichedUsers = getEnrichedUsers(roomCode);

        // Create a session token for reconnection support
        const sessionToken = securityManager.createSession(socket.id, userId, roomCode);
        // Store nickname in session for resumption
        const session = securityManager.validateSession(sessionToken);
        if (session) session.nickname = userNickname;

        callback({
          success: true,
          room: extendedRoom,
          users: enrichedUsers,
          messages,
          nickname: userNickname,
          isInviteOnly: result.room.settings?.isInviteOnly || false,
          inactivityTimeoutMs: securityManager.INACTIVITY_TIMEOUT_MS,
          sessionToken,
          activeMedia: getActiveMediaArray(roomCode)
        });

        // Notify others
        socket.to(roomCode).emit('user-joined', {
          user: {
            socketId: socket.id,
            id: userId || socket.id,
            nickname: userNickname,
            role: roomData[roomCode].userRoles?.[socket.id] || (roomData[roomCode].hostId === socket.id ? 'host' : 'user')
          },
          roomUsers: enrichedUsers
        });

        // logger.info(`👤 ${userNickname} joined room ${roomCode}`);
      } else if (result.redirectRoomCode) {
        // Handle redirect to a different room based on the token
        // logger.info(`Redirecting user to room ${result.redirectRoomCode}`);
        callback({
          success: false,
          redirect: true,
          roomCode: result.redirectRoomCode,
          requiresPassword: result.requiresPassword,
          error: result.error || 'Redirecting to correct room...'
        });
      } else {
        // Other errors - record failed attempt
        const failedAttempt = securityManager.recordFailedAttempt(socket.id);
        logger.error(`Failed to join room ${roomCode}:`, result.error);

        if (failedAttempt.locked) {
          callback({
            success: false,
            error: `Too many failed attempts. Please try again later.`
          });
        } else {
          callback({
            ...result,
            remainingAttempts: failedAttempt.remainingAttempts
          });
        }
      }
    } catch (error) {
      logger.error('Error joining room:', error);
      callback({ success: false, error: 'Failed to join room' });
    }
  });

  socket.on('send-message', async (data) => {
    try {
      if (!socket.roomCode) return;

      // Update user activity
      securityManager.updateUserActivity(socket.id, (socketId, userId, roomCode) => {
        logger.info(`⏰ User ${userId} timed out, disconnecting...`);
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('inactivity-timeout', {
            message: 'You have been disconnected due to inactivity'
          });
          socket.disconnect(true);
        }
      });

      // Rate limiting
      if (!checkRateLimit(socket.id)) {
        socket.emit('error', { message: 'Rate limit exceeded. Please slow down.' });
        return;
      }

      // Support for text, image, audio, and file messages
      // ─── v2 ratchet fields (PQXDH + Double Ratchet encrypted payloads) ───
      // ─── v3 MLS fields (RFC 9420 MLS group encryption) ───
      // ─── v4 AES-GCM fields (room-key symmetric encryption) ───
      // ─── v5 PQXDH + Double Ratchet / Megolm-style group encryption ───
      let { content, messageType = 'text', isViewOnce = false, imageData, pollData, recipients = [], replyTo, isEncrypted, iv, fileName, mimeType, fileSize, isAnonymous, overrideTtl,
        v: payloadVersion, header: ratchetHeader, ciphertext: ratchetCiphertext, ratchet: isRatchet, mls: mlsCiphertext,
        ct: aesCiphertext, dr: drPayload, sk: skPayload } = data;

      // ─── v5 normalization: map DR ciphertext or sender-key ct → content ──────
      const isV5 = payloadVersion === 5 && (drPayload || skPayload);
      if (isV5) {
        // Server never decrypts — just needs a non-empty content to pass validation
        if (!content) content = drPayload?.ciphertext || skPayload?.ct || '';
        if (messageType === 'image' && !imageData) imageData = content;
      }

      // ─── v4 normalization: map AES-GCM ciphertext → content ─────────────────
      const isV4 = payloadVersion === 4 && aesCiphertext;
      if (isV4) {
        // v4 AES-GCM messages carry their encrypted data in `ct`, not `content`.
        if (!content) content = aesCiphertext;
        if (messageType === 'image' && !imageData) imageData = aesCiphertext;
      }

      // ─── v3 normalization: map v3 MLS ciphertext → content so server pipeline works ─
      const isV3 = payloadVersion === 3 && mlsCiphertext;
      if (isV3) {
        // v3 MLS messages carry their encrypted data in `mls`, not `content`.
        // Map it so the rest of the handler (messageContent, message object) works.
        if (!content) content = mlsCiphertext;
        if (messageType === 'image' && !imageData) imageData = mlsCiphertext;
      }

      // ─── v2 normalization: map v2 ciphertext → content so server pipeline works ─
      const isV2 = payloadVersion === 2 && isRatchet;
      if (isV2) {
        // v2 messages carry their encrypted data in `ciphertext`, not `content`.
        // Map it so the rest of the handler (messageContent, message object) works.
        if (!content) content = ratchetCiphertext;
        if (messageType === 'image' && !imageData) imageData = ratchetCiphertext;
      }

      // Normalize content/imageData: If it's an image and content is provided but imageData isn't, use content for imageData
      if (messageType === 'image' && !imageData && content) {
        imageData = content;
      }

      // For text messages, validate content
      if (messageType === 'text') {
        if (!content || typeof content !== 'string' || content.trim().length === 0) {
          return;
        }
      }

      // For image messages, validate imageData
      if (messageType === 'image') {
        if (!imageData || typeof imageData !== 'string') {
          socket.emit('error', { message: 'Invalid image data' });
          return;
        }
        if (!isEncrypted && !imageData.startsWith('data:image/')) {
          socket.emit('error', { message: 'Invalid image data' });
          return;
        }
        // Check image size (max 5MB) — applies to all images, encrypted or not
        const base64Size = imageData.length * 0.75; // Approximate size in bytes
        if (base64Size > 5 * 1024 * 1024) {
          socket.emit('error', { message: 'Image too large. Maximum size is 5MB.' });
          return;
        }
      }

      // For audio messages, validate content (only if not encrypted)
      if (messageType === 'audio') {
        if (!isEncrypted) {
          // Relaxed validation to allow raw base64 strings (without data URI prefix)
          if (!content || typeof content !== 'string') {
            socket.emit('error', { message: 'Invalid audio data' });
            return;
          }
          // Check audio size (max 5MB)
          const base64Size = content.length * 0.75; // Approximate size in bytes
          if (base64Size > 5 * 1024 * 1024) {
            socket.emit('error', { message: 'Audio too large. Maximum size is 5MB.' });
            return;
          }
        }
      }

      // For file messages
      if (messageType === 'file') {
        const base64Size = content ? content.length * 0.75 : 0;
        if (base64Size > 10 * 1024 * 1024) {
          socket.emit('error', { message: 'File too large. Maximum size is 10MB.' });
          return;
        }
        if (!fileName) {
          socket.emit('error', { message: 'Invalid file data' });
          return;
        }
      }

      let messageContent;
      if (messageType === 'image') {
        messageContent = imageData;
      } else if (messageType === 'audio' && !isEncrypted) {
        try {
          // Convert audio to AAC (only if not encrypted)
          messageContent = await convertAudioToAAC(content);
        } catch (error) {
          logger.error('Audio conversion failed:', error);
          socket.emit('error', { message: 'Failed to process audio message' });
          return;
        }
      } else if (messageType === 'audio' && isEncrypted) {
        messageContent = content; // Keep encrypted string as is
      } else if (messageType === 'poll' && (isV2 || isV3 || isV4)) {
        // v2/v3/v4-encrypted poll: server cannot inspect poll structure.
        // The decrypted JSON is reconstructed by the receiving client.
        messageContent = content; // encrypted ciphertext string
      } else if (messageType === 'poll') {
        if (!pollData || !pollData.question || !Array.isArray(pollData.options)) {
          socket.emit('error', { message: 'Invalid poll data' });
          return;
        }
        // Sanitize poll data
        const sanitizedQuestion = sanitizeInput(pollData.question.trim());
        const sanitizedOptions = pollData.options
          .map(opt => {
            if (typeof opt === 'string') return { text: opt.trim(), followUps: [] };
            if (opt && typeof opt === 'object' && typeof opt.text === 'string') {
              return { text: opt.text.trim(), followUps: Array.isArray(opt.followUps) ? opt.followUps.filter(f => typeof f === 'string' && f.trim()) : [] };
            }
            return null;
          })
          .filter(opt => opt && opt.text.length > 0)
          .slice(0, 5) // Max 5 options
          .map((opt, idx) => {
            const followUpOpts = opt.followUps.map(f => sanitizeInput(f)).filter(Boolean);
            const subPoll = followUpOpts.length > 0 ? {
              question: `Follow-up choice`,
              allowMultiple: false,
              options: followUpOpts.slice(0, 5).map((fu, fIdx) => ({
                id: `sub_${Date.now()}_${idx}_${fIdx}`,
                text: fu,
                votes: []
              }))
            } : undefined;

            return {
              id: `opt_${Date.now()}_${idx}`,
              text: sanitizeInput(opt.text),
              subPoll,
              votes: []
            };
          });

        if (!sanitizedQuestion || sanitizedOptions.length < 2) {
          socket.emit('error', { message: 'Poll must have a question and at least 2 options' });
          return;
        }

        messageContent = sanitizedQuestion;
        data.pollData = {
          question: sanitizedQuestion,
          options: sanitizedOptions,
          allowMultiple: !!pollData.allowMultiple,
          allowCustomAnswers: !!pollData.allowCustomAnswers
        };
      } else if (messageType === 'game' && (isV2 || isV3 || isV4)) {
        // v2/v3/v4-encrypted game: server cannot inspect game structure.
        // The decrypted JSON is reconstructed by the receiving client.
        messageContent = content; // encrypted ciphertext string
      } else if (messageType === 'game') {
        const { gameData } = data;
        if (!gameData || !gameData.gameType) {
          socket.emit('error', { message: 'Invalid game data' });
          return;
        }

        // TTT, RPS, and Chess only allow 1 recipient in targeted messages
        if (recipients && recipients.length > 1 && (gameData.gameType === 'tic-tac-toe' || gameData.gameType === 'rock-paper-scissors' || gameData.gameType === 'chess')) {
          socket.emit('error', { message: 'Match games can only be sent to one person at a time.' });
          return;
        }
        if (gameData.gameType === 'would-you-rather') {
          if (!gameData.optionA || !gameData.optionB) {
            socket.emit('error', { message: 'Game requires two options' });
            return;
          }
          data.gameData = {
            gameType: gameData.gameType,
            optionA: sanitizeInput(gameData.optionA),
            optionB: sanitizeInput(gameData.optionB),
            answers: {}
          };
        } else if (gameData.gameType === 'trivia') {
          if (!gameData.question || !Array.isArray(gameData.options) || gameData.answer === undefined) {
            socket.emit('error', { message: 'Invalid trivia data' });
            return;
          }
          data.gameData = {
            gameType: gameData.gameType,
            question: sanitizeInput(gameData.question),
            options: gameData.options.map(o => sanitizeInput(o)),
            answer: gameData.answer,
            answers: {},
            timer: gameData.timer ? parseInt(gameData.timer, 10) : 15 // Default to 15s if missing
          };
        } else if (gameData.gameType === 'tic-tac-toe') {
          const tttSenderId = socket.persistentUserId || data.userId || socket.id;
          const isCpuMode = gameData.mode === 'cpu';
          data.gameData = {
            gameType: gameData.gameType,
            mode: isCpuMode ? 'cpu' : 'pvp',
            board: Array(9).fill(null),
            players: {
              X: { id: tttSenderId, socketId: socket.id, name: socket.nickname },
              O: isCpuMode
                ? { id: 'cpu-bot', socketId: null, name: 'CPU 🤖' }
                : { id: null, socketId: null, name: null }
            },
            turn: 'X',
            winner: null,
            winningLine: null,
            lastActivity: Date.now()
          };
        } else if (gameData.gameType === 'rock-paper-scissors') {
          const rpsSenderId = socket.persistentUserId || data.userId || socket.id;
          const isCpuMode = gameData.mode === 'cpu';
          data.gameData = {
            gameType: gameData.gameType,
            mode: isCpuMode ? 'cpu' : 'pvp',
            players: {
              P1: { id: rpsSenderId, socketId: socket.id, name: socket.nickname, move: null },
              P2: isCpuMode
                ? { id: 'cpu-bot', socketId: null, name: 'CPU 🤖', move: null }
                : { id: null, socketId: null, name: null, move: null }
            },
            scores: { P1: 0, P2: 0 },
            rounds: [],
            winner: null,
            lastActivity: Date.now()
          };
        } else if (gameData.gameType === 'chess') {
          const senderId = socket.persistentUserId || data.userId || socket.id; // Persistent ID preferred
          const isCpuMode = gameData.mode === 'cpu';
          const isTargeted = recipients && recipients.length === 1;
          let invitedNickname = null;
          if (isTargeted && !isCpuMode) {
            const chessRoom = await roomManager.getRoom(socket.roomCode);
            if (chessRoom && chessRoom.users) {
              const targetUser = chessRoom.users.find(u => u.socketId === recipients[0] || u.id === recipients[0]);
              invitedNickname = targetUser ? targetUser.nickname : null;
            }
          }

          data.gameData = {
            gameType: gameData.gameType,
            mode: isCpuMode ? 'cpu' : 'pvp',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            players: {
              white: { id: senderId, socketId: socket.id, name: socket.nickname },
              black: isCpuMode ? { id: 'cpu-bot', socketId: null, name: 'CPU 🤖' } : null
            },
            invitedNickname, // Store invited name for UI display
            turn: 'w',
            history: [],
            winner: null,
            lastActivity: Date.now()
          };
        } else if (gameData.gameType === 'hangman') {
          const { getHangmanWord } = require('./utils/gameWords');
          const hDiff = ['easy', 'medium', 'hard'].includes(gameData.difficulty) ? gameData.difficulty : 'medium';
          const rawHCustom = (gameData.customWord || '').toUpperCase().replace(/[^A-Z\s]/g, '').trim();
          const hIsCustom = rawHCustom.length >= 2;
          let hEntry;
          if (hIsCustom) {
            hEntry = { word: rawHCustom.replace(/\s+/g, ' '), category: 'Custom', hint: null };
          } else {
            const recentWords = recentHangmanWordsByRoom.get(socket.roomCode) || [];
            let pick = getHangmanWord(hDiff);
            let safety = 0;
            while (recentWords.includes(pick.word) && safety < 8) {
              pick = getHangmanWord(hDiff);
              safety++;
            }
            hEntry = pick;
            const nextRecent = [...recentWords, pick.word].slice(-12);
            recentHangmanWordsByRoom.set(socket.roomCode, nextRecent);
          }
          const hSenderId = socket.persistentUserId || data.userId || socket.id;
          const hIsCpuMode = gameData.mode === 'cpu';
          const hIsTargeted = !hIsCpuMode && !!(recipients && recipients.length === 1);
          const hMode = hIsCpuMode ? 'cpu' : (hIsTargeted ? 'duel' : 'coop');
          const hMaxPlayers = hIsCpuMode ? 2 : (hIsTargeted ? 2 : 8);
          let hInvitedNickname = null, hInvitedUserId = null;
          if (hIsTargeted) {
            const hRoom = await roomManager.getRoom(socket.roomCode);
            if (hRoom?.users) {
              const hTarget = hRoom.users.find(u => u.socketId === recipients[0] || u.id === recipients[0]);
              hInvitedNickname = hTarget?.nickname || null;
              hInvitedUserId = hTarget?.id || recipients[0];
            }
          }
          data.gameData = {
            gameType: 'hangman',
            mode: hMode,
            maxPlayers: hMaxPlayers,
            word: hEntry.word,
            category: hEntry.category,
            hint: hEntry.hint,
            display: hEntry.word.split('').map(() => '_'),
            guessed: {},
            wrongLetters: [],
            mistakes: 0,
            maxMistakes: hDiff === 'easy' ? 8 : hDiff === 'medium' ? 6 : 4,
            timeLimit: hDiff === 'hard' ? 120 : null,
            startedAt: null,
            hintUsed: false,
            difficulty: hDiff,
            currentTurn: 0,
            isCustomWord: hIsCustom,
            // Custom word setter is the host — not a guesser
            players: hIsCustom
              ? (hIsCpuMode ? [{ id: 'cpu-bot', socketId: null, name: 'CPU 🤖' }] : [])
              : [{ id: hSenderId, socketId: socket.id, name: socket.nickname }, ...(hIsCpuMode ? [{ id: 'cpu-bot', socketId: null, name: 'CPU 🤖' }] : [])],
            cpuProfile: hIsCpuMode
              ? {
                missChance: hDiff === 'hard' ? 0.34 : hDiff === 'medium' ? 0.24 : 0.17,
                minDelayMs: hDiff === 'hard' ? 800 : hDiff === 'medium' ? 1000 : 1200,
                maxDelayMs: hDiff === 'hard' ? 1500 : hDiff === 'medium' ? 1900 : 2300,
              }
              : null,
            winner: null,
            gameOver: false,
            isTargeted: hIsTargeted,
            invitedNickname: hInvitedNickname,
            invitedUserId: hInvitedUserId,
            lastActivity: Date.now()
          };
        } else if (gameData.gameType === 'anagram') {
          const { getAnagramWord } = require('./utils/gameWords');
          const aDiff = ['novice', 'adept', 'expert', 'master'].includes(gameData.difficulty) ? gameData.difficulty : 'novice';
          const aRounds = [3, 5, 7].includes(parseInt(gameData.rounds)) ? parseInt(gameData.rounds) : 5;
          const aTimeLimits = { novice: 60, adept: 55, expert: 50, master: 45 };
          const rawACustom = (gameData.customWord || '').toUpperCase().replace(/[^A-Z]/g, '');
          const aIsCustom = rawACustom.length >= 3;
          const aEntry = aIsCustom
            ? { word: rawACustom, letters: rawACustom.split('').sort(() => Math.random() - 0.5) }
            : getAnagramWord(aDiff);
          const aSenderId = socket.persistentUserId || data.userId || socket.id;
          const aIsTargeted = !!(recipients && recipients.length === 1);
          const aMode = aIsTargeted ? 'duel' : 'tournament';
          const aMaxPlayers = aIsTargeted ? 2 : 8;
          let aInvitedNickname = null, aInvitedUserId = null;
          if (aIsTargeted) {
            const aRoom = await roomManager.getRoom(socket.roomCode);
            if (aRoom?.users) {
              const aTarget = aRoom.users.find(u => u.socketId === recipients[0] || u.id === recipients[0]);
              aInvitedNickname = aTarget?.nickname || null;
              aInvitedUserId = aTarget?.id || recipients[0];
            }
          }
          // Targeted 1v1: wait for opponent before starting timer
          const aStartedAt = aIsTargeted ? null : Date.now();
          data.gameData = {
            gameType: 'anagram',
            mode: aMode,
            maxPlayers: aMaxPlayers,
            difficulty: aDiff,
            totalRounds: aRounds,
            currentRound: 1,
            word: aEntry.word,
            letters: aEntry.letters,
            startedAt: aStartedAt,
            timeLimit: aTimeLimits[aDiff] || 60,
            answers: {},
            revealed: false,
            roundHistory: [],
            streaks: {},
            hintUsed: false,
            hintLetter: null,
            isCustomWord: aIsCustom,
            // Custom word setter is the host — watches others scramble, doesn't compete
            scores: aIsCustom ? {} : { [aSenderId]: 0 },
            players: aIsCustom ? [] : [{ id: aSenderId, socketId: socket.id, name: socket.nickname }],
            gameOver: false,
            isTargeted: aIsTargeted,
            invitedNickname: aInvitedNickname,
            invitedUserId: aInvitedUserId,
            lastActivity: Date.now()
          };
        } else if (gameData.gameType === 'typing-race') {
          const { getTypingText } = require('./utils/gameWords');
          const tDiff = ['easy', 'medium', 'hard'].includes(gameData.difficulty) ? gameData.difficulty : 'easy';
          const tDuration = tDiff === 'hard' ? 45 : tDiff === 'medium' ? 60 : 75;
          const rawTCustom = (gameData.customText || '').trim();
          const tIsCustom = rawTCustom.length >= 20;
          const tText = tIsCustom ? rawTCustom.slice(0, 500) : getTypingText(tDiff);
          const tSenderId = socket.persistentUserId || data.userId || socket.id;
          const tIsCpuMode = gameData.mode === 'cpu';
          const tIsTargeted = !tIsCpuMode && !!(recipients && recipients.length === 1);
          const tMode = tIsCpuMode ? 'cpu' : (tIsTargeted ? 'duel' : 'race');
          const tMaxPlayers = tIsTargeted ? 2 : 8;
          let tInvitedNickname = null, tInvitedUserId = null;
          if (tIsTargeted) {
            const tRoom = await roomManager.getRoom(socket.roomCode);
            if (tRoom?.users) {
              const tTarget = tRoom.users.find(u => u.socketId === recipients[0] || u.id === recipients[0]);
              tInvitedNickname = tTarget?.nickname || null;
              tInvitedUserId = tTarget?.id || recipients[0];
            }
          }
          data.gameData = {
            gameType: 'typing-race',
            mode: tMode,
            maxPlayers: tMaxPlayers,
            difficulty: tDiff,
            text: tText,
            duration: tDuration,
            status: 'waiting',
            startedAt: null,
            endsAt: null,
            isCustomText: tIsCustom,
            players: tIsCustom
              ? {}
              : {
                [tSenderId]: { id: tSenderId, socketId: socket.id, name: socket.nickname, progress: 0, wpm: 0, accuracy: 100, errors: 0, finishedAt: null, rank: null },
                ...(tIsCpuMode
                  ? {
                    'cpu-bot': { id: 'cpu-bot', socketId: null, name: 'CPU 🤖', progress: 0, wpm: 0, accuracy: 100, errors: 0, finishedAt: null, rank: null }
                  }
                  : {})
              },
            cpuProfile: tIsCpuMode
              ? {
                // Lightly randomized profile per match for natural-feeling races.
                wpm: Math.round(
                  tDiff === 'hard'
                    ? 70 + Math.random() * 35
                    : tDiff === 'medium'
                      ? 52 + Math.random() * 25
                      : 35 + Math.random() * 20
                ),
                accuracy: Math.round(
                  tDiff === 'hard'
                    ? 89 + Math.random() * 7
                    : tDiff === 'medium'
                      ? 91 + Math.random() * 7
                      : 93 + Math.random() * 6
                ),
                reactionMs: Math.round(500 + Math.random() * 1400),
              }
              : null,
            nextRank: 1,
            winner: null,
            gameOver: false,
            isTargeted: tIsTargeted,
            invitedNickname: tInvitedNickname,
            invitedUserId: tInvitedUserId,
            lastActivity: Date.now()
          };
        } else {
          socket.emit('error', { message: 'Unknown game type' });
          return;
        }
        messageContent = gameData.gameType === 'would-you-rather' ? 'Would You Rather' :
          gameData.gameType === 'trivia' ? 'Trivia' :
            gameData.gameType === 'rock-paper-scissors' ? 'Rock Paper Scissors' :
              gameData.gameType === 'chess' ? 'Chess' :
                gameData.gameType === 'anagram' ? 'Anagram Challenge' :
                  gameData.gameType === 'hangman' ? 'Hangman Together' :
                    gameData.gameType === 'typing-race' ? 'Type Race' : 'Tic-Tac-Toe';
      } else {
        messageContent = isEncrypted ? content : sanitizeInput(content.trim());
      }

      const message = {
        id: `msg_${Date.now()}_${nodeCrypto.randomBytes(9).toString('base64url')}`,
        content: messageContent,
        messageType,
        isViewOnce,
        pollData: messageType === 'poll' ? data.pollData : undefined,
        gameData: messageType === 'game' ? data.gameData : undefined,
        fileName: messageType === 'file' ? fileName : undefined,
        mimeType: messageType === 'file' ? mimeType : undefined,
        fileSize: messageType === 'file' ? fileSize : undefined,
        recipients, // Store recipients
        isEncrypted: !!isEncrypted, // Store encryption flag
        iv: iv || null, // Store IV if encrypted
        // ─── v4 AES-GCM fields (room-key symmetric encryption) ───
        // These MUST be forwarded verbatim so the receiving client can
        // recognise and decrypt v4 AES-GCM payloads. The server NEVER decrypts.
        ...(isV4 ? {
          v: 4,
          ct: aesCiphertext,
          iv: data.iv || null,
        } : {}),
        // ─── v3 MLS fields (RFC 9420 MLS group encryption) ────────
        // These MUST be forwarded verbatim so the receiving client can
        // recognize and decrypt v3 MLS payloads.  The server NEVER decrypts.
        ...(isV3 ? {
          v: 3,
          mls: mlsCiphertext,
        } : {}),
        // ─── v2 ratchet fields (Double Ratchet + PQXDH) ────────
        // These MUST be forwarded verbatim so the receiving client can
        // recognize and decrypt v2 payloads.  The server NEVER decrypts.
        ...(isV2 ? {
          v: 2,
          header: ratchetHeader,
          ciphertext: ratchetCiphertext,
          ratchet: true,
        } : {}),
        replyTo: replyTo || null, // Store reply text/preview
        reactions: {}, // Initialize reactions
        hasBeenViewed: false,
        isAnonymous: !!isAnonymous, // Anonymous confession flag
        overrideTtl: overrideTtl || null,
        sender: isAnonymous ? {
          socketId: `anon_${Date.now()}`,
          nickname: 'Anonymous \uD83D\uDC7B',
          id: `anon_${Date.now()}`
        } : {
          socketId: socket.id,
          nickname: socket.nickname,
          id: socket.persistentUserId || socket.id
        },
        timestamp: new Date().toISOString()
      };

      // DEBUG: Log message details
      if (messageType === 'image') {
        // logger.info(`📷 Image message created - ID: ${message.id}, content length: ${message.content?.length}`);
      }

      // Initialize viewedBy array for read receipts
      message.viewedBy = [];
      if (isViewOnce) {
        // Keep explicit flag if needed logic depends on it, but viewedBy is now universal
      }

      await roomManager.addMessage(socket.roomCode, message);

      if (messageType === 'game' && message.gameData?.gameType === 'hangman' && message.gameData?.mode === 'cpu') {
        const profile = message.gameData.cpuProfile || {};
        const minDelay = Number(profile.minDelayMs) || 1000;
        const maxDelay = Number(profile.maxDelayMs) || 1800;
        scheduleHangmanCpuGuess(message.id, minDelay, maxDelay);
      }

      // Update user activity on any message sent
      securityManager.updateUserActivity(socket.id, handleInactivityTimeout);

      // Broadcast logic
      if (recipients && recipients.length > 0) {
        // Chess and TypingRace games should always be broadcast to the whole room (anyone can spectate)
        const isSpecialGame = message.messageType === 'game' && ['chess', 'typing-race'].includes(message.gameData?.gameType);
        if (isSpecialGame) {
          io.to(socket.roomCode).emit('new-message', message);
        } else {
          // Targeted delivery for non-chess messages
          // 1. Send to sender (so they see their own message)
          socket.emit('new-message', message);

          // 2. Send to each recipient
          recipients.forEach(recipientId => {
            io.to(recipientId).emit('new-message', message);
          });
        }

      } else {
        // Broadcast to all users in room (default)
        io.to(socket.roomCode).emit('new-message', message);
      }

      // ─── Link Preview Processing ────────────────────────────
      // For unencrypted text messages, extract URLs and fetch previews.
      // Cached previews are attached immediately; uncached ones are fetched
      // asynchronously and sent via 'link-preview-update' socket event.
      if (messageType === 'text' && !isEncrypted && !isV2 && !isV3 && !isV4 && content) {
        try {
          const cachedPreviews = await linkPreviewService.processMessage({
            content: message.content,
            messageId: message.id,
            roomCode: socket.roomCode,
            socketId: socket.id,
          });
          // If we got cached previews instantly, emit them right away
          if (cachedPreviews.length > 0) {
            io.to(socket.roomCode).emit('link-preview-update', {
              messageId: message.id,
              previews: cachedPreviews,
            });
          }
        } catch (err) {
          logger.warn(`[LinkPreview] Failed to process message: ${err.message}`);
        }
      }

    } catch (error) {
      logger.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Reaction
  socket.on('add-reaction', async ({ messageId, emoji }) => {
    if (!socket.roomCode || !messageId || !emoji) return;

    // Call roomManager
    const updatedMessage = await roomManager.addReaction(socket.roomCode, messageId, emoji, socket.id);

    if (updatedMessage) {
      // Broadcast update
      io.to(socket.roomCode).emit('message-updated', updatedMessage);
    }
  });



  // Edit Message
  // ─── v2-aware: accepts both legacy { newContent } and v2 { v, header, ciphertext, ratchet } ─
  socket.on('edit-message', async (data) => {
    const {
      messageId,
      newContent,
      v: editV,
      header: editHeader,
      ciphertext: editCiphertext,
      ratchet: editRatchet,
      isEncrypted: editEncrypted,
      iv: editIv,
      ct: editCt,
      mls: editMls
    } = data || {};

    const isV4Edit = editV === 4 && editCt;
    const isV3Edit = editV === 3 && editMls;
    const isV2Edit = editV === 2 && editRatchet;

    let effectiveContent;
    if (isV4Edit) effectiveContent = editCt;
    else if (isV3Edit) effectiveContent = editMls;
    else if (isV2Edit) effectiveContent = editCiphertext;
    else effectiveContent = newContent;

    if (!socket.roomCode || !messageId || !effectiveContent) return;

    // Call roomManager
    const updatedMessage = await roomManager.editMessage(socket.roomCode, messageId, data, socket.id);

    if (updatedMessage) {
      // Re-attach encryption metadata before broadcast
      if (isV4Edit) {
        updatedMessage.v = 4;
        updatedMessage.ct = editCt;
        updatedMessage.iv = editIv;
        updatedMessage.isEncrypted = true;
      } else if (isV3Edit) {
        updatedMessage.v = 3;
        updatedMessage.mls = editMls;
        updatedMessage.isEncrypted = true;
      } else if (isV2Edit) {
        updatedMessage.v = 2;
        updatedMessage.header = editHeader;
        updatedMessage.ciphertext = editCiphertext;
        updatedMessage.iv = editIv;
        updatedMessage.ratchet = true;
        updatedMessage.isEncrypted = true;
      }

      // Broadcast update
      io.to(socket.roomCode).emit('message-updated', updatedMessage);
    }
  });

  // Delete Message – handled in comprehensive delete-message handler below

  // Pulse
  socket.on('send-pulse', async ({ roomCode }) => {
    // Rate limit pulse
    if (!checkRateLimit(socket.id)) {
      return socket.emit('error', { message: 'Pulse rate limit exceeded' });
    }

    if (roomCode && socket.roomCode === roomCode) {
      socket.to(roomCode).emit('pulse-received', { from: socket.nickname });

    }
  });

  // Panic Burn (Delete all messages in room)
  socket.on('panic-burn', async () => {
    if (!socket.roomCode) return;
    try {
      // Only host, tier1, or tier2 can panic-burn (clear all messages)
      const rd = roomData[socket.roomCode];
      const requesterRole = rd?.userRoles?.[socket.id] || (rd?.hostId === socket.id ? 'host' : 'user');
      if (!['host', 'tier1', 'tier2'].includes(requesterRole)) {
        socket.emit('error-message', 'Only elevated roles can clear all messages');
        return;
      }
      await roomManager.clearMessages(socket.roomCode);
      io.to(socket.roomCode).emit('messages-cleared');
    } catch (err) {
      logger.error('Error in panic-burn:', err);
    }
  });

  // Zoom-style Room Reaction
  socket.on('send-room-reaction', ({ emoji }) => {
    if (!socket.roomCode) return;

    // Validate emoji: non-empty string, capped at 64 bytes
    if (typeof emoji !== 'string' || emoji.length === 0 || Buffer.byteLength(emoji, 'utf8') > 64) return;

    // Rate limit reactions to prevent spam (slightly higher limit than messages)
    if (!checkRateLimit(socket.id, 50, 60000)) return;

    // Broadcast to everyone else in the room
    socket.to(socket.roomCode).emit('room-reaction', {
      emoji,
      userId: socket.id
    });
  });

  // ─── Watch Party: Synced Media Player ────────────────────────────
  // Track media watchers per room (stored in-memory; rooms are ephemeral)
  if (!io._mediaWatchers) io._mediaWatchers = {};  // { roomCode: Set<socketId> }
  // Persist MULTIPLE active media items per room so reconnecting users get them back
  // Changed from single-object to Map: { roomCode: Map<mediaId, mediaEntry> }
  if (!io._activeMedia) io._activeMedia = {};
  // Track playback state per media item per room
  // { roomCode: Map<mediaId, { isPlaying, currentTime, updatedAt }> }
  if (!io._mediaPlaybackState) io._mediaPlaybackState = {};

  // Max concurrent media items per room (prevents memory abuse)
  const MAX_MEDIA_PER_ROOM = 10;

  // Allowed media types whitelist
  const ALLOWED_MEDIA_TYPES = ['youtube', 'soundcloud', 'figma', 'gdrive', 'docs'];
  // Allowed sync actions whitelist
  const ALLOWED_SYNC_ACTIONS = ['play', 'pause', 'seek'];
  // URL validation: must be a real YouTube, SoundCloud, Figma, or GDrive URL
  const SAFE_YT_URL = /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//;
  const SAFE_SC_URL = /^https?:\/\/(www\.)?soundcloud\.com\//;
  const SAFE_FIGMA_URL = /^https?:\/\/(www\.)?figma\.com\//;
  const SAFE_GDRIVE_URL = /^https?:\/\/(www\.|docs\.|drive\.)?google\.com\//;

  // Helper: generate a short unique mediaId (8 hex chars)
  const genMediaId = () => nodeCrypto.randomBytes(6).toString('hex');

  // Helper: ensure the room's media map exists
  const ensureMediaMap = (roomCode) => {
    if (!io._activeMedia[roomCode]) io._activeMedia[roomCode] = new Map();
    if (!io._mediaPlaybackState[roomCode]) io._mediaPlaybackState[roomCode] = new Map();
  };

  // Helper: get serialisable array of all active media for a room (for room-joined payload)
  const getActiveMediaArray = (roomCode) => {
    const map = io._activeMedia[roomCode];
    if (!map || map.size === 0) return [];
    return Array.from(map.entries()).map(([mediaId, entry]) => ({ mediaId, ...entry }));
  };

  socket.on('media-share', (data) => {
    if (!socket.roomCode) return;
    if (!checkRateLimit(socket.id, 10, 60000)) return;

    ensureMediaMap(socket.roomCode);
    const mediaMap = io._activeMedia[socket.roomCode];

    // Enforce per-room cap
    if (mediaMap.size >= MAX_MEDIA_PER_ROOM) {
      // Remove oldest entry to make room
      const oldestId = mediaMap.keys().next().value;
      mediaMap.delete(oldestId);
      io._mediaPlaybackState[socket.roomCode].delete(oldestId);
    }

    // Helper: extract cleartext media hint for rejoin (type, id, url, sharedBy)
    const extractMediaHint = (payload) => {
      if (payload._mediaHint && typeof payload._mediaHint === 'object') {
        const h = payload._mediaHint;
        const type = typeof h.type === 'string' ? h.type.toLowerCase().trim() : '';
        if (['youtube', 'soundcloud', 'figma', 'gdrive', 'docs'].indexOf(type) === -1) return null;
        const url = typeof h.url === 'string' ? h.url.trim() : '';
        if (!url || url.length > 2048) return null;
        if (type === 'youtube' && !SAFE_YT_URL.test(url)) return null;
        if (type === 'soundcloud' && !SAFE_SC_URL.test(url)) return null;
        if (type === 'figma' && !SAFE_FIGMA_URL.test(url)) return null;
        if ((type === 'gdrive' || type === 'docs') && !SAFE_GDRIVE_URL.test(url)) return null;
        const id = typeof h.id === 'string' ? h.id.trim() : null;
        if (type === 'youtube' && (!id || !/^[a-zA-Z0-9_-]{11}$/.test(id))) return null;
        const sharedBy = typeof h.sharedBy === 'string' ? h.sharedBy.substring(0, 30) : 'Someone';
        return { type, id, url, sharedBy };
      }
      return null;
    };

    // ── Encrypted v4 AES-GCM payload: relay opaquely (E2E encrypted) ──
    if (data && data.v === 4 && data.ct) {
      if (typeof data.ct !== 'string' || data.ct.length > 131072) return;
      if (typeof data.iv !== 'string' || data.iv.length > 256) return;
      const mediaId = typeof data._mediaId === 'string' ? data._mediaId.slice(0, 20) : genMediaId();
      const outData = { ...data, mediaId };
      io.to(socket.roomCode).emit('media-share', outData);
      const hint = extractMediaHint(data);
      if (hint) {
        mediaMap.set(mediaId, { ...hint, sharedAt: Date.now() });
        io._mediaPlaybackState[socket.roomCode].set(mediaId, { isPlaying: false, currentTime: 0, updatedAt: Date.now() });
      } else {
        mediaMap.set(mediaId, { v: 4, ct: data.ct, iv: data.iv, isEncrypted: true, sharedAt: Date.now() });
      }
      logger.info(`AES-GCM encrypted media shared in room ${socket.roomCode} (id=${mediaId})`);
      return;
    }

    // ── Encrypted v3 MLS payload: relay opaquely (E2E encrypted by MLS) ──
    if (data && data.v === 3 && data.mls) {
      if (typeof data.mls !== 'string' || data.mls.length > 131072) return;
      const mediaId = typeof data._mediaId === 'string' ? data._mediaId.slice(0, 20) : genMediaId();
      const outData = { ...data, mediaId };
      io.to(socket.roomCode).emit('media-share', outData);
      const hint = extractMediaHint(data);
      if (hint) {
        mediaMap.set(mediaId, { ...hint, sharedAt: Date.now() });
        io._mediaPlaybackState[socket.roomCode].set(mediaId, { isPlaying: false, currentTime: 0, updatedAt: Date.now() });
      } else {
        mediaMap.set(mediaId, { v: 3, mls: data.mls, sharedAt: Date.now() });
      }
      logger.info(`MLS-encrypted media shared in room ${socket.roomCode} (id=${mediaId})`);
      return;
    }

    // ── Encrypted v2 payload: relay opaquely (E2E encrypted by Double Ratchet) ──
    if (data && data.v === 2 && data.ratchet === true && data.ciphertext) {
      if (typeof data.ciphertext !== 'string' || data.ciphertext.length > 131072) return;
      if (typeof data.iv !== 'string' || data.iv.length > 256) return;
      if (data.header && typeof data.header !== 'object') return;
      const mediaId = typeof data._mediaId === 'string' ? data._mediaId.slice(0, 20) : genMediaId();
      const outData = { ...data, mediaId };
      io.to(socket.roomCode).emit('media-share', outData);
      mediaMap.set(mediaId, { v: 2, ratchet: true, ciphertext: data.ciphertext, iv: data.iv, header: data.header, sharedAt: Date.now() });
      logger.info(`Encrypted media shared in room ${socket.roomCode} (id=${mediaId})`);
      return;
    }

    // ── Cleartext fallback: full input validation (backward compat) ──
    const type = typeof data.type === 'string' ? data.type.toLowerCase().trim() : '';
    if (!ALLOWED_MEDIA_TYPES.includes(type)) return;

    const rawUrl = typeof data.url === 'string' ? data.url.trim() : '';
    if (!rawUrl || rawUrl.length > 2048) return;

    if (type === 'youtube' && !SAFE_YT_URL.test(rawUrl)) return;
    if (type === 'soundcloud' && !SAFE_SC_URL.test(rawUrl)) return;

    const rawId = typeof data.id === 'string' ? data.id.trim() : null;
    if (type === 'youtube') {
      if (!rawId || !/^[a-zA-Z0-9_-]{11}$/.test(rawId)) return;
    }

    const sharedBy = sanitizeInput(socket.nickname || 'Someone').substring(0, 30);
    const mediaId = typeof data.mediaId === 'string' ? data.mediaId.slice(0, 20) : genMediaId();

    const payload = { type, id: rawId, url: rawUrl, sharedBy, mediaId };

    // Broadcast to entire room (including sender so UI updates)
    io.to(socket.roomCode).emit('media-share', payload);
    // Persist this media item in the room's media map
    mediaMap.set(mediaId, { type, id: rawId, url: rawUrl, sharedBy, sharedAt: Date.now() });
    // Initialise playback state for this item
    io._mediaPlaybackState[socket.roomCode].set(mediaId, { isPlaying: false, currentTime: 0, updatedAt: Date.now() });
    logger.info(`Media shared in room ${socket.roomCode}: ${type} by ${sharedBy} (id=${mediaId})`);
  });

  socket.on('media-sync', (data) => {
    if (!socket.roomCode) return;
    if (!checkRateLimit(socket.id, 40, 60000)) return;

    const mediaId = typeof data?.mediaId === 'string' ? data.mediaId.slice(0, 20) : null;

    // ── Encrypted v4 AES-GCM payload: relay opaquely ──
    if (data && data.v === 4 && data.ct) {
      if (typeof data.ct !== 'string' || data.ct.length > 65536) return;
      if (typeof data.iv !== 'string' || data.iv.length > 256) return;
      socket.to(socket.roomCode).emit('media-sync', data);
      if (mediaId && typeof data._hint === 'object' && data._hint && io._mediaPlaybackState[socket.roomCode]) {
        io._mediaPlaybackState[socket.roomCode].set(mediaId, {
          isPlaying: data._hint.action === 'play',
          currentTime: typeof data._hint.currentTime === 'number' ? data._hint.currentTime : 0,
          updatedAt: Date.now()
        });
      }
      return;
    }

    // ── Encrypted v3 MLS payload: relay opaquely ──
    if (data && data.v === 3 && data.mls) {
      if (typeof data.mls !== 'string' || data.mls.length > 65536) return;
      socket.to(socket.roomCode).emit('media-sync', data);
      return;
    }

    // ── Encrypted v2 payload: relay opaquely ──
    if (data && data.v === 2 && data.ratchet === true && data.ciphertext) {
      if (typeof data.ciphertext !== 'string' || data.ciphertext.length > 65536) return;
      if (typeof data.iv !== 'string' || data.iv.length > 256) return;
      if (data.header && typeof data.header !== 'object') return;
      socket.to(socket.roomCode).emit('media-sync', data);
      return;
    }

    // ── Cleartext fallback: full input validation ──
    const action = typeof data.action === 'string' ? data.action.toLowerCase().trim() : '';
    if (!ALLOWED_SYNC_ACTIONS.includes(action)) return;

    const currentTime = typeof data.currentTime === 'number'
      ? Math.max(0, Math.min(data.currentTime, 86400))
      : 0;

    // Track playback state per media item
    if (mediaId && io._mediaPlaybackState[socket.roomCode]) {
      io._mediaPlaybackState[socket.roomCode].set(mediaId, {
        isPlaying: action === 'play',
        currentTime,
        updatedAt: Date.now()
      });
    }

    socket.to(socket.roomCode).emit('media-sync', { action, currentTime, mediaId, userId: socket.id });
  });

  // ─── Media Request Sync: rejoining user asks for current playback state ──
  socket.on('media-request-sync', (data) => {
    if (!socket.roomCode) return;
    if (!checkRateLimit(socket.id, 5, 60000)) return;

    const requestedId = typeof data?.mediaId === 'string' ? data.mediaId.slice(0, 20) : null;
    const playbackMap = io._mediaPlaybackState[socket.roomCode];
    if (!playbackMap) return;

    const respond = (mediaId, playbackState) => {
      let estimatedTime = playbackState.currentTime;
      if (playbackState.isPlaying && playbackState.updatedAt) {
        estimatedTime += (Date.now() - playbackState.updatedAt) / 1000;
      }
      socket.emit('media-sync-restore', {
        mediaId,
        isPlaying: playbackState.isPlaying,
        currentTime: Math.max(0, estimatedTime)
      });
    };

    if (requestedId) {
      const state = playbackMap.get(requestedId);
      if (state) respond(requestedId, state);
    } else {
      // No specific mediaId — restore all active media states
      for (const [mediaId, state] of playbackMap) {
        respond(mediaId, state);
      }
    }
  });

  // ─── Media Recover: peer-to-peer URL recovery for rejoin ────────────
  socket.on('media-recover-request', (data) => {
    if (!socket.roomCode) return;
    if (!checkRateLimit(socket.id, 3, 60000)) return;

    const watchers = io._mediaWatchers[socket.roomCode];
    if (!watchers || watchers.size === 0) return;

    let asked = 0;
    for (const wid of watchers) {
      if (wid !== socket.id) {
        io.to(wid).emit('media-recover-request', { requesterId: socket.id, mediaId: data?.mediaId || null });
        asked++;
      }
    }
    if (asked > 0) {
      logger.info(`Media recovery requested in room ${socket.roomCode} — asked ${asked} watchers for ${socket.id}`);
    }
  });

  socket.on('media-recover-response', (data) => {
    if (!socket.roomCode) return;
    if (!checkRateLimit(socket.id, 5, 60000)) return;
    if (!data || typeof data.requesterId !== 'string') return;

    const type = typeof data.type === 'string' ? data.type.toLowerCase().trim() : '';
    if (type !== 'youtube' && type !== 'soundcloud') return;
    const rawUrl = typeof data.url === 'string' ? data.url.trim() : '';
    if (!rawUrl || rawUrl.length > 2048) return;
    if (type === 'youtube' && !SAFE_YT_URL.test(rawUrl)) return;
    if (type === 'soundcloud' && !SAFE_SC_URL.test(rawUrl)) return;
    const rawId = typeof data.id === 'string' ? data.id.trim() : null;
    if (type === 'youtube' && (!rawId || !/^[a-zA-Z0-9_-]{11}$/.test(rawId))) return;
    const sharedBy = typeof data.sharedBy === 'string' ? data.sharedBy.substring(0, 30) : 'Someone';
    const mediaId = typeof data.mediaId === 'string' ? data.mediaId.slice(0, 20) : genMediaId();

    const payload = { type, id: rawId, url: rawUrl, sharedBy, mediaId };

    io.to(data.requesterId).emit('media-share', payload);

    // Update server's media map so future rejoins work directly
    if (io._activeMedia[socket.roomCode]) {
      io._activeMedia[socket.roomCode].set(mediaId, { ...payload, sharedAt: Date.now() });
    }
    logger.info(`Media recovered in room ${socket.roomCode} — ${socket.id} sent ${mediaId} to ${data.requesterId}`);
  });

  socket.on('media-join', () => {
    if (!socket.roomCode) return;
    if (!checkRateLimit(socket.id, 10, 60000)) return;
    if (!io._mediaWatchers[socket.roomCode]) io._mediaWatchers[socket.roomCode] = new Set();
    io._mediaWatchers[socket.roomCode].add(socket.id);
    io.to(socket.roomCode).emit('media-sync-count', { count: io._mediaWatchers[socket.roomCode].size });
  });

  socket.on('media-leave', () => {
    if (!socket.roomCode) return;
    if (!checkRateLimit(socket.id, 10, 60000)) return;
    if (io._mediaWatchers[socket.roomCode]) {
      io._mediaWatchers[socket.roomCode].delete(socket.id);
      const count = io._mediaWatchers[socket.roomCode].size;
      if (count === 0) delete io._mediaWatchers[socket.roomCode];
      else io.to(socket.roomCode).emit('media-sync-count', { count });
    }
  });

  socket.on('media-close', (data) => {
    if (!socket.roomCode) return;
    if (!checkRateLimit(socket.id, 5, 60000)) return;

    // Only host or elevated roles can close media for the room
    const room = roomData[socket.roomCode];
    if (room) {
      const userRole = room.userRoles?.[socket.id] || (room.hostId === socket.id ? 'host' : 'user');
      if (userRole !== 'host' && userRole !== 'tier1' && userRole !== 'tier2') {
        return;
      }
    }

    const mediaId = typeof data?.mediaId === 'string' ? data.mediaId.slice(0, 20) : null;

    if (mediaId) {
      // Close a specific media item
      socket.to(socket.roomCode).emit('media-close', { mediaId });
      if (io._activeMedia[socket.roomCode]) io._activeMedia[socket.roomCode].delete(mediaId);
      if (io._mediaPlaybackState[socket.roomCode]) io._mediaPlaybackState[socket.roomCode].delete(mediaId);
      // Clean up empty maps
      if (io._activeMedia[socket.roomCode]?.size === 0) delete io._activeMedia[socket.roomCode];
      if (io._mediaPlaybackState[socket.roomCode]?.size === 0) delete io._mediaPlaybackState[socket.roomCode];
    } else {
      // Close ALL media in the room (full clear)
      socket.to(socket.roomCode).emit('media-close', {});
      delete io._mediaWatchers[socket.roomCode];
      delete io._activeMedia[socket.roomCode];
      delete io._mediaPlaybackState[socket.roomCode];
    }
  });

  // ─── Now Playing Status ─────────────────────────────────────────
  socket.on('now-playing-update', (data) => {
    if (!socket.roomCode) return;
    // Rate limit: now-playing updates are infrequent (every 4s at most from polling)
    if (!checkRateLimit(socket.id, 20, 60000)) return;

    // ── Encrypted v2 payload: relay opaquely ──
    if (data && data.v === 2 && data.ratchet === true && data.ciphertext) {
      if (typeof data.ciphertext !== 'string' || data.ciphertext.length > 65536) return;
      if (typeof data.iv !== 'string' || data.iv.length > 256) return;
      if (data.header && typeof data.header !== 'object') return;
      socket.to(socket.roomCode).emit('now-playing-update', {
        ...data,
        userId: socket.id,
        nickname: socket.nickname,
      });
      return;
    }

    // ── Cleartext fallback: full input validation ──
    let nowPlaying = null;
    if (data.nowPlaying && typeof data.nowPlaying === 'object') {
      const title = typeof data.nowPlaying.title === 'string'
        ? sanitizeInput(data.nowPlaying.title).substring(0, 120)
        : '';
      const artist = typeof data.nowPlaying.artist === 'string'
        ? sanitizeInput(data.nowPlaying.artist).substring(0, 80)
        : '';
      const source = typeof data.nowPlaying.source === 'string'
        ? sanitizeInput(data.nowPlaying.source).substring(0, 30)
        : '';

      // Only broadcast if there's actually a title
      if (title.length > 0) {
        nowPlaying = { title, artist, source };
      }
    }

    // Broadcast this user's now-playing status to the room
    socket.to(socket.roomCode).emit('now-playing-update', {
      userId: socket.id,
      nickname: socket.nickname,
      nowPlaying,
    });
  });

  // Health Check
  socket.on('latency-ping', (startTime) => {
    socket.emit('latency-pong', startTime);
  });

  // Typing indicators
  socket.on('typing', ({ roomCode }) => {
    if (socket.roomCode === roomCode) {
      socket.to(roomCode).emit('user-typing', { userId: socket.id, nickname: socket.nickname });
    }
  });

  socket.on('stop-typing', ({ roomCode }) => {
    if (socket.roomCode === roomCode) {
      socket.to(roomCode).emit('user-stop-typing', { userId: socket.id });
    }
  });

  // Client heartbeat to keep the inactivity timer alive for passive users (spectators, readers)
  socket.on('user-activity', () => {
    if (!socket.roomCode) return;
    securityManager.updateUserActivity(socket.id, handleInactivityTimeout);
  });

  // Handle message viewed events (for view-once images)
  socket.on('message-viewed', async ({ messageId }) => {
    try {
      if (!socket.roomCode) return;

      // Mark message as viewed in room manager with room context for better performance/Redis support
      await roomManager.markMessageViewed(messageId, socket.id, socket.roomCode);

    } catch (error) {
      logger.error('Error marking message as viewed:', error);
    }
  });

  // Handle poll voting
  socket.on('vote-poll', async ({ messageId, optionId }) => {
    try {
      if (!socket.roomCode || !messageId || !optionId) return;

      // Use persistent identity so reconnecting users can't double-vote
      const voterId = socket.persistentUserId || socket.id;
      const updatedMessage = await roomManager.votePoll(socket.roomCode, messageId, optionId, voterId, socket.nickname);
      if (updatedMessage) {
        io.to(socket.roomCode).emit('message-updated', updatedMessage);

      }
    } catch (error) {
      logger.error('Error voting on poll:', error);
    }
  });

  // Handle poll custom answer ("Other" / open-ended)
  socket.on('poll-custom-answer', async ({ messageId, customText }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      if (typeof customText !== 'string' || !customText.trim()) return;
      if (!checkRateLimit(socket.id, 10, 60000)) return;

      const voterId = socket.persistentUserId || socket.id;
      const sanitized = sanitizeInput(customText.trim()).substring(0, 100);
      if (!sanitized) return;

      const updatedMessage = await roomManager.addPollCustomOption(
        socket.roomCode, messageId, sanitized, voterId, socket.nickname
      );
      if (updatedMessage) {
        io.to(socket.roomCode).emit('message-updated', updatedMessage);
      }
    } catch (error) {
      logger.error('Error adding custom poll answer:', error);
    }
  });

  // Handle sub-poll creation (follow-up poll under a poll option)
  socket.on('create-sub-poll', async ({ messageId, optionId, subPollData }) => {
    try {
      if (!socket.roomCode || !messageId || !optionId) return;
      if (!subPollData || !subPollData.question || !Array.isArray(subPollData.options)) return;
      if (!checkRateLimit(socket.id, 5, 60000)) return;

      const updatedMessage = await roomManager.createSubPoll(
        socket.roomCode, messageId, optionId, subPollData
      );
      if (updatedMessage) {
        io.to(socket.roomCode).emit('message-updated', updatedMessage);
      }
    } catch (error) {
      logger.error('Error creating sub-poll:', error);
    }
  });

  // Handle sub-poll voting
  socket.on('vote-sub-poll', async ({ messageId, optionId, subOptionId }) => {
    try {
      if (!socket.roomCode || !messageId || !optionId || !subOptionId) return;

      const voterId = socket.persistentUserId || socket.id;
      const updatedMessage = await roomManager.voteSubPoll(
        socket.roomCode, messageId, optionId, subOptionId, voterId, socket.nickname
      );
      if (updatedMessage) {
        io.to(socket.roomCode).emit('message-updated', updatedMessage);
      }
    } catch (error) {
      logger.error('Error voting on sub-poll:', error);
    }
  });

  // Handle game answer (Would You Rather, Truth or Dare, etc.)
  socket.on('game-answer', async ({ messageId, answer }) => {
    try {
      if (!socket.roomCode || !messageId || answer === undefined) return;

      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;

      const messages = room.messages || [];
      const message = messages.find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || !message.gameData) return;

      // Use persistent identity so reconnecting users can't double-answer
      const answererId = socket.persistentUserId || socket.id;

      // Prevent double-answering
      if (!message.gameData.answers) message.gameData.answers = {};
      if (message.gameData.answers[answererId] !== undefined) return;

      // Store the answer keyed by persistent ID
      message.gameData.answers[answererId] = answer;

      // Store nickname mapping so the sender can see who answered what
      if (!message.gameData.answerNicknames) message.gameData.answerNicknames = {};
      message.gameData.answerNicknames[answererId] = message.isAnonymous ? 'Anonymous 👻' : (socket.nickname || 'Unknown');

      await roomManager.saveRoom(socket.roomCode, room);

      // Broadcast the updated message with masking
      const usersInRoom = await roomManager.getRoomUsers(socket.roomCode);
      usersInRoom.forEach(u => {
        const masked = roomManager.maskMessageForUser(message, u.socketId, u.id || u.userId);
        io.to(u.socketId).emit('message-updated', masked);
      });
    } catch (error) {
      logger.error('Error handling game answer:', error);
    }
  });

  // Handle Tic-Tac-Toe moves
  socket.on('tic-tac-toe-move', async ({ messageId, action, position }) => {
    try {
      if (!socket.roomCode || !messageId || !action) return;

      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;

      const messages = room.messages || [];
      const message = messages.find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'tic-tac-toe') return;

      const { gameData } = message;
      if (gameData.winner) return; // Game already over

      const playerId = socket.persistentUserId || socket.id;
      const isX = gameData.players.X.id === playerId || gameData.players.X.id === socket.id || gameData.players.X.name === socket.nickname;
      const isO = gameData.players.O.id === playerId || gameData.players.O.id === socket.id || gameData.players.O.name === socket.nickname;

      if (action === 'join') {
        if (gameData.mode === 'cpu') return;
        if (!gameData.players.O.id && !isX) {
          // Check if it's a targeted match - check both socket.id and persistentUserId
          const recipients = message.recipients || [];
          if (recipients.length > 0 && !recipients.includes(socket.id) && !recipients.includes(playerId)) {
            socket.emit('error', { message: 'You are not invited to this match.' });
            return;
          }

          gameData.players.O = { id: playerId, socketId: socket.id, name: socket.nickname };
          gameData.lastActivity = Date.now();
          await roomManager.saveRoom(socket.roomCode, room);

          // Broadcast update with masking
          const roomUsers = await roomManager.getRoomUsers(socket.roomCode);
          roomUsers.forEach(user => {
            const maskedMessage = roomManager.maskMessageForUser(message, user.socketId, user.id || user.userId);
            io.to(user.socketId).emit('message-updated', maskedMessage);
          });
        } else if (isX || isO) {
          // Re-sync socketId for reconnecting player
          if (isX) { gameData.players.X.socketId = socket.id; gameData.players.X.id = playerId; }
          if (isO) { gameData.players.O.socketId = socket.id; gameData.players.O.id = playerId; }
          gameData.lastActivity = Date.now();
          await roomManager.saveRoom(socket.roomCode, room);
          io.to(socket.roomCode).emit('message-updated', message);
        }
        return;
      }

      if (action === 'move') {
        if (position === undefined || position < 0 || position > 8) return;
        if (gameData.board[position]) return; // Position already taken

        // Turn check using persistent identity
        const currentTurnPlayer = gameData.players[gameData.turn];
        const isMyTurn = currentTurnPlayer.id === playerId || currentTurnPlayer.id === socket.id || currentTurnPlayer.name === socket.nickname;
        if (!isMyTurn) return; // Not your turn

        // Update board
        gameData.board[position] = gameData.turn;
        gameData.lastActivity = Date.now();

        // Check for winner
        const winLines = [
          [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
          [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
          [0, 4, 8], [2, 4, 6]             // Diagonals
        ];

        const resolveBoardState = () => {
          let winnerFound = false;
          for (const line of winLines) {
            const [a, b, c] = line;
            if (gameData.board[a] && gameData.board[a] === gameData.board[b] && gameData.board[a] === gameData.board[c]) {
              gameData.winner = gameData.board[a];
              gameData.winningLine = line;
              winnerFound = true;
              break;
            }
          }

          if (!winnerFound) {
            if (gameData.board.every(cell => cell !== null)) {
              gameData.winner = 'draw';
            } else {
              gameData.turn = gameData.turn === 'X' ? 'O' : 'X';
            }
          }
        };

        resolveBoardState();

        // CPU turn (O) for single-player mode
        if (!gameData.winner && gameData.mode === 'cpu' && gameData.turn === 'O') {
          const openCells = gameData.board
            .map((cell, idx) => (cell === null ? idx : null))
            .filter(idx => idx !== null);
          if (openCells.length > 0) {
            const cpuPos = openCells[Math.floor(Math.random() * openCells.length)];
            gameData.board[cpuPos] = 'O';
            resolveBoardState();
          }
        }

        await roomManager.saveRoom(socket.roomCode, room);
        io.to(socket.roomCode).emit('message-updated', message);
      }
    } catch (error) {
      logger.error('Error handling tic-tac-toe move:', error);
    }
  });

  // Handle Rock Paper Scissors actions (Best of Three)
  socket.on('rps-action', async ({ messageId, action, move }) => {
    try {
      if (!socket.roomCode || !messageId || !action) return;

      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;

      const messages = room.messages || [];
      const message = messages.find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'rock-paper-scissors') return;

      const { gameData } = message;
      if (gameData.winner) return; // Game already over

      const playerId = socket.persistentUserId || socket.id;
      const isP1 = gameData.players.P1.id === playerId || gameData.players.P1.id === socket.id || gameData.players.P1.name === socket.nickname;
      const isP2 = gameData.players.P2.id === playerId || gameData.players.P2.id === socket.id || gameData.players.P2.name === socket.nickname;

      if (action === 'join') {
        if (gameData.mode === 'cpu') return;
        if (!gameData.players.P2.id && !isP1) {
          // Check if it's a targeted match - check both socket.id and persistentUserId
          const recipients = message.recipients || [];
          if (recipients.length > 0 && !recipients.includes(socket.id) && !recipients.includes(playerId)) {
            socket.emit('error', { message: 'You are not invited to this match.' });
            return;
          }

          gameData.players.P2 = { id: playerId, socketId: socket.id, name: socket.nickname, move: null };
          gameData.lastActivity = Date.now();
          await roomManager.saveRoom(socket.roomCode, room);

          // Broadcast update with masking
          const usersInRoom = await roomManager.getRoomUsers(socket.roomCode);
          usersInRoom.forEach(u => {
            const masked = roomManager.maskMessageForUser(message, u.socketId, u.id || u.userId);
            io.to(u.socketId).emit('message-updated', masked);
          });
        } else if (isP1 || isP2) {
          // Re-sync socketId for reconnecting player
          if (isP1) { gameData.players.P1.socketId = socket.id; gameData.players.P1.id = playerId; }
          if (isP2) { gameData.players.P2.socketId = socket.id; gameData.players.P2.id = playerId; }
          gameData.lastActivity = Date.now();
          await roomManager.saveRoom(socket.roomCode, room);

          const usersInRoom = await roomManager.getRoomUsers(socket.roomCode);
          usersInRoom.forEach(u => {
            const masked = roomManager.maskMessageForUser(message, u.socketId, u.id || u.userId);
            io.to(u.socketId).emit('message-updated', masked);
          });
        }
        return;
      }

      if (action === 'move') {
        if (!['rock', 'paper', 'scissors'].includes(move)) return;
        if (!isP1 && !isP2) return; // Must be joined to play

        if (isP1 && !gameData.players.P1.move) {
          gameData.players.P1.move = move;
        } else if (isP2 && !gameData.players.P2.move) {
          gameData.players.P2.move = move;
        } else {
          return; // Move already locked in
        }

        // CPU instantly picks after player move
        if (gameData.mode === 'cpu' && gameData.players.P1.move && !gameData.players.P2.move) {
          const cpuMoves = ['rock', 'paper', 'scissors'];
          gameData.players.P2.move = cpuMoves[Math.floor(Math.random() * cpuMoves.length)];
        }

        // Check if round is over
        if (gameData.players.P1.move && gameData.players.P2.move) {
          const m1 = gameData.players.P1.move;
          const m2 = gameData.players.P2.move;
          let roundResult = 'draw';

          if (m1 !== m2) {
            if (
              (m1 === 'rock' && m2 === 'scissors') ||
              (m1 === 'paper' && m2 === 'rock') ||
              (m1 === 'scissors' && m2 === 'paper')
            ) {
              roundResult = 'P1';
              gameData.scores.P1++;
            } else {
              roundResult = 'P2';
              gameData.scores.P2++;
            }
          }

          // Record round
          gameData.rounds.push({
            P1: m1,
            P2: m2,
            result: roundResult
          });

          // Check for match winner (Best of Three)
          if (gameData.scores.P1 >= 2) {
            gameData.winner = 'P1';
          } else if (gameData.scores.P2 >= 2) {
            gameData.winner = 'P2';
          } else {
            // Match continues, reset moves for next round
            gameData.players.P1.move = null;
            gameData.players.P2.move = null;
          }
        }

        gameData.lastActivity = Date.now();
        await roomManager.saveRoom(socket.roomCode, room);

        // Always broadcast with masking to hide pending moves from spectators and the other player
        const usersInRoom = await roomManager.getRoomUsers(socket.roomCode);
        usersInRoom.forEach(u => {
          const masked = roomManager.maskMessageForUser(message, u.socketId, u.id || u.userId);
          io.to(u.socketId).emit('message-updated', masked);
        });
      }
    } catch (error) {
      logger.error('Error handling RPS action:', error);
    }
  });

  // Handle Chess actions
  socket.on('chess-join', async (data) => {
    try {
      const { messageId, userId } = data;
      if (!socket.roomCode || !messageId) return;

      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;

      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'chess') return;

      const { gameData } = message;
      if (gameData.winner) return;

      const joinerId = userId || socket.persistentUserId || socket.id;
      const isWhite = gameData.players.white?.id === joinerId || gameData.players.white?.name === socket.nickname;

      if (!gameData.players.white?.id) {
        gameData.players.white = { id: joinerId, socketId: socket.id, name: socket.nickname };
      } else if (!gameData.players.black?.id) {
        if (gameData.mode === 'cpu') return;
        if (gameData.players.white?.id === joinerId || gameData.players.white?.name === socket.nickname) return; // Already joined as White

        const isTargeted = message.recipients && message.recipients.length > 0;
        if (isTargeted) {
          // Check if this user was the intended recipient (by socketId, persistentId, or invited nickname)
          const isIntendedRecipient = message.recipients.includes(joinerId) ||
            message.recipients.includes(socket.id) ||
            (gameData.invitedNickname && gameData.invitedNickname === socket.nickname);
          if (!isIntendedRecipient) {
            return;
          }
        }

        gameData.players.black = { id: joinerId, socketId: socket.id, name: socket.nickname };
      } else {
        // Re-sync socketId if existing player joins from new socket
        if (gameData.players.white.id === joinerId || gameData.players.white.name === socket.nickname) {
          gameData.players.white.id = joinerId;
          gameData.players.white.socketId = socket.id;
          gameData.players.white.name = socket.nickname;
        } else if (gameData.players.black.id === joinerId || gameData.players.black.name === socket.nickname) {
          gameData.players.black.id = joinerId;
          gameData.players.black.socketId = socket.id;
          gameData.players.black.name = socket.nickname;
        } else {
          return; // Game full
        }
      }

      gameData.lastActivity = Date.now();
      await roomManager.saveRoom(socket.roomCode, room);
      io.to(socket.roomCode).emit('message-updated', message);
    } catch (error) {
      logger.error('Error handling chess join:', error);
    }
  });

  socket.on('chess-move', async (data) => {
    try {
      const { messageId, move, userId } = data;
      if (!socket.roomCode || !messageId || !move) return;

      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;

      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'chess') return;

      const { gameData } = message;
      if (gameData.winner) return;

      const playerId = socket.persistentUserId || userId || socket.id;
      const isWhite = gameData.players.white?.id === playerId || gameData.players.white?.name === socket.nickname;
      const isBlack = gameData.players.black?.id === playerId || gameData.players.black?.name === socket.nickname;

      if ((gameData.turn === 'w' && !isWhite) || (gameData.turn === 'b' && !isBlack)) {
        return;
      }

      const chess = new Chess(gameData.fen);
      const moveResult = chess.move(move);

      if (moveResult) {
        const applyTerminalState = () => {
          if (chess.isCheckmate() || chess.isDraw()) {
            const winner = chess.isDraw() ? 'draw' : (chess.turn() === 'w' ? 'black' : 'white');
            gameData.winner = winner;
            if (winner !== 'draw') {
              gameData.winnerId = winner === 'white' ? gameData.players.white.id : gameData.players.black.id;
            }
            gameData.endedAt = Date.now();

            // Completed games get 2-min TTL
            message.timestamp = new Date().toISOString();
            message.overrideTtl = 120;
            message.expiresAt = new Date(Date.now() + 120 * 1000).toISOString();
          }
        };

        gameData.history = gameData.history || [];
        gameData.history.push(moveResult.san);
        gameData.fen = chess.fen();
        gameData.turn = chess.turn();
        applyTerminalState();

        // CPU auto-move as Black
        if (!gameData.winner && gameData.mode === 'cpu' && gameData.turn === 'b') {
          const legalMoves = chess.moves();
          if (legalMoves.length > 0) {
            const cpuMove = legalMoves[Math.floor(Math.random() * legalMoves.length)];
            const cpuResult = chess.move(cpuMove);
            if (cpuResult) {
              gameData.history.push(cpuResult.san);
              gameData.fen = chess.fen();
              gameData.turn = chess.turn();
              applyTerminalState();
            }
          }
        }

        gameData.lastActivity = Date.now();

        await roomManager.saveRoom(socket.roomCode, room);
        io.to(socket.roomCode).emit('message-updated', message);
      }
    } catch (error) {
      logger.error('Error handling chess move:', error);
    }
  });

  // Chess Player Management with Approval Flow
  socket.on('chess-swap-request', async ({ messageId }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'chess') return;

      const requesterId = socket.persistentUserId || socket.id;
      const isHost = message.sender.id === requesterId || message.sender.socketId === socket.id || message.sender.nickname === socket.nickname;
      if (!isHost) return;

      const { gameData } = message;
      if (!gameData.players.white || !gameData.players.black) {
        // Can't swap if one side is empty — just do it
        const temp = gameData.players.white;
        gameData.players.white = gameData.players.black;
        gameData.players.black = temp;
        await roomManager.saveRoom(socket.roomCode, room);
        io.to(socket.roomCode).emit('message-updated', message);
        return;
      }

      // Check if both players are online
      const whiteOnline = io.sockets.sockets.has(gameData.players.white.socketId);
      const blackOnline = io.sockets.sockets.has(gameData.players.black.socketId);

      if (!whiteOnline && !blackOnline) {
        // Both offline — host can freely swap
        const temp = gameData.players.white;
        gameData.players.white = gameData.players.black;
        gameData.players.black = temp;
        await roomManager.saveRoom(socket.roomCode, room);
        io.to(socket.roomCode).emit('message-updated', message);
        return;
      }

      // At least one player is online — send approval request to online player(s)
      const pendingKey = `swap_${messageId}`;
      if (!message._pendingSwap) {
        message._pendingSwap = { requestedBy: requesterId, approvals: new Set(), needed: 0 };
      }

      // Send approval request to online players who are not the host
      const onlinePlayers = [];
      if (whiteOnline && gameData.players.white.id !== requesterId) {
        onlinePlayers.push(gameData.players.white);
      }
      if (blackOnline && gameData.players.black.id !== requesterId) {
        onlinePlayers.push(gameData.players.black);
      }

      if (onlinePlayers.length === 0) {
        // Host is the only online player — free swap
        const temp = gameData.players.white;
        gameData.players.white = gameData.players.black;
        gameData.players.black = temp;
        await roomManager.saveRoom(socket.roomCode, room);
        io.to(socket.roomCode).emit('message-updated', message);
        return;
      }

      // Store pending swap info on the message temporarily (in-memory only)
      gameData._pendingSwap = {
        requestedBy: requesterId,
        requesterName: socket.nickname,
        responses: {},
        needed: onlinePlayers.length
      };
      await roomManager.saveRoom(socket.roomCode, room);

      // Notify online players who need to approve
      onlinePlayers.forEach(player => {
        io.to(player.socketId).emit('chess-swap-approval-needed', {
          messageId,
          requestedBy: socket.nickname
        });
      });

      // Also notify host that request was sent
      socket.emit('chess-swap-pending', { messageId, waitingFor: onlinePlayers.map(p => p.name) });
    } catch (err) { logger.error('chess-swap-request err:', err); }
  });

  socket.on('chess-swap-response', async ({ messageId, approved }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'chess') return;

      const { gameData } = message;
      if (!gameData._pendingSwap) return;

      const responderId = socket.persistentUserId || socket.id;
      gameData._pendingSwap.responses[responderId] = approved;

      if (!approved) {
        // Declined — cancel the swap
        const requesterSocketId = gameData.players.white?.id === gameData._pendingSwap.requestedBy
          ? gameData.players.white.socketId
          : (gameData.players.black?.id === gameData._pendingSwap.requestedBy
            ? gameData.players.black.socketId : null);

        // Notify host (the sender of the game message)
        io.to(message.sender.socketId).emit('chess-swap-declined', {
          messageId,
          declinedBy: socket.nickname
        });
        delete gameData._pendingSwap;
        await roomManager.saveRoom(socket.roomCode, room);
        return;
      }

      // Check if all needed approvals are in
      const approvalCount = Object.values(gameData._pendingSwap.responses).filter(v => v === true).length;
      if (approvalCount >= gameData._pendingSwap.needed) {
        // All approved — do the swap
        const temp = gameData.players.white;
        gameData.players.white = gameData.players.black;
        gameData.players.black = temp;
        delete gameData._pendingSwap;
        await roomManager.saveRoom(socket.roomCode, room);
        io.to(socket.roomCode).emit('message-updated', message);
      } else {
        await roomManager.saveRoom(socket.roomCode, room);
      }
    } catch (err) { logger.error('chess-swap-response err:', err); }
  });

  socket.on('chess-replace-request', async ({ messageId, role, targetUserId }) => {
    try {
      if (!socket.roomCode || !messageId || !role || !targetUserId) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'chess') return;

      const requesterId = socket.persistentUserId || socket.id;
      const isHost = message.sender.id === requesterId || message.sender.socketId === socket.id || message.sender.nickname === socket.nickname;
      if (!isHost) return;

      const targetUser = (room.users || []).find(u => u.socketId === targetUserId);
      const targetId = targetUser?.id || targetUser?.userId || targetUserId;
      const targetNick = targetUser?.nickname || 'New Player';

      const { gameData } = message;
      const currentPlayer = gameData.players[role];

      // Check if the player being replaced is currently online
      const isCurrentPlayerOnline = currentPlayer && currentPlayer.socketId && io.sockets.sockets.has(currentPlayer.socketId);

      if (!isCurrentPlayerOnline || !currentPlayer?.id) {
        // Player is offline or slot is empty — free replacement
        gameData.players[role] = { id: targetId, socketId: targetUserId, name: targetNick };
        await roomManager.saveRoom(socket.roomCode, room);
        io.to(socket.roomCode).emit('message-updated', message);
        return;
      }

      // Player is online — require their approval
      gameData._pendingReplace = {
        role,
        newPlayer: { id: targetId, socketId: targetUserId, name: targetNick },
        requestedBy: requesterId,
        requesterName: socket.nickname
      };
      await roomManager.saveRoom(socket.roomCode, room);

      io.to(currentPlayer.socketId).emit('chess-replace-approval-needed', {
        messageId,
        role,
        newPlayerName: targetNick,
        requestedBy: socket.nickname
      });

      socket.emit('chess-replace-pending', {
        messageId,
        role,
        waitingFor: currentPlayer.name
      });
    } catch (err) { logger.error('chess-replace-request err:', err); }
  });

  socket.on('chess-replace-response', async ({ messageId, approved }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'chess') return;

      const { gameData } = message;
      if (!gameData._pendingReplace) return;

      if (approved) {
        const { role, newPlayer } = gameData._pendingReplace;
        gameData.players[role] = newPlayer;
        delete gameData._pendingReplace;
        await roomManager.saveRoom(socket.roomCode, room);
        io.to(socket.roomCode).emit('message-updated', message);
      } else {
        io.to(message.sender.socketId).emit('chess-replace-declined', {
          messageId,
          declinedBy: socket.nickname
        });
        delete gameData._pendingReplace;
        await roomManager.saveRoom(socket.roomCode, room);
      }
    } catch (err) { logger.error('chess-replace-response err:', err); }
  });


  // ─────────────────────────────────────────────────────────
  // HANGMAN HANDLERS
  // ─────────────────────────────────────────────────────────

  const clearHangmanCpuTimer = (messageId) => {
    const existing = hangmanCpuGuessTimers.get(messageId);
    if (existing) {
      clearTimeout(existing);
      hangmanCpuGuessTimers.delete(messageId);
    }
  };

  const scheduleHangmanCpuGuess = (messageId, minDelayMs = 900, maxDelayMs = 1800) => {
    clearHangmanCpuTimer(messageId);
    const floor = Math.max(250, Number(minDelayMs) || 900);
    const ceil = Math.max(floor + 10, Number(maxDelayMs) || 1800);
    const delay = Math.round(floor + Math.random() * (ceil - floor));

    const timer = setTimeout(async () => {
      hangmanCpuGuessTimers.delete(messageId);
      try {
        const room = await roomManager.getRoom(socket.roomCode);
        if (!room) return;
        const message = room.messages.find(m => m.id === messageId);
        if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'hangman') return;

        const gd = message.gameData;
        if (gd.gameOver || gd.mode !== 'cpu') {
          clearHangmanCpuTimer(messageId);
          return;
        }

        if (!gd.startedAt) gd.startedAt = Date.now();

        if (gd.difficulty === 'hard' && gd.timeLimit) {
          const elapsed = Math.floor((Date.now() - gd.startedAt) / 1000);
          if (elapsed >= gd.timeLimit) {
            gd.gameOver = true;
            gd.winner = 'house';
            gd.display = gd.word.split('');
          }
        }

        if (!gd.gameOver) {
          const profile = gd.cpuProfile || {};
          const missChance = Math.max(0, Math.min(0.95, Number(profile.missChance) || 0.25));
          const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

          const unrevealedLetters = [...new Set(
            String(gd.word || '')
              .split('')
              .filter(ch => /^[A-Z]$/.test(ch) && gd.guessed[ch] === undefined && !gd.wrongLetters.includes(ch))
          )];

          const availableWrongLetters = alphabet.filter(
            l => gd.guessed[l] === undefined && !gd.wrongLetters.includes(l) && !String(gd.word || '').includes(l)
          );

          if (unrevealedLetters.length > 0 || availableWrongLetters.length > 0) {
            const pickWrong = availableWrongLetters.length > 0 && (unrevealedLetters.length === 0 || Math.random() < missChance);
            const pool = pickWrong ? availableWrongLetters : unrevealedLetters;
            const pickedLetter = pool[Math.floor(Math.random() * pool.length)];

            if (pickedLetter && String(gd.word || '').includes(pickedLetter)) {
              gd.guessed[pickedLetter] = 'cpu-bot';
              gd.display = String(gd.word || '').split('').map(c => (gd.guessed[c] !== undefined ? c : '_'));
              if (!gd.display.includes('_')) {
                gd.gameOver = true;
                gd.winner = 'team';
              }
            } else if (pickedLetter) {
              gd.wrongLetters.push(pickedLetter);
              gd.mistakes++;
              if (gd.mistakes >= gd.maxMistakes) {
                gd.gameOver = true;
                gd.winner = 'house';
                gd.display = String(gd.word || '').split('');
              }
            }
          }
        }

        if (gd.gameOver && !message.overrideTtl) {
          message.overrideTtl = 120;
          message.expiresAt = new Date(Date.now() + 120 * 1000).toISOString();
        }

        gd.lastActivity = Date.now();
        await roomManager.saveRoom(socket.roomCode, room);
        const roomUsers = room.users || [];
        for (const u of roomUsers) {
          const masked = roomManager.maskMessageForUser(message, u.socketId, u.id || u.userId);
          io.to(u.socketId).emit('message-updated', masked);
        }

        if (!gd.gameOver) {
          const nextMin = Number(gd.cpuProfile?.minDelayMs) || floor;
          const nextMax = Number(gd.cpuProfile?.maxDelayMs) || ceil;
          scheduleHangmanCpuGuess(messageId, nextMin, nextMax);
        } else {
          clearHangmanCpuTimer(messageId);
        }
      } catch (err) {
        logger.error('hangman CPU guess error:', err);
      }
    }, delay);

    hangmanCpuGuessTimers.set(messageId, timer);
  };

  socket.on('hangman-join', async ({ messageId }) => {
    try {
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = room.messages.find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'hangman') return;
      const gd = message.gameData;
      if (gd.mode === 'cpu') return;
      if (gd.gameOver) return;
      const userId = socket.persistentUserId || socket.id;

      // REJOIN: player already in game — update their socketId for reconnect
      const existingIdx = gd.players.findIndex(p => p.id === userId);
      if (existingIdx !== -1) {
        gd.players[existingIdx].socketId = socket.id;
        gd.lastActivity = Date.now();
        await roomManager.saveRoom(socket.roomCode, room);
        const roomUsers = room.users || [];
        for (const u of roomUsers) {
          const masked = roomManager.maskMessageForUser(message, u.socketId, u.id || u.userId);
          io.to(u.socketId).emit('message-updated', masked);
        }
        return;
      }

      // TARGETED: only the invited player may join; cap at 2 players
      if (gd.isTargeted) {
        if (gd.players.length >= 2) return;
        if (gd.invitedUserId && userId !== gd.invitedUserId && socket.id !== gd.invitedUserId) return;
      } else if (gd.maxPlayers && gd.players.length >= gd.maxPlayers) {
        return;
      }

      gd.players.push({ id: userId, socketId: socket.id, name: socket.nickname });
      gd.lastActivity = Date.now();
      await roomManager.saveRoom(socket.roomCode, room);
      const roomUsers = room.users || [];
      for (const u of roomUsers) {
        const masked = roomManager.maskMessageForUser(message, u.socketId, u.id || u.userId);
        io.to(u.socketId).emit('message-updated', masked);
      }
    } catch (err) { logger.error('hangman-join error:', err); }
  });

  socket.on('hangman-guess', async ({ messageId, letter }) => {
    try {
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = room.messages.find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'hangman') return;
      const gd = message.gameData;
  if (gd.mode === 'cpu') clearHangmanCpuTimer(messageId);
      if (gd.gameOver) return;
      const userId = socket.persistentUserId || socket.id;
      if (!gd.players.some(p => p.id === userId || p.socketId === socket.id)) return;
      if (!gd.startedAt) gd.startedAt = Date.now();

      if (gd.difficulty === 'hard' && gd.timeLimit) {
        const elapsed = Math.floor((Date.now() - gd.startedAt) / 1000);
        if (elapsed >= gd.timeLimit) {
          gd.gameOver = true;
          gd.winner = 'house';
          gd.display = gd.word.split('');
        }
      }
      if (gd.gameOver) return;
      // Custom word setter cannot guess (they chose the word — they're the host)
      if (gd.isCustomWord && (message.sender.id === userId || message.sender.socketId === socket.id)) return;
      const L = String(letter).toUpperCase().trim();
      if (!/^[A-Z]$/.test(L)) return;
      if (gd.guessed[L] !== undefined || gd.wrongLetters.includes(L)) return;

      if (gd.word.includes(L)) {
        gd.guessed[L] = userId;
        gd.display = gd.word.split('').map(c => (gd.guessed[c] !== undefined ? c : '_'));
        if (!gd.display.includes('_')) { gd.gameOver = true; gd.winner = 'team'; }
      } else {
        gd.wrongLetters.push(L);
        gd.mistakes++;
        if (gd.mistakes >= gd.maxMistakes) {
          gd.gameOver = true;
          gd.winner = 'house';
          gd.display = gd.word.split(''); // reveal word on loss
        }
      }
      // When game finishes, set TTL countdown
      if (gd.gameOver && !message.overrideTtl) {
        message.overrideTtl = 120; // 2-min TTL for finished Hangman
        message.expiresAt = new Date(Date.now() + 120 * 1000).toISOString();
      }

      if (gd.gameOver) {
        clearHangmanCpuTimer(messageId);
      }

      gd.lastActivity = Date.now();
      await roomManager.saveRoom(socket.roomCode, room);
      const roomUsers = room.users || [];
      for (const u of roomUsers) {
        const masked = roomManager.maskMessageForUser(message, u.socketId, u.id || u.userId);
        io.to(u.socketId).emit('message-updated', masked);
      }

      if (gd.mode === 'cpu' && !gd.gameOver) {
        const minDelay = Number(gd.cpuProfile?.minDelayMs) || 1000;
        const maxDelay = Number(gd.cpuProfile?.maxDelayMs) || 1800;
        scheduleHangmanCpuGuess(messageId, minDelay, maxDelay);
      }
    } catch (err) { logger.error('hangman-guess error:', err); }
  });

  socket.on('hangman-hint', async ({ messageId }) => {
    try {
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = room.messages.find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'hangman') return;
      const gd = message.gameData;
      if (gd.gameOver || gd.hintUsed || !gd.hint) return;

      const userId = socket.persistentUserId || socket.id;
      const isPlayer = gd.players.some(p => p.id === userId || p.socketId === socket.id);
      if (!isPlayer) return;

      gd.hintUsed = true;
      gd.mistakes = Math.min(gd.maxMistakes, (gd.mistakes || 0) + 1);

      if (gd.mistakes >= gd.maxMistakes) {
        gd.gameOver = true;
        gd.winner = 'house';
        gd.display = gd.word.split('');
      }

      if (gd.gameOver && !message.overrideTtl) {
        message.overrideTtl = 120;
        message.expiresAt = new Date(Date.now() + 120 * 1000).toISOString();
      }

      if (gd.gameOver) {
        clearHangmanCpuTimer(messageId);
      }

      gd.lastActivity = Date.now();
      await roomManager.saveRoom(socket.roomCode, room);
      const roomUsers = room.users || [];
      for (const u of roomUsers) {
        const masked = roomManager.maskMessageForUser(message, u.socketId, u.id || u.userId);
        io.to(u.socketId).emit('message-updated', masked);
      }

      if (gd.mode === 'cpu' && !gd.gameOver) {
        const minDelay = Number(gd.cpuProfile?.minDelayMs) || 1000;
        const maxDelay = Number(gd.cpuProfile?.maxDelayMs) || 1800;
        scheduleHangmanCpuGuess(messageId, minDelay, maxDelay);
      }
    } catch (err) { logger.error('hangman-hint error:', err); }
  });

  // ─────────────────────────────────────────────────────────
  // ANAGRAM HANDLERS
  // ─────────────────────────────────────────────────────────

  socket.on('anagram-join', async ({ messageId }) => {
    try {
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = room.messages.find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'anagram') return;
      const gd = message.gameData;
      if (gd.gameOver) return;
      const userId = socket.persistentUserId || socket.id;

      // REJOIN: player already in game — update socketId for reconnect
      const existingIdx = gd.players.findIndex(p => p.id === userId);
      if (existingIdx !== -1) {
        gd.players[existingIdx].socketId = socket.id;
        gd.lastActivity = Date.now();
        await roomManager.saveRoom(socket.roomCode, room);
        const roomUsers = room.users || [];
        for (const u of roomUsers) {
          const masked = roomManager.maskMessageForUser(message, u.socketId, u.id || u.userId);
          io.to(u.socketId).emit('message-updated', masked);
        }
        return;
      }

      // TARGETED: only the invited player may join; cap at 2 players
      if (gd.isTargeted) {
        if (gd.players.length >= 2) return;
        if (gd.invitedUserId && userId !== gd.invitedUserId && socket.id !== gd.invitedUserId) return;
      } else if (gd.maxPlayers && gd.players.length >= gd.maxPlayers) {
        return;
      }

      gd.players.push({ id: userId, socketId: socket.id, name: socket.nickname });
      if (!gd.scores[userId]) gd.scores[userId] = 0;
      // Targeted: start timer when both players are in; broadcast: timer already running
      if (!gd.startedAt) gd.startedAt = Date.now();
      gd.lastActivity = Date.now();
      await roomManager.saveRoom(socket.roomCode, room);

      // Server-side auto-reveal after timeLimit (prevents game hanging if client drops)
      const timeoutKey = `${socket.roomCode}:${messageId}`;
      if (!gameTimeouts.has(timeoutKey)) {
        const tid = setTimeout(async () => {
          gameTimeouts.delete(timeoutKey);
          try {
            const r2 = await roomManager.getRoom(socket.roomCode);
            if (!r2) return;
            const m2 = r2.messages.find(m => m.id === messageId);
            if (!m2 || m2.gameData?.revealed || m2.gameData?.gameOver) return;
            const g2 = m2.gameData;
            g2.revealed = true;
            applyAnagramRoundScores(g2);
            await roomManager.saveRoom(socket.roomCode, r2);
            const ru = r2.users || [];
            for (const u of ru) {
              const masked = roomManager.maskMessageForUser(m2, u.socketId, u.id || u.userId);
              io.to(u.socketId).emit('message-updated', masked);
            }
          } catch (e) { logger.error('anagram auto-reveal error:', e); }
        }, (gd.timeLimit + 2) * 1000); // +2s grace period
        gameTimeouts.set(timeoutKey, tid);
      }

      const roomUsers = room.users || [];
      for (const u of roomUsers) {
        const masked = roomManager.maskMessageForUser(message, u.socketId, u.id || u.userId);
        io.to(u.socketId).emit('message-updated', masked);
      }
    } catch (err) { logger.error('anagram-join error:', err); }
  });

  socket.on('anagram-submit', async ({ messageId, word, powerUps = {} }) => {
    try {
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = room.messages.find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'anagram') return;
      const gd = message.gameData;
      if (gd.gameOver || gd.revealed) return;
      const userId = socket.persistentUserId || socket.id;
      if (gd.answers[userId] !== undefined) return;
      // Custom word setter cannot submit (they set the word)
      if (gd.isCustomWord && (message.sender.id === userId || message.sender.socketId === socket.id)) return;
      if (!gd.players.some(p => p.id === userId || p.socketId === socket.id)) return;

      const cleanWord = String(word || '').toUpperCase().replace(/[^A-Z]/g, '');
      if (!cleanWord) return;
      gd.answers[userId] = {
        word: cleanWord,
        submittedAt: Date.now(),
        doublePoints: !!powerUps.doublePoints,
        speedBoost: !!powerUps.speedBoost,
      };
      gd.lastActivity = Date.now();

      // Auto-reveal when all players have answered
      const allAnswered = gd.players.every(p => gd.answers[p.id] !== undefined);
      if (allAnswered) {
        gd.revealed = true;
        applyAnagramRoundScores(gd);
        const timeoutKey = `${socket.roomCode}:${messageId}`;
        const t = gameTimeouts.get(timeoutKey);
        if (t) { clearTimeout(t); gameTimeouts.delete(timeoutKey); }
      }

      await roomManager.saveRoom(socket.roomCode, room);
      const roomUsers = room.users || [];
      for (const u of roomUsers) {
        const masked = roomManager.maskMessageForUser(message, u.socketId, u.id || u.userId);
        io.to(u.socketId).emit('message-updated', masked);
      }
    } catch (err) { logger.error('anagram-submit error:', err); }
  });

  // Client fires this when the round timer expires client-side
  socket.on('anagram-reveal', async ({ messageId }) => {
    try {
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = room.messages.find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'anagram') return;
      const gd = message.gameData;
      if (gd.revealed || gd.gameOver) return;
      // Only reveal if timer has genuinely elapsed
      const elapsed = (Date.now() - gd.startedAt) / 1000;
      if (elapsed < gd.timeLimit - 1) return;

      // Cancel server-side auto-reveal timeout since we're revealing manually
      const timeoutKey = `${socket.roomCode}:${messageId}`;
      const tid = gameTimeouts.get(timeoutKey);
      if (tid) { clearTimeout(tid); gameTimeouts.delete(timeoutKey); }

      gd.revealed = true;
      applyAnagramRoundScores(gd);
      gd.lastActivity = Date.now();
      await roomManager.saveRoom(socket.roomCode, room);
      const roomUsers = room.users || [];
      for (const u of roomUsers) {
        const masked = roomManager.maskMessageForUser(message, u.socketId, u.id || u.userId);
        io.to(u.socketId).emit('message-updated', masked);
      }
    } catch (err) { logger.error('anagram-reveal error:', err); }
  });

  // Hint: reveals first letter of the word publicly, deducts 5 pts from requester
  socket.on('anagram-hint', async ({ messageId }) => {
    try {
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = room.messages.find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'anagram') return;
      const gd = message.gameData;
      if (gd.revealed || gd.gameOver || gd.hintUsed) return;
      const userId = socket.persistentUserId || socket.id;
      if (!gd.players.some(p => p.id === userId || p.socketId === socket.id)) return;
      gd.hintUsed = true;
      gd.hintLetter = gd.word[0];
      // Cost: -5 pts from requester
      if (!gd.scores[userId]) gd.scores[userId] = 0;
      gd.scores[userId] = Math.max(0, gd.scores[userId] - 5);
      gd.lastActivity = Date.now();
      await roomManager.saveRoom(socket.roomCode, room);
      const roomUsers = room.users || [];
      for (const u of roomUsers) {
        const masked = roomManager.maskMessageForUser(message, u.socketId, u.id || u.userId);
        io.to(u.socketId).emit('message-updated', masked);
      }
    } catch (err) { logger.error('anagram-hint error:', err); }
  });

  socket.on('anagram-next-round', async ({ messageId }) => {
    try {
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = room.messages.find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'anagram') return;
      const gd = message.gameData;
      // Sender OR any active player may advance rounds (handles sender-offline case)
      const advancerId = socket.persistentUserId || socket.id;
      const isSenderAdvancing = message.sender.id === advancerId || message.sender.socketId === socket.id;
      const isPlayerAdvancing = gd.players.some(p => p.id === advancerId || p.socketId === socket.id);
      if (!isSenderAdvancing && !isPlayerAdvancing) return;
      if (!gd.revealed && !gd.gameOver) return;
      if (gd.gameOver) return;

      const { getAnagramWord } = require('./utils/gameWords');
      gd.roundHistory.push({ round: gd.currentRound, word: gd.word, letters: gd.letters, answers: { ...gd.answers } });
      gd.currentRound++;

      // Cancel any pending auto-reveal for the old round
      const timeoutKey = `${socket.roomCode}:${messageId}`;
      const oldTid = gameTimeouts.get(timeoutKey);
      if (oldTid) { clearTimeout(oldTid); gameTimeouts.delete(timeoutKey); }

      if (gd.currentRound > gd.totalRounds) {
        gd.gameOver = true;
      } else {
        // For custom word games, reuse same word each round (that's the point)
        if (!gd.isCustomWord) {
          const next = getAnagramWord(gd.difficulty);
          gd.word = next.word;
          gd.letters = next.letters;
        } else {
          // Re-shuffle the same custom word
          gd.letters = gd.word.split('').sort(() => Math.random() - 0.5);
        }
        gd.answers = {};
        gd.revealed = false;
        gd.hintUsed = false;
        gd.hintLetter = null;
        gd.startedAt = Date.now();

        // Schedule server-side auto-reveal for the new round
        const newTid = setTimeout(async () => {
          gameTimeouts.delete(timeoutKey);
          try {
            const r2 = await roomManager.getRoom(socket.roomCode);
            if (!r2) return;
            const m2 = r2.messages.find(m => m.id === messageId);
            if (!m2 || m2.gameData?.revealed || m2.gameData?.gameOver) return;
            const g2 = m2.gameData;
            g2.revealed = true;
            applyAnagramRoundScores(g2);
            await roomManager.saveRoom(socket.roomCode, r2);
            const ru = r2.users || [];
            for (const u of ru) {
              const masked = roomManager.maskMessageForUser(m2, u.socketId, u.id || u.userId);
              io.to(u.socketId).emit('message-updated', masked);
            }
          } catch (e) { logger.error('anagram auto-reveal (next round) error:', e); }
        }, (gd.timeLimit + 2) * 1000);
        gameTimeouts.set(timeoutKey, newTid);
      }

      // When game finishes, set TTL countdown
      if (gd.gameOver && !message.overrideTtl) {
        message.overrideTtl = 120; // 2-min TTL for finished Anagram
        message.expiresAt = new Date(Date.now() + 120 * 1000).toISOString();
      }

      gd.lastActivity = Date.now();
      await roomManager.saveRoom(socket.roomCode, room);
      const roomUsers = room.users || [];
      for (const u of roomUsers) {
        const masked = roomManager.maskMessageForUser(message, u.socketId, u.id || u.userId);
        io.to(u.socketId).emit('message-updated', masked);
      }
    } catch (err) { logger.error('anagram-next-round error:', err); }
  });

  // ─────────────────────────────────────────────────────────
  // TYPING RACE HANDLERS
  // ─────────────────────────────────────────────────────────

  const finalizeTypingRaceIfNeeded = (message, force = false) => {
    const gd = message?.gameData;
    if (!gd || gd.gameType !== 'typing-race') return false;
    if (gd.status === 'finished' || gd.gameOver) return false;

    const durationSec = Number(gd.duration) || 60;
    const timeExpired = !!gd.startedAt && Date.now() >= (gd.startedAt + (durationSec * 1000));
    if (!force && !timeExpired) return false;

    const players = Object.values(gd.players || {});
    if (players.length === 0) return false;

    const alreadyRanked = players
      .filter(p => Number.isFinite(Number(p.rank)))
      .sort((a, b) => Number(a.rank) - Number(b.rank));
    let rankCursor = alreadyRanked.length + 1;
    gd.nextRank = Math.max(Number(gd.nextRank) || 1, rankCursor);

    const finishedUnranked = players
      .filter(p => p.finishedAt && !p.rank)
      .sort((a, b) => Number(a.finishedAt || 0) - Number(b.finishedAt || 0));
    for (const p of finishedUnranked) {
      p.rank = rankCursor++;
      gd.nextRank = rankCursor;
    }

    const unfinished = players
      .filter(p => !p.finishedAt)
      .sort((a, b) => {
        const progDiff = (Number(b.progress) || 0) - (Number(a.progress) || 0);
        if (progDiff !== 0) return progDiff;
        const wpmDiff = (Number(b.wpm) || 0) - (Number(a.wpm) || 0);
        if (wpmDiff !== 0) return wpmDiff;
        return (Number(b.accuracy) || 0) - (Number(a.accuracy) || 0);
      });

    const finishStamp = Date.now();
    for (const p of unfinished) {
      p.finishedAt = finishStamp;
      p.rank = rankCursor++;
      gd.nextRank = rankCursor;
    }

    const winner = players
      .filter(p => p.rank)
      .sort((a, b) => Number(a.rank) - Number(b.rank))[0];
    if (winner?.id) gd.winner = winner.id;

    gd.status = 'finished';
    gd.gameOver = true;
    gd.endsAt = gd.startedAt ? gd.startedAt + (durationSec * 1000) : Date.now();

    if (!message.overrideTtl) {
      message.overrideTtl = 120;
      message.expiresAt = new Date(Date.now() + 120 * 1000).toISOString();
    }
    return true;
  };

  const updateTypingRaceCpuProgress = (gd) => {
    if (!gd || gd.gameType !== 'typing-race' || gd.mode !== 'cpu' || gd.status !== 'racing' || !gd.startedAt) return;
    const cpu = gd.players?.['cpu-bot'];
    if (!cpu) return;

    const profile = gd.cpuProfile || { wpm: 50, accuracy: 93, reactionMs: 900 };
    const textLen = String(gd.text || '').length || 1;
    const words = Math.max(1, textLen / 5);
    const cpuWpm = Math.max(20, Number(profile.wpm) || 50);
    const cpuFinishMs = (words / cpuWpm) * 60 * 1000;
    const elapsedMs = Math.max(0, Date.now() - gd.startedAt - (Number(profile.reactionMs) || 0));
    const progress = Math.min(1, elapsedMs / Math.max(1, cpuFinishMs));

    cpu.progress = progress;
    cpu.wpm = cpuWpm;
    cpu.accuracy = Math.min(100, Math.max(75, Number(profile.accuracy) || 93));
    cpu.errors = Math.max(0, Math.round((1 - (cpu.accuracy / 100)) * words * 5 * progress));

    if (progress >= 1 && !cpu.finishedAt) {
      cpu.finishedAt = Date.now();
      cpu.rank = gd.nextRank++;
      if (!gd.winner) gd.winner = cpu.id;
    }
  };

  socket.on('typing-race-join', async ({ messageId }) => {
    try {
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = room.messages.find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'typing-race') return;
      const gd = message.gameData;
      const userId = socket.persistentUserId || socket.id;

  if (gd.mode === 'cpu') return;

      // REJOIN: player already in game — update socketId for reconnect
      if (gd.players[userId]) {
        gd.players[userId].socketId = socket.id;
        gd.lastActivity = Date.now();
        await roomManager.saveRoom(socket.roomCode, room);
        io.to(socket.roomCode).emit('message-updated', message);
        return;
      }

      if (gd.status !== 'waiting') return;

      // Custom text host cannot race — they know the text
      if (gd.isCustomText && (message.sender.id === userId || message.sender.socketId === socket.id)) return;

      // TARGETED: only the invited player may join; cap at 2 players
      if (gd.isTargeted) {
        if (Object.keys(gd.players).length >= 2) return;
        if (gd.invitedUserId && userId !== gd.invitedUserId && socket.id !== gd.invitedUserId) return;
      } else if (gd.maxPlayers && Object.keys(gd.players).length >= gd.maxPlayers) {
        return;
      }

      gd.players[userId] = { id: userId, socketId: socket.id, name: socket.nickname, progress: 0, wpm: 0, accuracy: 100, errors: 0, finishedAt: null, rank: null };
      // Auto-start for targeted 1v1 when both players have joined
      if (gd.isTargeted && Object.keys(gd.players).length >= 2 && gd.status === 'waiting') {
        gd.status = 'racing';
        gd.startedAt = Date.now() + 3000;
        gd.endsAt = gd.startedAt + ((Number(gd.duration) || 60) * 1000);
      }
      gd.lastActivity = Date.now();
      await roomManager.saveRoom(socket.roomCode, room);
      io.to(socket.roomCode).emit('message-updated', message);
    } catch (err) { logger.error('typing-race-join error:', err); }
  });

  socket.on('typing-race-start', async ({ messageId }) => {
    try {
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = room.messages.find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'typing-race') return;
      const gd = message.gameData;
      if (gd.status !== 'waiting') return;
      // Only sender can start
      const senderId = socket.persistentUserId || socket.id;
      if (message.sender.id !== senderId && message.sender.socketId !== socket.id) return;
      gd.status = 'racing';
      gd.startedAt = Date.now() + 3000; // 3s countdown
  gd.endsAt = gd.startedAt + ((Number(gd.duration) || 60) * 1000);
      if (gd.mode === 'cpu') {
        updateTypingRaceCpuProgress(gd);
      }
      gd.lastActivity = Date.now();
      await roomManager.saveRoom(socket.roomCode, room);
      io.to(socket.roomCode).emit('message-updated', message);
    } catch (err) { logger.error('typing-race-start error:', err); }
  });

  socket.on('typing-race-progress', async ({ messageId, progress, wpm, accuracy, errors }) => {
    try {
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = room.messages.find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'typing-race') return;
      const gd = message.gameData;
      if (gd.status !== 'racing') return;

      if (gd.mode === 'cpu') {
        updateTypingRaceCpuProgress(gd);
      }

      if (finalizeTypingRaceIfNeeded(message)) {
        gd.lastActivity = Date.now();
        await roomManager.saveRoom(socket.roomCode, room);
        io.to(socket.roomCode).emit('message-updated', message);
        return;
      }

      const userId = socket.persistentUserId || socket.id;
      if (!gd.players[userId]) return;
      gd.players[userId].progress = Math.min(1, Math.max(0, Number(progress) || 0));
      gd.players[userId].wpm = Number(wpm) || 0;
      gd.players[userId].accuracy = Number(accuracy) || 100;
      gd.players[userId].errors = Number(errors) || 0;

      if (gd.mode === 'cpu') {
        updateTypingRaceCpuProgress(gd);
      }

      gd.lastActivity = Date.now();
      await roomManager.saveRoom(socket.roomCode, room);
      io.to(socket.roomCode).emit('message-updated', message);
    } catch (err) { logger.error('typing-race-progress error:', err); }
  });

  socket.on('typing-race-finish', async ({ messageId, wpm, accuracy, errors, time }) => {
    try {
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = room.messages.find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'typing-race') return;
      const gd = message.gameData;
      if (gd.status !== 'racing') return;
      const userId = socket.persistentUserId || socket.id;
      if (!gd.players[userId] || gd.players[userId].finishedAt) return;
      gd.players[userId].progress = 1;
      gd.players[userId].wpm = Number(wpm) || 0;
      gd.players[userId].accuracy = Number(accuracy) || 100;
      gd.players[userId].errors = Number(errors) || 0;
      gd.players[userId].finishedAt = Date.now();
      gd.players[userId].rank = gd.nextRank++;
      if (!gd.winner) gd.winner = userId;

      if (gd.mode === 'cpu') {
        updateTypingRaceCpuProgress(gd);
      }

      const allDone = Object.values(gd.players).every(p => p.finishedAt != null);
      if (allDone) {
        finalizeTypingRaceIfNeeded(message, true);
      } else {
        finalizeTypingRaceIfNeeded(message);
      }

      gd.lastActivity = Date.now();
      await roomManager.saveRoom(socket.roomCode, room);
      io.to(socket.roomCode).emit('message-updated', message);
    } catch (err) { logger.error('typing-race-finish error:', err); }
  });

  // Handle ephemeral view token requests
  socket.on('request-view-token', async ({ messageId }, callback) => {
    try {
      if (!socket.roomCode || !messageId) return callback({ error: 'Invalid request' });

      const tokenData = roomManager.generateViewToken(messageId, socket.id);
      callback({ success: true, ...tokenData });
    } catch (error) {
      logger.error('Error generating view token:', error);
      callback({ error: 'Failed to generate token' });
    }
  });

  // Explicit delete for view-once audio/images after completion
  socket.on('delete-message', async ({ messageId }) => {
    try {
      if (!socket.roomCode || !messageId) return;

      const message = await roomManager.getMessage(socket.roomCode, messageId);
      if (!message) return;

      // Permission check: sender, host, or view-once auto-deletion can delete
      const requesterId = socket.persistentUserId || socket.id;
      const isSender = message.sender.id === requesterId || message.sender.socketId === socket.id || (socket.nickname && message.sender.nickname === socket.nickname);
      const isRoomHost = (roomData[socket.roomCode] && roomData[socket.roomCode].hostId === socket.id);

      let shouldDelete = false;

      if (isSender || isRoomHost) {
        shouldDelete = true;
      } else if (message.isViewOnce) {
        // Ensure the requesting user is marked as having viewed the message
        // (handles race condition where delete-message arrives before message-viewed is processed)
        if (!message.viewedBy) message.viewedBy = [];
        if (!message.viewedBy.includes(socket.id)) {
          message.viewedBy.push(socket.id);
          await roomManager.saveMessage(socket.roomCode, message);
        }
        const viewedBy = message.viewedBy;

        // Smart deletion for multi-recipient messages
        const recipients = message.recipients || [];

        if (recipients.length > 0) {
          const allViewed = recipients.every(rId => viewedBy.includes(rId));
          if (allViewed) shouldDelete = true;
        } else {
          const room = await roomManager.getRoom(socket.roomCode);
          if (room && room.users) {
            const currentOtherUsers = room.users
              .map(u => u.socketId)
              .filter(id => id !== message.sender.socketId);

            const allOthersViewed = currentOtherUsers.every(id => viewedBy.includes(id));
            if (allOthersViewed) shouldDelete = true;
          }
        }
      }

      if (shouldDelete) {
        const removed = await roomManager.removeMessage(socket.roomCode, messageId);
        if (removed) {
          io.to(socket.roomCode).emit('message-deleted', { messageId });
        }
      }
    } catch (error) {
      logger.error('Error deleting message:', error);
    }
  });


  // WebRTC Call Signaling Events

  // Helper: check that a target socket ID is a member of the caller's current room
  function isRoomMember(targetId) {
    if (!socket.roomCode || !targetId) return false;
    return io.sockets.adapter.rooms.get(socket.roomCode)?.has(targetId) ?? false;
  }

  // Handle call offer
  socket.on('call-offer', (data) => {
    if (!socket.roomCode) return;

    const payload = {
      ...data,
      fromNickname: socket.nickname,
      fromSocketId: socket.id
    };

    if (data.to) {
      // Targeted offer — verify target is in the same room to prevent cross-room signaling
      if (!isRoomMember(data.to)) return;
      io.to(data.to).emit('call-offer', payload);
    } else {
      // Broadcast offer to other participants in the room (legacy/group behavior)
      socket.to(socket.roomCode).emit('call-offer', payload);
    }
  });

  // Handle call answer
  socket.on('call-answer', (data) => {
    if (!socket.roomCode) return;

    const payload = {
      ...data,
      fromNickname: socket.nickname,
      fromSocketId: socket.id
    };

    if (data.to) {
      if (!isRoomMember(data.to)) return;
      io.to(data.to).emit('call-answer', payload);
    } else {
      socket.to(socket.roomCode).emit('call-answer', payload);
    }
  });

  // Handle ICE candidate exchange
  socket.on('call-ice-candidate', (data) => {
    if (!socket.roomCode) return;

    const payload = {
      ...data,
      fromSocketId: socket.id
    };

    if (data.to) {
      if (!isRoomMember(data.to)) return;
      io.to(data.to).emit('call-ice-candidate', payload);
    } else {
      socket.to(socket.roomCode).emit('call-ice-candidate', payload);
    }
  });

  // Handle call rejected
  socket.on('call-rejected', (data) => {
    if (!socket.roomCode) return;

    const payload = {
      ...data,
      rejectedBy: socket.nickname,
      fromSocketId: socket.id
    };

    if (data.to) {
      if (!isRoomMember(data.to)) return;
      io.to(data.to).emit('call-rejected', payload);
    } else {
      socket.to(socket.roomCode).emit('call-rejected', payload);
    }
  });

  // Handle call ended
  socket.on('call-ended', (data) => {
    if (!socket.roomCode) return;

    const payload = {
      ...data,
      endedBy: socket.nickname,
      fromSocketId: socket.id
    };

    if (data.to) {
      if (!isRoomMember(data.to)) return;
      io.to(data.to).emit('call-ended', payload);
    } else {
      socket.to(socket.roomCode).emit('call-ended', payload);
    }
  });

  // File Transfer Wake-Up Signal
  socket.on('file-transfer-intent', ({ roomCode, recipients, senderId }) => {
    if (!socket.roomCode || socket.roomCode !== roomCode) return;

    const from = socket.nickname || 'Unknown';
    // Use the stable senderId if provided (to survive reconnects), otherwise socket.id
    const fromId = senderId || socket.id;

    logger.info(`📁 [File Transfer Intent] From: ${from} (Socket: ${socket.id}, Stable: ${fromId}) recipients: ${recipients?.length || 'all'}`);

    const payload = {
      from,
      fromId,
      roomCode,
      recipients: (recipients && recipients.length > 0) ? recipients : null
    };

    if (recipients && recipients.length > 0) {
      // Notify ONLY the specific targeted users, EXCLUDING the sender
      const targetIds = recipients.filter(id => id !== socket.id);

      if (targetIds.length === 0) {
        logger.info(`   -> No valid recipients after filtering sender`);
        return;
      }

      targetIds.forEach(recipientId => {
        logger.info(`   -> Sending targeted invite to: ${recipientId}`);
        io.to(recipientId).emit('file-transfer-invite', payload);
      });
    } else {
      // Broadcast to ALL users in room EXCEPT the sender
      // socket.to() automatically excludes the sender socket
      logger.info(`   -> Broadcasting invite to room: ${roomCode} (excluding sender: ${fromId})`);
      socket.to(roomCode).emit('file-transfer-invite', payload);
    }
  });

  const handleUserDeparture = async (isExplicit = false) => {
    if (!socket.roomCode) return;

    const roomCode = socket.roomCode;
    const nickname = socket.nickname;
    const socketId = socket.id;

    logger.info(`🚪 User ${nickname} (${socketId}) leaving room ${roomCode} (explicit: ${isExplicit})`);

    // ── Clean up media watcher tracking immediately (before roomCode is nulled) ──
    if (io._mediaWatchers?.[roomCode]) {
      io._mediaWatchers[roomCode].delete(socketId);
      const watcherCount = io._mediaWatchers[roomCode].size;
      if (watcherCount === 0) delete io._mediaWatchers[roomCode];
      else io.to(roomCode).emit('media-sync-count', { count: watcherCount });
    }

    // Leave the socket.io room FIRST so adapter state is immediately accurate
    socket.leave(roomCode);
    socket.roomCode = null;
    socket.nickname = null;

    // Stop server chaff for the room if it's now empty
    const socketRoomCheck = io.sockets.adapter.rooms.get(roomCode);
    if (!socketRoomCheck || socketRoomCheck.size === 0) {
      cleanupRoomChaff(roomCode);
    }

    if (isExplicit) {
      // ── Explicit leave (user clicked "Leave") ── immediate full cleanup
      if (roomData[roomCode]?.userRoles?.[socketId]) {
        delete roomData[roomCode].userRoles[socketId];
      }

      // Host Handover Logic (immediate)
      const room = roomData[roomCode];
      if (room) {
        const socketRoom = io.sockets.adapter.rooms.get(roomCode);
        const remainingMembers = Array.from(socketRoom || []);

        if (room.hostId === socketId) {
          if (remainingMembers.length > 0) {
            const newHostId = remainingMembers[0];
            room.hostId = newHostId;
            if (!room.userRoles) room.userRoles = {};
            room.userRoles[newHostId] = 'host';
            logger.info(`👑 Host reassigned to ${newHostId} in room ${roomCode}`);
            io.to(newHostId).emit('promoted-to-host');
          } else {
            logger.info(`🗑️ Room ${roomCode} is now empty, cleaning up metadata`);
            delete roomData[roomCode];
          }
        } else if (remainingMembers.length === 0) {
          delete roomData[roomCode];
        } else {
          const hostStillConnected = remainingMembers.includes(room.hostId);
          if (!hostStillConnected) {
            const newHostId = remainingMembers[0];
            room.hostId = newHostId;
            if (!room.userRoles) room.userRoles = {};
            room.userRoles[newHostId] = 'host';
            logger.info(`👑 Stale host detected, reassigned to ${newHostId} in room ${roomCode}`);
            io.to(newHostId).emit('promoted-to-host');
          }
        }
      }

      securityManager.clearUserActivity(socketId);
      securityManager.invalidateSocketSessions(socketId);

      // Remove from room manager immediately
      await roomManager.leaveRoom(roomCode, socketId);

      // Also clean any other stale users
      try {
        const managedRoom = await roomManager.getRoom(roomCode);
        if (managedRoom && managedRoom.users) {
          const before = managedRoom.users.length;
          // Preserve users with pending deferred removals (grace period)
          const deferredSocketIds = new Set();
          for (const [, def] of deferredRemovals.entries()) {
            if (def.roomCode === roomCode) deferredSocketIds.add(def.socketId);
          }
          managedRoom.users = managedRoom.users.filter(u => io.sockets.sockets.has(u.socketId) || deferredSocketIds.has(u.socketId));
          if (managedRoom.users.length !== before) {
            logger.info(`🧹 Cleaned ${before - managedRoom.users.length} stale user(s) from room ${roomCode} during departure`);
            await roomManager.saveRoom(roomCode, managedRoom);
          }
        }
      } catch (e) {
        logger.error('Error cleaning stale users during departure:', e);
      }

      // Notify others immediately
      const socketRoomAfter = io.sockets.adapter.rooms.get(roomCode);
      const socketRoomSize = socketRoomAfter ? socketRoomAfter.size : 0;
      io.to(roomCode).emit('user-left', {
        nickname,
        socketId,
        userCount: socketRoomSize
      });

      if (roomData[roomCode]) {
        const enrichedUsers = getEnrichedUsers(roomCode);
        io.to(roomCode).emit('users-updated', { users: enrichedUsers });
      }
    } else {
      // ── Non-explicit disconnect (screen sleep, network switch, app backgrounded) ──
      // Defer the actual removal for the grace period so the user can reconnect seamlessly.
      // Other users will NOT see a "left" notification unless the grace period expires.

      let matchedToken = null;
      for (const [token, session] of securityManager.sessionTokens.entries()) {
        if (session.socketId === socketId) {
          securityManager.trackDisconnectedSession(token, socketId, session.userId, roomCode);
          matchedToken = token;
          break;
        }
      }

      const gracePeriodMs = securityManager.RECONNECT_GRACE_PERIOD_MS || 5 * 60 * 1000;
      logger.info(`📱 Deferring removal of ${nickname} (${socketId}) from room ${roomCode} for ${gracePeriodMs / 1000}s grace period`);

      const timeoutId = setTimeout(async () => {
        // Grace period expired – perform the actual removal now
        if (matchedToken) deferredRemovals.delete(matchedToken);

        logger.info(`⏰ Grace period expired for ${nickname} (${socketId}) in room ${roomCode} – removing now`);

        // Clean up role data
        if (roomData[roomCode]?.userRoles?.[socketId]) {
          delete roomData[roomCode].userRoles[socketId];
        }

        // Host Handover Logic
        const room = roomData[roomCode];
        if (room) {
          const socketRoom = io.sockets.adapter.rooms.get(roomCode);
          const remainingMembers = Array.from(socketRoom || []);

          if (room.hostId === socketId) {
            if (remainingMembers.length > 0) {
              const newHostId = remainingMembers[0];
              room.hostId = newHostId;
              if (!room.userRoles) room.userRoles = {};
              room.userRoles[newHostId] = 'host';
              logger.info(`👑 Host reassigned to ${newHostId} in room ${roomCode}`);
              io.to(newHostId).emit('promoted-to-host');
            } else {
              logger.info(`🗑️ Room ${roomCode} is now empty, cleaning up metadata`);
              delete roomData[roomCode];
            }
          } else if (remainingMembers.length === 0) {
            delete roomData[roomCode];
          } else {
            const hostStillConnected = remainingMembers.includes(room.hostId);
            if (!hostStillConnected) {
              const newHostId = remainingMembers[0];
              room.hostId = newHostId;
              if (!room.userRoles) room.userRoles = {};
              room.userRoles[newHostId] = 'host';
              logger.info(`👑 Stale host detected, reassigned to ${newHostId} in room ${roomCode}`);
              io.to(newHostId).emit('promoted-to-host');
            }
          }
        }

        securityManager.clearUserActivity(socketId);

        await roomManager.leaveRoom(roomCode, socketId);

        // Clean stale users
        try {
          const managedRoom = await roomManager.getRoom(roomCode);
          if (managedRoom && managedRoom.users) {
            const before = managedRoom.users.length;
            // Preserve users with pending deferred removals (grace period)
            const deferredSocketIds = new Set();
            for (const [, def] of deferredRemovals.entries()) {
              if (def.roomCode === roomCode) deferredSocketIds.add(def.socketId);
            }
            managedRoom.users = managedRoom.users.filter(u => io.sockets.sockets.has(u.socketId) || deferredSocketIds.has(u.socketId));
            if (managedRoom.users.length !== before) {
              logger.info(`🧹 Cleaned ${before - managedRoom.users.length} stale user(s) from room ${roomCode} during deferred departure`);
              await roomManager.saveRoom(roomCode, managedRoom);
            }
          }
        } catch (e) {
          logger.error('Error cleaning stale users during deferred departure:', e);
        }

        // Now notify others
        const socketRoomAfter = io.sockets.adapter.rooms.get(roomCode);
        const socketRoomSize = socketRoomAfter ? socketRoomAfter.size : 0;
        io.to(roomCode).emit('user-left', {
          nickname,
          socketId,
          userCount: socketRoomSize
        });

        if (roomData[roomCode]) {
          const enrichedUsers = getEnrichedUsers(roomCode);
          io.to(roomCode).emit('users-updated', { users: enrichedUsers });
        }
      }, gracePeriodMs);

      // Store so it can be cancelled if user reconnects
      if (matchedToken) {
        deferredRemovals.set(matchedToken, { timeoutId, socketId, roomCode });
      }
    }
  };

  // ─── MLS Key-Package & Welcome Relay ──────────────────────
  // The server does NOT inspect MLS payloads — it merely forwards them
  // between room members so the MLS handshake can complete (RFC 9420).
  socket.on('mls-key-package', ({ roomCode: rc, keyPackage }) => {
    // rc must match the room this socket has joined — prevents cross-room injection
    if (!rc || rc !== socket.roomCode || !keyPackage) return;
    // Forward key package to all OTHER members (the group creator will add them)
    socket.to(rc).emit('mls-key-package', {
      keyPackage,
      from: socket.id
    });
    logger.info(`🔑 MLS key-package relayed in room ${rc} from ${socket.id}`);
  });

  socket.on('mls-welcome', ({ roomCode: rc, welcome, commit, proposal, ratchetTree, target }) => {
    if (!rc || rc !== socket.roomCode || !welcome) return;
    // If target is specified, send only to that socket — must be a room member
    if (target) {
      if (!isRoomMember(target)) return;
      io.to(target).emit('mls-welcome', {
        welcome,
        commit: commit || null,
        proposal: proposal || null,
        ratchetTree: ratchetTree || null,
        from: socket.id
      });
    } else {
      socket.to(rc).emit('mls-welcome', {
        welcome,
        commit: commit || null,
        proposal: proposal || null,
        ratchetTree: ratchetTree || null,
        from: socket.id
      });
    }
    logger.info(`🔑 MLS welcome relayed in room ${rc} from ${socket.id}${target ? ` to ${target}` : ''}`);
  });

  // Legacy key-bundle relay (kept for backward compat during rollout)
  socket.on('key-bundle-offer', ({ roomCode: rc, keyBundle }) => {
    if (!rc || !keyBundle) return;
    socket.to(rc).emit('key-bundle-offer', { keyBundle, from: socket.id });
  });
  socket.on('key-bundle-answer', ({ roomCode: rc, keyBundle, pqCiphertext }) => {
    if (!rc || !keyBundle) return;
    socket.to(rc).emit('key-bundle-answer', { keyBundle, pqCiphertext: pqCiphertext || null, from: socket.id });
  });

  // ─── v2 Security: Padded/chaff message passthrough ────────
  // The server relays padded messages without inspecting them.
  // Chaff is indistinguishable from real traffic at this layer.
  socket.on('padded-message', (data) => {
    if (!socket.roomCode || !data?.payload) return;
    socket.to(socket.roomCode).emit('padded-message', {
      payload: data.payload,
      from: socket.id,
      timestamp: Date.now()
    });
  });

  socket.on('leave-room', async () => {
    keyRegistry.removeKeyBundle(socket.id);
    await handleUserDeparture(true);
  });

  // ─── E2EE Key Registry Handlers ────────────────────────────

  // Client registers their public key bundle on room join
  socket.on('register-public-key', ({ roomCode, bundle }) => {
    if (!roomCode || !bundle) return;
    const ok = keyRegistry.registerKeyBundle(socket.id, bundle, roomCode);
    if (!ok) {
      logger.warn(`[E2EE] Invalid key bundle rejected from socket ${socket.id}`);
      socket.emit('error', { code: 'INVALID_KEY_BUNDLE', message: 'Key bundle validation failed' });
      return;
    }
    // Broadcast to other room members so they can initiate key exchange
    socket.to(roomCode).emit('peer-key-bundle', signSocketPayload({ socketId: socket.id, bundle, roomCode }));
    logger.info(`🔑 Key bundle registered for socket ${socket.id} in room ${roomCode}`);
  });

  // Client requests bundles for all existing room members
  socket.on('request-key-bundles', ({ roomCode }) => {
    if (!roomCode) return;
    const bundles = keyRegistry.getBundlesForRoom(roomCode, socket.id);
    socket.emit('key-bundle-roster', signSocketPayload({ bundles, roomCode }));
  });

  // Forward key-bundle-offer to a specific peer (Alice → Bob)
  socket.on('key-bundle-offer', ({ roomCode, to, alicePublicBundle, pqCiphertext }) => {
    if (!to || !alicePublicBundle) return;
    const targetSocket = io.sockets.sockets.get(to);
    if (targetSocket) {
      targetSocket.emit('key-bundle-offer', { from: socket.id, alicePublicBundle, pqCiphertext, roomCode });
    }
  });

  // Forward key-bundle-answer back to initiator (Bob → Alice)
  socket.on('key-bundle-answer', ({ roomCode, to }) => {
    if (!to) return;
    const targetSocket = io.sockets.sockets.get(to);
    if (targetSocket) {
      targetSocket.emit('key-bundle-answer', { from: socket.id, roomCode });
    }
  });

  // Forward DR-encrypted sender-key-distribution to a specific peer
  socket.on('sender-key-distribution', ({ roomCode, to, encryptedKeyDist }) => {
    if (!to || !encryptedKeyDist) return;
    const targetSocket = io.sockets.sockets.get(to);
    if (targetSocket) {
      targetSocket.emit('sender-key-distribution', { from: socket.id, encryptedKeyDist, roomCode });
    }
  });

  socket.on('disconnect', async (reason) => {
    keyRegistry.removeKeyBundle(socket.id);
    // logger.info(`🔌 User disconnected: ${socket.id} (Reason: ${reason})`);

    // Cleanup file transfer tracking (clear all transfers for this socket)
    clearSocketTransfers(socket.id);

    // Remove from knock lobby if this socket was waiting for host approval
    if (socket.roomCode && pendingKnocks.has(socket.roomCode)) {
      const knockSet = pendingKnocks.get(socket.roomCode);
      knockSet.delete(socket.id);
      if (knockSet.size === 0) pendingKnocks.delete(socket.roomCode);
    }

    // Note: Media watcher cleanup is handled inside handleUserDeparture
    // Note: Do NOT delete io._activeMedia on disconnect — media persists for the room
    // It will be cleaned up when the room is deleted or host closes media

    // Handle user departure logic (also cleans _mediaWatchers)
    await handleUserDeparture(false);

    // Remove from rate limits
    rateLimits.delete(socket.id);
  });
});

// Catch-all route to serve index.html for client-side routing
const indexLimiter = RateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});

app.get('*', indexLimiter, (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  } else {
    res.sendFile(path.join(__dirname, '../client/index.html'));
  }
});

// Start server
async function startServer() {
  try {
    // Initialize server components
    await initializeServer();

    // Start the server
    server.listen(PORT, () => {
      logger.info(`🚀 Ephemeral Chat server running on port ${PORT}`);
      logger.info(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`📡 Server ready to accept connections`);
    });

    server.on('error', (err) => {
      logger.error('Server error:', err);
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. Please close other instances.`);
        process.exit(1);
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer().catch(err => {
  logger.error('startServer failed:', err);
  logger.error(err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('🛑 Shutting down server...');
  // Stop security module timers
  stopOHTTPKeyRotation();
  stopPPCleanup();
  if (redisClient) {
    await redisClient.quit();
  }
  server.close(() => {
    logger.info('✅ Server shut down gracefully');
    process.exit(0);
  });
});
