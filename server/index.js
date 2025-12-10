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
const {
  generateRandomNickname,
  sanitizeInput,
  isValidRoomCode,
  isValidNickname,
  getTTLOptions,
  generateInviteLink
} = require('./utils');

// Initialize Cap.js for proof-of-work CAPTCHA
const cap = new Cap({
  tokens_per_challenge: 1,
  // Use environment variable for secret in production
  secret: process.env.CAP_SECRET || 'ephemeral-chat-cap-secret-change-in-production'
});

// Initialize in-memory storage
console.log('🔌 Using in-memory storage for rooms and messages');

async function initializeServer() {
  console.log('🚀 Starting server with in-memory storage...');
  // Initialize Redis if configured
  await initializeRedis();
  console.log('✅ Server initialized');
}

async function initializeRedis() {
  try {
    if (process.env.REDIS_URL) {
      const redisClient = createClient({ url: process.env.REDIS_URL });
      await redisClient.connect();
      console.log('✅ Connected to Redis');
      return redisClient;
    } else {
      console.log('⚠️  Redis not configured, using in-memory storage');
    }
  } catch (error) {
    console.log('⚠️  Redis connection failed, using in-memory storage:', error.message);
  }
}

const app = express();
const server = http.createServer(app);

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Detect environment
const isProduction = process.env.NODE_ENV === 'production';
const isRender = process.env.RENDER === 'true';

// Allowed origins can be provided as a comma-separated list via env
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['https://ephemeral-chat-7j66.onrender.com'];

// Configure CORS options
const getCorsOptions = () => {
  // Allow all origins in development
  if (!isProduction) {
    return {
      origin: true, // Reflect the request origin
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
      maxAge: 86400 // 24 hours
    };
  }

  // In production, use the environment-configured allowedOrigins array
  return {
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('onrender.com')) {
        return callback(null, true);
      }

      callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'X-Foo', 'X-Bar'],
    maxAge: 86400 // 24 hours
  };
};

// Get CORS options
const corsOptions = getCorsOptions();

