/**
 * Ephemeral Chat Server
 * Express + Socket.IO server for Private, temporary chat rooms
 */

require('dotenv').config();
const nodeCrypto = require('crypto');
const express = require('express');
const fs = require('fs');
const os = require('os');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
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
const { Chess } = require('./utils/chess');

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
// OHTTP relay is a separate Render service — not started from this process
const { attachMASQUEProxy } = require('./masque-proxy');
const { attachWebAuthnRoutes } = require('./webauthn');
const { trafficPaddingMiddleware, startServerChaff, stopServerChaff, isChaff, stripPadding, padResponseMiddleware } = require('./traffic-padding');
const { LinkPreviewService } = require('./link-preview');
const { initializeAttestation, verifyAndroidAttestation, requireDeviceAttestation } = require('./device-attestation-verifier');
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

  // Device Attestation — Android/iOS authenticity verification (optional; logs status)
  initializeAttestation();

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

// Serve static files from .well-known directory (for Digital Asset Links)
app.use('/.well-known', express.static(path.join(__dirname, '../client/public/.well-known')));

// Games must be embeddable in iframes — strip frame-blocking headers before serving
app.use('/games', (req, res, next) => {
  res.removeHeader('X-Frame-Options');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; media-src 'self' blob:; img-src 'self' data:; frame-ancestors 'self'");
  next();
});

// Serve react-tetris game as an embedded activity
app.use('/games/tetris', express.static(path.join(__dirname, '../react-tetris/docs')));

// Serve standalone HTML games
app.use('/games/anagram', express.static(path.join(__dirname, '../games/anagram-game')));
app.use('/games/hangman', express.static(path.join(__dirname, '../games/hangman-game')));
app.use('/games/typing', express.static(path.join(__dirname, '../games/typing-game')));

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
      scriptSrc: [
        "'self'", 
        "'unsafe-inline'",
        "'unsafe-eval'", 
        "https://*.youtube.com", 
        "https://youtube.com",
        "https://*.ytimg.com",
        "https://*.soundcloud.com",
        "https://w.soundcloud.com"
      ],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: [
        "'self'",
        'wss:',
        'https:',
        "https://*.youtube.com",
        "https://youtube.com",
        "https://*.ytimg.com",
        "https://*.soundcloud.com",
        "https://*.sndcdn.com",
        // Allow socket.io and OHTTP relay connections
        ...(process.env.PUBLIC_URL ? [process.env.PUBLIC_URL.replace(/^http/, 'ws')] : []),
      ].filter(Boolean),
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      mediaSrc: ["'self'", 'blob:', 'https:'],
      workerSrc: ["'self'", 'blob:'],
      frameSrc: [
        "'self'", 
        "https://*.youtube.com", 
        "https://youtube.com",
        "https://*.youtube-nocookie.com",
        "https://*.figma.com", 
        "https://docs.google.com", 
        "https://drive.google.com",
        "https://w.soundcloud.com"
      ],
      frameAncestors: ["'self'"],        // Allow same-origin iframes (games panel); external clickjacking still blocked
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
  crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow third-party media assets
  crossOriginOpenerPolicy: false,    // Allow popups for OAuth
  // Additional security headers
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  referrerPolicy: { policy: 'no-referrer-when-downgrade' },
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

  // OHTTP relay is deployed as a separate service — URL must be set explicitly
  const ohttpRelayUrl = process.env.OHTTP_RELAY_URL || null;

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

