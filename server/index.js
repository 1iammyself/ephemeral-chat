/**
 * Ephemeral Chat Server
 * Express + Socket.IO server for anonymous, temporary chat rooms
 */

require('dotenv').config();
const express = require('express');
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
  generateInviteLink,
  logger
} = require('./utils');
const { convertAudioToAAC } = require('./utils/audio-converter');

// Initialize Cap.js for proof-of-work CAPTCHA
const cap = new Cap({
  tokens_per_challenge: 1,
  // Use environment variable for secret in production
  secret: process.env.CAP_SECRET || 'ephemeral-chat-cap-secret-change-in-production'
});

// Initialize in-memory storage
logger.info('🔌 Using in-memory storage for rooms and messages');

async function initializeServer() {
  logger.info('🚀 Starting server with in-memory storage...');
  // Initialize Redis if configured
  await initializeRedis();
  logger.info('✅ Server initialized');
}

async function initializeRedis() {
  try {
    if (process.env.REDIS_URL) {
      const redisClient = createClient({ url: process.env.REDIS_URL });
      await redisClient.connect();
      logger.info('✅ Connected to Redis');
      return redisClient;
    } else {
      logger.info('⚠️  Redis not configured, using in-memory storage');
    }
  } catch (error) {
    logger.error('⚠️  Redis connection failed, using in-memory storage:', error.message);
  }
}

const app = express();
const server = http.createServer(app);

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Middleware for Safari Audio compatibility
app.use((req, res, next) => {
  if (req.path.endsWith('.mp4')) {
    res.setHeader('Content-Type', 'audio/mp4');
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'no-store');
  }
  next();
});

// Detect environment

// Always use a whitelist for CORS, even in development
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [];

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
  maxAge: 86400 // 24 hours
};

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
  allowEIO3: true, // Enable Socket.IO v3 compatibility
  perMessageDeflate: false, // Disable to prevent Base64 corruption
  maxHttpBufferSize: 1e7 // 10MB to accommodate large audio/image strings
});

const PORT = process.env.PORT || 8000;

// Apply JSON middleware
app.use(express.json());

// Serve static files from the client build directory
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
} else {
  // In development, serve from client directory
  app.use(express.static(path.join(__dirname, '../client')));
}

// Rate limiting storage
const rateLimits = new Map();

// Room metadata for Lobby/Host logic
const roomData = {}; // { [roomId]: { hostId: string, lobbyLimit: number, lobbyCount: number } }

// Initialize Redis client (optional)
let redisClient = null;
let roomManager;
let securityManager;

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
  securityManager = new SecurityManager();

  // Periodic cleanup for security manager
  setInterval(() => {
    securityManager.cleanup();
  }, 60 * 60 * 1000); // Every hour
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
    console.error('Error validating invite token:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// Cap.js API endpoints for proof-of-work CAPTCHA
app.post('/api/cap/challenge', async (req, res) => {
  // console.log('Received Cap challenge request');
  try {
    const challenge = await cap.createChallenge();
    // console.log('Generated challenge:', challenge);
    res.json(challenge);
  } catch (error) {
    console.error('Error generating Cap challenge:', error);
    res.status(500).json({ error: 'Failed to generate challenge' });
  }
});

app.post('/api/cap/redeem', async (req, res) => {
  // console.log('Received Cap redeem request');
  // console.log('Request body:', req.body);
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

    // console.log('Verification result:', result);

    // If result is an object, send it directly. If boolean, wrap it.
    if (typeof result === 'object') {
      res.json(result);
    } else {
      res.json({ success: result });
    }
  } catch (error) {
    console.error('Error redeeming Cap token:', error);
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

    // Generate the invite link using the generateInviteLink method
    const invite = await roomManager.generateInviteLink(roomCode, {
      isPermanent: false,
      expiryMs: 5 * 60 * 1000 // 5 minutes
    });

    res.json({
      success: true,
      inviteLink: invite.url,
      expiresIn: '5 minutes'
    });

  } catch (error) {
    console.error('Error generating invite:', error);
    res.status(500).json({
      error: 'Failed to generate invite',
      details: error.message
    });
  }
});

