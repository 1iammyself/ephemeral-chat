/**
 * Security module for Ephemeral Chat
 * Handles inactivity tracking, session management, and secure authentication
 */

const crypto = require('crypto');
const { logger } = require('./utils');

class SecurityManager {
  constructor() {
    // User activity tracking
    this.userActivity = new Map(); // socketId -> { lastActivity, userId, roomCode, timeoutId }
    this.sessionTokens = new Map(); // sessionToken -> { socketId, userId, roomCode, createdAt }

    // Configuration - Mobile-friendly defaults
    // Inactivity timeout: How long before a user is considered inactive (default 60 min for mobile users)
    this.INACTIVITY_TIMEOUT_MS = parseInt(process.env.INACTIVITY_TIMEOUT_MINUTES || 60) * 60 * 1000;
    this.SESSION_TOKEN_LENGTH = 32;
    // Failed attempts before lockout (increased for mobile users who may have connectivity issues)
    this.MAX_FAILED_ATTEMPTS = parseInt(process.env.MAX_FAILED_ATTEMPTS || 10);
    // Lockout duration after max failed attempts (use env variable, default 15 min)
    this.LOCKOUT_DURATION_MS = parseInt(process.env.LOCKOUT_DURATION_MINUTES || 15) * 60 * 1000;
    // Grace period for reconnection (5 minutes) - allows seamless rejoin after screen sleep
    this.RECONNECT_GRACE_PERIOD_MS = parseInt(process.env.RECONNECT_GRACE_MINUTES || 5) * 60 * 1000;

    // Failed authentication attempts tracking
    this.failedAttempts = new Map(); // identifier -> { count, lockedUntil }
    // Disconnected sessions grace period tracking
    this.disconnectedSessions = new Map(); // sessionToken -> { disconnectedAt, socketId, userId, roomCode }

    logger.info(`🔒 Security Manager initialized:`);
    logger.info(`   - Inactivity timeout: ${this.INACTIVITY_TIMEOUT_MS / 60000} minutes`);
    logger.info(`   - Max failed attempts: ${this.MAX_FAILED_ATTEMPTS}`);
    logger.info(`   - Lockout duration: ${this.LOCKOUT_DURATION_MS / 60000} minutes`);
    logger.info(`   - Reconnect grace period: ${this.RECONNECT_GRACE_PERIOD_MS / 60000} minutes`);
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
   * @param {number} overrideTimeoutMs - Optional custom timeout
   */
  registerUserActivity(socketId, userId, roomCode, onTimeout, overrideTimeoutMs = null) {
    // Clear existing timeout if any
    this.clearUserActivity(socketId);

    const timeoutMs = overrideTimeoutMs || this.INACTIVITY_TIMEOUT_MS;

    const timeoutId = setTimeout(() => {
      logger.info(`⏰ User ${userId} (${socketId}) timed out due to inactivity`);
      this.clearUserActivity(socketId);
      if (onTimeout) {
        onTimeout(socketId, userId, roomCode);
      }
    }, timeoutMs);

    this.userActivity.set(socketId, {
      lastActivity: Date.now(),
      userId,
      roomCode,
      timeoutId,
      timeoutMs // Store the timeout value used
    });

    logger.info(`✅ Activity registered for user ${userId} (${socketId}) with ${timeoutMs / 60000}m timeout`);
  }

  /**
   * Update user activity (reset inactivity timer)
   * @param {string} socketId - Socket ID
   * @param {Function} onTimeout - Callback when user times out
   * @param {number} overrideTimeoutMs - Optional custom timeout
   */
  updateUserActivity(socketId, onTimeout, overrideTimeoutMs = null) {
    const activity = this.userActivity.get(socketId);
    if (!activity) {
      return false;
    }

    // Clear old timeout
    if (activity.timeoutId) {
      clearTimeout(activity.timeoutId);
    }

    const timeoutMs = overrideTimeoutMs || activity.timeoutMs || this.INACTIVITY_TIMEOUT_MS;

    // Set new timeout
    const timeoutId = setTimeout(() => {
      logger.info(`⏰ User ${activity.userId} (${socketId}) timed out due to inactivity`);
      this.clearUserActivity(socketId);
      if (onTimeout) {
        onTimeout(socketId, activity.userId, activity.roomCode);
      }
    }, timeoutMs);

    activity.lastActivity = Date.now();
    activity.timeoutId = timeoutId;
    activity.timeoutMs = timeoutMs;

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
   * Resume a session with a new socket ID
   * @param {string} token - Session token
   * @param {string} newSocketId - New socket ID
   * @returns {boolean} True if resumed
   */
  resumeSession(token, newSocketId) {
    const session = this.sessionTokens.get(token);
    if (session) {
      session.socketId = newSocketId;
      return true;
    }
    return false;
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

      logger.info(`🔒 Identifier ${identifier} locked until ${new Date(attempts.lockedUntil).toISOString()}`);

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
   * Track a disconnected session for grace period reconnection
   * Mobile users often disconnect temporarily (screen sleep, network switch)
   * @param {string} sessionToken - The session token
   * @param {string} socketId - The disconnected socket ID
   * @param {string} userId - User ID
   * @param {string} roomCode - Room code
   */
  trackDisconnectedSession(sessionToken, socketId, userId, roomCode) {
    if (!sessionToken) return;
    
    this.disconnectedSessions.set(sessionToken, {
      disconnectedAt: Date.now(),
      socketId,
      userId,
      roomCode
    });
    
    logger.info(`📱 Tracking disconnected session for user ${userId} in room ${roomCode} (grace period: ${this.RECONNECT_GRACE_PERIOD_MS / 60000}m)`);
  }

  /**
   * Check if a session is within the grace period for seamless reconnection
   * @param {string} sessionToken - The session token
   * @returns {Object|null} Session info if within grace period, null otherwise
   */
  checkGracePeriod(sessionToken) {
    const disconnectedSession = this.disconnectedSessions.get(sessionToken);
    if (!disconnectedSession) return null;

    const elapsed = Date.now() - disconnectedSession.disconnectedAt;
    if (elapsed <= this.RECONNECT_GRACE_PERIOD_MS) {
      logger.info(`✅ Session within grace period (${Math.round(elapsed / 1000)}s elapsed)`);
      return disconnectedSession;
    }

    // Grace period expired, clean up
    this.disconnectedSessions.delete(sessionToken);
    logger.info(`⏰ Grace period expired for session (${Math.round(elapsed / 1000)}s elapsed)`);
    return null;
  }

  /**
   * Clear a disconnected session (user successfully reconnected)
   * @param {string} sessionToken - The session token
   */
  clearDisconnectedSession(sessionToken) {
    this.disconnectedSessions.delete(sessionToken);
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

    // Clean up expired grace period sessions
    for (const [token, session] of this.disconnectedSessions.entries()) {
      if (now - session.disconnectedAt > this.RECONNECT_GRACE_PERIOD_MS) {
        this.disconnectedSessions.delete(token);
      }
    }

    logger.info(`🧹 Security cleanup completed. Active sessions: ${this.sessionTokens.size}, Active users: ${this.userActivity.size}, Grace period sessions: ${this.disconnectedSessions.size}`);
  }

  /**
   * Get security statistics
   * @returns {Object} Security stats
   */
  getStats() {
    return {
      activeUsers: this.userActivity.size,
      activeSessions: this.sessionTokens.size,
      gracePeriodSessions: this.disconnectedSessions.size,
      lockedIdentifiers: Array.from(this.failedAttempts.values()).filter(a => a.lockedUntil && Date.now() < a.lockedUntil).length,
      inactivityTimeoutMinutes: this.INACTIVITY_TIMEOUT_MS / 60000,
      reconnectGraceMinutes: this.RECONNECT_GRACE_PERIOD_MS / 60000
    };
  }
}

module.exports = SecurityManager;