app.post('/api/rooms', requireDeviceAttestation, async (req, res) => {
  try {
    const { messageTTL, password, maxUsers, capToken, creatorId, persistenceMode, customCode, hp_email, hp_website, hp_timestamp, autoApprove, preApprovedList, scheduledFor, geofence } = req.body;

    // Verify Play Integrity token for Android clients (middleware sets req.deviceAttestation)
    if (req.deviceAttestation?.platform === 'android') {
      const { token: attToken, nonce: attNonce } = req.deviceAttestation;
      const nonceEntry = pendingNonces.get(attNonce);
      if (!nonceEntry || nonceEntry.used) {
        return res.status(403).json({ error: 'Invalid or replayed attestation nonce', code: 'ATTESTATION_FAILED' });
      }
      pendingNonces.set(attNonce, { ...nonceEntry, used: true });
      try {
        await verifyAndroidAttestation(attToken, attNonce);
      } catch (err) {
        logger.warn('[Integrity] Room creation blocked:', err.message);
        return res.status(403).json({ error: 'Device integrity check failed', code: 'ATTESTATION_FAILED' });
      }
    }

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

    // Geofence — validate and store centre + radius
    if (geofence && typeof geofence === 'object') {
      const { lat, lng, radiusMeters } = geofence;
      if (
        typeof lat === 'number' && lat >= -90 && lat <= 90 &&
        typeof lng === 'number' && lng >= -180 && lng <= 180 &&
        typeof radiusMeters === 'number' && radiusMeters >= 50 && radiusMeters <= 50000
      ) {
        roomData[roomCode].geofence = { lat, lng, radiusMeters };
      }
    }

    // Scheduled room support
    if (scheduledFor) {
      const ts = new Date(scheduledFor).getTime();
      if (!isNaN(ts) && ts > Date.now()) {
        roomData[roomCode].scheduledFor = ts;
        const delay = ts - Date.now();
        setTimeout(() => {
          if (roomData[roomCode]) roomData[roomCode].scheduledFor = null;
          io.to(`waiting:${roomCode}`).emit('room-opening', { roomCode });
          io.to(roomCode).emit('room-opening', { roomCode });
        }, delay);
      }
    }

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

    res.json({ success: true, roomCode, scheduledFor: roomData[roomCode]?.scheduledFor || null });
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

// ─── Play Integrity API Endpoints ──────────────────────────────────────────
// In-memory nonce store — entries expire after 10 minutes.
// Rate-limited naturally by Play Integrity's own per-app quota; an explicit
// RateLimit on the nonce endpoint prevents bulk pre-generation.
const pendingNonces = new Map(); // nonce -> { createdAt: number, used: boolean }

const integrityLimiter = RateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 20, // 20 integrity operations per IP per window
  message: { error: 'Too many integrity requests' },
});

// GET /api/integrity/nonce — Issue a server-generated nonce for Play Integrity.
// Clients pass this nonce to IntegrityPlugin.requestIntegrityToken(), then
// POST the resulting token + nonce to /api/integrity/verify.
app.get('/api/integrity/nonce', integrityLimiter, (req, res) => {
  const nonce = nodeCrypto.randomBytes(24).toString('base64');
  pendingNonces.set(nonce, { createdAt: Date.now(), used: false });

  // Prune nonces older than 10 minutes to bound memory growth
  const TEN_MIN = 10 * 60 * 1000;
  for (const [k, v] of pendingNonces) {
    if (Date.now() - v.createdAt > TEN_MIN) pendingNonces.delete(k);
  }

  res.json({ nonce });
});

// POST /api/integrity/verify — Verify a Play Integrity token (enforcement active).
// Validates nonce provenance and replay protection, then enforces device integrity.
// Returns 403 if the device fails the integrity check.
app.post('/api/integrity/verify', integrityLimiter, express.json(), async (req, res) => {
  const { token, nonce } = req.body;

  if (!token || !nonce) {
    return res.status(400).json({ error: 'token and nonce required' });
  }

  // Verify nonce was issued by us and has not been replayed
  const nonceEntry = pendingNonces.get(nonce);
  if (!nonceEntry) {
    return res.status(400).json({ error: 'Unknown or expired nonce' });
  }
  if (nonceEntry.used) {
    return res.status(400).json({ error: 'Nonce already used' });
  }

  // Mark nonce as used before the async call to prevent concurrent replays
  pendingNonces.set(nonce, { ...nonceEntry, used: true });

  try {
    const result = await verifyAndroidAttestation(token, nonce);

    if (result.verdict.unconfigured) {
      return res.json({ valid: true, unconfigured: true });
    }

    logger.info('[Integrity] Verdict:', {
      deviceTrusted: result.verdict.deviceTrusted,
      appAuthentic: result.verdict.appAuthentic,
    });

    if (!result.verdict.deviceTrusted) {
      return res.status(403).json({
        error: 'Device integrity check failed',
        code: 'DEVICE_NOT_TRUSTED',
      });
    }

    return res.json({ valid: true });

  } catch (err) {
    logger.error('[Integrity] Token verification failed:', err.message);
    return res.status(403).json({
      error: 'Device attestation failed',
      code: 'ATTESTATION_FAILED',
    });
  }
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

// ─── Haversine Distance (metres) ───────────────────────────
function haversineMeters(lat1, lng1, lat2, lng2) {
  const R = 6_371_000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

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

const tetrisDisconnectTimeouts = new Map(); // persistentUserId → timeout handle

io.on('connection', (socket) => {
  // logger.info(`🔌 User connected: ${socket.id}`);

  // Per-socket rate limit for confetti bomb (10 s cooldown)
  let lastConfettiTime = 0;

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
      const { messageTTL, password, maxUsers, customCode, totpEnabled, scheduledFor } = data || {};

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

      // Validate and store scheduledFor timestamp
      let parsedScheduledFor = null;
      if (scheduledFor) {
        const ts = new Date(scheduledFor).getTime();
        if (!isNaN(ts) && ts > Date.now()) {
          parsedScheduledFor = ts;
        }
      }

      // Initialize room metadata for Lobby/Host logic
      roomData[roomCode] = {
        hostId: socket.id,
        lobbyLimit: (settings.maxUsers || 50) * 2, // Default 2x max users
        lobbyCount: 0,
        totpSecret: totpSecret || undefined, // undefined = TOTP not required
        scheduledFor: parsedScheduledFor,
      };

      // Schedule room-opening broadcast
      if (parsedScheduledFor) {
        const delay = parsedScheduledFor - Date.now();
        setTimeout(() => {
          if (roomData[roomCode]) roomData[roomCode].scheduledFor = null;
          // Notify waiters in the waiting room
          io.to(`waiting:${roomCode}`).emit('room-opening', { roomCode });
          // Also notify the host who is already in the room
          io.to(roomCode).emit('room-opening', { roomCode });
        }, delay);
      }

      callback({ success: true, roomCode, totpSecret, scheduledFor: parsedScheduledFor }); // creator receives the secret to share
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
      const { roomCode, nickname, password, inviteToken, capToken, sessionToken, userId, hp_email, hp_website, hp_timestamp, totpCode, lat, lng } = data;

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
              activeMedia: []
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

        // Geofence — validate joiner's location before allowing entry
        const rd = roomData[roomCode];
        if (rd?.geofence && socket.id !== rd.hostId) {
          if (typeof lat !== 'number' || typeof lng !== 'number') {
            return callback({ success: false, error: 'geofence-location-required' });
          }
          const dist = haversineMeters(rd.geofence.lat, rd.geofence.lng, lat, lng);
          if (dist > rd.geofence.radiusMeters) {
            return callback({
              success: false,
              error: 'geofence-out-of-range',
              distanceMeters: Math.round(dist),
              radiusMeters: rd.geofence.radiusMeters,
            });
          }
        }

        // Scheduled room — block entry until open time (host may still join)
        if (rd?.scheduledFor && socket.id !== rd.hostId) {
          // Put waiter in a waiting room so they receive room-opening
          socket.join(`waiting:${roomCode}`);
          return callback({ success: false, scheduledFor: rd.scheduledFor, error: 'room-not-open-yet' });
        }

        // logger.info(`User ${userNickname} (${socket.id}) successfully joined room ${roomCode}`);
        socket.join(roomCode);
        ensureRoomChaff(roomCode); // Start traffic-analysis-resistant chaff
        socket.roomCode = roomCode;
        socket.nickname = userNickname;
        socket.persistentUserId = userId || socket.id; // Store persistent ID on socket

        // Re-sync chess (and other game) player socketIds for this returning user
        try {
          const freshRoom = await roomManager.getRoom(roomCode);
          if (freshRoom && freshRoom.messages) {
            let gamesUpdated = false;
            for (const msg of freshRoom.messages) {
              if (msg.messageType !== 'game' || !msg.gameData) continue;
              const gd = msg.gameData;

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

              if (gd.gameType === 'tetris' && gd.status !== 'finished') {
                const pid = userId || socket.id;
                if (gd.player1 && (gd.player1.id === pid || gd.player1.name === userNickname)) {
                  // Cancel any pending forfeit for this player
                  const prevTimeout = tetrisDisconnectTimeouts.get(gd.player1.id);
                  if (prevTimeout) { clearTimeout(prevTimeout); tetrisDisconnectTimeouts.delete(gd.player1.id); }
                  gd.player1.socketId = socket.id;
                  if (userId) gd.player1.id = userId;
                  gamesUpdated = true;
                  if (gd.player2?.socketId) io.to(gd.player2.socketId).emit('tetris-opponent-reconnected', { messageId: msg.id });
                }
                if (gd.player2 && (gd.player2.id === pid || gd.player2.name === userNickname)) {
                  const prevTimeout = tetrisDisconnectTimeouts.get(gd.player2.id);
                  if (prevTimeout) { clearTimeout(prevTimeout); tetrisDisconnectTimeouts.delete(gd.player2.id); }
                  gd.player2.socketId = socket.id;
                  if (userId) gd.player2.id = userId;
                  gamesUpdated = true;
                  if (gd.player1?.socketId) io.to(gd.player1.socketId).emit('tetris-opponent-reconnected', { messageId: msg.id });
                }
              }

              if (gd.gameType === 'anagram' && !gd.winner) {
                const pid = userId || socket.id;
                if (gd.host && (gd.host.id === pid || gd.host.name === userNickname)) {
                  gd.host.socketId = socket.id;
                  if (userId) gd.host.id = userId;
                  gamesUpdated = true;
                  if (gd.challenger?.socketId) io.to(gd.challenger.socketId).emit('anagram-opponent-reconnected', { messageId: msg.id });
                }
                if (gd.challenger && (gd.challenger.id === pid || gd.challenger.name === userNickname)) {
                  gd.challenger.socketId = socket.id;
                  if (userId) gd.challenger.id = userId;
                  gamesUpdated = true;
                  if (gd.host?.socketId) io.to(gd.host.socketId).emit('anagram-opponent-reconnected', { messageId: msg.id });
                }
              }

              if (gd.gameType === 'hangman' && !gd.winner) {
                const pid = userId || socket.id;
                if (gd.wordmaster && (gd.wordmaster.id === pid || gd.wordmaster.name === userNickname)) {
                  gd.wordmaster.socketId = socket.id;
                  if (userId) gd.wordmaster.id = userId;
                  gamesUpdated = true;
                  if (gd.guesser?.socketId) io.to(gd.guesser.socketId).emit('hangman-opponent-reconnected', { messageId: msg.id });
                }
                if (gd.guesser && (gd.guesser.id === pid || gd.guesser.name === userNickname)) {
                  gd.guesser.socketId = socket.id;
                  if (userId) gd.guesser.id = userId;
                  gamesUpdated = true;
                  if (gd.wordmaster?.socketId) io.to(gd.wordmaster.socketId).emit('hangman-opponent-reconnected', { messageId: msg.id });
                }
              }

              if (gd.gameType === 'typesprint' && !gd.winner) {
                const pid = userId || socket.id;
                if (gd.player1 && (gd.player1.id === pid || gd.player1.name === userNickname)) {
                  gd.player1.socketId = socket.id;
                  if (userId) gd.player1.id = userId;
                  gamesUpdated = true;
                  if (gd.player2?.socketId) io.to(gd.player2.socketId).emit('typesprint-opponent-reconnected', { messageId: msg.id });
                }
                if (gd.player2 && (gd.player2.id === pid || gd.player2.name === userNickname)) {
                  gd.player2.socketId = socket.id;
                  if (userId) gd.player2.id = userId;
                  gamesUpdated = true;
                  if (gd.player1?.socketId) io.to(gd.player1.socketId).emit('typesprint-opponent-reconnected', { messageId: msg.id });
                }
              }

              if (msg.sender && msg.sender.nickname === userNickname && msg.sender.id !== userId && userId) {
                msg.sender.id = userId;
                msg.sender.socketId = socket.id;
                gamesUpdated = true;
              }
            }
            if (gamesUpdated) {
              await roomManager.saveRoom(roomCode, freshRoom);
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
          preApprovedList: roomData[roomCode].preApprovedList || [],
          pinnedMessage: roomData[roomCode].pinnedMessage || null,
          hotSeatTarget: roomData[roomCode].hotSeatTarget || null,
          geofence: roomData[roomCode].geofence
            ? { radiusMeters: roomData[roomCode].geofence.radiusMeters }
            : null,
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
          activeMedia: rd?.activeMedia || []
        });

        // Sync active hot seat to late joiners
        if (rd?.hotSeatTarget) {
          socket.emit('hotSeat-started', { targetNickname: rd.hotSeatTarget });
        }
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
      let { content, messageType = 'text', isViewOnce = false, imageData, pollData, gameData, recipients = [], replyTo, parentId, isEncrypted, iv, fileName, mimeType, fileSize, isAnonymous, overrideTtl,
        v: payloadVersion, header: ratchetHeader, ciphertext: ratchetCiphertext, ratchet: isRatchet, mls: mlsCiphertext,
        ct: aesCiphertext, dr: drPayload, sk: skPayload,
        duration: videoDuration, filterStyle: videoFilterStyle, overlays: videoOverlays } = data;

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
      } else if (messageType === 'game') {
        if (!gameData || !gameData.gameType) {
          socket.emit('error', { message: 'Invalid game data' });
          return;
        }
        // Chess only allows at most 1 targeted recipient
        if (recipients && recipients.length > 1 && gameData.gameType === 'chess') {
          socket.emit('error', { message: 'Chess can only target one player' });
          return;
        }
        if (gameData.gameType === 'chess') {
          const senderId = socket.persistentUserId || data.userId || socket.id;
          const isCPU = !!gameData.isCPU;
          const cpuDifficulty = isCPU ? (gameData.cpuDifficulty || 'medium') : undefined;
          const isTargeted = !isCPU && recipients && recipients.length === 1;
          let invitedNickname = null;
          if (isTargeted) {
            const chessRoom = await roomManager.getRoom(socket.roomCode);
            if (chessRoom && chessRoom.users) {
              const targetUser = chessRoom.users.find(u => u.socketId === recipients[0] || u.id === recipients[0]);
              invitedNickname = targetUser ? targetUser.nickname : null;
            }
          }
          data.gameData = {
            gameType: 'chess',
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            players: {
              white: { id: senderId, socketId: socket.id, name: socket.nickname },
              black: isCPU ? { id: 'cpu', name: `CPU (${cpuDifficulty})`, isCPU: true } : null,
            },
            invitedNickname: isCPU ? null : invitedNickname,
            isCPU,
            cpuDifficulty,
            turn: 'w',
            history: [],
            winner: null,
            lastActivity: Date.now()
          };
          // Chess games must never expire while active; overrideTtl=0 signals "never expire"
          overrideTtl = 0;
        } else if (gameData.gameType === 'tetris') {
          const senderId = socket.persistentUserId || data.userId || socket.id;
          const gameId = `tetris_${Date.now()}_${nodeCrypto.randomBytes(4).toString('hex')}`;
          data.gameData = {
            gameType: 'tetris',
            gameId,
            player1: { id: senderId, socketId: socket.id, name: socket.nickname },
            player2: null,
            status: 'waiting',
            winner: null,
            scores: { player1: 0, player2: 0 },
            startedAt: null,
            endedAt: null,
          };
          overrideTtl = 0;
          messageContent = 'Tetris Battle';
        } else if (gameData.gameType === 'anagram') {
          const senderId = socket.persistentUserId || data.userId || socket.id;
          data.gameData = {
            gameType: 'anagram',
            status: 'waiting',
            host: { id: senderId, socketId: socket.id, name: socket.nickname },
            challenger: null,
            scores: { host: 0, challenger: 0 },
            round: 0,
            totalRounds: 3,
            currentScrambled: null,
            currentWord: null,
            roundWinner: null,
            winner: null,
            startedAt: null,
            isSolo: !!gameData.isSolo,
          };
          overrideTtl = 0;
          messageContent = 'Word Duel';
        } else if (gameData.gameType === 'hangman') {
          const senderId = socket.persistentUserId || data.userId || socket.id;
          data.gameData = {
            gameType: 'hangman',
            status: 'waiting',
            wordmaster: { id: senderId, socketId: socket.id, name: socket.nickname },
            guesser: null,
            wordLength: 0,
            revealedLetters: [],
            wrongGuesses: [],
            maxWrong: 6,
            winner: null,
            startedAt: null,
            spectators: [],
          };
          overrideTtl = 0;
          messageContent = 'Word Trap';
        } else if (gameData.gameType === 'typesprint') {
          const senderId = socket.persistentUserId || data.userId || socket.id;
          data.gameData = {
            gameType: 'typesprint',
            status: 'waiting',
            player1: { id: senderId, socketId: socket.id, name: socket.nickname },
            player2: null,
            passage: null,
            progress: { player1: 0, player2: 0 },
            wpm: { player1: 0, player2: 0 },
            finished: { player1: false, player2: false },
            winner: null,
            startedAt: null,
          };
          overrideTtl = 0;
          messageContent = 'Type Sprint';
        } else {
          socket.emit('error', { message: 'Unknown game type' });
          return;
        }
        if (gameData.gameType === 'chess') messageContent = gameData.isCPU ? `Chess vs CPU` : 'Chess';
      } else if (messageType === 'videoReply') {
        // Always encrypted; content holds the ciphertext forwarded from v4/v5 payload
        messageContent = content;
      } else if (!['text', 'image', 'audio', 'poll', 'file'].includes(messageType)) {
        socket.emit('error', { message: 'Unsupported message type' });
        return;
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
        mimeType: messageType === 'file' ? mimeType : (messageType === 'videoReply' ? (mimeType || 'video/webm') : undefined),
        fileSize: messageType === 'file' ? fileSize : undefined,
        duration: messageType === 'videoReply' ? (videoDuration || undefined) : undefined,
        filterStyle: messageType === 'videoReply' ? (videoFilterStyle || undefined) : undefined,
        overlays: messageType === 'videoReply' ? (videoOverlays || undefined) : undefined,
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
        replyTo: replyTo || null,
        parentId: parentId || null, // Thread reply — groups under parent message
        reactions: {}, // Initialize reactions
        hasBeenViewed: false,
        isAnonymous: !!isAnonymous, // Anonymous confession flag
        overrideTtl: overrideTtl != null ? overrideTtl : null,
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

      // Update user activity on any message sent
      securityManager.updateUserActivity(socket.id, handleInactivityTimeout);

      // Broadcast logic
      if (recipients && recipients.length > 0) {
        // Chess games always broadcast to the whole room (anyone can spectate)
        const isChessGame = message.messageType === 'game' && message.gameData?.gameType === 'chess';
        if (isChessGame) {
          io.to(socket.roomCode).emit('new-message', message);
        } else {
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

  // ─── Chess Handlers ────────────────────────────────────────────────────────

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

      if (!gameData.players.white?.id) {
        gameData.players.white = { id: joinerId, socketId: socket.id, name: socket.nickname };
      } else if (!gameData.players.black?.id) {
        if (gameData.players.white?.id === joinerId || gameData.players.white?.name === socket.nickname) return;

        const isTargeted = message.recipients && message.recipients.length > 0;
        if (isTargeted) {
          const isIntendedRecipient = message.recipients.includes(joinerId) ||
            message.recipients.includes(socket.id) ||
            (gameData.invitedNickname && gameData.invitedNickname === socket.nickname);
          if (!isIntendedRecipient) return;
        }

        gameData.players.black = { id: joinerId, socketId: socket.id, name: socket.nickname };
      } else {
        // Re-sync socketId if existing player rejoins
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
      // CPU move: client sends isCpuMove=true when submitting AI-computed black move
      const isCpuMove = !!data.isCpuMove && gameData.isCPU && gameData.turn === 'b';
      const isBlack = gameData.players.black?.id === playerId || gameData.players.black?.name === socket.nickname || isCpuMove;

      if ((gameData.turn === 'w' && !isWhite) || (gameData.turn === 'b' && !isBlack)) return;

      const chess = new Chess(gameData.fen);
      const moveResult = chess.move(move);

      if (moveResult) {
        gameData.fen = chess.fen();
        gameData.turn = chess.turn();

        if (chess.isCheckmate() || chess.isDraw()) {
          const winner = chess.isDraw() ? 'draw' : (chess.turn() === 'w' ? 'black' : 'white');
          gameData.winner = winner;
          if (winner !== 'draw') {
            gameData.winnerId = winner === 'white' ? gameData.players.white.id : gameData.players.black.id;
          }
          gameData.endedAt = Date.now();
          // Completed games get a 2-min grace period before expiry
          message.overrideTtl = 120;
          message.expiresAt = new Date(Date.now() + 120 * 1000).toISOString();
        }

        gameData.history = gameData.history || [];
        gameData.history.push(moveResult.san);
        gameData.lastRawMove = { from: moveResult.from, to: moveResult.to };
        gameData.lastActivity = Date.now();

        await roomManager.saveRoom(socket.roomCode, room);
        io.to(socket.roomCode).emit('message-updated', message);
      }
    } catch (error) {
      logger.error('Error handling chess move:', error);
    }
  });

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
        const temp = gameData.players.white;
        gameData.players.white = gameData.players.black;
        gameData.players.black = temp;
        await roomManager.saveRoom(socket.roomCode, room);
        io.to(socket.roomCode).emit('message-updated', message);
        return;
      }

      const whiteOnline = io.sockets.sockets.has(gameData.players.white.socketId);
      const blackOnline = io.sockets.sockets.has(gameData.players.black.socketId);

      if (!whiteOnline && !blackOnline) {
        const temp = gameData.players.white;
        gameData.players.white = gameData.players.black;
        gameData.players.black = temp;
        await roomManager.saveRoom(socket.roomCode, room);
        io.to(socket.roomCode).emit('message-updated', message);
        return;
      }

      const onlinePlayers = [];
      if (whiteOnline && gameData.players.white.id !== requesterId) onlinePlayers.push(gameData.players.white);
      if (blackOnline && gameData.players.black.id !== requesterId) onlinePlayers.push(gameData.players.black);

      if (onlinePlayers.length === 0) {
        const temp = gameData.players.white;
        gameData.players.white = gameData.players.black;
        gameData.players.black = temp;
        await roomManager.saveRoom(socket.roomCode, room);
        io.to(socket.roomCode).emit('message-updated', message);
        return;
      }

      gameData._pendingSwap = {
        requestedBy: requesterId,
        requesterName: socket.nickname,
        responses: {},
        needed: onlinePlayers.length
      };
      await roomManager.saveRoom(socket.roomCode, room);

      onlinePlayers.forEach(player => {
        io.to(player.socketId).emit('chess-swap-approval-needed', { messageId, requestedBy: socket.nickname });
      });
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
        io.to(message.sender.socketId).emit('chess-swap-declined', { messageId, declinedBy: socket.nickname });
        delete gameData._pendingSwap;
        await roomManager.saveRoom(socket.roomCode, room);
        return;
      }

      const approvalCount = Object.values(gameData._pendingSwap.responses).filter(v => v === true).length;
      if (approvalCount >= gameData._pendingSwap.needed) {
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
      const isCurrentPlayerOnline = currentPlayer && currentPlayer.socketId && io.sockets.sockets.has(currentPlayer.socketId);

      if (!isCurrentPlayerOnline || !currentPlayer?.id) {
        gameData.players[role] = { id: targetId, socketId: targetUserId, name: targetNick };
        await roomManager.saveRoom(socket.roomCode, room);
        io.to(socket.roomCode).emit('message-updated', message);
        return;
      }

      gameData._pendingReplace = {
        role,
        newPlayer: { id: targetId, socketId: targetUserId, name: targetNick },
        requestedBy: requesterId,
        requesterName: socket.nickname
      };
      await roomManager.saveRoom(socket.roomCode, room);

      io.to(currentPlayer.socketId).emit('chess-replace-approval-needed', {
        messageId, role, newPlayerName: targetNick, requestedBy: socket.nickname
      });
      socket.emit('chess-replace-pending', { messageId, role, waitingFor: currentPlayer.name });
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
        io.to(message.sender.socketId).emit('chess-replace-declined', { messageId, declinedBy: socket.nickname });
        delete gameData._pendingReplace;
        await roomManager.saveRoom(socket.roomCode, room);
      }
    } catch (err) { logger.error('chess-replace-response err:', err); }
  });

  // ─── Tetris Handlers ──────────────────────────────────────────────────────

  socket.on('tetris-join', async ({ messageId }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.messageType !== 'game' || message.gameData?.gameType !== 'tetris') return;

      const { gameData } = message;
      if (gameData.status === 'finished') return;

      const joinerId = socket.persistentUserId || socket.id;

      // Reconnecting player1 — just update socketId (handled by join-room re-sync, but guard here too)
      if (gameData.player1?.id === joinerId || gameData.player1?.name === socket.nickname) {
        gameData.player1.socketId = socket.id;
        await roomManager.saveRoom(socket.roomCode, room);
        return;
      }

      // Only allow joining as player2 if slot is open
      if (gameData.player2 || gameData.status !== 'waiting') return;

      gameData.player2 = { id: joinerId, socketId: socket.id, name: socket.nickname };
      gameData.status = 'playing';
      gameData.startedAt = Date.now();

      await roomManager.saveRoom(socket.roomCode, room);
      io.to(socket.roomCode).emit('message-updated', message);
    } catch (err) { logger.error('tetris-join err:', err); }
  });

  socket.on('tetris-state-update', async ({ messageId, score, lines, level, matrix }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.gameData?.gameType !== 'tetris') return;

      const { gameData } = message;
      const isP1 = gameData.player1?.socketId === socket.id || gameData.player1?.id === (socket.persistentUserId || socket.id);
      const role = isP1 ? 'player1' : 'player2';

      if (gameData.scores) gameData.scores[role] = score;

      // Relay board snapshot to the whole room (opponent + spectators)
      io.to(socket.roomCode).emit('tetris-opponent-state', { messageId, role, score, lines, level, matrix });
    } catch (err) { logger.error('tetris-state-update err:', err); }
  });

  socket.on('tetris-garbage', async ({ messageId, count }) => {
    try {
      if (!socket.roomCode || !messageId || !count) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.gameData?.gameType !== 'tetris') return;

      const { gameData } = message;
      const isP1 = gameData.player1?.socketId === socket.id || gameData.player1?.id === (socket.persistentUserId || socket.id);
      const opponent = isP1 ? gameData.player2 : gameData.player1;

      if (opponent?.socketId) {
        io.to(opponent.socketId).emit('tetris-add-garbage', { messageId, count });
      }
    } catch (err) { logger.error('tetris-garbage err:', err); }
  });

  socket.on('tetris-game-over', async ({ messageId }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.gameData?.gameType !== 'tetris') return;

      const { gameData } = message;
      if (gameData.status === 'finished') return;

      // Solo game — no winner, just mark finished
      if (!gameData.player2) {
        gameData.winner = null;
        gameData.status = 'finished';
        gameData.endedAt = Date.now();
        await roomManager.saveRoom(socket.roomCode, room);
        io.to(socket.roomCode).emit('message-updated', message);
        return;
      }

      const loserId = socket.persistentUserId || socket.id;
      const isP1Losing = gameData.player1?.id === loserId || gameData.player1?.socketId === socket.id;
      gameData.winner = isP1Losing ? 'player2' : 'player1';
      gameData.status = 'finished';
      gameData.endedAt = Date.now();

      await roomManager.saveRoom(socket.roomCode, room);
      io.to(socket.roomCode).emit('message-updated', message);
    } catch (err) { logger.error('tetris-game-over err:', err); }
  });

  socket.on('tetris-forfeit', async ({ messageId }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.gameData?.gameType !== 'tetris') return;

      const { gameData } = message;
      if (gameData.status === 'finished') return;

      const forfeitorId = socket.persistentUserId || socket.id;
      const isP1 = gameData.player1?.id === forfeitorId || gameData.player1?.socketId === socket.id;

      if (!gameData.player2) {
        // Solo — just cancel the game
        gameData.status = 'finished';
        gameData.winner = null;
      } else {
        gameData.winner = isP1 ? 'player2' : 'player1';
        gameData.status = 'finished';
      }
      gameData.endedAt = Date.now();

      await roomManager.saveRoom(socket.roomCode, room);
      io.to(socket.roomCode).emit('message-updated', message);
    } catch (err) { logger.error('tetris-forfeit err:', err); }
  });

  socket.on('tetris-solo-reset', async ({ messageId }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.gameData?.gameType !== 'tetris') return;
      const { gameData } = message;
      if (gameData.player2) return; // solo only
      gameData.status = 'playing';
      gameData.winner = null;
      gameData.endedAt = null;
      await roomManager.saveRoom(socket.roomCode, room);
      io.to(socket.roomCode).emit('message-updated', message);
    } catch (err) { logger.error('tetris-solo-reset err:', err); }
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
      
      const room = roomData[socket.roomCode];
      const userRole = room ? (room.userRoles?.[socket.id] || (room.hostId === socket.id ? 'host' : 'user')) : 'user';
      const isAuthorizedModerator = (userRole === 'host' || userRole === 'tier1');

      let shouldDelete = false;

      if (isSender || isAuthorizedModerator) {
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

  socket.on('message-viewed', async ({ messageId }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      await roomManager.markMessageViewed(
        messageId,
        socket.persistentUserId || socket.id,
        socket.roomCode,
        socket.nickname || null
      );
    } catch (error) {
      logger.error('Error marking message viewed:', error);
    }
  });

  socket.on('add-reaction', async ({ messageId, emoji }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      if (!emoji || typeof emoji !== 'string' || emoji.length > 16) return;

      const updatedMessage = await roomManager.addReaction(
        socket.roomCode,
        messageId,
        emoji,
        socket.persistentUserId || socket.id
      );

      if (!updatedMessage) return;

      io.to(socket.roomCode).emit('message-updated', updatedMessage);

      // Only fire the physics event when the emoji was actually added, not toggled off
      const reactorId = socket.persistentUserId || socket.id;
      const wasAdded = Array.isArray(updatedMessage.reactions?.[emoji]) &&
        updatedMessage.reactions[emoji].includes(reactorId);
      if (wasAdded) {
        io.to(socket.roomCode).emit('message-reaction', {
          messageId,
          emoji,
          fromSocketId: socket.id,
          fromNickname: socket.nickname || 'Someone',
        });
      }
    } catch (error) {
      logger.error('Error adding reaction:', error);
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
      // Emit peer-left so remaining clients can rekey their group sender key
      io.to(roomCode).emit('peer-left', { socketId, roomCode });

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

  // ─── Typing Indicators ──────────────────────────────────────
  socket.on('typing', () => {
    if (!socket.roomCode) return;
    socket.to(socket.roomCode).emit('user-typing', {
      nickname: socket.nickname,
      socketId: socket.id,
    });
  });

  socket.on('stop-typing', () => {
    if (!socket.roomCode) return;
    socket.to(socket.roomCode).emit('user-stop-typing', {
      nickname: socket.nickname,
      socketId: socket.id,
    });
  });

  // ─── Live Typing Preview (opt-in ghost text) ────────────────
  socket.on('typing-preview', ({ partial } = {}) => {
    if (!socket.roomCode || typeof partial !== 'string') return;
    socket.to(socket.roomCode).emit('typing-preview-received', {
      partial: partial.slice(0, 500), // safety cap
      nickname: socket.nickname,
      socketId: socket.id,
    });
  });

  // ─── Floating Room Reactions ────────────────────────────────
  socket.on('send-room-reaction', ({ emoji }) => {
    if (!socket.roomCode || !emoji) return;
    socket.to(socket.roomCode).emit('room-reaction', {
      emoji,
      nickname: socket.nickname,
    });
  });

  // ─── Pulse (haptic shake for all devices) ──────────────────
  socket.on('send-pulse', ({ roomCode: pulseRoom }) => {
    if (!socket.roomCode || socket.roomCode !== pulseRoom) return;
    socket.to(socket.roomCode).emit('pulse-received', {
      from: socket.nickname || 'Someone',
    });
  });

  // ─── Message Pinning (host + managers) ───
  socket.on('pin-message', ({ messageId, text, senderNickname }) => {
    if (!socket.roomCode || !messageId) return;
    const rd = roomData[socket.roomCode];
    if (!rd) return;
    const canManage = rd.hostId === socket.id || ['tier1', 'admin', 'mod'].includes(rd.userRoles?.[socket.id]);
    if (!canManage) return;
    const safeText = typeof text === 'string' ? text.slice(0, 500) : '';
    const safeNickname = typeof senderNickname === 'string' ? senderNickname.slice(0, 60) : 'Unknown';
    rd.pinnedMessage = { messageId, text: safeText, senderNickname: safeNickname };
    io.to(socket.roomCode).emit('message-pinned', rd.pinnedMessage);
  });

  socket.on('unpin-message', () => {
    if (!socket.roomCode) return;
    const rd = roomData[socket.roomCode];
    if (!rd) return;
    const canManage = rd.hostId === socket.id || ['tier1', 'admin', 'mod'].includes(rd.userRoles?.[socket.id]);
    if (!canManage) return;
    rd.pinnedMessage = null;
    io.to(socket.roomCode).emit('message-unpinned');
  });

  // ─── Room Forking (host only) ───
  socket.on('fork-room', async ({ targetSocketIds } = {}) => {
    const roomCode = socket.roomCode;
    if (!roomCode || !Array.isArray(targetSocketIds) || targetSocketIds.length === 0) return;
    const rd = roomData[roomCode];
    if (!rd || rd.hostId !== socket.id) return; // host only

    try {
      const parentRoom = await roomManager.getRoom(roomCode);
      const newSettings = {
        password: parentRoom?.settings?.password || '',
        maxUsers: parentRoom?.settings?.maxUsers || 50,
      };
      const newRoomCode = await roomManager.createRoom(newSettings);
      roomData[newRoomCode] = {
        hostId: socket.id,
        lobbyLimit: (newSettings.maxUsers || 50) * 2,
        lobbyCount: 0,
        userRoles: {},
        vibe: rd.vibe || 'default',
        topic: '',
        timer: null,
      };
      // Notify each target
      targetSocketIds.forEach(sid => {
        const target = io.sockets.sockets.get(sid);
        if (target) {
          target.emit('room-fork-invite', {
            newRoomCode,
            fromNickname: socket.nickname || 'Host',
          });
        }
      });
      // Host gets the new room code too
      socket.emit('room-fork-invite', { newRoomCode, fromNickname: socket.nickname || 'Host', isHost: true });
    } catch (err) {
      logger.error('fork-room error:', err);
    }
  });

  // ─── Hot Seat ───
  socket.on('hotSeat-start', ({ targetNickname } = {}) => {
    const rc = socket.roomCode;
    if (!rc || !targetNickname) return;
    const rd = roomData[rc];
    if (!rd || rd.hostId !== socket.id) return;
    rd.hotSeatTarget = targetNickname;
    rd.hotSeatQueue = [];
    io.to(rc).emit('hotSeat-started', { targetNickname });
  });

  socket.on('hotSeat-question', ({ text } = {}) => {
    const rc = socket.roomCode;
    if (!rc || !text || typeof text !== 'string') return;
    const rd = roomData[rc];
    if (!rd?.hotSeatTarget) return;
    // Block the hot-seat subject from submitting questions about themselves
    if (socket.nickname === rd.hotSeatTarget) return;
    const safe = text.trim().slice(0, 200);
    if (!safe) return;
    rd.hotSeatQueue = rd.hotSeatQueue || [];
    rd.hotSeatQueue.push(safe);
    // Broadcast anonymously — no sender info
    io.to(rc).emit('hotSeat-question-received', { text: safe });
  });

  socket.on('hotSeat-next', () => {
    const rc = socket.roomCode;
    if (!rc) return;
    const rd = roomData[rc];
    if (!rd?.hotSeatTarget || !Array.isArray(rd.hotSeatQueue)) return;
    // Only the hot-seat subject or the host may advance to the next question
    if (socket.nickname !== rd.hotSeatTarget && rd.hostId !== socket.id) return;
    const q = rd.hotSeatQueue.shift() || null;
    io.to(rc).emit('hotSeat-next-question', { question: q });
  });

  socket.on('hotSeat-end', () => {
    const rc = socket.roomCode;
    if (!rc) return;
    const rd = roomData[rc];
    if (!rd || rd.hostId !== socket.id) return;
    rd.hotSeatTarget = null;
    rd.hotSeatQueue = [];
    io.to(rc).emit('hotSeat-ended');
  });

  // ─── Code Share — Yjs CRDT relay ────────────────────────────
  socket.on('yjs-update', ({ roomCode: rc, update } = {}) => {
    if (!rc || !Array.isArray(update)) return;
    // Validate socket is in this room
    if (socket.roomCode !== rc) return;
    // Store for late joiners
    if (!roomData[rc]) return;
    if (!roomData[rc].yjsUpdates) roomData[rc].yjsUpdates = [];
    roomData[rc].yjsUpdates.push(update);
    // Relay to all others in room
    socket.to(rc).emit('yjs-update', { update });
  });

  socket.on('yjs-request-state', ({ roomCode: rc } = {}, callback) => {
    if (typeof callback !== 'function') return;
    if (!rc || socket.roomCode !== rc || !roomData[rc]) return callback([]);
    callback(roomData[rc].yjsUpdates || []);
  });

  // ─── Watch Party (synchronized media sharing) ────────────────────────────
  const SAFE_MEDIA_TYPES_WP = new Set(['youtube', 'figma', 'gdrive', 'docs', 'soundcloud']);
  const SAFE_MEDIA_ORIGINS_WP = {
    youtube: /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|youtube-nocookie\.com)\//,
    figma: /^https?:\/\/(www\.)?figma\.com\//,
    gdrive: /^https?:\/\/(www\.|docs\.|drive\.)?google\.com\//,
    docs: /^https?:\/\/(www\.|docs\.|drive\.)?google\.com\//,
    soundcloud: /^https?:\/\/(www\.|w\.|api\.)?soundcloud\.com\//,
  };

  socket.on('media-share', (data) => {
    const rc = socket.roomCode;
    if (!rc) return;
    // Relay encrypted payloads without validation (clients decrypt and validate)
    if ((data?.v === 4 && data?.ct) || (data?.v === 3 && data?.mls)) {
      io.to(rc).emit('media-share', data);
      return;
    }
    const type = typeof data?.type === 'string' ? data.type : '';
    if (!SAFE_MEDIA_TYPES_WP.has(type)) return;
    const url = typeof data?.url === 'string' ? data.url : '';
    if (!url || url.length > 2048) return;
    const lower = url.toLowerCase().trim();
    if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:')) return;
    if (!SAFE_MEDIA_ORIGINS_WP[type]?.test(url)) return;
    if (type === 'youtube' && (!data?.id || !/^[a-zA-Z0-9_-]{11}$/.test(data.id))) return;
    const mediaId = (typeof data?.mediaId === 'string' && data.mediaId.length < 80)
      ? data.mediaId
      : `m-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const mediaItem = {
      mediaId, type,
      id: data?.id || null,
      service: data?.service || null,
      query: data?.query || null,
      url,
      sharedBy: typeof data?.sharedBy === 'string' ? data.sharedBy.substring(0, 30) : 'Someone',
    };
    const rd = roomData[rc];
    if (rd) {
      if (!rd.activeMedia) rd.activeMedia = [];
      if (!rd.activeMedia.some(m => m.mediaId === mediaId)) rd.activeMedia.push(mediaItem);
    }
    io.to(rc).emit('media-share', mediaItem);
  });

  socket.on('media-sync', (data) => {
    const rc = socket.roomCode;
    if (!rc) return;
    socket.to(rc).emit('media-sync', data);
  });

  socket.on('media-close', (data) => {
    const rc = socket.roomCode;
    if (!rc) return;
    const mediaId = data?.mediaId;
    const rd = roomData[rc];
    if (rd?.activeMedia) {
      rd.activeMedia = mediaId
        ? rd.activeMedia.filter(m => m.mediaId !== mediaId)
        : [];
    }
    io.to(rc).emit('media-close', { mediaId });
  });

  socket.on('media-join', () => {
    const rc = socket.roomCode;
    if (!rc) return;
    if (!io._mediaWatchers) io._mediaWatchers = {};
    if (!io._mediaWatchers[rc]) io._mediaWatchers[rc] = new Set();
    io._mediaWatchers[rc].add(socket.id);
    io.to(rc).emit('media-sync-count', { count: io._mediaWatchers[rc].size });
  });

  socket.on('media-leave', () => {
    const rc = socket.roomCode;
    if (!rc) return;
    if (io._mediaWatchers?.[rc]) {
      io._mediaWatchers[rc].delete(socket.id);
      const count = io._mediaWatchers[rc].size;
      if (count === 0) delete io._mediaWatchers[rc];
      else io.to(rc).emit('media-sync-count', { count });
    }
  });

  socket.on('media-request-sync', ({ mediaId } = {}) => {
    const rc = socket.roomCode;
    if (!rc) return;
    socket.to(rc).emit('media-request-sync', { mediaId, requesterId: socket.id });
  });

  socket.on('media-recover-request', (data = {}) => {
    const rc = socket.roomCode;
    if (!rc) return;
    socket.to(rc).emit('media-recover-request', { ...data, requesterId: socket.id });
  });

  socket.on('media-recover-response', (data = {}) => {
    const requesterId = data?.requesterId;
    if (requesterId) io.to(requesterId).emit('media-share', data);
  });

  // ─── Confetti Bomb (rate-limited: 1 per 10 s per socket) ───
  socket.on('send-confetti-bomb', () => {
    if (!socket.roomCode) return;
    const now = Date.now();
    if (now - lastConfettiTime < 10000) return;
    lastConfettiTime = now;
    io.to(socket.roomCode).emit('confetti-bomb', {
      nickname: socket.nickname || 'Someone',
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
    const rawBundles = keyRegistry.getBundlesForRoom(roomCode, socket.id);
    // Annotate each entry with the socket's nickname for key bundle routing
    const bundles = rawBundles.map(entry => ({
      ...entry,
      nickname: io.sockets.sockets.get(entry.socketId)?.nickname || null,
    }));
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

  // ─── Anagram Game Handlers ─────────────────────────────────────────────────
  const WORD_LISTS = {
    easy: ['apple','brave','chess','dance','eagle','flame','grape','house','image','joker','knife','lemon','mango','night','ocean','piano','queen','river','solar','tiger','uncle','vivid','witch','xerox','yacht','zebra'],
    medium: ['bridge','castle','dancer','engine','forest','garden','hunter','island','jungle','knight','ladder','marble','needle','orange','puzzle','quartz','rabbit','shadow','tunnel','unique','violet','walnut','xyster','yellow','zipper'],
    hard: ['abolish','bracket','cabinet','diamond','exhibit','fantasy','granite','harmony','integer','jackpot','kingdom','leopard','machine','network','obscure','pyramid','quantum','railway','science','torpedo','unusual','vortex','walruse','xylohem','zephyrs'],
  };

  function scramble(word) {
    const a = word.split('');
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    const s = a.join('');
    return s === word ? scramble(word) : s;
  }

  socket.on('anagram-join', async ({ messageId }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.gameData?.gameType !== 'anagram') return;
      const gd = message.gameData;
      if (gd.challenger || gd.status !== 'waiting') return;
      const joinerId = socket.persistentUserId || socket.id;
      if (joinerId === gd.host.id) return;
      gd.challenger = { id: joinerId, socketId: socket.id, name: socket.nickname };
      // Start round 1
      const difficulty = 'medium';
      const words = WORD_LISTS[difficulty];
      const word = words[Math.floor(Math.random() * words.length)];
      gd.currentWord = word;
      gd.currentScrambled = scramble(word);
      gd.round = 1;
      gd.status = 'playing';
      gd.startedAt = Date.now();
      gd.roundDeadline = Date.now() + 30000;
      await roomManager.saveRoom(socket.roomCode, room);
      io.to(socket.roomCode).emit('message-updated', message);
    } catch (err) { logger.error('anagram-join err:', err); }
  });

  socket.on('anagram-guess', async ({ messageId, guess }) => {
    try {
      if (!socket.roomCode || !messageId || !guess) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.gameData?.gameType !== 'anagram') return;
      const gd = message.gameData;
      if (gd.winner || gd.status !== 'playing') return;
      const guesser = socket.persistentUserId || socket.id;
      const isHost = gd.host.id === guesser || gd.host.name === socket.nickname;
      const isChallenger = gd.challenger?.id === guesser || gd.challenger?.name === socket.nickname;
      if (!isHost && !isChallenger) return;
      if (guess.toLowerCase().trim() !== gd.currentWord) return;
      // Correct!
      const role = isHost ? 'host' : 'challenger';
      gd.scores[role]++;
      gd.roundWinner = role;
      if (gd.round >= gd.totalRounds || gd.scores[role] >= Math.ceil(gd.totalRounds / 2) + (gd.totalRounds % 2 === 0 ? 1 : 0)) {
        gd.winner = role;
        gd.status = 'finished';
      } else {
        // Next round
        gd.round++;
        const difficulty = 'medium';
        const words = WORD_LISTS[difficulty];
        const word = words[Math.floor(Math.random() * words.length)];
        gd.currentWord = word;
        gd.currentScrambled = scramble(word);
        gd.roundDeadline = Date.now() + 30000;
        gd.roundWinner = null;
      }
      await roomManager.saveRoom(socket.roomCode, room);
      io.to(socket.roomCode).emit('message-updated', message);
    } catch (err) { logger.error('anagram-guess err:', err); }
  });

  socket.on('anagram-solo', async ({ messageId }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.gameData?.gameType !== 'anagram') return;
      const gd = message.gameData;
      if (gd.status !== 'waiting') return;
      const hostId = socket.persistentUserId || socket.id;
      if (gd.host.id !== hostId && gd.host.name !== socket.nickname) return;
      gd.isSolo = true;
      gd.challenger = { id: 'bot', name: 'Bot', isBot: true };
      const words = WORD_LISTS['medium'];
      const word = words[Math.floor(Math.random() * words.length)];
      gd.currentWord = word;
      gd.currentScrambled = scramble(word);
      gd.round = 1;
      gd.status = 'playing';
      gd.startedAt = Date.now();
      gd.roundDeadline = Date.now() + 30000;
      await roomManager.saveRoom(socket.roomCode, room);
      io.to(socket.roomCode).emit('message-updated', message);
    } catch (err) { logger.error('anagram-solo err:', err); }
  });

  // ─── Hangman Game Handlers ──────────────────────────────────────────────────
  const HANGMAN_WORDS = ['algorithm','blueprint','cognition','democracy','evolution','fantastic','geography','hibernate','illusion','journalism','keyboard','lightning','magazine','nitrogen','obsidian','photograph','question','rhythmic','symmetry','technology','umbrella','vibration','wavelength','xenolith','yesterday','zodiac'];

  socket.on('hangman-solo', async ({ messageId }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.gameData?.gameType !== 'hangman') return;
      const gd = message.gameData;
      if (gd.status !== 'waiting') return;
      const hostId = socket.persistentUserId || socket.id;
      if (gd.wordmaster.id !== hostId && gd.wordmaster.name !== socket.nickname) return;
      // Computer picks a random word, player guesses
      const word = HANGMAN_WORDS[Math.floor(Math.random() * HANGMAN_WORDS.length)];
      gd.isSolo = true;
      gd.guesser = { id: hostId, socketId: socket.id, name: socket.nickname };
      gd.wordmaster = { id: 'computer', name: 'Computer', isBot: true };
      gd.currentWord = word;
      gd.wordLength = word.length;
      gd.revealedLetters = Array(word.length).fill(null);
      gd.wrongGuesses = [];
      gd.status = 'playing';
      gd.startedAt = Date.now();
      await roomManager.saveRoom(socket.roomCode, room);
      // Only send word to guesser (same user here, but keep pattern)
      const maskedMessage = { ...message, gameData: { ...gd, currentWord: null } };
      io.to(socket.roomCode).emit('message-updated', maskedMessage);
      io.to(socket.id).emit('hangman-your-word', { messageId, word });
    } catch (err) { logger.error('hangman-solo err:', err); }
  });

  socket.on('hangman-join', async ({ messageId }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.gameData?.gameType !== 'hangman') return;
      const gd = message.gameData;
      if (gd.guesser || gd.status !== 'waiting') return;
      const joinerId = socket.persistentUserId || socket.id;
      if (joinerId === gd.wordmaster.id) return;
      gd.guesser = { id: joinerId, socketId: socket.id, name: socket.nickname };
      gd.status = 'picking'; // wordmaster picks word
      await roomManager.saveRoom(socket.roomCode, room);
      io.to(socket.roomCode).emit('message-updated', message);
    } catch (err) { logger.error('hangman-join err:', err); }
  });

  socket.on('hangman-set-word', async ({ messageId, word }) => {
    try {
      if (!socket.roomCode || !messageId || !word) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.gameData?.gameType !== 'hangman') return;
      const gd = message.gameData;
      const masterId = socket.persistentUserId || socket.id;
      if (gd.wordmaster.id !== masterId && gd.wordmaster.name !== socket.nickname) return;
      if (gd.status !== 'picking' && gd.status !== 'waiting') return;
      const clean = word.toLowerCase().replace(/[^a-z]/g, '');
      if (clean.length < 3 || clean.length > 20) return;
      gd.currentWord = clean;
      gd.wordLength = clean.length;
      gd.revealedLetters = Array(clean.length).fill(null);
      gd.wrongGuesses = [];
      gd.status = 'playing';
      gd.startedAt = Date.now();
      gd.wordForMaster = clean; // only wordmaster sees this
      await roomManager.saveRoom(socket.roomCode, room);
      // Send full state to wordmaster, masked state to others
      const maskedMessage = { ...message, gameData: { ...gd, currentWord: null } };
      io.to(socket.roomCode).emit('message-updated', maskedMessage);
      // Send actual word to wordmaster
      if (gd.wordmaster.socketId) io.to(gd.wordmaster.socketId).emit('hangman-your-word', { messageId, word: clean });
    } catch (err) { logger.error('hangman-set-word err:', err); }
  });

  socket.on('hangman-guess', async ({ messageId, letter }) => {
    try {
      if (!socket.roomCode || !messageId || !letter) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.gameData?.gameType !== 'hangman') return;
      const gd = message.gameData;
      if (gd.winner || gd.status !== 'playing') return;
      const guesserId = socket.persistentUserId || socket.id;
      const isGuesser = gd.guesser?.id === guesserId || gd.guesser?.name === socket.nickname;
      // In solo mode wordmaster is 'computer' — only the guesser can guess; otherwise allow spectators too
      const isSpectator = !gd.isSolo && !isGuesser && gd.wordmaster.id !== guesserId;
      if (!isGuesser && !isSpectator) return;
      const l = letter.toLowerCase();
      if (gd.revealedLetters.includes(l) || gd.wrongGuesses.includes(l)) return;
      const word = gd.wordForMaster || gd.currentWord;
      if (!word) return;
      if (word.includes(l)) {
        gd.revealedLetters = word.split('').map((c, i) => c === l ? l : (gd.revealedLetters[i] || null));
        if (!gd.revealedLetters.includes(null)) {
          gd.winner = 'guesser'; gd.status = 'finished';
        }
      } else {
        gd.wrongGuesses.push(l);
        if (gd.wrongGuesses.length >= gd.maxWrong) { gd.winner = 'wordmaster'; gd.status = 'finished'; }
      }
      await roomManager.saveRoom(socket.roomCode, room);
      io.to(socket.roomCode).emit('message-updated', { ...message, gameData: { ...gd, currentWord: null } });
    } catch (err) { logger.error('hangman-guess err:', err); }
  });

  // ─── Type Sprint Game Handlers ──────────────────────────────────────────────

  socket.on('typesprint-solo', async ({ messageId }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.gameData?.gameType !== 'typesprint') return;
      const gd = message.gameData;
      if (gd.status !== 'waiting') return;
      const p1Id = socket.persistentUserId || socket.id;
      if (gd.player1.id !== p1Id && gd.player1.name !== socket.nickname) return;
      gd.isSolo = true;
      gd.player2 = { id: 'bot', name: 'Bot', isBot: true };
      gd.passage = PASSAGES[Math.floor(Math.random() * PASSAGES.length)];
      gd.status = 'countdown';
      gd.startedAt = Date.now() + 3000;
      gd.progress = { player1: 0, player2: 0 };
      gd.wpm = { player1: 0, player2: 0 };
      await roomManager.saveRoom(socket.roomCode, room);
      io.to(socket.roomCode).emit('message-updated', message);
    } catch (err) { logger.error('typesprint-solo err:', err); }
  });

  const PASSAGES = [
    "The quick brown fox jumps over the lazy dog and runs away into the sunset.",
    "Programming is the art of telling another human being what one wants the computer to do.",
    "To be or not to be that is the question whether tis nobler in the mind to suffer.",
    "All that glitters is not gold often have you heard that told many a man his life hath sold.",
    "The only way to do great work is to love what you do if you have not found it yet keep looking.",
  ];

  socket.on('typesprint-join', async ({ messageId }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.gameData?.gameType !== 'typesprint') return;
      const gd = message.gameData;
      if (gd.player2 || gd.status !== 'waiting') return;
      const joinerId = socket.persistentUserId || socket.id;
      if (joinerId === gd.player1.id) return;
      gd.player2 = { id: joinerId, socketId: socket.id, name: socket.nickname };
      gd.passage = PASSAGES[Math.floor(Math.random() * PASSAGES.length)];
      gd.status = 'countdown';
      gd.startedAt = Date.now() + 3000; // 3s countdown
      gd.progress = { player1: 0, player2: 0 };
      gd.wpm = { player1: 0, player2: 0 };
      await roomManager.saveRoom(socket.roomCode, room);
      io.to(socket.roomCode).emit('message-updated', message);
    } catch (err) { logger.error('typesprint-join err:', err); }
  });

  socket.on('typesprint-progress', async ({ messageId, progress, wpm }) => {
    try {
      if (!socket.roomCode || !messageId) return;
      const room = await roomManager.getRoom(socket.roomCode);
      if (!room) return;
      const message = (room.messages || []).find(m => m.id === messageId);
      if (!message || message.gameData?.gameType !== 'typesprint') return;
      const gd = message.gameData;
      if (gd.winner) return;
      const playerId = socket.persistentUserId || socket.id;
      const isP1 = gd.player1?.id === playerId || gd.player1?.name === socket.nickname;
      const isP2 = gd.player2?.id === playerId || gd.player2?.name === socket.nickname;
      if (!isP1 && !isP2) return;
      const role = isP1 ? 'player1' : 'player2';
      gd.progress[role] = Math.min(100, Math.max(0, progress));
      gd.wpm[role] = wpm || 0;
      if (gd.status === 'countdown' && Date.now() >= gd.startedAt) gd.status = 'playing';
      if (gd.progress[role] >= 100 && !gd.finished[role]) {
        gd.finished[role] = true;
        if (!gd.winner) { gd.winner = role; gd.status = 'finished'; }
      }
      await roomManager.saveRoom(socket.roomCode, room);
      io.to(socket.roomCode).emit('message-updated', message);
    } catch (err) { logger.error('typesprint-progress err:', err); }
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

    // Notify tetris opponents of disconnect and schedule auto-forfeit after 30s
    if (socket.roomCode) {
      try {
        const room = await roomManager.getRoom(socket.roomCode);
        if (room && room.messages) {
          for (const msg of room.messages) {
            if (msg.messageType !== 'game' || msg.gameData?.gameType !== 'tetris') continue;
            const gd = msg.gameData;
            if (gd.status === 'finished') continue;

            const playerId = socket.persistentUserId || socket.id;
            const isP1 = gd.player1?.id === playerId || gd.player1?.socketId === socket.id;
            const isP2 = gd.player2?.id === playerId || gd.player2?.socketId === socket.id;
            if (!isP1 && !isP2) continue;

            const opponent = isP1 ? gd.player2 : gd.player1;
            if (opponent?.socketId) {
              io.to(opponent.socketId).emit('tetris-opponent-disconnected', { messageId: msg.id });
            }

            // Auto-forfeit after 30 seconds if they don't reconnect
            const timeoutKey = playerId;
            const existing = tetrisDisconnectTimeouts.get(timeoutKey);
            if (existing) clearTimeout(existing);

            const handle = setTimeout(async () => {
              tetrisDisconnectTimeouts.delete(timeoutKey);
              try {
                const freshRoom = await roomManager.getRoom(socket.roomCode);
                if (!freshRoom) return;
                const freshMsg = (freshRoom.messages || []).find(m => m.id === msg.id);
                if (!freshMsg || freshMsg.gameData?.status === 'finished') return;
                const freshGd = freshMsg.gameData;
                freshGd.winner = isP1 ? 'player2' : 'player1';
                if (!freshGd.player2) { freshGd.winner = null; }
                freshGd.status = 'finished';
                freshGd.endedAt = Date.now();
                await roomManager.saveRoom(socket.roomCode, freshRoom);
                io.to(socket.roomCode).emit('message-updated', freshMsg);
              } catch (e) { logger.error('tetris auto-forfeit err:', e); }
            }, 30000);

            tetrisDisconnectTimeouts.set(timeoutKey, handle);
          }
        }
      } catch (e) { logger.error('tetris disconnect handler err:', e); }
    }

    // Note: Media watcher cleanup is handled inside handleUserDeparture

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