app.post('/api/rooms', async (req, res) => {
  try {
    const { messageTTL, password, maxUsers, capToken } = req.body;

    // console.log('HTTP room creation request:', { messageTTL, password, maxUsers, hasCapToken: !!capToken });

    // Validate Cap token (proof-of-work verification)
    if (capToken) {
      const isValid = await cap.validateToken(capToken);
      if (!isValid) {
        console.error('Invalid Cap token');
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

    const roomCode = await roomManager.createRoom(settings);
    res.json({ success: true, roomCode });
  } catch (error) {
    console.error('Error creating room via HTTP:', error);
    res.status(500).json({ error: 'Failed to create room' });
  }
});



/**
 * Exchange an invite token for room credentials
 * GET /api/invite/:token
 */
app.get('/api/invite/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const roomCredentials = await roomManager.validateInviteToken(token);

    res.json({
      success: true,
      ...roomCredentials
    });

  } catch (error) {
    logger.error('Error validating invite token:', error);
    res.status(400).json({
      error: 'Invalid or expired invite token',
      details: error.message
    });
  }
});

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
    const msgResult = roomManager.getMessageById(messageId);

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
    const mimeType = message.content.split(';')[0].split(':')[1];

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'no-store');
    res.send(imgBuffer);

  } catch (error) {
    logger.error('Error revealing image:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

io.on('connection', (socket) => {
  // logger.info(`🔌 User connected: ${socket.id}`);

  socket.on('create-room', async (data, callback) => {
    try {
      const { messageTTL, password, maxUsers } = data || {};

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

      const roomCode = await roomManager.createRoom(settings);

      // Initialize room metadata for Lobby/Host logic
      roomData[roomCode] = {
        hostId: socket.id,
        lobbyLimit: (settings.maxUsers || 50) * 2, // Default 2x max users
        lobbyCount: 0
      };

      callback({ success: true, roomCode });
    } catch (error) {
      logger.error('Error creating room:', error);
      callback({ success: false, error: 'Failed to create room' });
    }
  });

  // Knock-to-Join Logic
  socket.on('knock', ({ roomCode, nickname, password, inviteToken, capToken }) => {
    // Reject clearly unsafe room codes that could lead to prototype pollution
    if (
      typeof roomCode !== 'string' ||
      roomCode === '__proto__' ||
      roomCode === 'constructor' ||
      roomCode === 'prototype'
    ) {
      return socket.emit('knock-denied', { reason: 'Invalid room code' });
    }

    // 1. Check if room exists in our metadata
    let room = roomData[roomCode];

    // Check if room exists in socket adapter (active room)
    const socketRoom = io.sockets.adapter.rooms.get(roomCode);
    const userCount = socketRoom ? socketRoom.size : 0;

    // If room is empty or doesn't exist, user becomes host automatically
    if (userCount === 0) {
      // Initialize roomData if missing
      if (!room) {
        roomData[roomCode] = {
          hostId: socket.id,
          lobbyLimit: 100, // Default
          lobbyCount: 0
        };
      } else {
        room.hostId = socket.id;
      }

      // Auto-approve
      return socket.emit('knock-approved', { isHost: true });
    }

    // If room exists but we don't have metadata (e.g. server restart or API creation)
    if (!room) {
      // Pick the first user as host
      const firstUser = Array.from(socketRoom)[0];
      room = {
        hostId: firstUser,
        lobbyLimit: 100,
        lobbyCount: 0
      };
      roomData[roomCode] = room;
    }

    // 2. Check Lobby Limit
    if (room.lobbyCount >= room.lobbyLimit) {
      return socket.emit('knock-denied', { reason: 'Lobby is full' });
    }

    // 3. Notify Host
    const hostId = room.hostId;
    const hostSocket = io.sockets.sockets.get(hostId);

    if (!hostSocket) {
      // Host might have disconnected without us knowing?
      // Trigger handover logic or just let them in?
      // Let's try to find a new host
      const remainingMembers = Array.from(socketRoom || []);
      if (remainingMembers.length > 0) {
        room.hostId = remainingMembers[0];
        io.to(room.hostId).emit('promoted-to-host');
        io.to(room.hostId).emit('user-knocking', {
          socketId: socket.id,
          nickname: nickname
        });
      } else {
        // No one left, they become host
        room.hostId = socket.id;
        return socket.emit('knock-approved', { isHost: true });
      }
    } else {
      room.lobbyCount++;
      hostSocket.emit('user-knocking', {
        socketId: socket.id,
        nickname: nickname
      });
    }

    socket.emit('knock-pending');
  });

  socket.on('approve-guest', ({ guestId, roomCode }) => {
    // Verify requester is host
    if (roomData[roomCode]?.hostId !== socket.id) return;

    const guestSocket = io.sockets.sockets.get(guestId);
    if (guestSocket) {
      if (roomData[roomCode].lobbyCount > 0) roomData[roomCode].lobbyCount--;
      guestSocket.emit('knock-approved', { isHost: false });
    }
  });

  socket.on('deny-guest', ({ guestId, roomCode }) => {
    // Verify requester is host
    if (roomData[roomCode]?.hostId !== socket.id) return;

    const guestSocket = io.sockets.sockets.get(guestId);
    if (guestSocket) {
      if (roomData[roomCode].lobbyCount > 0) roomData[roomCode].lobbyCount--;
      guestSocket.emit('knock-denied', { reason: 'Host denied entry' });
    }
  });

  socket.on('join-room', async (data, callback) => {
    try {
      const { roomCode, nickname, password, inviteToken, capToken } = data;
      const userId = socket.id; // Use socket ID as user ID

      // Validate credentials
      const validation = authUtils.validateCredentials({ roomCode, password, nickname });
      if (!validation.valid) {
        logger.error(`Invalid credentials: ${validation.errors.join(', ')}`);
        return callback({ success: false, error: validation.errors[0] });
      }

      // Verify Cap token (proof-of-work verification)
      if (capToken) {
        const isValid = await cap.validateToken(capToken);
        if (!isValid) {
          logger.error(`Invalid Cap token for room ${roomCode}`);
          return callback({ success: false, error: 'Verification failed. Please try again.' });
        }
      }

      // Check if user is locked out due to failed attempts
      const lockStatus = securityManager.isLocked(socket.id);
      if (lockStatus.locked) {
        const remainingTime = Math.ceil((lockStatus.lockedUntil - Date.now()) / 1000 / 60);
        return callback({
          success: false,
          error: `Too many failed attempts. Please try again in ${remainingTime} minutes.`
        });
      }

      if (!isValidRoomCode(roomCode)) {
        logger.error(`Invalid room code format: ${roomCode}`);
        return callback({ success: false, error: 'Invalid room code format' });
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
        socket.roomCode = roomCode;
        socket.nickname = userNickname;

        // Register user activity and start inactivity timer
        securityManager.registerUserActivity(socket.id, userId, roomCode, (socketId, userId, roomCode) => {
          // logger.info(`⏰ User ${userId} timed out, disconnecting...`);
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit('inactivity-timeout', {
              message: 'You have been disconnected due to inactivity'
            });
            socket.disconnect(true);
          }
        });

        // Send room data to user
        // Pass socket.id to filter private messages correctly
        const messages = await roomManager.getMessages(roomCode, socket.id);
        callback({
          success: true,
          room: result.room,
          messages,
          nickname: userNickname,
          isInviteOnly: result.room.settings?.isInviteOnly || false,
          inactivityTimeoutMs: securityManager.INACTIVITY_TIMEOUT_MS
        });

        // Notify others
        socket.to(roomCode).emit('user-joined', {
          user: {
            socketId: socket.id,
            id: socket.id,
            nickname: userNickname
          },
          roomUsers: result.room.users
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

      // Support for text, image and audio messages
      const { content, messageType = 'text', isViewOnce = false, imageData, recipients = [] } = data;

      // For text messages, validate content
      if (messageType === 'text') {
        if (!content || typeof content !== 'string' || content.trim().length === 0) {
          return;
        }
      }

      // For image messages, validate imageData
      if (messageType === 'image') {
        if (!imageData || typeof imageData !== 'string' || !imageData.startsWith('data:image/')) {
          socket.emit('error', { message: 'Invalid image data' });
          return;
        }
        // Check image size (max 5MB)
        const base64Size = imageData.length * 0.75; // Approximate size in bytes
        if (base64Size > 5 * 1024 * 1024) {
          socket.emit('error', { message: 'Image too large. Maximum size is 5MB.' });
          return;
        }
      }

      // For audio messages, validate content
      if (messageType === 'audio') {
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

      let messageContent;
      if (messageType === 'image') {
        messageContent = imageData;
      } else if (messageType === 'audio') {
        try {
          // Convert audio to AAC
          // logger.info('Converting audio to AAC...');
          messageContent = await convertAudioToAAC(content);
          // logger.info('Audio conversion successful');
        } catch (error) {
          logger.error('Audio conversion failed:', error);
          socket.emit('error', { message: 'Failed to process audio message' });
          return;
        }
      } else {
        messageContent = sanitizeInput(content.trim());
      }

      const message = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content: messageContent,
        messageType,
        isViewOnce,
        recipients, // Store recipients
        hasBeenViewed: false,
        sender: {
          socketId: socket.id,
          nickname: socket.nickname
        },
        timestamp: new Date().toISOString()
      };

      // DEBUG: Log message details
      if (messageType === 'image') {
        // logger.info(`📷 Image message created - ID: ${message.id}, content length: ${message.content?.length}`);
      }

      // Initialize viewedBy array for view-once messages
      if (isViewOnce) {
        message.viewedBy = [];
      }

      await roomManager.addMessage(socket.roomCode, message);

      // Broadcast logic
      if (recipients && recipients.length > 0) {
        // Targeted delivery

        // 1. Send to sender (so they see their own message)
        socket.emit('new-message', message);

        // 2. Send to each recipient
        recipients.forEach(recipientId => {
          io.to(recipientId).emit('new-message', message);
        });

      } else {
        // Broadcast to all users in room (default)
        io.to(socket.roomCode).emit('new-message', message);
      }

    } catch (error) {
      logger.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle message viewed events (for view-once images)
  socket.on('message-viewed', async ({ messageId }) => {
    try {
      if (!socket.roomCode) return;

      // logger.info(`👁️ Message ${messageId} viewed by ${socket.nickname}`);

      // Mark message as viewed in room manager
      // Use socket.id as the unique identifier for the session
      await roomManager.markMessageViewed(messageId, socket.id);

    } catch (error) {
      logger.error('Error marking message as viewed:', error);
    }
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

  // Explicit delete for view-once audio after first play completion
  socket.on('delete-message', async ({ messageId }) => {
    try {
      if (!socket.roomCode || !messageId) return;

      const removed = await roomManager.removeMessage(socket.roomCode, messageId);
      if (removed) {
        io.to(socket.roomCode).emit('message-deleted', { messageId });
      }
    } catch (error) {
      logger.error('Error deleting message:', error);
    }
  });

  // WebRTC Call Signaling Events

  // Handle call offer
  socket.on('call-offer', (data) => {
    if (!socket.roomCode) return;

    // logger.info(`📞 Call offer from ${socket.nickname} (${socket.id}) in room ${socket.roomCode}`);

    const payload = {
      ...data,
      fromNickname: socket.nickname,
      fromSocketId: socket.id
    };

    if (data.to) {
      // Targeted offer
      io.to(data.to).emit('call-offer', payload);
    } else {
      // Broadcast offer to other participants in the room (legacy/group behavior)
      socket.to(socket.roomCode).emit('call-offer', payload);
    }
  });

  // Handle call answer
  socket.on('call-answer', (data) => {
    if (!socket.roomCode) return;

    // logger.info(`📞 Call answer from ${socket.nickname} (${socket.id}) in room ${socket.roomCode}`);

    const payload = {
      ...data,
      fromNickname: socket.nickname,
      fromSocketId: socket.id
    };

    if (data.to) {
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
      io.to(data.to).emit('call-ice-candidate', payload);
    } else {
      socket.to(socket.roomCode).emit('call-ice-candidate', payload);
    }
  });

  // Handle call rejected
  socket.on('call-rejected', (data) => {
    if (!socket.roomCode) return;

    // logger.info(`📞 Call rejected by ${socket.nickname} in room ${socket.roomCode}`);

    const payload = {
      ...data,
      rejectedBy: socket.nickname,
      fromSocketId: socket.id
    };

    if (data.to) {
      io.to(data.to).emit('call-rejected', payload);
    } else {
      socket.to(socket.roomCode).emit('call-rejected', payload);
    }
  });

  // Handle call ended
  socket.on('call-ended', (data) => {
    if (!socket.roomCode) return;

    // logger.info(`📞 Call ended by ${socket.nickname} in room ${socket.roomCode}`);

    const payload = {
      ...data,
      endedBy: socket.nickname,
      fromSocketId: socket.id
    };

    if (data.to) {
      io.to(data.to).emit('call-ended', payload);
    } else {
      socket.to(socket.roomCode).emit('call-ended', payload);
    }
  });

  socket.on('disconnect', async () => {
    // logger.info(`🔌 User disconnected: ${socket.id}`);

    // Host Handover Logic
    if (socket.roomCode) {
      const room = roomData[socket.roomCode];
      if (room && room.hostId === socket.id) {
        // Host is leaving
        const socketRoom = io.sockets.adapter.rooms.get(socket.roomCode);
        const remainingMembers = Array.from(socketRoom || []).filter(id => id !== socket.id);

        if (remainingMembers.length > 0) {
          // Promote next user
          const newHostId = remainingMembers[0];
          room.hostId = newHostId;
          io.to(newHostId).emit('promoted-to-host');
          // logger.info(`Host handover in room ${socket.roomCode} to ${newHostId}`);
        } else {
          // Room empty
          delete roomData[socket.roomCode];
        }
      }
    }

    // Clear user activity tracking
    securityManager.clearUserActivity(socket.id);

    // Invalidate all sessions for this socket
    securityManager.invalidateSocketSessions(socket.id);

    if (socket.roomCode) {
      await roomManager.leaveRoom(socket.roomCode, socket.id);

      // Notify others
      socket.to(socket.roomCode).emit('user-left', {
        nickname: socket.nickname,
        socketId: socket.id
      });

      // logger.info(`👤 ${socket.nickname} left room ${socket.roomCode}`);
    }

    // Clean up rate limiting
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
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer().catch(logger.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('🛑 Shutting down server...');
  if (redisClient) {
    await redisClient.quit();
  }
  server.close(() => {
    logger.info('✅ Server shut down gracefully');
    process.exit(0);
  });
});
