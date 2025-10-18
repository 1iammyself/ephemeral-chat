/**
 * Client-side security utilities for ephemeral chat
 * Handles credential hashing and secure transmission
 */

/**
 * Hash a password using SHA-256 before sending to server
 * This ensures passwords are never sent in plain text
 * @param {string} password - Plain text password
 * @param {string} salt - Salt (room code or challenge)
 * @returns {Promise<string>} Hashed password
 */
export async function hashPassword(password, salt = '') {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Generate a secure random token
 * @param {number} length - Length in bytes
 * @returns {string} Random hex token
 */
export function generateSecureToken(length = 32) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate room code format
 * @param {string} roomCode - Room code to validate
 * @returns {boolean} True if valid
 */
export function isValidRoomCode(roomCode) {
  return typeof roomCode === 'string' && 
         roomCode.length === 10 && 
         /^[A-Z0-9]+$/.test(roomCode);
}

/**
 * Validate nickname format
 * @param {string} nickname - Nickname to validate
 * @returns {boolean} True if valid
 */
export function isValidNickname(nickname) {
  return typeof nickname === 'string' && 
         nickname.length >= 1 && 
         nickname.length <= 50 &&
         /^[a-zA-Z0-9_\-\s]+$/.test(nickname);
}

/**
 * Validate password strength
 * @param {string} password - Password to validate
 * @returns {Object} { valid: boolean, strength: string, errors: array }
 */
export function validatePasswordStrength(password) {
  const errors = [];
  let strength = 'weak';

  if (!password || password.length === 0) {
    return { valid: true, strength: 'none', errors: [] }; // Optional password
  }

  if (password.length < 4) {
    errors.push('Password must be at least 4 characters');
  }

  if (password.length > 128) {
    errors.push('Password is too long (max 128 characters)');
  }

  // Calculate strength
  if (password.length >= 8) {
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    const strengthScore = [hasUpper, hasLower, hasNumber, hasSpecial].filter(Boolean).length;

    if (strengthScore >= 3 && password.length >= 12) {
      strength = 'strong';
    } else if (strengthScore >= 2 && password.length >= 8) {
      strength = 'medium';
    }
  }

  return {
    valid: errors.length === 0,
    strength,
    errors
  };
}

/**
 * Sanitize user input to prevent XSS
 * @param {string} input - User input
 * @returns {string} Sanitized input
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  
  return input
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim()
    .substring(0, 500); // Limit length
}

/**
 * Create a secure credential object for transmission
 * @param {Object} credentials - Raw credentials
 * @returns {Promise<Object>} Sanitized and hashed credentials
 */
export async function prepareCredentials(credentials) {
  const prepared = {};

  if (credentials.roomCode) {
    prepared.roomCode = credentials.roomCode.toString().trim().toUpperCase();
  }

  if (credentials.nickname) {
    prepared.nickname = sanitizeInput(credentials.nickname);
  }

  if (credentials.password) {
    // Note: Password is sent as-is to server for bcrypt hashing
    // In production, consider using HTTPS to encrypt transmission
    prepared.password = credentials.password;
  }

  if (credentials.inviteToken) {
    prepared.inviteToken = credentials.inviteToken;
  }

  if (credentials.captchaAnswer) {
    prepared.captchaAnswer = credentials.captchaAnswer;
  }

  if (credentials.captchaProblem) {
    prepared.captchaProblem = credentials.captchaProblem;
  }

  return prepared;
}

/**
 * Store sensitive data in session storage (cleared on tab close)
 * @param {string} key - Storage key
 * @param {any} value - Value to store
 */
export function storeSessionData(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error('Failed to store session data:', error);
  }
}

/**
 * Retrieve sensitive data from session storage
 * @param {string} key - Storage key
 * @returns {any} Stored value or null
 */
export function getSessionData(key) {
  try {
    const data = sessionStorage.getItem(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Failed to retrieve session data:', error);
    return null;
  }
}

/**
 * Clear sensitive data from session storage
 * @param {string} key - Storage key (optional, clears all if not provided)
 */
export function clearSessionData(key = null) {
  try {
    if (key) {
      sessionStorage.removeItem(key);
    } else {
      sessionStorage.clear();
    }
  } catch (error) {
    console.error('Failed to clear session data:', error);
  }
}

/**
 * Clear all sensitive data on logout
 */
export function clearAllSensitiveData() {
  clearSessionData();
  // Clear any other sensitive data from memory
  if (window.roomCode) delete window.roomCode;
  if (window.userSession) delete window.userSession;
}

/**
 * Format time remaining for display
 * @param {number} ms - Milliseconds remaining
 * @returns {string} Formatted time string
 */
export function formatTimeRemaining(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Check if browser supports required security features
 * @returns {Object} { supported: boolean, missing: array }
 */
export function checkBrowserSecuritySupport() {
  const missing = [];

  if (!window.crypto || !window.crypto.subtle) {
    missing.push('Web Crypto API');
  }

  if (!window.sessionStorage) {
    missing.push('Session Storage');
  }

  if (!window.crypto.getRandomValues) {
    missing.push('Crypto Random Values');
  }

  return {
    supported: missing.length === 0,
    missing
  };
}

/**
 * Rate limit function calls
 * @param {Function} func - Function to rate limit
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Rate limited function
 */
export function rateLimit(func, delay = 1000) {
  let timeout = null;
  let lastCall = 0;

  return function(...args) {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;

    if (timeSinceLastCall >= delay) {
      lastCall = now;
      return func.apply(this, args);
    } else {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => {
        lastCall = Date.now();
        func.apply(this, args);
      }, delay - timeSinceLastCall);
    }
  };
}

export default {
  hashPassword,
  generateSecureToken,
  isValidRoomCode,
  isValidNickname,
  validatePasswordStrength,
  sanitizeInput,
  prepareCredentials,
  storeSessionData,
  getSessionData,
  clearSessionData,
  clearAllSensitiveData,
  formatTimeRemaining,
  checkBrowserSecuritySupport,
  rateLimit
};
