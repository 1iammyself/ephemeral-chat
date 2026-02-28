/**
 * Room management for Ephemeral Chat
 * Handles both in-memory storage (MVP) and Redis storage (enhanced)
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { generateRoomCode, sanitizeInput, logger } = require('./utils');
const { WORDLIST } = require('./wordlist');
const {
  getPersistenceMode,
  isValidPersistenceMode,
  getLifetimeMs,
  MAX_ROOMS_PER_CREATOR
} = require('./utils/persistence');

class RoomManager {
  constructor(redisClient = null) {
    this.redis = redisClient;
    this.rooms = new Map(); // In-memory fallback
    this.roomTimers = new Map(); // For room expiry timers
    this.ROOM_EXPIRY_MS = parseInt(process.env.ROOM_EXPIRY_MINUTES || 10) * 60 * 1000;
    // Invite token expiry - increased default for mobile users who may take longer to join
    this.INVITE_TOKEN_EXPIRY_MS = parseInt(process.env.INVITE_TOKEN_EXPIRY_MINUTES || 30) * 60 * 1000; // Default 30 minutes
    this.ROOM_DEFAULT_LIFETIME_MS = 2 * 60 * 60 * 1000; // 2 hours default room lifetime
    this.ROOM_DEFAULT_LIFETIME_MINUTES = 120; // 2 hours in minutes

    // In-memory storage for invite tokens
    this.inviteTokens = new Map(); // token -> { roomCode, timeoutId, isPermanent: boolean }
    this.roomToTokens = new Map(); // roomCode -> Set of tokens (for cleanup)
    this._io = null; // socket.io reference for broadcasts
    this.joinLocks = new Map(); // roomCode -> Promise (Mutex for joining)
    this.viewTokens = new Map(); // token -> { messageId, userId, expiresAt, watermarkSeed }

    // Creator tracking for persistent rooms
    this.creatorRooms = new Map(); // creatorId -> Set([roomCodes])
    this.participatedRooms = new Map(); // userId -> Set([roomCodes]) (for "Recent Rooms")
    this.MAX_SERVER_ROOMS = 1500; // Server-wide limit for persistent rooms

    // Start garbage collector for in-memory messages
    if (!this.redis) {
      this.cleanupInterval = setInterval(() => this.pruneExpiredMessages(), 60 * 1000);
    }

    // Periodic cleanup for expired persistent rooms
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredRooms();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Create a new room
   * @param {Object} settings - Room settings {messageTTL, password, creatorId, persistenceMode}
   * @returns {Promise<string>} Room code
   */
  async createRoom(settings = {}) {
    const creatorId = settings.creatorId || null;
    const persistenceMode = settings.persistenceMode || 'ephemeral';

    // Validate persistence mode
    if (!isValidPersistenceMode(persistenceMode)) {
      throw new Error(`Invalid persistence mode: ${persistenceMode}`);
    }

    // Check per-creator room limit (5 rooms max)
    if (creatorId) {
      const creatorRoomCount = this.creatorRooms.get(creatorId)?.size || 0;
      if (creatorRoomCount >= MAX_ROOMS_PER_CREATOR) {
        throw new Error(`You have reached the maximum of ${MAX_ROOMS_PER_CREATOR} rooms. Please delete an existing room first.`);
      }
    }

    // Check server-wide room limit (1500 total persistent rooms)
    if (persistenceMode !== 'ephemeral') {
      const totalPersistentRooms = Array.from(this.creatorRooms.values())
        .reduce((sum, roomSet) => sum + roomSet.size, 0);

      if (totalPersistentRooms >= this.MAX_SERVER_ROOMS) {
        throw new Error('Server capacity reached. Please try again later.');
      }
    }

    let roomCode;

    // Use custom phrase if provided, otherwise auto-generate
    if (settings.customCode && typeof settings.customCode === 'string') {
      // Normalize: lowercase, trim, replace spaces with hyphens
      roomCode = settings.customCode.trim().toLowerCase().replace(/\s+/g, '-');

      // Validate format: 3-30 chars, alphanumeric and hyphens only
      if (roomCode.length < 3 || roomCode.length > 30) {
        throw new Error('Custom phrase must be between 3 and 30 characters');
      }
      if (!/^[a-zA-Z0-9]+(-[a-zA-Z0-9]+)*$/.test(roomCode)) {
        throw new Error('Custom phrase can only contain letters, numbers, and hyphens');
      }

      // Check if already taken
      if (await this.roomExists(roomCode)) {
        throw new Error('Please try another.');
      }
    } else {
      // Auto-generate unique room code
      let attempts = 0;
      const maxAttempts = 10;
      do {
        roomCode = generateRoomCode();
        attempts++;
        if (attempts > maxAttempts) {
          throw new Error('Failed to generate unique room code');
        }
      } while (await this.roomExists(roomCode));
    }

    // Get lifetime from persistence mode configuration
    const modeConfig = getPersistenceMode(persistenceMode);
    const lifetimeMinutes = modeConfig.lifetimeMinutes;

    const room = {
      id: roomCode,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (lifetimeMinutes * 60 * 1000)).toISOString(),
      users: [],
      messages: [],
      creatorId: creatorId, // NEW: Store creator ID
      settings: {
        messageTTL: settings.messageTTL || 0,
        passwordHash: settings.password ? await bcrypt.hash(settings.password, 10) : null,
        isInviteOnly: settings.isInviteOnly || false,
        maxUsers: settings.maxUsers,
        lifetimeMinutes: lifetimeMinutes,
        persistenceMode: persistenceMode // NEW: Store persistence mode
      }
    };

    await this.saveRoom(roomCode, room);

    // Set room expiry with persistence mode awareness
    this.setRoomExpiry(roomCode, lifetimeMinutes * 60 * 1000, persistenceMode);

    // Track creator-to-room mapping
    if (creatorId) {
      if (!this.creatorRooms.has(creatorId)) {
        this.creatorRooms.set(creatorId, new Set());
      }
      this.creatorRooms.get(creatorId).add(roomCode);
    }

    // If it's an invite-only room, generate a permanent invite token
    if (room.settings.isInviteOnly) {
      const token = await this.generateInviteToken(roomCode, true);
      room.settings.inviteToken = token; // Store the permanent invite token
      await this.saveRoom(roomCode, room);
    }

    return roomCode;
  }

  /**
   * Check if room exists
   * @param {string} roomCode - Room code to check
   * @returns {Promise<boolean>} True if room exists
   */
  async roomExists(roomCode) {
    if (this.redis) {
      const exists = await this.redis.exists(`room:${roomCode}`);
      return exists === 1;
    }
    return this.rooms.has(roomCode);
  }

  /**
   * Get room data
   * @param {string} roomCode - Room code
   * @returns {Promise<Object|null>} Room data or null if not found
   */
  async getRoom(roomCode) {
    if (this.redis) {
      const roomData = await this.redis.get(`room:${roomCode}`);
      return roomData ? JSON.parse(roomData) : null;
    }
    return this.rooms.get(roomCode) || null;
  }

  /**
   * Get users in a room
   */
  async getRoomUsers(roomCode) {
    const room = await this.getRoom(roomCode);
    return room ? room.users : [];
  }

  /**
   * Get inactivity timeout for a room based on its persistence mode
   * @param {string} roomCode - Room code
   * @returns {Promise<number>} Timeout in milliseconds
   */
  async getRoomTimeout(roomCode) {
    const room = await this.getRoom(roomCode);
    if (!room) return null;

    const persistenceMode = room.settings?.persistenceMode || 'ephemeral';
    const config = getPersistenceMode(persistenceMode);
    return config ? config.socketTimeout : null;
  }

  /**
   * Save room data
   * @param {string} roomCode - Room code
   * @param {Object} roomData - Room data to save
   */
  async saveRoom(roomCode, roomData) {
    if (this.redis) {
      await this.redis.setex(`room:${roomCode}`, this.ROOM_EXPIRY_MS / 1000, JSON.stringify(roomData));
    } else {
      this.rooms.set(roomCode, roomData);
    }
  }

  /**
   * Join a user to a room
   * @param {string} roomCode - Room code
   * @param {string} userId - User ID
   * @param {string} nickname - User nickname
   * @param {string} password - Room password (if required)
   * @param {string} inviteToken - Invite token (if required)
   * @returns {Promise<Object>} Result {success, error, room}
   */
  /**
   * Join a user to a room
   * @param {string} roomCode - The room code to join
   * @param {string} userId - The user's unique ID
   * @param {string} nickname - The user's nickname
   * @param {string} [password] - Optional room password
   * @param {string} [inviteToken] - Optional invite token for invite-only rooms
   * @param {string} socketId - The socket ID of the user
   * @returns {Promise<{success: boolean, room: Object}>} Result of the join operation
   */
  async joinRoom(roomCode, userId, nickname, password = '', inviteToken = null, socketId = null) {
    // Mutex to prevent race conditions (duplicate nicknames)
    while (this.joinLocks.has(roomCode)) {
      await this.joinLocks.get(roomCode);
    }

    let resolveLock;
    const lockPromise = new Promise(resolve => resolveLock = resolve);
    this.joinLocks.set(roomCode, lockPromise);

    try {
      // console.log(`Attempting to join room ${roomCode} with token:`, inviteToken);
      const room = await this.getRoom(roomCode);
      if (!room) {
        // console.error(`Room ${roomCode} not found`);
        return { success: false, error: 'Room not found' };
      }

      // Ensure users array exists
      if (!room.users) room.users = [];

      // Clean stale users whose sockets are no longer connected
      // This prevents "username taken" errors from ghost users
      if (this._io && room.users.length > 0) {
        const beforeCount = room.users.length;
        room.users = room.users.filter(u => this._io.sockets.sockets.has(u.socketId));
        if (room.users.length !== beforeCount) {
          logger.info(`🧹 joinRoom cleanup: removed ${beforeCount - room.users.length} stale user(s) from room ${roomCode}`);
          await this.saveRoom(roomCode, room);
        }
      }

      // Check if room has expired
      if (new Date(room.expiresAt) < new Date()) {
        await this.deleteRoom(roomCode);
        throw new Error('This room has expired');
      }

      // Sanitize nickname and normalize for case-insensitive comparison
      const sanitizedNickname = sanitizeInput(nickname);
      const normalizedNickname = sanitizedNickname.toLowerCase().trim();

      // Check if nickname is already taken by another user (case-insensitive)
      const isNicknameTaken = room.users.some(u => {
        const existingNormalized = (u.nickname || '').toLowerCase().trim();
        return existingNormalized === normalizedNickname && u.socketId !== socketId;
      });

      if (isNicknameTaken) {
        // console.log(`Nickname collision: ${sanitizedNickname} is already taken in room ${roomCode}`);
        throw new Error('This nickname is already taken in this room');
      }

      // Check if user is already in the room with this socket
      const existingUserIndex = room.users.findIndex(u => u.socketId === socketId);
      if (existingUserIndex !== -1) {
        // Update user's nickname if it changed
        if (room.users[existingUserIndex].nickname !== sanitizedNickname) {
          room.users[existingUserIndex].nickname = sanitizedNickname;
          await this.saveRoom(roomCode, room);
        }
        return { success: true, room };
      }

      // Check room capacity
      if (room.settings.maxUsers && room.users.length >= room.settings.maxUsers) {
        throw new Error('Room is full');
      }

      // Check if room is invite-only or if an invite token is provided
      if (room.settings.isInviteOnly || inviteToken) {
        // console.log(`Room ${roomCode} is ${room.settings.isInviteOnly ? 'invite-only' : 'public'}, validating token...`);

        if (!inviteToken) {
          // console.error('No invite token provided but one is required');
          return {
            success: false,
            error: room.settings.isInviteOnly
              ? 'This is an invite-only room. An invite token is required to join.'
              : 'An invite token is required to join this room.'
          };
        }

        // Validate the invite token (don't consume it yet)
        const tokenValid = await this.validateInviteToken(inviteToken, roomCode, false);
        // console.log('Token validation result:', tokenValid);

        if (!tokenValid.valid) {
          // console.error('Invalid or expired token for room', roomCode);
          return {
            success: false,
            error: tokenValid.error || 'Invalid or expired invite token'
          };
        }

        // console.log(`Token validated successfully for room ${roomCode}`);

        // If token is valid but room code doesn't match, update the room code
        if (tokenValid.roomCode && tokenValid.roomCode !== roomCode) {
          // console.log(`Redirecting to room ${tokenValid.roomCode} based on token`);
          const targetRoom = await this.getRoom(tokenValid.roomCode);
          if (targetRoom) {
            return {
              success: false,
              error: 'Invalid room',
              redirectRoomCode: tokenValid.roomCode,
              requiresPassword: !!targetRoom.settings.passwordHash
            };
          }
        }
      }

      // Check password if room is password protected
      if (room.settings.passwordHash) {
        if (!password) {
          throw new Error('Password required');
        }
        const isPasswordValid = await bcrypt.compare(password, room.settings.passwordHash);
        if (!isPasswordValid) {
          throw new Error('Invalid password');
        }
      }

      // Create user object
      const user = {
        id: userId,
        socketId,
        nickname: sanitizedNickname,
        joinedAt: new Date().toISOString()
      };

      // Add user to room
      room.users.push(user);

      // Record participation for "Recent Rooms" visibility
      if (userId) {
        if (!this.participatedRooms.has(userId)) {
          this.participatedRooms.set(userId, new Set());
        }
        this.participatedRooms.get(userId).add(roomCode);
      }

      await this.saveRoom(roomCode, room);

      // If an invite token was used, consume it now after successful join
      if (inviteToken) {
        await this.validateInviteToken(inviteToken, roomCode, true);
      }

      this.refreshRoomExpiry(roomCode);
      return { success: true, room };
    } catch (error) {
      // console.error('Error joining room:', error);
      return { success: false, error: error.message };
    } finally {
      // Release lock
      this.joinLocks.delete(roomCode);
      if (resolveLock) resolveLock();
    }
  }

  /**
   * Remove user from room
   * @param {string} roomCode - Room code
   * @param {string} socketId - User's socket ID
   */
  async leaveRoom(roomCode, socketId) {
    const room = await this.getRoom(roomCode);
    if (!room) return;

    room.users = room.users.filter(user => user.socketId !== socketId);

    // Check if room should be deleted when empty
    if (room.users.length === 0) {
      const persistenceMode = room.settings?.persistenceMode || 'ephemeral';
      const modeConfig = getPersistenceMode(persistenceMode);

      // Only delete if mode doesn't allow empty rooms (ephemeral only)
      if (!modeConfig.allowEmpty) {
        await this.deleteRoom(roomCode);
      } else {
        // Persistent rooms stay alive when empty
        await this.saveRoom(roomCode, room);
      }
    } else {
      await this.saveRoom(roomCode, room);
    }
  }


  /**
   * Internal helper to save a message with correct TTL
   */
  async saveMessage(roomCode, message) {
    const room = await this.getRoom(roomCode);
    if (!room) return;

    const isChess = (message.messageType === 'game' && message.gameData?.gameType === 'chess') ||
      (message.gameData?.type === 'chess'); // Compatibility check
    const isFinished = !!message.gameData?.winner || !!message.gameData?.endedAt;

    // Active Chess games NEVER have an expiry
    if (isChess && !isFinished) {
      delete message.expiresAt;
      delete message.overrideTtl;
    }

    if (this.redis && room.settings.messageTTL > 0) {
      const messageKey = `message:${roomCode}:${message.id}`;

      // Calculate TTL:
      // 1. If message has override (e.g. 120s for finished chess)
      // 2. Otherwise use room default
      // 3. EXCEPT if it is an active Chess game, then NO TTL (survives until room deletion)
      let ttl = message.overrideTtl || room.settings.messageTTL;

      if (isChess && !isFinished) {
        // Active Chess persists until room ends. 
        // We set to 0 (no expiry) so Redis doesn't auto-delete it. 
        await this.redis.set(messageKey, JSON.stringify(message));
      } else {
        await this.redis.setex(messageKey, ttl, JSON.stringify(message));
      }
    } else if (!this.redis) {
      // In-memory: update or push
      const existingIdx = room.messages.findIndex(m => m.id === message.id);
      if (existingIdx !== -1) {
        room.messages[existingIdx] = message;
      } else {
        room.messages.push(message);
      }

      // Safety cap: prevent memory exhaustion (keep last 500 messages max)
      if (room.messages.length > 500) {
        const activeChess = room.messages.filter(m => m.messageType === 'game' && m.gameData?.gameType === 'chess' && !m.gameData?.winner);
        const others = room.messages.filter(m => !(m.messageType === 'game' && m.gameData?.gameType === 'chess' && !m.gameData?.winner));
        const otherCount = Math.max(0, 500 - activeChess.length);
        room.messages = [...activeChess, ...others.slice(-otherCount)];
      }

      await this.saveRoom(roomCode, room);
    }
  }

  /**
   * Add message to room
   * @param {string} roomCode - Room code
   * @param {Object} message - Message data
   */
  async addMessage(roomCode, message) {
    const room = await this.getRoom(roomCode);
    if (!room) return;

    // Only sanitize text messages, not image/audio data (which contains base64)
    if (message.messageType !== 'image' && message.messageType !== 'audio') {
      message.content = sanitizeInput(message.content);
    }

    if (!message.timestamp) message.timestamp = new Date().toISOString();

    // GAME TTL LOGIC: If a room's TTL is < 5 minutes (300 seconds), game TTL should be twice the room's TTL
    // CHESS EXCEPTION: Chess lasts until room ends or manual delete, unless it's finished.
    const isChess = (message.messageType === 'game' && message.gameData?.gameType === 'chess') || (message.gameData?.type === 'chess');

    if (message.messageType === 'game' && !isChess && room.settings && room.settings.messageTTL > 0 && room.settings.messageTTL < 300) {
      if (!message.overrideTtl) {
        message.overrideTtl = room.settings.messageTTL * 2;
      }
    }

    // Handle per-message override TTL (e.g., 10s override)
    if (message.overrideTtl && message.overrideTtl > 0) {
      const expiresAt = new Date(Date.now() + message.overrideTtl * 1000);
      message.expiresAt = expiresAt.toISOString();
    }

    // Initialize viewedBy array for view-once messages
    if (message.isViewOnce && !message.viewedBy) {
      message.viewedBy = [];
    }

    // Call the unified saver
    await this.saveMessage(roomCode, message);
    this.refreshRoomExpiry(roomCode);
  }

  /**
   * Clear all messages from a room
   * @param {string} roomCode - Room code
   */
  async clearMessages(roomCode) {
    const room = await this.getRoom(roomCode);
    if (!room) return;

    if (this.redis) {
      const messageKeys = await this.redis.keys(`message:${roomCode}:*`);
      if (messageKeys.length > 0) {
        await this.redis.del(...messageKeys);
      }
    } else {
      room.messages = [];
      await this.saveRoom(roomCode, room);
    }
  }

  /**
   * Remove a message from a room by id
   */
  async removeMessage(roomCode, messageId) {
    const room = await this.getRoom(roomCode);
    if (!room || !room.messages) return false;

    const originalLen = room.messages.length;
    room.messages = room.messages.filter(m => m.id !== messageId);

    if (room.messages.length !== originalLen) {
      await this.saveRoom(roomCode, room);
      return true;
    }
    return false;
  }

  /**
   * Get messages for a room
   * @param {string} roomCode - Room code
   * @param {string} [userId] - Optional user ID to filter private messages and mask game data
   * @returns {Promise<Array>} Array of messages
   */
  async getMessages(roomCode, userId = null) {
    const room = await this.getRoom(roomCode);
    if (!room) return [];

    let messages = [];

    if (this.redis && room.settings.messageTTL > 0) {
      // Get messages from Redis with TTL
      const messageKeys = await this.redis.keys(`message:${roomCode}:*`);

      for (const key of messageKeys) {
        const messageData = await this.redis.get(key);
        if (messageData) {
          messages.push(JSON.parse(messageData));
        }
      }

      messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    } else {
      // In-memory: Filter out expired messages on read
      const now = new Date();
      const defaultTtlMs = room.settings.messageTTL * 1000;

      // Filter messages that haven't expired
      const validMessages = room.messages.filter(msg => {
        const isChess = msg.messageType === 'game' && msg.gameData?.gameType === 'chess';
        if (isChess && !(msg.gameData?.winner || msg.gameData?.endedAt)) {
          return true; // Active Chess persists until manually deleted or room ends
        }

        // 1. Check if message has its own expiry override
        if (msg.expiresAt) {
          return new Date(msg.expiresAt) > now;
        }

        // 2. Fallback to room default TTL if set
        if (defaultTtlMs > 0) {
          // Finished Chess games will use their overrideTtl or fall back here

          const msgTime = new Date(msg.timestamp);
          return (now - msgTime) < defaultTtlMs;
        }

        return true;
      });

      // If we filtered anything out, update the room storage immediately
      if (validMessages.length !== room.messages.length) {
        room.messages = validMessages;
        await this.saveRoom(roomCode, room);
      }

      messages = validMessages;
    }

    // Filter private messages and mask game data if userId is provided
    if (userId) {
      messages = messages
        .filter(msg => {
          // If no recipients defined, it's a broadcast message (everyone sees it)
          if (!msg.recipients || msg.recipients.length === 0) return true;

          // If I am the sender, I can see it
          if (msg.sender.socketId === userId || msg.sender.id === userId) return true;

          // If I am in the recipients list, I can see it
          return msg.recipients.includes(userId);
        })
        .map(msg => this.maskMessageForUser(msg, userId));
    }

    return messages;
  }

  /**
   * Mask sensitive game data for non-senders
   */
  maskMessageForUser(message, userId) {
    if (message.messageType !== 'game' || !message.gameData || !message.gameData.answers) {
      return message;
    }

    // Senders see everything
    if (message.sender.socketId === userId || message.sender.id === userId) {
      return message;
    }

    const { gameType, answers } = message.gameData;
    if (gameType === 'would-you-rather' || gameType === 'trivia') {
      const stats = {};
      Object.values(answers).forEach(val => {
        stats[val] = (stats[val] || 0) + 1;
      });

      // Include only their own answer
      const maskedAnswers = {};
      if (answers[userId]) {
        maskedAnswers[userId] = answers[userId];
      }

      return {
        ...message,
        gameData: {
          ...message.gameData,
          answers: maskedAnswers,
          stats: stats,
          isMasked: true
        }
      };
    }

    return message;
  }

  /**
   * Prune expired messages from in-memory storage
   * Runs periodically to ensure "Black Hole" security
   */
  pruneExpiredMessages() {
    const now = new Date();

    for (const [roomCode, room] of this.rooms.entries()) {
      const now = new Date();
      const defaultTtlMs = room.settings.messageTTL * 1000;
      const originalCount = room.messages.length;

      room.messages = room.messages.filter(msg => {
        // 1. Check if message has its own expiry override
        if (msg.expiresAt) {
          return new Date(msg.expiresAt) > now;
        }

        // 2. Fallback to room default TTL
        if (defaultTtlMs > 0) {
          const msgTime = new Date(msg.timestamp);
          return (now - msgTime) < defaultTtlMs;
        }

        return true;
      });

      if (room.messages.length !== originalCount) {
        // console.log(`Pruned ${originalCount - room.messages.length} expired messages from room ${roomCode}`);
      }
    }
  }

  /**
   * Get a specific message from a room
   */
  async getMessage(roomCode, messageId) {
    if (this.redis) {
      const room = await this.getRoom(roomCode);
      if (!room) return null;

      // Check if message is in Redis (with TTL)
      if (room.settings.messageTTL > 0) {
        const messageKey = `message:${roomCode}:${messageId}`;
        const messageData = await this.redis.get(messageKey);
        return messageData ? JSON.parse(messageData) : null;
      }

      // Check if message is in room object (no TTL)
      return (room.messages || []).find(m => m.id === messageId) || null;
    }

    const room = this.rooms.get(roomCode);
    if (!room) return null;
    return (room.messages || []).find(m => m.id === messageId) || null;
  }

  /**
   * Get a message by id across all rooms
   */
  async getMessageById(messageId) {
    // Check in-memory maps first
    for (const [roomCode, room] of this.rooms.entries()) {
      const msg = (room.messages || []).find(m => m.id === messageId);
      if (msg) return { roomCode, message: msg };
    }

    // If using Redis, we'd need to pattern match keys which is expensive
    // In current architecture, we usually have the roomCode when we need a message
    return null;
  }

  /**
   * Mark a message as viewed by a specific user
   */
  async markMessageViewed(messageId, userId, roomCode = null) {
    // If roomCode is provided, we can be much more efficient
    if (roomCode) {
      const msg = await this.getMessage(roomCode, messageId);
      if (msg) {
        if (!msg.viewedBy) msg.viewedBy = [];
        if (!msg.viewedBy.includes(userId)) {
          msg.viewedBy.push(userId);

          // Save back to storage using unified logic
          await this.saveMessage(roomCode, msg);

          // Broadcast via socket.io if available
          if (this._io) {
            this._io.to(roomCode).emit('message-viewed', { messageId, userId });
          }
          return true;
        }
        return false;
      }
    }

    // Fallback search across all rooms (only for in-memory)
    for (const [rCode, room] of this.rooms.entries()) {
      const idx = (room.messages || []).findIndex(m => m.id === messageId);
      if (idx >= 0) {
        const msg = room.messages[idx];
        if (!msg.viewedBy) msg.viewedBy = [];
        if (!msg.viewedBy.includes(userId)) {
          msg.viewedBy.push(userId);
          await this.saveRoom(rCode, room);

          if (this._io) {
            this._io.to(rCode).emit('message-viewed', { messageId, userId });
          }
          return true;
        }
        return false;
      }
    }
    return false;
  }

  setIo(io) {
    this._io = io;
  }

  /**
   * Set room expiry timer
   * @param {string} roomCode - Room code
   * @param {number} [lifetimeMs] - Optional custom lifetime in milliseconds
   * @param {string} [persistenceMode] - Persistence mode (ephemeral/gathering/social/extended)
   */
  setRoomExpiry(roomCode, lifetimeMs, persistenceMode = 'ephemeral') {
    this.clearRoomTimer(roomCode);

    const expiryTime = lifetimeMs || this.ROOM_DEFAULT_LIFETIME_MS;
    const modeConfig = getPersistenceMode(persistenceMode);

    const timer = setTimeout(async () => {
      // console.log(`Room ${roomCode} has expired after ${expiryTime / (60 * 1000)} minutes`);
      await this.deleteRoom(roomCode);
    }, expiryTime);

    this.roomTimers.set(roomCode, {
      timer,
      persistenceMode,
      refreshOnActivity: modeConfig.refreshOnActivity
    });

    // Log expiration time for debugging
    const expiryDate = new Date(Date.now() + expiryTime);
    // console.log(`Room ${roomCode} (${persistenceMode}) will expire at: ${expiryDate.toISOString()}`);
  }

  /**
   * Refresh room expiry timer
   * @param {string} roomCode - Room code
   */
  refreshRoomExpiry(roomCode) {
    const timerData = this.roomTimers.get(roomCode);

    // Only refresh if the room's persistence mode allows it (ephemeral only)
    if (timerData && timerData.refreshOnActivity) {
      this.setRoomExpiry(roomCode, null, timerData.persistenceMode);
    }
    // Persistent rooms don't refresh - they have fixed expiry from creation
  }

  /**
   * Clear room timer
   * @param {string} roomCode - Room code
   */
  clearRoomTimer(roomCode) {
    const timerData = this.roomTimers.get(roomCode);
    if (timerData) {
      clearTimeout(timerData.timer || timerData); // Handle both old and new format
      this.roomTimers.delete(roomCode);
    }
  }

  /**
   * Delete room and all associated data
   * @param {string} roomCode - Room code
   */
  async deleteRoom(roomCode) {
    // console.log(`Deleting room ${roomCode} and cleaning up resources`);

    // Get room before deleting for creator cleanup
    const room = await this.getRoom(roomCode);

    // Clear any timers
    if (this.roomTimers.has(roomCode)) {
      const timerData = this.roomTimers.get(roomCode);
      clearTimeout(timerData.timer || timerData);
      this.roomTimers.delete(roomCode);
    }

    // Clean up any invite tokens for this room
    if (this.roomToTokens.has(roomCode)) {
      const tokens = this.roomToTokens.get(roomCode);
      for (const token of tokens) {
        this.cleanupToken(token);
      }
      this.roomToTokens.delete(roomCode);
    }

    // Remove from creator tracking
    if (room && room.creatorId) {
      const creatorRooms = this.creatorRooms.get(room.creatorId);
      if (creatorRooms) {
        creatorRooms.delete(roomCode);
        if (creatorRooms.size === 0) {
          this.creatorRooms.delete(room.creatorId);
        }
      }
    }

    // Delete from storage
    if (this.redis) {
      await this.redis.del(`room:${roomCode}`);
    } else {
      this.rooms.delete(roomCode);
    }
  }

  /**
   * Generate a secure random token
   * @private
   * @returns {string} A secure random token (Base64URL)
   */
  generateSecureToken() {
    // Use Base64URL for shorter tokens
    return crypto.randomBytes(32).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  /**
   * Generate a one-time invite token for a room
   * @param {string} roomCode - The room code to generate an invite for
   * @param {boolean} [isPermanent=false] - Whether the token should be permanent
   * @param {number} [customExpiryMs] - Optional custom expiration time in milliseconds
   * @returns {Promise<string>} The generated token
   */
  async generateInviteToken(roomCode, isPermanent = false, customExpiryMs) {
    // Verify room exists
    const room = await this.getRoom(roomCode);
    if (!room) {
      throw new Error('Room not found');
    }

    // Generate a secure random token
    const token = this.generateSecureToken();

    // Calculate expiration time
    const expiryMs = customExpiryMs || this.INVITE_TOKEN_EXPIRY_MS;
    const expiresAt = isPermanent ? null : new Date(Date.now() + expiryMs);

    // Create token data
    const tokenData = {
      roomCode,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      isPermanent,
      createdAt: new Date().toISOString(),
      uses: 0,
      maxUses: isPermanent ? null : 1 // One-time use for non-permanent tokens
    };

    // Store the token
    this.inviteTokens.set(token, tokenData);

    // Add to room's token set for cleanup
    if (!this.roomToTokens.has(roomCode)) {
      this.roomToTokens.set(roomCode, new Set());
    }
    this.roomToTokens.get(roomCode).add(token);

    // Set up cleanup for non-permanent tokens
    if (!isPermanent) {
      tokenData.timeoutId = setTimeout(() => {
        // console.log(`Token ${token} expired, cleaning up`);
        this.cleanupToken(token);
      }, expiryMs);
    }

    // console.log(`Generated ${isPermanent ? 'permanent' : 'temporary'} token for room ${roomCode}`);
    /* console.log('All tokens:', Array.from(this.inviteTokens.entries()).map(([t, d]) => ({
      token: t.substring(0, 8) + '...',
      roomCode: d.roomCode,
      expiresAt: d.expiresAt,
      isPermanent: d.isPermanent
    }))); */

    return token;
  }

  /**
   * Generate a shareable invite link
   * @param {string} roomCode - The room code to generate an invite for
   * @param {Object} [options] - Options for the invite
   * @param {boolean} [options.isPermanent=false] - Whether the invite should be permanent
   * @param {number} [options.expiryMs] - Custom expiration time in milliseconds
   * @returns {Promise<{token: string, url: string, expiresAt: Date | null}>} The token and full URL
   */
  async generateInviteLink(roomCode, { isPermanent = false, expiryMs, baseUrl } = {}) {
    const token = await this.generateInviteToken(roomCode, isPermanent, expiryMs);

    // Robust URL detection for different environments
    let usedBaseUrl = baseUrl;

    if (!usedBaseUrl) {
      if (process.env.NODE_ENV === 'production') {
        // In production, prefer BASE_URL (chat.kyere.me), fallback to Render only if Koyeb is down
        usedBaseUrl = process.env.BASE_URL ||
          (process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : null);
      } else {
        // In development, use localhost
        usedBaseUrl = 'http://localhost:5173';
      }
    }

    // Final fallback
    usedBaseUrl = usedBaseUrl || 'http://localhost:5173';

    // Remove trailing slash if present
    usedBaseUrl = usedBaseUrl.replace(/\/$/, '');

    const url = `${usedBaseUrl}/invite/${token}`;

    const tokenData = this.inviteTokens.get(token);
    const verbalCode = this.tokenToVerbalCode(token);
    return {
      token,
      url,
      verbalCode,
      expiresAt: tokenData.expiresAt ? new Date(tokenData.expiresAt) : null,
      isPermanent
    };
  }

  /**
   * Convert an invite token to a 4-word verbal code
   * @param {string} token - The invite token
   * @returns {string} A 4-word verbal code (e.g., "clarity compass journey peace")
   */
  tokenToVerbalCode(token) {
    const hash = crypto.createHash('sha256').update(token).digest();
    const words = [];
    for (let i = 0; i < 4; i++) {
      const idx = hash[i] % WORDLIST.length;
      words.push(WORDLIST[idx]);
    }
    return words.join(' ');
  }

  /**
   * Find an invite token by its verbal code
   * @param {string} verbalCode - The 4-word verbal code
   * @returns {{token: string, roomCode: string} | null} The matching token data or null
   */
  findTokenByVerbalCode(verbalCode) {
    // Normalize: lowercase, trim, and collapse multiple spaces to single space
    const normalizedCode = verbalCode.toLowerCase().trim().replace(/\s+/g, ' ');

    for (const [token, tokenData] of this.inviteTokens.entries()) {
      // Skip expired tokens
      if (tokenData.expiresAt && new Date() > new Date(tokenData.expiresAt)) {
        continue;
      }

      const tokenVerbalCode = this.tokenToVerbalCode(token);
      if (tokenVerbalCode === normalizedCode) {
        return {
          token,
          roomCode: tokenData.roomCode,
          isPermanent: tokenData.isPermanent
        };
      }
    }

    return null;
  }

  /**
   * Cleanup a single token and its references
   * @private
   * @param {string} token - The token to clean up
   */
  cleanupToken(token) {
    const tokenData = this.inviteTokens.get(token);
    if (!tokenData) return;

    // Clear the timeout if it exists
    if (tokenData.timeoutId) {
      clearTimeout(tokenData.timeoutId);
    }

    // Remove the token from the main map
    this.inviteTokens.delete(token);

    // Remove the token from the room's token set
    if (tokenData.roomCode) {
      const tokens = this.roomToTokens.get(tokenData.roomCode);
      if (tokens) {
        tokens.delete(token);
        if (tokens.size === 0) {
          this.roomToTokens.delete(tokenData.roomCode);
        }
      }
    }

    // console.log(`Cleaned up token: ${token}`);
  }

  /**
   * Validate an invite token
   * @param {string} token - The invite token to validate
   * @param {string} [roomCode] - Optional room code to validate against
   * @param {boolean} [consumeToken=false] - Whether to consume (delete) the token after validation
   * @returns {Promise<{valid: boolean, roomCode: string, isPermanent: boolean, error?: string}>}
   */
  async validateInviteToken(token, roomCode = null, consumeToken = false) {
    // console.log(`Validating token: ${token} for room: ${roomCode || 'any'}, consume: ${consumeToken}`);

    // Basic token validation
    if (!token || typeof token !== 'string' || token.length < 16) {
      // console.log('Invalid token format');
      return { valid: false, error: 'Invalid token format' };
    }

    const tokenData = this.inviteTokens.get(token);

    // Check if token exists
    if (!tokenData) {
      // console.log(`Token ${token} not found`);
      return { valid: false, error: 'Invalid or expired token' };
    }

    // Check if token is expired
    if (tokenData.expiresAt && new Date() > new Date(tokenData.expiresAt)) {
      // console.log(`Token ${token} has expired`);
      this.cleanupToken(token);
      return { valid: false, error: 'Token has expired' };
    }

    // If roomCode is provided, verify it matches the token's room
    if (roomCode && tokenData.roomCode !== roomCode) {
      // console.log(`Token ${token} is for room ${tokenData.roomCode}, but was used for room ${roomCode}`);
      return {
        valid: false,
        error: 'This invite is for a different room',
        roomCode: tokenData.roomCode
      };
    }

    // Verify the room still exists
    const room = await this.getRoom(tokenData.roomCode);
    if (!room) {
      logger.info(`Room ${tokenData.roomCode} not found for token ${token}`);
      // Clean up invalid token
      this.inviteTokens.delete(token);
      const tokens = this.roomToTokens.get(tokenData.roomCode);
      if (tokens) {
        tokens.delete(token);
        if (tokens.size === 0) {
          this.roomToTokens.delete(tokenData.roomCode);
        }
      }
      return { valid: false, error: 'The room no longer exists' };
    }

    // If this is a one-time token and we're consuming it, invalidate it after use
    if (!tokenData.isPermanent && consumeToken) {
      logger.info('Consuming one-time token after successful join');
      this.inviteTokens.delete(token);
      const tokens = this.roomToTokens.get(tokenData.roomCode);
      if (tokens) {
        tokens.delete(token);
        if (tokens.size === 0) {
          this.roomToTokens.delete(tokenData.roomCode);
        }
      }
    }

    logger.info(`Token validation successful for room ${tokenData.roomCode}`);
    return {
      valid: true,
      roomCode: tokenData.roomCode,
      isPermanent: tokenData.isPermanent,
      room, // Include full room data for reference
      error: null
    };
  }

  /**
   * Generate a short-lived view token for a specific message
   * @param {string} messageId - The message ID
   * @param {string} userId - The user ID requesting the token
   * @returns {Object} { token, watermarkSeed }
   */
  generateViewToken(messageId, userId) {
    const token = crypto.randomBytes(16).toString('hex');
    const watermarkSeed = `${userId}:${messageId}:${Date.now()}`;
    const expiresAt = Date.now() + 30 * 1000; // 30 seconds expiry

    this.viewTokens.set(token, {
      messageId,
      userId,
      expiresAt,
      watermarkSeed
    });

    // Auto-cleanup
    setTimeout(() => {
      this.viewTokens.delete(token);
    }, 35 * 1000);

    return { token, watermarkSeed };
  }

  /**
   * Validate a view token and return the message data
   * @param {string} token - The view token
   * @returns {Object|null} The token data if valid
   */
  validateViewToken(token) {
    const data = this.viewTokens.get(token);
    if (!data) return null;

    if (Date.now() > data.expiresAt) {
      this.viewTokens.delete(token);
      return null;
    }

    return data;
  }

  /**
   * Add or remove a reaction from a message
   * @param {string} roomCode - Room code
   * @param {string} messageId - Message ID
   * @param {string} emoji - Emoji character
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Updated message or null
   */
  async addReaction(roomCode, messageId, emoji, userId) {
    const room = await this.getRoom(roomCode);
    if (!room) return null;

    let message;
    if (this.redis && room.settings.messageTTL > 0) {
      const messageKey = `message:${roomCode}:${messageId}`;
      const messageData = await this.redis.get(messageKey);
      message = messageData ? JSON.parse(messageData) : null;
    } else {
      message = (room.messages || []).find(m => m.id === messageId);
    }

    if (!message) return null;

    if (!message.reactions) message.reactions = {};
    if (!message.reactions[emoji]) message.reactions[emoji] = [];

    const userIndex = message.reactions[emoji].indexOf(userId);
    if (userIndex !== -1) {
      // Remove reaction
      message.reactions[emoji].splice(userIndex, 1);
      if (message.reactions[emoji].length === 0) {
        delete message.reactions[emoji];
      }
    } else {
      // Add reaction
      message.reactions[emoji].push(userId);
    }

    // Save back to storage using unified logic
    await this.saveMessage(roomCode, message);

    return message;
  }

  /**
   * Edit a message content
   * @param {string} roomCode - Room code
   * @param {string} messageId - Message ID
   * @param {string} newContent - New message content
   * @param {string} userId - User ID (for permission check)
   * @returns {Promise<Object|null>} Updated message or null
   */
  async editMessage(roomCode, messageId, newContent, userId) {
    const room = await this.getRoom(roomCode);
    if (!room) return null;

    let message;
    if (this.redis && room.settings.messageTTL > 0) {
      const messageKey = `message:${roomCode}:${messageId}`;
      const messageData = await this.redis.get(messageKey);
      message = messageData ? JSON.parse(messageData) : null;
    } else {
      message = (room.messages || []).find(m => m.id === messageId);
    }

    if (!message) return null;

    // Check permission: only sender can edit
    if (message.sender.socketId !== userId && message.sender.id !== userId) {
      return null;
    }

    // Update content
    message.content = sanitizeInput(newContent);
    message.isEdited = true;

    // Save back to storage using unified logic
    await this.saveMessage(roomCode, message);

    return message;
  }

  /**
   * Vote on a poll message
   * @param {string} roomCode - Room code
   * @param {string} messageId - Message ID of the poll
   * @param {string} optionId - ID of the option being voted for
   * @param {string} userId - ID of the user voting
   * @param {string} nickname - Nickname of the user voting
   * @returns {Promise<Object|null>} Updated message or null
   */
  async votePoll(roomCode, messageId, optionId, userId, nickname) {
    const room = await this.getRoom(roomCode);
    if (!room) return null;

    const message = await this.getMessage(roomCode, messageId);
    if (!message || message.messageType !== 'poll' || !message.pollData) return null;

    const { pollData } = message;
    const { options, allowMultiple } = pollData;

    const option = options.find(o => o.id === optionId);
    if (!option) return null;

    if (!option.votes) option.votes = [];

    const voterIndex = option.votes.findIndex(v => v.userId === userId);
    const hasVotedForThis = voterIndex !== -1;

    if (hasVotedForThis) {
      // Remove vote
      option.votes.splice(voterIndex, 1);
    } else {
      // Add vote
      const voteObj = {
        userId,
        nickname,
        timestamp: new Date().toISOString()
      };

      if (!allowMultiple) {
        // Remove from all other options first
        options.forEach(opt => {
          if (opt.votes) {
            opt.votes = opt.votes.filter(v => v.userId !== userId);
          }
        });
      }
      option.votes.push(voteObj);
    }

    // Save back to storage using unified logic
    await this.saveMessage(roomCode, message);

    return message;
  }

  /**
   * Get all rooms created by a specific creator
   * @param {string} creatorId - Creator ID
   * @returns {Promise<Array>} Array of room objects
   */
  async getRoomsByCreator(creatorId) {
    if (!creatorId) return [];

    const roomCodes = this.creatorRooms.get(creatorId) || new Set();
    const rooms = [];

    for (const code of roomCodes) {
      const room = await this.getRoom(code);
      if (room) {
        rooms.push(room);
      } else {
        // Room was deleted but not removed from tracking, clean up
        this.creatorRooms.get(creatorId).delete(code);
      }
    }

    return rooms;
  }

  /**
   * Get all rooms a user has participated in
   * @param {string} userId - User ID (device ID)
   * @returns {Promise<Array>} Array of room objects
   */
  async getRoomsByParticipant(userId) {
    if (!userId) return [];

    const roomCodes = this.participatedRooms.get(userId) || new Set();
    const rooms = [];

    for (const code of roomCodes) {
      const room = await this.getRoom(code);
      if (room) {
        rooms.push(room);
      } else {
        // Room was deleted, clean up tracking
        this.participatedRooms.get(userId).delete(code);
      }
    }

    return rooms;
  }

  /**
   * Delete a room by creator (manual deletion)
   * @param {string} roomCode - Room code to delete
   * @param {string} creatorId - Creator ID requesting deletion
   * @throws {Error} If unauthorized or room not found
   */
  async deleteRoomByCreator(roomCode, creatorId) {
    const room = await this.getRoom(roomCode);

    if (!room) {
      throw new Error('Room not found');
    }

    if (room.creatorId !== creatorId) {
      throw new Error('Unauthorized: You can only delete rooms you created');
    }

    await this.deleteRoom(roomCode);
  }

  /**
   * Cleanup expired persistent rooms
   * Called periodically by cleanup interval
   */
  async cleanupExpiredRooms() {
    const now = new Date();
    const roomsToDelete = [];

    // Check in-memory rooms
    for (const [roomCode, room] of this.rooms.entries()) {
      if (room.expiresAt && new Date(room.expiresAt) < now) {
        roomsToDelete.push(roomCode);
      }
    }

    // Delete expired rooms
    for (const roomCode of roomsToDelete) {
      logger.info(`Cleanup: Deleting expired room ${roomCode}`);
      await this.deleteRoom(roomCode);
    }

    if (roomsToDelete.length > 0) {
      logger.info(`Cleanup: Deleted ${roomsToDelete.length} expired room(s)`);
    }
  }

}

module.exports = RoomManager;
