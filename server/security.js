/**
 * Security module for Ephemeral Chat
 * Handles inactivity tracking, session management, and secure authentication
 */

const crypto = require('crypto');

class SecurityManager {
  constructor() {
    // User activity tracking
    this.userActivity = new Map(); // socketId -> { lastActivity, userId, roomCode, timeoutId }
    this.sessionTokens = new Map(); // sessionToken -> { socketId, userId, roomCode, createdAt }
    
    // Configuration
    this.INACTIVITY_TIMEOUT_MS = parseInt(process.env.INACTIVITY_TIMEOUT_MINUTES || 15) * 60 * 1000; // 15 minutes default
    this.SESSION_TOKEN_LENGTH = 32;
    this.MAX_FAILED_ATTEMPTS = 5;
    this.LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes lockout
    
    // Failed authentication attempts tracking
    this.failedAttempts = new Map(); // identifier -> { count, lockedUntil }
    
    console.log(`🔒 Security Manager initialized with ${this.INACTIVITY_TIMEOUT_MS / 1000}s inactivity timeout`);
  }

  /**
   * Generate a secure session token
   * @returns {string} Secure random token
   */
  generateSessionToken() {
    return crypto.randomBytes(this.SESSION_TOKEN_LENGTH).toString('hex');
  }

  /**
   * Generate a secure hash for credentials (room codes, passwords)
   * Uses SHA-256 with salt for non-password data
   * @param {string} data - Data to hash
   * @param {string} salt - Optional salt (generated if not provided)
   * @returns {Object} { hash, salt }
   */
  generateSecureHash(data, salt = null) {
    if (!salt) {
      salt = crypto.randomBytes(16).toString('hex');
    }
    const hash = crypto.createHmac('sha256', salt)
      .update(data)
      .digest('hex');
    return { hash, salt };
  }

