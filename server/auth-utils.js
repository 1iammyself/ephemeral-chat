/**
 * Authentication utilities for secure credential handling
 * Ensures no plain text credentials are sent or stored
 */

const bcrypt = require('bcryptjs');
const crypto = require('crypto');

/**
 * Hash a password using bcrypt (for password protection)
 * @param {string} password - Plain text password
 * @returns {Promise<string>} Hashed password
 */
async function hashPassword(password) {
  const saltRounds = 12; // Higher for better security
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Verify a password against a hash
 * @param {string} password - Plain text password
 * @param {string} hash - Hashed password
 * @returns {Promise<boolean>} True if password matches
 */
async function verifyPassword(password, hash) {
  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    console.error('Error verifying password:', error);
    return false;
  }
}

/**
 * Create a client-side hash for password transmission
 * This allows passwords to be hashed on client before sending
 * @param {string} password - Plain text password
 * @param {string} salt - Salt (can be room code or a challenge)
 * @returns {string} Client-side hash
 */
function createClientHash(password, salt) {
  return crypto.createHash('sha256')
    .update(password + salt)
    .digest('hex');
}

/**
 * Verify client-side hash
 * @param {string} clientHash - Hash from client
 * @param {string} password - Plain text password (server-side)
 * @param {string} salt - Salt used
 * @returns {boolean} True if valid
 */
function verifyClientHash(clientHash, password, salt) {
  const computed = createClientHash(password, salt);
  try {
    return crypto.timingSafeEqual(
      Buffer.from(clientHash, 'hex'),
      Buffer.from(computed, 'hex')
    );
  } catch (error) {
    return false;
  }
}

/**
 * Generate a challenge for authentication
 * @returns {string} Random challenge string
 */
function generateChallenge() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Create a secure room code verification token
 * This allows verifying room access without storing the room code in plain text
 * @param {string} roomCode - Room code
 * @param {string} secret - Server secret
 * @returns {string} Verification token
 */
function createRoomVerificationToken(roomCode, secret) {
  const timestamp = Date.now();
  const data = `${roomCode}:${timestamp}`;
  const signature = crypto.createHmac('sha256', secret)
    .update(data)
    .digest('hex');
  
  return Buffer.from(JSON.stringify({
    signature,
    timestamp
  })).toString('base64');
}

/**
 * Verify room verification token
 * @param {string} token - Verification token
 * @param {string} roomCode - Room code to verify
 * @param {string} secret - Server secret
 * @param {number} maxAge - Maximum age in milliseconds (default 5 minutes)
 * @returns {boolean} True if valid
 */
function verifyRoomVerificationToken(token, roomCode, secret, maxAge = 5 * 60 * 1000) {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
    const { signature, timestamp } = decoded;
    
    // Check age
    if (Date.now() - timestamp > maxAge) {
      return false;
    }
    
    // Verify signature
    const data = `${roomCode}:${timestamp}`;
    const expectedSignature = crypto.createHmac('sha256', secret)
      .update(data)
      .digest('hex');
    
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  } catch (error) {
    return false;
  }
}

/**
 * Create a secure invite token with embedded verification
 * @param {string} roomCode - Room code
 * @param {string} secret - Server secret
 * @param {Object} options - Options { expiresIn: ms, metadata: object }
 * @returns {string} Secure invite token
 */
function createSecureInviteToken(roomCode, secret, options = {}) {
  const { expiresIn = 24 * 60 * 60 * 1000, metadata = {} } = options;
  
  const payload = {
    roomCode,
    expiresAt: Date.now() + expiresIn,
    metadata,
    nonce: crypto.randomBytes(16).toString('hex')
  };
  
  const payloadStr = JSON.stringify(payload);
  const signature = crypto.createHmac('sha256', secret)
    .update(payloadStr)
    .digest('hex');
  
  return Buffer.from(JSON.stringify({
    payload: payloadStr,
    signature
  })).toString('base64url');
}

/**
 * Verify and decode secure invite token
 * @param {string} token - Invite token
 * @param {string} secret - Server secret
 * @returns {Object|null} Decoded payload or null if invalid
 */
