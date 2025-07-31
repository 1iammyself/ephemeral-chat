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
const { createClient } = require('redis');

const RoomManager = require('./rooms');
const { 
  generateRandomNickname, 
  sanitizeInput, 
  isValidRoomCode, 
  isValidNickname,
  getTTLOptions 
} = require('./utils');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production'
      ? ['https://ephemeral-chat-7j66.onrender.com', /\.onrender\.com$/, '*']
      : "http://localhost:5173",
    methods: ["GET", "POST"],
    credentials: true
  }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? ['https://ephemeral-chat-7j66.onrender.com', /\.onrender\.com$/, '*']
    : 'http://localhost:5173',
  credentials: true
}));
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
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    redis: redisClient ? 'connected' : 'not connected'
  });
});

app.post('/api/rooms', async (req, res) => {
  try {
    const { messageTTL, password } = req.body;
    
    const settings = {};
    if (messageTTL && getTTLOptions()[messageTTL] !== undefined) {
      settings.messageTTL = getTTLOptions()[messageTTL];
    }
    if (password && typeof password === 'string' && password.length > 0) {
      settings.password = sanitizeInput(password);
    }
    
    const roomCode = await roomManager.createRoom(settings);
    res.json({ roomCode, settings: { messageTTL: settings.messageTTL || 0 } });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
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

// Socket.IO Connection Handling
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);
  
  socket.on('create-room', async (data, callback) => {
    try {
      const { messageTTL, password } = data || {};
      
      const settings = {};
      if (messageTTL && getTTLOptions()[messageTTL] !== undefined) {
        settings.messageTTL = getTTLOptions()[messageTTL];
      }
      if (password && typeof password === 'string' && password.length > 0) {
        settings.password = sanitizeInput(password);
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
      const { roomCode, nickname, password } = data;
      
      if (!isValidRoomCode(roomCode)) {
        return callback({ success: false, error: 'Invalid room code' });
      }
      
      let userNickname = nickname && isValidNickname(nickname) 
        ? sanitizeInput(nickname) 
        : generateRandomNickname();
      
      const user = { socketId: socket.id, nickname: userNickname };
      const result = await roomManager.joinRoom(roomCode, user, password);
      
      if (result.success) {
        socket.join(roomCode);
        socket.roomCode = roomCode;
        socket.nickname = userNickname;
        
        // Send room data to user
        const messages = await roomManager.getMessages(roomCode);
        callback({ 
          success: true, 
          room: result.room, 
          messages,
          nickname: userNickname 
        });
        
        // Notify others
        socket.to(roomCode).emit('user-joined', { 
          nickname: userNickname,
          userCount: result.room.users.length 
        });
        
        console.log(`👤 ${userNickname} joined room ${roomCode}`);
      } else {
        callback(result);
      }
    } catch (error) {
      console.error('Error joining room:', error);
      callback({ success: false, error: 'Failed to join room' });
    }
  });
  
  socket.on('send-message', async (data) => {
    try {
      if (!socket.roomCode) return;
      
      // Rate limiting
      if (!checkRateLimit(socket.id)) {
        socket.emit('error', { message: 'Rate limit exceeded. Please slow down.' });
        return;
      }
      
      const { content } = data;
      if (!content || typeof content !== 'string' || content.trim().length === 0) {
        return;
      }
      
      const message = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        content: sanitizeInput(content.trim()),
        sender: {
          socketId: socket.id,
          nickname: socket.nickname
        },
        timestamp: new Date().toISOString()
      };
      
      await roomManager.addMessage(socket.roomCode, message);
      
      // Broadcast to all users in room
      io.to(socket.roomCode).emit('new-message', message);
      
    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', { message: 'Failed to send message' });
    }
  });
  
  socket.on('disconnect', async () => {
    console.log(`🔌 User disconnected: ${socket.id}`);
    
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
  await initializeRedis();

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Ephemeral Chat server running on port ${PORT}`);
    console.log(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`📡 Server ready to accept connections`);
  });
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
