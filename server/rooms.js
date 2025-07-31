/**
 * Room management for Ephemeral Chat
 * Handles both in-memory storage (MVP) and Redis storage (enhanced)
 */

const bcrypt = require('bcryptjs');
const { generateRoomCode, sanitizeInput } = require('./utils');

class RoomManager {
  constructor(redisClient = null) {
    this.redis = redisClient;
    this.rooms = new Map(); // In-memory fallback
    this.roomTimers = new Map(); // For room expiry timers
    this.ROOM_EXPIRY_MS = (process.env.ROOM_EXPIRY_MINUTES || 10) * 60 * 1000;
  }

  /**
   * Create a new room
   * @param {Object} settings - Room settings {messageTTL, password}
   * @returns {Promise<string>} Room code
   */
  async createRoom(settings = {}) {
    let roomCode;
    let attempts = 0;
    const maxAttempts = 10;

    // Generate unique room code
    do {
      roomCode = generateRoomCode();
      attempts++;
      if (attempts > maxAttempts) {
        throw new Error('Failed to generate unique room code');
      }
    } while (await this.roomExists(roomCode));

    const room = {
      id: roomCode,
      createdAt: new Date().toISOString(),
      users: [],
      messages: [],
      settings: {
        messageTTL: settings.messageTTL || 0,
        passwordHash: settings.password ? await bcrypt.hash(settings.password, 10) : null
      }
    };

    await this.saveRoom(roomCode, room);
    this.setRoomExpiry(roomCode);

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
   * @param {Object} user - User data {socketId, nickname}
   * @param {string} password - Room password (if required)
   * @returns {Promise<Object>} Result {success, error, room}
   */
  async joinRoom(roomCode, user, password = null) {
    const room = await this.getRoom(roomCode);
    
    if (!room) {
      return { success: false, error: 'Room not found' };
    }

    // Check password if required
    if (room.settings.passwordHash && password) {
      const passwordValid = await bcrypt.compare(password, room.settings.passwordHash);
      if (!passwordValid) {
        return { success: false, error: 'Invalid password' };
      }
    } else if (room.settings.passwordHash && !password) {
      return { success: false, error: 'Password required' };
    }

    // Sanitize nickname
    user.nickname = sanitizeInput(user.nickname);

    // Check if user already in room
    const existingUserIndex = room.users.findIndex(u => u.socketId === user.socketId);
    if (existingUserIndex === -1) {
      room.users.push(user);
      await this.saveRoom(roomCode, room);
    }

    this.refreshRoomExpiry(roomCode);
    return { success: true, room };
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
    
    if (room.users.length === 0) {
      await this.deleteRoom(roomCode);
    } else {
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

    message.content = sanitizeInput(message.content);
    message.timestamp = new Date().toISOString();

    // Handle message TTL with Redis
    if (this.redis && room.settings.messageTTL > 0) {
      const messageKey = `message:${roomCode}:${message.id}`;
      await this.redis.setex(messageKey, room.settings.messageTTL, JSON.stringify(message));
    } else {
      room.messages.push(message);
      await this.saveRoom(roomCode, room);
    }

    this.refreshRoomExpiry(roomCode);
  }

  /**
   * Get messages for a room
   * @param {string} roomCode - Room code
   * @returns {Promise<Array>} Array of messages
   */
  async getMessages(roomCode) {
    const room = await this.getRoom(roomCode);
    if (!room) return [];

    if (this.redis && room.settings.messageTTL > 0) {
      // Get messages from Redis with TTL
      const messageKeys = await this.redis.keys(`message:${roomCode}:*`);
      const messages = [];
      
      for (const key of messageKeys) {
        const messageData = await this.redis.get(key);
        if (messageData) {
          messages.push(JSON.parse(messageData));
        }
      }
      
      return messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    return room.messages || [];
  }

  /**
   * Set room expiry timer
   * @param {string} roomCode - Room code
   */
  setRoomExpiry(roomCode) {
    this.clearRoomTimer(roomCode);
    
    const timer = setTimeout(async () => {
      await this.deleteRoom(roomCode);
    }, this.ROOM_EXPIRY_MS);
    
    this.roomTimers.set(roomCode, timer);
  }

  /**
   * Refresh room expiry timer
   * @param {string} roomCode - Room code
   */
  refreshRoomExpiry(roomCode) {
    this.setRoomExpiry(roomCode);
  }

  /**
   * Clear room timer
   * @param {string} roomCode - Room code
   */
  clearRoomTimer(roomCode) {
    const timer = this.roomTimers.get(roomCode);
    if (timer) {
      clearTimeout(timer);
      this.roomTimers.delete(roomCode);
    }
  }

  /**
   * Delete room and all associated data
   * @param {string} roomCode - Room code
   */
  async deleteRoom(roomCode) {
    if (this.redis) {
      // Delete room and all messages
      await this.redis.del(`room:${roomCode}`);
      const messageKeys = await this.redis.keys(`message:${roomCode}:*`);
      if (messageKeys.length > 0) {
        await this.redis.del(...messageKeys);
      }
    } else {
      this.rooms.delete(roomCode);
    }
    
    this.clearRoomTimer(roomCode);
  }
}

module.exports = RoomManager;
