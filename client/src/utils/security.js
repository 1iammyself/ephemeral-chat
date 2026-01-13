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
         nickname.trim().length >= 2 && 
         nickname.trim().length <= 20 &&
         /^[a-zA-Z0-9_-]+$/.test(nickname);
}

/**
 * Generate a random room key for E2EE
 * @returns {string} Base64URL string of the key
 */
export function generateRoomKey() {
  const array = new Uint8Array(32); // 256 bits
  crypto.getRandomValues(array);
  // Convert to Base64URL for shorter URLs
  const base64 = btoa(String.fromCharCode(...array));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Encrypt a message using AES-GCM
 * @param {string} text - Message text
 * @param {string} keyString - Hex string of the key
 * @returns {Promise<{encrypted: string, iv: string}>} Encrypted data and IV
 */
export async function encryptMessage(text, keyString) {
  try {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    // Convert hex key string to key material
    // We hash it first to ensure it's the right length/format for importKey if it's not raw bytes
    // But if we generated 32 bytes hex, we can just import it? 
    // The user's example uses SHA-256 digest of the keyString. Let's follow that for robustness.
    const keyData = encoder.encode(keyString);
    const hash = await crypto.subtle.digest('SHA-256', keyData);
    const key = await crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt']);
    
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
    
    // Convert to base64 for transport
    const encryptedArray = new Uint8Array(encryptedBuffer);
    const encryptedBase64 = btoa(String.fromCharCode(...encryptedArray));
    const ivBase64 = btoa(String.fromCharCode(...iv));
    
    return { encrypted: encryptedBase64, iv: ivBase64 };
  } catch (error) {
    console.error('Encryption error:', error);
    throw error;
  }
}

/**
 * Decrypt a message using AES-GCM
 * @param {string} encryptedBase64 - Encrypted text (base64)
 * @param {string} ivBase64 - IV (base64)
 * @param {string} keyString - Hex string of the key
 * @returns {Promise<string>} Decrypted text
 */
export async function decryptMessage(encryptedBase64, ivBase64, keyString) {
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(keyString);
    const hash = await crypto.subtle.digest('SHA-256', keyData);
    const key = await crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['decrypt']);
    
    const encryptedString = atob(encryptedBase64);
    const encryptedArray = new Uint8Array(encryptedString.length);
    for (let i = 0; i < encryptedString.length; i++) {
      encryptedArray[i] = encryptedString.charCodeAt(i);
    }
    
    const ivString = atob(ivBase64);
    const ivArray = new Uint8Array(ivString.length);
    for (let i = 0; i < ivString.length; i++) {
      ivArray[i] = ivString.charCodeAt(i);
    }
    
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivArray },
      key,
      encryptedArray
    );
    
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (error) {
    console.error('Decryption error:', error);
    return '⚠️ Decryption failed';
  }
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

  let sanitized = input;
  let previous;

  // Repeatedly remove dangerous patterns until the string stabilizes
  do {
    previous = sanitized;
    sanitized = sanitized
      .replace(/[<>]/g, '') // Remove < and >
      .replace(/\b(?:javascript|data|vbscript):/gi, '') // Remove potentially dangerous URL protocols
      .replace(/on\w+=/gi, ''); // Remove event handlers
  } while (sanitized !== previous);

  return sanitized
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
  rateLimit,
  generateRoomKey,
  encryptMessage,
  decryptMessage
};