function verifySecureInviteToken(token, secret) {
  try {
    const decoded = JSON.parse(Buffer.from(token, 'base64url').toString());
    const { payload: payloadStr, signature } = decoded;
    
    // Verify signature
    const expectedSignature = crypto.createHmac('sha256', secret)
      .update(payloadStr)
      .digest('hex');
    
    if (!crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    )) {
      return null;
    }
    
    const payload = JSON.parse(payloadStr);
    
    // Check expiration
    if (Date.now() > payload.expiresAt) {
      return null;
    }
    
    return payload;
  } catch (error) {
    console.error('Error verifying invite token:', error);
    return null;
  }
}

/**
 * Sanitize and validate credentials before processing
 * @param {Object} credentials - Credentials object
 * @returns {Object} { valid: boolean, sanitized: object, errors: array }
 */
function validateCredentials(credentials) {
  const errors = [];
  const sanitized = {};
  
  // Validate room code
  if (credentials.roomCode) {
    const roomCode = credentials.roomCode.toString().trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(roomCode)) {
      errors.push('Invalid room code format');
    } else {
      sanitized.roomCode = roomCode;
    }
  }
  
  // Validate password
  if (credentials.password !== undefined) {
    const password = credentials.password.toString();
    if (password.length > 128) {
      errors.push('Password too long');
    } else if (password.length > 0 && password.length < 4) {
      errors.push('Password too short (minimum 4 characters)');
    } else {
      sanitized.password = password;
    }
  }
  
  // Validate nickname
  if (credentials.nickname) {
    const nickname = credentials.nickname.toString().trim();
    if (nickname.length > 50) {
      errors.push('Nickname too long');
    } else if (!/^[a-zA-Z0-9_\-\s]+$/.test(nickname)) {
      errors.push('Nickname contains invalid characters');
    } else {
      sanitized.nickname = nickname;
    }
  }
  
  return {
    valid: errors.length === 0,
    sanitized,
    errors
  };
}

/**
 * Generate a secure random token
 * @param {number} length - Length in bytes (default 32)
 * @returns {string} Random token
 */
function generateSecureToken(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Create a time-based one-time password (TOTP) style verification code
 * Useful for additional verification steps
 * @param {string} secret - Shared secret
 * @param {number} window - Time window in seconds (default 30)
 * @returns {string} 6-digit code
 */
function generateTOTP(secret, window = 30) {
  const counter = Math.floor(Date.now() / 1000 / window);
  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(Buffer.from(counter.toString(16).padStart(16, '0'), 'hex'));
  const hash = hmac.digest();
  
  const offset = hash[hash.length - 1] & 0xf;
  const binary = ((hash[offset] & 0x7f) << 24) |
                 ((hash[offset + 1] & 0xff) << 16) |
                 ((hash[offset + 2] & 0xff) << 8) |
                 (hash[offset + 3] & 0xff);
  
  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Verify TOTP code
 * @param {string} code - Code to verify
 * @param {string} secret - Shared secret
 * @param {number} window - Time window in seconds
 * @param {number} tolerance - Number of windows to check (default 1)
 * @returns {boolean} True if valid
 */
function verifyTOTP(code, secret, window = 30, tolerance = 1) {
  for (let i = -tolerance; i <= tolerance; i++) {
    const counter = Math.floor(Date.now() / 1000 / window) + i;
    const hmac = crypto.createHmac('sha1', secret);
    hmac.update(Buffer.from(counter.toString(16).padStart(16, '0'), 'hex'));
    const hash = hmac.digest();
    
    const offset = hash[hash.length - 1] & 0xf;
    const binary = ((hash[offset] & 0x7f) << 24) |
                   ((hash[offset + 1] & 0xff) << 16) |
                   ((hash[offset + 2] & 0xff) << 8) |
                   (hash[offset + 3] & 0xff);
    
    const otp = (binary % 1000000).toString().padStart(6, '0');
    
    if (otp === code) {
      return true;
    }
  }
  
  return false;
}

module.exports = {
  hashPassword,
  verifyPassword,
  createClientHash,
  verifyClientHash,
  generateChallenge,
  createRoomVerificationToken,
  verifyRoomVerificationToken,
  createSecureInviteToken,
  verifySecureInviteToken,
  validateCredentials,
  generateSecureToken,
  generateTOTP,
  verifyTOTP
};