// Apply CORS middleware to Express
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Configure WebSocket with CORS and additional settings
const io = socketIo(server, {
  cors: {
    origin: (origin, callback) => {
      // Allow all in development
      if (!isProduction) return callback(null, true);

      // In production, check against the environment-configured allowedOrigins
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1 || origin.includes('onrender.com')) {
        return callback(null, true);
      }

      callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowUpgrades: true,
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  cookie: false,
  serveClient: false,
  allowEIO3: true, // Enable Socket.IO v3 compatibility
  perMessageDeflate: {
    threshold: 1024, // 1KB
    zlibDeflateOptions: {
      chunkSize: 16 * 1024,
    },
  }
});

const PORT = process.env.PORT || 3001;

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

// Initialize Redis client (optional)
let redisClient = null;
let roomManager;
let securityManager;

async function initializeRedis() {
  try {
    if (process.env.REDIS_URL) {
      redisClient = createClient({ url: process.env.REDIS_URL });
      await redisClient.connect();
      console.log('✅ Connected to Redis');
    } else {
      console.log('⚠️  Redis not configured, using in-memory storage');
    }
  } catch (error) {
    console.log('⚠️  Redis connection failed, using in-memory storage:', error.message);
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

// Health check endpoint for Render
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// REST API Routes
app.get('/api/invite/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { roomCode } = req.query; // Optional room code to validate against

    console.log(`Validating invite token: ${token} for room: ${roomCode || 'any'}`);

    const result = await roomManager.validateInviteToken(token, roomCode || null, false);

    if (result.valid) {
      console.log(`Token validation successful for room ${result.roomCode}`);
      res.json({
        success: true,
        roomCode: result.roomCode,
        requiresPassword: result.room?.settings?.passwordHash ? true : false,
        isPermanent: result.isPermanent
      });
    } else {
      console.log('Token validation failed:', result.error);
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
  console.log('Received Cap challenge request');
  try {
    const challenge = await cap.createChallenge();
    console.log('Generated challenge:', challenge);
    res.json(challenge);
  } catch (error) {
    console.error('Error generating Cap challenge:', error);
    res.status(500).json({ error: 'Failed to generate challenge' });
  }
});

app.post('/api/cap/redeem', async (req, res) => {
  console.log('Received Cap redeem request');
  console.log('Request body:', req.body);
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

    console.log('Verification result:', result);

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

    console.log('HTTP room creation request:', { messageTTL, password, maxUsers, hasCapToken: !!capToken });

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
    console.error('Error validating invite token:', error);
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
    console.error('Error checking room:', error);
    res.status(500).json({ error: 'Failed to check room' });
  }
});

io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  socket.on('create-room', async (data, callback) => {
    try {
      const { messageTTL, password, maxUsers } = data || {};

      console.log('Creating room with data:', { messageTTL, password, maxUsers });

      const settings = {};
      if (messageTTL && getTTLOptions()[messageTTL] !== undefined) {
        settings.messageTTL = getTTLOptions()[messageTTL];
      }
      if (password && typeof password === 'string' && password.length > 0) {
        settings.password = sanitizeInput(password);
      }
      if (maxUsers && typeof maxUsers === 'number' && maxUsers >= 1 && maxUsers <= 200) {
        settings.maxUsers = maxUsers;
        console.log('Setting maxUsers to:', maxUsers);
      } else {
        console.log('Invalid or missing maxUsers, using default');
      }

      const roomCode = await roomManager.createRoom(settings);
      callback({ success: true, roomCode });
    } catch (error) {
      console.error('Error creating room:', error);
      callback({ success: false, error: 'Failed to create room' });
    }
  });

  socket.on('join-room', async (data, callback) => {
    try {
      const { roomCode, nickname, password, inviteToken, capToken } = data;
      const userId = socket.id; // Use socket ID as user ID

      // Validate credentials
      const validation = authUtils.validateCredentials({ roomCode, password, nickname });
      if (!validation.valid) {
        console.error(`Invalid credentials: ${validation.errors.join(', ')}`);
        return callback({ success: false, error: validation.errors[0] });
      }

      // Verify Cap token (proof-of-work verification)
      if (capToken) {
        const isValid = await cap.validateToken(capToken);
        if (!isValid) {
          console.error(`Invalid Cap token for room ${roomCode}`);
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
        console.error(`Invalid room code format: ${roomCode}`);
        return callback({ success: false, error: 'Invalid room code format' });
      }

      // Validate and sanitize nickname
      let userNickname = nickname && isValidNickname(nickname)
        ? sanitizeInput(nickname)
        : generateRandomNickname();

      console.log(`User ${userNickname} (${socket.id}) attempting to join room ${roomCode} with token:`, inviteToken || 'none');

      // First, validate the invite token if provided (don't consume it yet)
      if (inviteToken) {
        console.log(`Validating invite token for room ${roomCode}`);
        const tokenValidation = await roomManager.validateInviteToken(inviteToken, roomCode, false);

        if (!tokenValidation.valid) {
          console.error('Invalid or expired invite token:', tokenValidation.error);
          return callback({
            success: false,
            error: tokenValidation.error || 'Invalid or expired invite token'
          });
        }

        console.log(`Token validation successful for room ${roomCode}`);
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

        console.log(`User ${userNickname} (${socket.id}) successfully joined room ${roomCode}`);
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.nickname = userNickname;

        // Register user activity and start inactivity timer
        securityManager.registerUserActivity(socket.id, userId, roomCode, (socketId, userId, roomCode) => {
          console.log(`⏰ User ${userId} timed out, disconnecting...`);
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit('inactivity-timeout', {
              message: 'You have been disconnected due to inactivity'
            });
            socket.disconnect(true);
          }
        });

        // Send room data to user
        const messages = await roomManager.getMessages(roomCode);
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
          nickname: userNickname,
          userCount: result.room.users.length
        });

        console.log(`👤 ${userNickname} joined room ${roomCode}`);
      } else if (result.redirectRoomCode) {
        // Handle redirect to a different room based on the token
        console.log(`Redirecting user to room ${result.redirectRoomCode}`);
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
        console.error(`Failed to join room ${roomCode}:`, result.error);

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
      console.error('Error joining room:', error);
      callback({ success: false, error: 'Failed to join room' });
    }
  });

  socket.on('send-message', async (data) => {
    try {
      if (!socket.roomCode) return;

      // Update user activity
      securityManager.updateUserActivity(socket.id, (socketId, userId, roomCode) => {
        console.log(`⏰ User ${userId} timed out, disconnecting...`);
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

      // Support for text and image messages
      const { content, messageType = 'text', isViewOnce = false, imageData } = data;

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

      const message = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content: messageType === 'image' ? imageData : sanitizeInput(content.trim()),
        messageType,
        isViewOnce,
        hasBeenViewed: false,
        sender: {
          socketId: socket.id,
          nickname: socket.nickname
        },
        timestamp: new Date().toISOString()
      };

      // DEBUG: Log image message details
      if (messageType === 'image') {
        console.log(`📷 Image message created - ID: ${message.id}, content length: ${message.content?.length}, starts with: ${message.content?.substring(0, 50)}`);
      }

      await roomManager.addMessage(socket.roomCode, message);

      // Broadcast to all users in room
      io.to(socket.roomCode).emit('new-message', message);

    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });

  // Handle message viewed events (for view-once images)
  socket.on('message-viewed', async ({ messageId }) => {
    try {
      if (!socket.roomCode) return;

      console.log(`👁️ Message ${messageId} viewed by ${socket.nickname}`);

      // Mark message as viewed in room manager
      const result = await roomManager.markMessageViewed(messageId);

      if (result) {
        // Broadcast to all users in room that message was viewed
        io.to(socket.roomCode).emit('message-viewed', {
          messageId,
          viewedBy: socket.nickname
        });
      }
    } catch (error) {
      console.error('Error marking message as viewed:', error);
    }
  });

  // WebRTC Call Signaling Events

  // Handle call offer
  socket.on('call-offer', (data) => {
    if (!socket.roomCode) return;

    console.log(`📞 Call offer from ${socket.nickname} (${socket.id}) in room ${socket.roomCode}`);
    console.log(`   Target: ${data.targetNickname}, Video: ${data.includeVideo}`);

    // Broadcast offer to other participants in the room
    socket.to(socket.roomCode).emit('call-offer', {
      ...data,
      fromNickname: socket.nickname,
      fromSocketId: socket.id
    });
  });

  // Handle call answer
  socket.on('call-answer', (data) => {
    if (!socket.roomCode) return;

    console.log(`📞 Call answer from ${socket.nickname} (${socket.id}) in room ${socket.roomCode}`);

    // Broadcast answer to other participants
    socket.to(socket.roomCode).emit('call-answer', {
      ...data,
      fromNickname: socket.nickname
    });
  });

  // Handle ICE candidate exchange
  socket.on('call-ice-candidate', (data) => {
    if (!socket.roomCode) return;

    // Forward ICE candidate to other participants
    socket.to(socket.roomCode).emit('call-ice-candidate', {
      ...data,
      fromSocketId: socket.id
    });
  });

  // Handle call rejected
  socket.on('call-rejected', (data) => {
    if (!socket.roomCode) return;

    console.log(`📞 Call rejected by ${socket.nickname} in room ${socket.roomCode}`);

    // Notify caller that call was rejected
    socket.to(socket.roomCode).emit('call-rejected', {
      ...data,
      rejectedBy: socket.nickname
    });
  });

  // Handle call ended
  socket.on('call-ended', (data) => {
    if (!socket.roomCode) return;

    console.log(`📞 Call ended by ${socket.nickname} in room ${socket.roomCode}`);

    // Notify other participants that call ended
    socket.to(socket.roomCode).emit('call-ended', {
      ...data,
      endedBy: socket.nickname
    });
  });

  socket.on('disconnect', async () => {
    console.log(`🔌 User disconnected: ${socket.id}`);

    // Clear user activity tracking
    securityManager.clearUserActivity(socket.id);

    // Invalidate all sessions for this socket
    securityManager.invalidateSocketSessions(socket.id);

    if (socket.roomCode) {
      await roomManager.leaveRoom(socket.roomCode, socket.id);

      // Notify others
      socket.to(socket.roomCode).emit('user-left', {
        nickname: socket.nickname
      });

      console.log(`👤 ${socket.nickname} left room ${socket.roomCode}`);
    }

    // Clean up rate limiting
    rateLimits.delete(socket.id);
  });
});

// Catch-all route to serve index.html for client-side routing
app.get('*', (req, res) => {
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
      console.log(`🚀 Ephemeral Chat server running on port ${PORT}`);
      console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`📡 Server ready to accept connections`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer().catch(console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 Shutting down server...');
  if (redisClient) {
    await redisClient.quit();
  }
  server.close(() => {
    console.log('✅ Server shut down gracefully');
    process.exit(0);
  });
});