  /**
   * Verify a hash against data
   * @param {string} data - Data to verify
   * @param {string} hash - Expected hash
   * @param {string} salt - Salt used in hashing
   * @returns {boolean} True if hash matches
   */
  verifyHash(data, hash, salt) {
    const computed = crypto.createHmac('sha256', salt)
      .update(data)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(computed, 'hex')
    );
  }

  /**
   * Create a secure checksum for room codes (for verification without storing plain text)
   * @param {string} roomCode - Room code to create checksum for
   * @returns {string} Checksum
   */
  createRoomCodeChecksum(roomCode) {
    return crypto.createHash('sha256')
      .update(roomCode + process.env.ROOM_CODE_SALT || 'ephemeral-chat-salt')
      .digest('hex')
      .substring(0, 16); // Use first 16 chars for brevity
  }

  /**
   * Verify room code against checksum
   * @param {string} roomCode - Room code to verify
   * @param {string} checksum - Expected checksum
   * @returns {boolean} True if valid
   */
  verifyRoomCodeChecksum(roomCode, checksum) {
    const computed = this.createRoomCodeChecksum(roomCode);
    return computed === checksum;
  }

  /**
   * Register user activity and start inactivity timer
   * @param {string} socketId - Socket ID
   * @param {string} userId - User ID
   * @param {string} roomCode - Room code
   * @param {Function} onTimeout - Callback when user times out
   */
  registerUserActivity(socketId, userId, roomCode, onTimeout) {
    // Clear existing timeout if any
    this.clearUserActivity(socketId);

    const timeoutId = setTimeout(() => {
      console.log(`⏰ User ${userId} (${socketId}) timed out due to inactivity`);
      this.clearUserActivity(socketId);
      if (onTimeout) {
        onTimeout(socketId, userId, roomCode);
      }
    }, this.INACTIVITY_TIMEOUT_MS);

    this.userActivity.set(socketId, {
      lastActivity: Date.now(),
      userId,
      roomCode,
      timeoutId
    });

    console.log(`✅ Activity registered for user ${userId} (${socketId})`);
  }

  /**
   * Update user activity (reset inactivity timer)
   * @param {string} socketId - Socket ID
   * @param {Function} onTimeout - Callback when user times out
   */
  updateUserActivity(socketId, onTimeout) {
    const activity = this.userActivity.get(socketId);
    if (!activity) {
      return false;
    }

    // Clear old timeout
    if (activity.timeoutId) {
      clearTimeout(activity.timeoutId);
    }

    // Set new timeout
    const timeoutId = setTimeout(() => {
      console.log(`⏰ User ${activity.userId} (${socketId}) timed out due to inactivity`);
      this.clearUserActivity(socketId);
      if (onTimeout) {
        onTimeout(socketId, activity.userId, activity.roomCode);
      }
    }, this.INACTIVITY_TIMEOUT_MS);

    activity.lastActivity = Date.now();
    activity.timeoutId = timeoutId;

    return true;
  }

  /**
   * Clear user activity tracking
   * @param {string} socketId - Socket ID
   */
  clearUserActivity(socketId) {
    const activity = this.userActivity.get(socketId);
    if (activity && activity.timeoutId) {
      clearTimeout(activity.timeoutId);
    }
    this.userActivity.delete(socketId);
  }

  /**
   * Get user's last activity time
   * @param {string} socketId - Socket ID
   * @returns {number|null} Timestamp of last activity or null
   */
  getLastActivity(socketId) {
    const activity = this.userActivity.get(socketId);
    return activity ? activity.lastActivity : null;
  }

  /**
   * Get time until user timeout
   * @param {string} socketId - Socket ID
   * @returns {number|null} Milliseconds until timeout or null
   */
  getTimeUntilTimeout(socketId) {
    const activity = this.userActivity.get(socketId);
    if (!activity) return null;

    const elapsed = Date.now() - activity.lastActivity;
    const remaining = this.INACTIVITY_TIMEOUT_MS - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * Create a session token for a user
   * @param {string} socketId - Socket ID
   * @param {string} userId - User ID
   * @param {string} roomCode - Room code
   * @returns {string} Session token
   */
  createSession(socketId, userId, roomCode) {
    const token = this.generateSessionToken();
    this.sessionTokens.set(token, {
      socketId,
      userId,
      roomCode,
      createdAt: Date.now()
    });
    return token;
  }

  /**
   * Validate a session token
   * @param {string} token - Session token
   * @returns {Object|null} Session data or null if invalid
   */
  validateSession(token) {
    return this.sessionTokens.get(token) || null;
  }

  /**
   * Invalidate a session token
   * @param {string} token - Session token
   */
  invalidateSession(token) {
    this.sessionTokens.delete(token);
  }

  /**
   * Invalidate all sessions for a socket
   * @param {string} socketId - Socket ID
   */
  invalidateSocketSessions(socketId) {
    for (const [token, session] of this.sessionTokens.entries()) {
      if (session.socketId === socketId) {
        this.sessionTokens.delete(token);
      }
    }
  }

  /**
   * Record a failed authentication attempt
   * @param {string} identifier - Identifier (IP, user ID, etc.)
   * @returns {Object} { locked: boolean, remainingAttempts: number, lockedUntil: number|null }
   */
  recordFailedAttempt(identifier) {
    const now = Date.now();
    const attempts = this.failedAttempts.get(identifier) || { count: 0, lockedUntil: null };

    // Check if currently locked
    if (attempts.lockedUntil && now < attempts.lockedUntil) {
      return {
        locked: true,
        remainingAttempts: 0,
        lockedUntil: attempts.lockedUntil
      };
    }

    // Reset if lockout expired
    if (attempts.lockedUntil && now >= attempts.lockedUntil) {
      attempts.count = 0;
      attempts.lockedUntil = null;
    }

    // Increment failed attempts
    attempts.count++;

    // Lock if max attempts reached
    if (attempts.count >= this.MAX_FAILED_ATTEMPTS) {
      attempts.lockedUntil = now + this.LOCKOUT_DURATION_MS;
      this.failedAttempts.set(identifier, attempts);
      
      console.log(`🔒 Identifier ${identifier} locked until ${new Date(attempts.lockedUntil).toISOString()}`);
      
      return {
        locked: true,
        remainingAttempts: 0,
        lockedUntil: attempts.lockedUntil
      };
    }

    this.failedAttempts.set(identifier, attempts);
    
    return {
      locked: false,
      remainingAttempts: this.MAX_FAILED_ATTEMPTS - attempts.count,
      lockedUntil: null
    };
  }

  /**
   * Clear failed attempts for an identifier
   * @param {string} identifier - Identifier
   */
  clearFailedAttempts(identifier) {
    this.failedAttempts.delete(identifier);
  }

  /**
   * Check if an identifier is locked
   * @param {string} identifier - Identifier
   * @returns {Object} { locked: boolean, lockedUntil: number|null }
   */
  isLocked(identifier) {
    const attempts = this.failedAttempts.get(identifier);
    if (!attempts || !attempts.lockedUntil) {
      return { locked: false, lockedUntil: null };
    }

    const now = Date.now();
    if (now >= attempts.lockedUntil) {
      // Lockout expired
      this.clearFailedAttempts(identifier);
      return { locked: false, lockedUntil: null };
    }

    return { locked: true, lockedUntil: attempts.lockedUntil };
  }

  /**
   * Clean up expired sessions and activity tracking
   * Should be called periodically
   */
  cleanup() {
    const now = Date.now();
    const SESSION_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

    // Clean up old sessions
    for (const [token, session] of this.sessionTokens.entries()) {
      if (now - session.createdAt > SESSION_MAX_AGE) {
        this.sessionTokens.delete(token);
      }
    }

    // Clean up expired lockouts
    for (const [identifier, attempts] of this.failedAttempts.entries()) {
      if (attempts.lockedUntil && now >= attempts.lockedUntil) {
        this.failedAttempts.delete(identifier);
      }
    }

    console.log(`🧹 Security cleanup completed. Active sessions: ${this.sessionTokens.size}, Active users: ${this.userActivity.size}`);
  }

  /**
   * Get security statistics
   * @returns {Object} Security stats
   */
  getStats() {
    return {
      activeUsers: this.userActivity.size,
      activeSessions: this.sessionTokens.size,
      lockedIdentifiers: Array.from(this.failedAttempts.values()).filter(a => a.lockedUntil && Date.now() < a.lockedUntil).length,
      inactivityTimeoutMinutes: this.INACTIVITY_TIMEOUT_MS / 60000
    };
  }
}

module.exports = SecurityManager;
