/**
 * Room management for Ephemeral Chat
 * Handles both in-memory storage (MVP) and Redis storage (enhanced)
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { generateRoomCode, sanitizeInput } = require('./utils');

class RoomManager {
  constructor(redisClient = null) {
    this.redis = redisClient;
    this.rooms = new Map(); // In-memory fallback
    this.roomTimers = new Map(); // For room expiry timers
    this.ROOM_EXPIRY_MS = (process.env.ROOM_EXPIRY_MINUTES || 10) * 60 * 1000;
    this.INVITE_TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes expiry for invite tokens
    this.ROOM_DEFAULT_LIFETIME_MS = 2 * 60 * 60 * 1000; // 2 hours default room lifetime
    this.ROOM_DEFAULT_LIFETIME_MINUTES = 120; // 2 hours in minutes
    
    // In-memory storage for invite tokens
    this.inviteTokens = new Map(); // token -> { roomCode, timeoutId, isPermanent: boolean }
    this.roomToTokens = new Map(); // roomCode -> Set of tokens (for cleanup)
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

    const lifetimeMinutes = settings.lifetimeMinutes || this.ROOM_DEFAULT_LIFETIME_MINUTES;
    
    const room = {
      id: roomCode,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + (lifetimeMinutes * 60 * 1000)).toISOString(),
      users: [],
      messages: [],
      settings: {
        messageTTL: settings.messageTTL || 0,
        passwordHash: settings.password ? await bcrypt.hash(settings.password, 10) : null,
        isInviteOnly: settings.isInviteOnly || false,
        maxUsers: settings.maxUsers || 50,
        lifetimeMinutes: lifetimeMinutes // Store lifetime for reference
      }
    };

    await this.saveRoom(roomCode, room);
    this.setRoomExpiry(roomCode, lifetimeMinutes * 60 * 1000);

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
    try {
      console.log(`Attempting to join room ${roomCode} with token:`, inviteToken);
      const room = await this.getRoom(roomCode);
      if (!room) {
        console.error(`Room ${roomCode} not found`);
        return { success: false, error: 'Room not found' };
      }

      // Check if room has expired
      if (new Date(room.expiresAt) < new Date()) {
        await this.deleteRoom(roomCode);
        throw new Error('This room has expired');
      }

      // Sanitize nickname
      const sanitizedNickname = sanitizeInput(nickname);
      
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
      if (room.users.length >= (room.settings.maxUsers || 50)) {
        throw new Error('Room is full');
      }

      // Check if room is invite-only or if an invite token is provided
      if (room.settings.isInviteOnly || inviteToken) {
        console.log(`Room ${roomCode} is ${room.settings.isInviteOnly ? 'invite-only' : 'public'}, validating token...`);
        
        if (!inviteToken) {
          console.error('No invite token provided but one is required');
          return { 
            success: false, 
            error: room.settings.isInviteOnly 
              ? 'This is an invite-only room. An invite token is required to join.' 
              : 'An invite token is required to join this room.'
          };
        }

        // Validate the invite token (don't consume it yet)
        const tokenValid = await this.validateInviteToken(inviteToken, roomCode, false);
        console.log('Token validation result:', tokenValid);
        
        if (!tokenValid.valid) {
          console.error('Invalid or expired token for room', roomCode);
          return { 
            success: false, 
            error: tokenValid.error || 'Invalid or expired invite token' 
          };
        }
        
        console.log(`Token validated successfully for room ${roomCode}`);
        
        // If token is valid but room code doesn't match, update the room code
        if (tokenValid.roomCode && tokenValid.roomCode !== roomCode) {
          console.log(`Redirecting to room ${tokenValid.roomCode} based on token`);
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
      await this.saveRoom(roomCode, room);

      // If an invite token was used, consume it now after successful join
      if (inviteToken) {
        await this.validateInviteToken(inviteToken, roomCode, true);
      }

      this.refreshRoomExpiry(roomCode);
      return { success: true, room };
    } catch (error) {
      console.error('Error joining room:', error);
      return { success: false, error: error.message };
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
   * @param {number} [lifetimeMs] - Optional custom lifetime in milliseconds
   */
  setRoomExpiry(roomCode, lifetimeMs) {
    this.clearRoomTimer(roomCode);
    
    const expiryTime = lifetimeMs || this.ROOM_DEFAULT_LIFETIME_MS;
    
    const timer = setTimeout(async () => {
      console.log(`Room ${roomCode} has expired after ${expiryTime / (60 * 1000)} minutes`);
      await this.deleteRoom(roomCode);
    }, expiryTime);
    
    this.roomTimers.set(roomCode, timer);
    
    // Log expiration time for debugging
    const expiryDate = new Date(Date.now() + expiryTime);
    console.log(`Room ${roomCode} will expire at: ${expiryDate.toISOString()}`);
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
    console.log(`Deleting room ${roomCode} and cleaning up resources`);
    
    // Clear any timers
    if (this.roomTimers.has(roomCode)) {
      clearTimeout(this.roomTimers.get(roomCode));
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
   * @returns {string} A secure random token
   */
  generateSecureToken() {
    return crypto.randomBytes(32).toString('hex');
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
        console.log(`Token ${token} expired, cleaning up`);
        this.cleanupToken(token);
      }, expiryMs);
    }
    
    console.log(`Generated ${isPermanent ? 'permanent' : 'temporary'} token for room ${roomCode}`);
    console.log('All tokens:', Array.from(this.inviteTokens.entries()).map(([t, d]) => ({
      token: t.substring(0, 8) + '...',
      roomCode: d.roomCode,
      expiresAt: d.expiresAt,
      isPermanent: d.isPermanent
    })));

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
  async generateInviteLink(roomCode, { isPermanent = false, expiryMs } = {}) {
    const token = await this.generateInviteToken(roomCode, isPermanent, expiryMs);
    // Use BASE_URL for production (since frontend is served from backend)
    const baseUrl = process.env.BASE_URL || 'http://localhost:5173';
    const url = `${baseUrl}/invite/${token}`;
    
    const tokenData = this.inviteTokens.get(token);
    return {
      token,
      url,
      expiresAt: tokenData.expiresAt ? new Date(tokenData.expiresAt) : null,
      isPermanent
    };
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
    
    console.log(`Cleaned up token: ${token}`);
  }

  /**
   * Validate an invite token
   * @param {string} token - The invite token to validate
   * @param {string} [roomCode] - Optional room code to validate against
   * @param {boolean} [consumeToken=false] - Whether to consume (delete) the token after validation
   * @returns {Promise<{valid: boolean, roomCode: string, isPermanent: boolean, error?: string}>}
   */
  async validateInviteToken(token, roomCode = null, consumeToken = false) {
    console.log(`Validating token: ${token} for room: ${roomCode || 'any'}, consume: ${consumeToken}`);
    
    // Basic token validation
    if (!token || typeof token !== 'string' || token.length < 16) {
      console.log('Invalid token format');
      return { valid: false, error: 'Invalid token format' };
    }
    
    const tokenData = this.inviteTokens.get(token);
    
    // Check if token exists
    if (!tokenData) {
      console.log(`Token ${token} not found`);
      return { valid: false, error: 'Invalid or expired token' };
    }
    
    // Check if token is expired
    if (tokenData.expiresAt && new Date() > new Date(tokenData.expiresAt)) {
      console.log(`Token ${token} has expired`);
      this.cleanupToken(token);
      return { valid: false, error: 'Token has expired' };
    }
    
    // If roomCode is provided, verify it matches the token's room
    if (roomCode && tokenData.roomCode !== roomCode) {
      console.log(`Token ${token} is for room ${tokenData.roomCode}, but was used for room ${roomCode}`);
      return { 
        valid: false, 
        error: 'This invite is for a different room',
        roomCode: tokenData.roomCode
      };
    }
    
    // Verify the room still exists
    const room = await this.getRoom(tokenData.roomCode);
    if (!room) {
      console.log(`Room ${tokenData.roomCode} not found for token ${token}`);
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
      console.log('Consuming one-time token after successful join');
      this.inviteTokens.delete(token);
      const tokens = this.roomToTokens.get(tokenData.roomCode);
      if (tokens) {
        tokens.delete(token);
        if (tokens.size === 0) {
          this.roomToTokens.delete(tokenData.roomCode);
        }
      }
    }
    
    console.log(`Token validation successful for room ${tokenData.roomCode}`);
    return { 
      valid: true,
      roomCode: tokenData.roomCode,
      isPermanent: tokenData.isPermanent,
      room, // Include full room data for reference
      error: null 
    };
  }

  /**
   * Cleanup all invite tokens for a room (when room is deleted)
   * @param {string} roomCode - The room code to clean up tokens for
   */
  cleanupInviteTokens(roomCode) {
    const tokens = this.roomToTokens.get(roomCode) || new Set();
    
    for (const token of tokens) {
      const tokenData = this.inviteTokens.get(token);
      if (tokenData) {
        clearTimeout(tokenData.timeoutId);
        this.inviteTokens.delete(token);
      }
    }
    
    this.roomToTokens.delete(roomCode);
  }

  /**
   * Cleanup all resources when a room is deleted
   * @param {string} roomCode - The room code being deleted
   */
  async deleteRoom(roomCode) {
    // Clean up invite tokens first
    this.cleanupInviteTokens(roomCode);
    
    // Clear any room expiry timer
    if (this.roomTimers.has(roomCode)) {
      clearTimeout(this.roomTimers.get(roomCode));
      this.roomTimers.delete(roomCode);
    }
    
    // Delete from storage
    if (this.redis) {
      await this.redis.del(`room:${roomCode}`);
    } else {
      this.rooms.delete(roomCode);
    }
  }
}

module.exports = RoomManager;
